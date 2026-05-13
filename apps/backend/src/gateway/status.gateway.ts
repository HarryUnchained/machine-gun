import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleInit } from '@nestjs/common';
import { FlowEngineService } from '../core/flow-engine.service';
import { SchemaDiscoveryService } from '../core/discovery.service';
import { GeneratorService } from '../core/generator.service';
import { PublisherService } from '../core/publishing/publisher.service';
import { CustomDataService } from '../core/custom-data.service';
import * as common from '@machine-gun/common';
import { faker } from '@faker-js/faker';

type ThrottledUpdateState = {
  batchSize: number;
  receivedCount: number;
  sampleData: unknown[];
  sampleResponses: unknown[];
  timer: NodeJS.Timeout | null;
};

const IGNORED_FAKER_NAMESPACES = ['_randomizer', 'definitions', 'rawDefinitions', 'helpers'];
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:4200';

@WebSocketGateway({
  cors: {
    origin: FRONTEND_ORIGIN,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class StatusGateway implements OnModuleInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(StatusGateway.name);
  private readonly UPDATE_DELAY = 200;
  private throttledUpdates: Map<string, ThrottledUpdateState>;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly discoveryService: SchemaDiscoveryService,
    private readonly generatorService: GeneratorService,
    private readonly publisherService: PublisherService,
    private readonly customDataService: CustomDataService,
    private readonly flowEngineService: FlowEngineService,
  ) {
    this.throttledUpdates = new Map();
  }

  onModuleInit() {
    this.registerTelemetrySubscription();
    this.registerFlowStatusSubscription();
    this.registerFlowLifecycleSubscription();
    this.registerBrokerNotificationSubscription();
    this.startStatusBroadcastLoop();
  }

  handleConnection(client: Socket) {
    const auth = client.handshake.auth as unknown as Record<string, unknown> | undefined;
    const token = auth?.['token'];
    const validToken = process.env.API_KEY || 'my-super-secret-key';

    if (token !== validToken) {
      this.logger.warn(`Auth failed for ${client.id}`);
      client.disconnect();
      return;
    }

    this.logger.log(
      `Client connected: ${client.id} | IP: ${client.handshake.address} | UA: ${client.handshake.headers['user-agent']}`,
    );
    this.bootstrapClient(client);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('start_test')
  async handleStartTest(client: Socket, payload: { schemaId: string; frequency: number }) {
    this.logger.log(`Start test request from ${client.id} for schema: ${payload.schemaId}`);

    try {
      const schema = this.getSchemaById(payload.schemaId);

      if (!schema) {
        this.logger.error(`Cannot start test: Schema ${payload.schemaId} not found.`);
        return;
      }

      if (!this.validateDestination(schema)) {
        return;
      }

      await this.publisherService.prepareDestination(schema.destination);

      const { requested, actual, reason } = this.generatorService.startLoadTest(
        schema,
        payload.frequency,
        async (batch) => {
          await this.handlePublishedBatch(schema, batch, 'Batch publishing failure');
        },
        () => this.publisherService.isBackpressured(),
      );

      if (actual < requested) {
        client.emit('test_clamped', { schemaId: schema.id, requested, actual, reason });
      }

      if (actual === 0) {
        return;
      }

      this.server.emit('test_started', { schemaId: schema.id, requested, actual });
    } catch (error: unknown) {
      this.logger.error(`Start test failure: ${common.getErrorMessage(error)}`);
    }
  }

  @SubscribeMessage('stop_test')
  handleStopTest(client: Socket, payload: { schemaId: string }) {
    this.logger.log(`Stop test request from ${client.id} for schema: ${payload.schemaId}`);
    try {
      this.generatorService.stopLoadTest(payload.schemaId);
      this.server.emit('test_stopped', { schemaId: payload.schemaId });
    } catch (error: unknown) {
      this.logger.error(`Stop test failure: ${common.getErrorMessage(error)}`);
    }
  }

  @SubscribeMessage('burst_test')
  async handleBurstTest(
    client: Socket,
    payload: { schemaId: string; count: number; schema?: common.SchemaDefinition },
  ) {
    this.logger.log(`Burst test request from ${client.id} for schema: ${payload.schemaId}`);

    try {
      const schema = this.resolveSchema(payload);
      if (!schema || !this.validateDestination(schema)) {
        return;
      }

      this.logger.log(`Emitting burst_started for ${schema.id}`);
      this.server.emit('burst_started', { schemaId: schema.id });

      await this.generatorService.burst(schema, payload.count, async (batch) => {
        await this.handlePublishedBatch(schema, batch, 'Burst batch publish failure');
      });

      this.logger.log(`Emitting burst_finished for ${schema.id}`);
      this.server.emit('burst_finished', { schemaId: schema.id });
    } catch (error: unknown) {
      this.logger.error(`Burst test failure: ${common.getErrorMessage(error)}`);
      this.server.emit('burst_finished', { schemaId: payload.schemaId });
    }
  }

  @SubscribeMessage('create_schema')
  async handleCreateSchema(_client: Socket, schema: common.SchemaDefinition) {
    this.logger.log(`Creating schema: ${schema.id}`);
    try {
      await this.discoveryService.createDynamicSchema(schema);
      this.emitSchemas();
    } catch (error: unknown) {
      this.logger.error(`Schema creation failure: ${common.getErrorMessage(error)}`);
    }
  }

  @SubscribeMessage('update_schema')
  async handleUpdateSchema(
    _client: Socket,
    payload: { originalId: string; schema: common.SchemaDefinition },
  ) {
    this.logger.log(`Updating schema: ${payload.originalId}`);
    try {
      await this.discoveryService.updateDynamicSchema(payload.originalId, payload.schema);
      this.emitSchemas();
    } catch (error: unknown) {
      this.logger.error(`Schema update failure: ${common.getErrorMessage(error)}`);
    }
  }

  @SubscribeMessage('delete_schema')
  async handleDeleteSchema(_client: Socket, payload: { id: string }) {
    this.logger.log(`Deleting schema: ${payload.id}`);
    try {
      await this.discoveryService.deleteDynamicSchema(payload.id);
      this.emitSchemas();
    } catch (error: unknown) {
      this.logger.error(`Schema deletion failure: ${common.getErrorMessage(error)}`);
    }
  }

  @SubscribeMessage('refresh_schemas')
  async handleRefreshSchemas() {
    this.logger.log('Refreshing all schemas from disk...');
    await this.discoveryService.refresh();
    this.emitSchemas();
  }

  @SubscribeMessage('start_flow')
  handleStartFlow(_client: Socket, flow: common.SimulationFlow) {
    this.logger.log(`Starting flow: ${flow.id}`);
    this.flowEngineService.startFlow(flow);
    this.server.emit('flow_started', { flowId: flow.id });
  }

  @SubscribeMessage('stop_flow')
  handleStopFlow(_client: Socket, payload: { flowId: string }) {
    this.logger.log(`Stopping flow: ${payload.flowId}`);
    this.flowEngineService.stopFlow(payload.flowId);
  }

  @SubscribeMessage('save_flow')
  async handleSaveFlow(_client: Socket, flow: common.SimulationFlow) {
    this.logger.log(`Saving flow: ${flow.id}`);
    await this.discoveryService.saveFlow(flow);
    this.emitFlows();
  }

  @SubscribeMessage('delete_flow')
  async handleDeleteFlow(_client: Socket, payload: { id: string }) {
    this.logger.log(`Deleting flow: ${payload.id}`);
    await this.discoveryService.deleteFlow(payload.id);
    this.emitFlows();
  }

  @SubscribeMessage('save_custom_template')
  async handleSaveTemplate(_client: Socket, template: common.CustomTemplate) {
    await this.customDataService.saveTemplate(template);
    void this.emitCustomData();
  }

  @SubscribeMessage('delete_custom_template')
  async handleDeleteTemplate(_client: Socket, id: string) {
    await this.customDataService.deleteTemplate(id);
    void this.emitCustomData();
  }

  @SubscribeMessage('save_custom_module')
  async handleSaveModule(_client: Socket, module: common.CustomModule) {
    await this.customDataService.saveModule(module);
    void this.emitCustomData();
  }

  @SubscribeMessage('delete_custom_module')
  async handleDeleteModule(_client: Socket, id: string) {
    await this.customDataService.deleteModule(id);
    void this.emitCustomData();
  }

  private async handlePublishedBatch(
    schema: common.SchemaDefinition,
    batch: Array<Record<string, unknown> | string>,
    errorPrefix: string,
  ) {
    try {
      const responses = await this.publisherService.publishBatch(schema.destination, batch);
      const receivedCount = this.countReceivedResponses(schema, responses);
      const shouldCaptureSamples = this.shouldCaptureSamples(schema.id);
      const sampleData = shouldCaptureSamples ? this.buildSampleData(batch) : undefined;
      const sampleResponses = shouldCaptureSamples
        ? this.buildSampleResponses(responses)
        : undefined;

      this.emitThrottledUpdate(schema.id, batch.length, receivedCount, sampleData, sampleResponses);

      this.generatorService.recordPublished(batch.length);
    } catch (err: unknown) {
      this.logger.error(`${errorPrefix}: ${common.getErrorMessage(err)}`);
    }
  }

  private registerTelemetrySubscription() {
    this.generatorService.telemetry$.subscribe((data) => {
      this.server.emit('telemetry_update', {
        throughput: data.throughput,
        totalMessagesSent: data.messagesSent,
      });
    });
  }

  private registerFlowStatusSubscription() {
    this.flowEngineService.status$.subscribe((update) => {
      this.server.emit('flow_node_status', update);
    });

    this.flowEngineService.activity$.subscribe((activity) => {
      this.server.emit('flow_node_message', activity);
      this.emitThrottledUpdate(
        activity.schemaId,
        activity.batchSize,
        activity.receivedCount,
        activity.sampleData,
        activity.sampleResponses,
      );
    });
  }

  private registerFlowLifecycleSubscription() {
    this.flowEngineService.lifecycle$.subscribe((event) => {
      if (event.status === 'stopped') {
        this.server.emit('flow_stopped', { flowId: event.flowId });
      }
    });
  }

  private registerBrokerNotificationSubscription() {
    this.publisherService.brokerNotifications$.subscribe((notification) => {
      this.emitBrokerTargetNotification(notification);
    });
  }

  private startStatusBroadcastLoop() {
    setInterval(() => {
      this.broadcastStatus();
    }, 1000);
  }

  private bootstrapClient(client: Socket) {
    this.emitStatus(client);
    this.emitSchemas(client);
    this.emitFlows(client);
    this.emitFakerNamespaces(client);
    void this.emitCustomData(client);
  }

  private broadcastStatus() {
    this.emitStatus();
  }

  private emitFakerNamespaces(client: Socket) {
    client.emit('faker_namespaces_loaded', {
      namespaces: this.getFakerNamespaces(),
    });
  }

  private emitCustomData(client?: Socket) {
    const templates = this.customDataService.getTemplates();
    const modules = this.customDataService.getModules();
    const target = client ?? this.server;
    target.emit('custom_data_loaded', { templates, modules });
  }

  private emitStatus(client?: Socket) {
    const infraStatus = this.publisherService.getInfrastructureStatus();
    const { messagesSent, throughput } = this.generatorService.getTelemetry();
    const target = client ?? this.server;

    target.emit('status_update', {
      socketConnected: true,
      ...infraStatus,
      activeSchemas: this.generatorService.getActiveTestsCount(),
      activeSchemaIds: this.generatorService.getActiveSchemaIds(),
      totalMessagesSent: messagesSent,
      throughput,
    });
  }

  private emitSchemas(client?: Socket) {
    const target = client ?? this.server;
    target.emit('schemas_loaded', {
      schemas: this.discoveryService.getSchemas(),
    });
  }

  private emitFlows(client?: Socket) {
    const target = client ?? this.server;
    target.emit('flows_loaded', {
      flows: this.discoveryService.getFlows(),
    });
  }

  private emitBrokerTargetNotification(notification: common.BrokerTargetNotification) {
    this.server.emit('broker_target_missing', notification);
  }

  private validateDestination(schema: common.SchemaDefinition): boolean {
    const destination = schema.destination;
    if (destination.transport !== common.TransportType.RABBITMQ) return true;

    if (destination.targetType !== 'exchange' && destination.targetType !== 'queue') {
      this.logger.error(
        `Invalid RabbitMQ target type for schema "${schema.id}": ${destination.targetType}`,
      );
      return false;
    }

    if (!destination.target?.trim()) {
      this.logger.error(`Missing target name for schema "${schema.id}"`);
      return false;
    }

    return true;
  }

  private resolveSchema(payload: {
    schemaId: string;
    schema?: common.SchemaDefinition;
  }): common.SchemaDefinition | null {
    if (payload.schema) {
      if (payload.schema.id !== payload.schemaId) {
        this.logger.warn(`Schema ID mismatch: ${payload.schema.id} vs ${payload.schemaId}`);
        return null;
      }
      return payload.schema;
    }

    return this.getSchemaById(payload.schemaId);
  }

  private emitThrottledUpdate(
    schemaId: string,
    batchSize: number,
    receivedCount: number,
    sampleData?: unknown[],
    sampleResponses?: unknown[],
  ) {
    let state = this.throttledUpdates.get(schemaId);

    if (!state) {
      state = { batchSize: 0, receivedCount: 0, sampleData: [], sampleResponses: [], timer: null };
      this.throttledUpdates.set(schemaId, state);
    }

    state.batchSize += batchSize;
    state.receivedCount += receivedCount;

    if (sampleData) {
      state.sampleData = sampleData;
    }

    if (sampleResponses) {
      state.sampleResponses = sampleResponses;
    }

    if (!state.timer) {
      state.timer = setTimeout(() => {
        const current = this.throttledUpdates.get(schemaId);
        if (!current) return;

        this.server.emit('messages_batch_sent', {
          schemaId,
          batchSize: current.batchSize,
          receivedCount: current.receivedCount,
          sampleData: current.sampleData,
          sampleResponses: current.sampleResponses,
        });

        current.batchSize = 0;
        current.receivedCount = 0;
        current.timer = null;
      }, this.UPDATE_DELAY);
    }
  }

  // Suppress sample capture above this throughput (msg/s) to reduce WebSocket overhead.
  private static readonly SAMPLE_SUPPRESS_THRESHOLD = 5000;

  private shouldCaptureSamples(schemaId: string): boolean {
    const state = this.throttledUpdates.get(schemaId);
    if (state?.timer) return false; // throttle already pending
    const { throughput } = this.generatorService.getTelemetry();
    return throughput < StatusGateway.SAMPLE_SUPPRESS_THRESHOLD;
  }

  private getSchemaById(schemaId: string): common.SchemaDefinition | null {
    const schemas = this.discoveryService.getSchemas();

    for (const schema of schemas) {
      if (schema.id === schemaId) {
        return schema;
      }
    }

    return null;
  }

  private countReceivedResponses(schema: common.SchemaDefinition, responses: unknown[]): number {
    if (!schema.destination.isRpc) {
      return 0;
    }

    let receivedCount = 0;

    for (const response of responses) {
      if (response && typeof response === 'object' && !('error' in response)) {
        receivedCount++;
      }
    }

    return receivedCount;
  }

  private buildSampleData(batch: Array<Record<string, unknown> | string>): unknown[] {
    const sampleData: unknown[] = [];
    const limit = Math.min(batch.length, 50);

    for (let index = 0; index < limit; index++) {
      const item = batch[index];

      if (typeof item === 'string') {
        try {
          sampleData.push(JSON.parse(item));
        } catch {
          sampleData.push(item);
        }
      } else {
        sampleData.push(item);
      }
    }

    return sampleData;
  }

  private buildSampleResponses(responses: unknown[]): unknown[] {
    const sampleResponses: unknown[] = [];
    const limit = Math.min(responses.length, 50);

    for (let index = 0; index < limit; index++) {
      sampleResponses.push(responses[index]);
    }

    return sampleResponses;
  }

  private getFakerNamespaces(): string[] {
    const namespaces: string[] = [];

    for (const [moduleName, moduleObj] of Object.entries(
      faker as unknown as Record<string, unknown>,
    )) {
      if (IGNORED_FAKER_NAMESPACES.includes(moduleName)) {
        continue;
      }

      if (typeof moduleObj === 'object' && moduleObj !== null) {
        for (const [methodName, methodObj] of Object.entries(
          moduleObj as Record<string, unknown>,
        )) {
          if (typeof methodObj === 'function') {
            namespaces.push(`${moduleName}.${methodName}`);
          }
        }
      }
    }

    return namespaces.sort();
  }
}
