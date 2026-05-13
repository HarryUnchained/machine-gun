import { Injectable, Logger } from '@nestjs/common';
import {
  FlowEdge,
  FlowNode,
  FlowNodeMessageEvent,
  FlowNodeRuntimeStatus,
  FlowNodeStatusEvent,
  SimulationFlow,
  getErrorMessage,
  SchemaDefinition,
} from '@machine-gun/common';
import { Subject } from 'rxjs';
import { all, create } from 'mathjs';
import { GeneratorService } from './generator.service';
import { PublisherService } from './publishing/publisher.service';
import { SchemaDiscoveryService } from './discovery.service';

const math = create(all!);

interface NodeExecutionState {
  sentCount: number;
  startTime: number;
  pulseTimer: NodeJS.Timeout | undefined;
  pulseEnabled: boolean;
  status: FlowNodeRuntimeStatus;
  completed: boolean;
}

interface FlowExecutionState {
  flow: SimulationFlow;
  nodes: Map<string, NodeExecutionState>;
  activeTimers: Set<NodeJS.Timeout>;
  activeExecutions: number;
}

type GeneratedFlowMessage = Record<string, unknown>;

@Injectable()
export class FlowEngineService {
  private readonly logger = new Logger(FlowEngineService.name);
  private readonly activeFlows = new Map<string, FlowExecutionState>();

  private readonly statusSubject = new Subject<FlowNodeStatusEvent>();
  readonly status$ = this.statusSubject.asObservable();

  private readonly activitySubject = new Subject<FlowNodeMessageEvent>();
  readonly activity$ = this.activitySubject.asObservable();

  private readonly lifecycleSubject = new Subject<{ flowId: string; status: 'stopped' }>();
  readonly lifecycle$ = this.lifecycleSubject.asObservable();

  constructor(
    private readonly generatorService: GeneratorService,
    private readonly publisherService: PublisherService,
    private readonly discoveryService: SchemaDiscoveryService,
  ) {
    this.initializeMathHelpers();
  }

  public startFlow(flow: SimulationFlow) {
    this.logger.log(`Starting flow: ${flow.name} (${flow.id})`);

    const executionState = this.createExecutionState(flow);
    this.activeFlows.set(flow.id, executionState);

    const nodesToStart = this.resolveNodesToStart(flow);

    for (const node of nodesToStart) {
      this.startNodePulse(flow, node, executionState);
    }
  }

  public stopFlow(flowId: string) {
    const state = this.activeFlows.get(flowId);
    if (!state) {
      return;
    }

    this.logger.log(`Request to stop flow: ${flowId}`);

    for (const timer of state.activeTimers) {
      clearTimeout(timer);
    }

    for (const nodeState of state.nodes.values()) {
      if (nodeState.pulseTimer) {
        clearTimeout(nodeState.pulseTimer);
        nodeState.pulseTimer = undefined;
      }
    }

    this.activeFlows.delete(flowId);
    this.lifecycleSubject.next({ flowId, status: 'stopped' });
    this.logger.log(`Flow stopped: ${flowId}`);
  }

  private initializeMathHelpers() {
    const mathInstance = math as unknown as Record<string, unknown>;

    if (typeof mathInstance['import'] !== 'function') {
      return;
    }

    (mathInstance['import'] as (data: unknown, options: unknown) => void)(
      {
        timestamp: (value: string | number | Date) => new Date(value).getTime(),
        now: () => Date.now(),
      },
      { override: true },
    );
  }

  private createExecutionState(flow: SimulationFlow): FlowExecutionState {
    const executionState: FlowExecutionState = {
      flow,
      nodes: new Map(),
      activeTimers: new Set(),
      activeExecutions: 0,
    };

    for (const node of flow.nodes) {
      executionState.nodes.set(node.id, {
        sentCount: 0,
        startTime: Date.now(),
        pulseTimer: undefined,
        pulseEnabled: false,
        status: 'idle',
        completed: false,
      });
    }

    return executionState;
  }

  private findEntryNodes(flow: SimulationFlow): FlowNode[] {
    const entryNodes: FlowNode[] = [];

    for (const node of flow.nodes) {
      let hasIncomingEdge = false;

      for (const edge of flow.edges) {
        if (edge.target === node.id) {
          hasIncomingEdge = true;
          break;
        }
      }

      if (!hasIncomingEdge) {
        entryNodes.push(node);
      }
    }

    return entryNodes;
  }

  private startNodePulse(flow: SimulationFlow, node: FlowNode, state: FlowExecutionState) {
    const nodeState = state.nodes.get(node.id);
    if (!nodeState) {
      return;
    }

    nodeState.pulseEnabled = true;

    const settings = node.settings ?? {};
    const intervalMs = this.resolveNodePulseIntervalMs(node);

    const pulse = async () => {
      nodeState.pulseTimer = undefined;

      try {
        if (this.hasNodeReachedLimit(nodeState, settings.count, settings.duration)) {
          this.logger.log(`Node "${node.id}" reached limit. Stopping pulse.`);
          this.updateNodeStatus(flow.id, node.id, nodeState, 'completed');
          this.maybeFinalizeFlow(flow.id);
          return;
        }

        await this.executeNode(flow, node, state);

        if (nodeState.completed || !this.activeFlows.has(flow.id)) {
          this.maybeFinalizeFlow(flow.id);
          return;
        }

        const timer = setTimeout(() => {
          void pulse();
        }, intervalMs);
        nodeState.pulseTimer = timer;
      } catch (error: unknown) {
        this.emitNodeStatus(flow.id, node.id, 'error');
        this.logger.error(`Pulse loop failure [${node.id}]: ${getErrorMessage(error)}`);
      }
    };

    const initialTimer = setTimeout(() => {
      void pulse();
    }, intervalMs);

    nodeState.pulseTimer = initialTimer;
  }

  private hasNodeReachedLimit(
    nodeState: NodeExecutionState,
    maxCount?: number,
    maxDurationSeconds?: number,
  ): boolean {
    const allowedCount = maxCount ?? Infinity;
    const allowedDurationSeconds = maxDurationSeconds ?? Infinity;
    const elapsedSeconds = (Date.now() - nodeState.startTime) / 1000;

    return nodeState.sentCount >= allowedCount || elapsedSeconds >= allowedDurationSeconds;
  }

  private async executeNode(
    flow: SimulationFlow,
    node: FlowNode,
    state: FlowExecutionState,
    parentMessage?: Record<string, unknown>,
  ) {
    const nodeState = state.nodes.get(node.id);
    if (!nodeState) {
      return;
    }

    const settings = node.settings ?? {};

    if (this.hasNodeReachedLimit(nodeState, settings.count, settings.duration)) {
      this.updateNodeStatus(flow.id, node.id, nodeState, 'completed');
      this.maybeFinalizeFlow(flow.id);
      return;
    }

    state.activeExecutions++;

    try {
      const schema = this.resolveNodeSchema(node);
      if (!schema) {
        this.updateNodeStatus(flow.id, node.id, nodeState, 'error');
        return;
      }

      if (!this.shouldProcessNode(node, parentMessage)) {
        this.updateNodeStatus(flow.id, node.id, nodeState, 'idle');
        return;
      }

      this.updateNodeStatus(flow.id, node.id, nodeState, 'executing');

      const generatedMessage = await this.generateNodeMessage(node, schema);
      if (!generatedMessage) {
        this.updateNodeStatus(flow.id, node.id, nodeState, 'error');
        return;
      }

      const finalMessage = this.buildNodeMessage(flow, node, generatedMessage, parentMessage);

      const responses = await this.publisherService.publishBatch(schema.destination, [
        finalMessage,
      ]);

      nodeState.sentCount++;
      this.recordPublishedMessage();
      this.emitMessageActivity(
        flow.id,
        node.id,
        schema.id,
        schema.destination.isRpc ? responses : [],
        finalMessage,
      );

      if (this.hasNodeReachedLimit(nodeState, settings.count, settings.duration)) {
        this.updateNodeStatus(flow.id, node.id, nodeState, 'completed');
      } else {
        this.updateNodeStatus(flow.id, node.id, nodeState, 'idle');
      }

      await this.triggerDownstream(flow, node, state, finalMessage);
    } catch (error: unknown) {
      this.updateNodeStatus(flow.id, node.id, nodeState, 'error');
      this.logger.error(`Node execution failure [${node.id}]: ${getErrorMessage(error)}`);
    } finally {
      state.activeExecutions = Math.max(0, state.activeExecutions - 1);
      this.maybeFinalizeFlow(flow.id);
    }
  }

  private shouldProcessNode(node: FlowNode, parentMessage?: Record<string, unknown>): boolean {
    const filterExpression = node.settings?.filter;

    if (!filterExpression) {
      return true;
    }

    try {
      return Boolean(math.evaluate(filterExpression, { parent: parentMessage ?? {} }));
    } catch (error: unknown) {
      this.logger.error(`Node filter failure [${node.id}]: ${getErrorMessage(error)}`);
      return false;
    }
  }

  private buildNodeMessage(
    flow: SimulationFlow,
    node: FlowNode,
    generatedMessage: Record<string, unknown>,
    parentMessage?: Record<string, unknown>,
  ): Record<string, unknown> {
    const finalMessage: Record<string, unknown> = { ...generatedMessage };
    const bindings = node.settings?.bindings ?? {};
    const expressions = node.settings?.expressions ?? {};

    this.applyBindings(flow, finalMessage, bindings, parentMessage);
    this.applyExpressions(finalMessage, expressions, parentMessage);

    return finalMessage;
  }

  private applyBindings(
    flow: SimulationFlow,
    targetMessage: Record<string, unknown>,
    bindings: Record<string, string>,
    parentMessage?: Record<string, unknown>,
  ) {
    for (const [targetField, sourcePath] of Object.entries(bindings)) {
      const resolvedValue = this.resolveBindingValue(flow, sourcePath, parentMessage);

      if (resolvedValue !== undefined) {
        targetMessage[targetField] = resolvedValue;
      }
    }
  }

  private resolveBindingValue(
    flow: SimulationFlow,
    sourcePath: string,
    parentMessage?: Record<string, unknown>,
  ): unknown {
    if (!parentMessage) {
      return undefined;
    }

    const segments = sourcePath.split('.');
    if (segments.length === 0) {
      return undefined;
    }

    if (this.hasNodeId(flow, segments[0] ?? '')) {
      segments.shift();
    }

    if (segments.length === 0) {
      return undefined;
    }

    let value: unknown = parentMessage;
    for (const segment of segments) {
      if (value === null || value === undefined || typeof value !== 'object') {
        return undefined;
      }
      value = (value as Record<string, unknown>)[segment];
    }

    return value;
  }

  private applyExpressions(
    targetMessage: Record<string, unknown>,
    expressions: Record<string, string>,
    parentMessage?: Record<string, unknown>,
  ) {
    for (const [fieldName, expression] of Object.entries(expressions)) {
      try {
        targetMessage[fieldName] = math.evaluate(expression, {
          parent: parentMessage ?? {},
          msg: targetMessage,
        });
      } catch (error: unknown) {
        this.logger.error(`Expression failure [${fieldName}]: ${getErrorMessage(error)}`);
      }
    }
  }

  private async triggerDownstream(
    flow: SimulationFlow,
    sourceNode: FlowNode,
    state: FlowExecutionState,
    message: Record<string, unknown>,
  ) {
    for (const edge of flow.edges) {
      if (edge.source !== sourceNode.id) {
        continue;
      }

      const targetNode = this.findNodeById(flow, edge.target);
      if (!targetNode) {
        continue;
      }

      if (!this.shouldTriggerEdge(edge, message)) {
        continue;
      }

      const delayMs = this.resolveEdgeDelay(edge, message);

      if (delayMs > 0) {
        this.scheduleDelayedEdge(flow, targetNode, state, message, delayMs);
        continue;
      }

      await this.executeNode(flow, targetNode, state, message);
    }
  }

  private shouldTriggerEdge(edge: FlowEdge, message: Record<string, unknown>): boolean {
    if (edge.condition === 'immediate' || edge.condition === 'wait') {
      return true;
    }

    if (edge.condition === 'random') {
      return Math.random() >= 0.5;
    }

    try {
      return Boolean(math.evaluate(String(edge.condition), { parent: message, msg: message }));
    } catch (error: unknown) {
      this.logger.error(`Edge condition failure [${edge.id}]: ${getErrorMessage(error)}`);
      return false;
    }
  }

  private resolveEdgeDelay(edge: FlowEdge, message: Record<string, unknown>): number {
    if (edge.delayExpression) {
      try {
        const evaluatedDelay: unknown = math.evaluate(edge.delayExpression, {
          parent: message,
          msg: message,
        });

        if (typeof evaluatedDelay === 'number' && Number.isFinite(evaluatedDelay)) {
          return Math.max(0, evaluatedDelay);
        }
      } catch (error: unknown) {
        this.logger.error(`Edge delay failure [${edge.id}]: ${getErrorMessage(error)}`);
      }
    }

    return edge.delayMs ?? 0;
  }

  private emitNodeStatus(flowId: string, nodeId: string, status: FlowNodeRuntimeStatus) {
    this.statusSubject.next({ flowId, nodeId, status });
  }

  private updateNodeStatus(
    flowId: string,
    nodeId: string,
    nodeState: NodeExecutionState,
    status: FlowNodeRuntimeStatus,
  ) {
    nodeState.status = status;
    if (status === 'completed' || status === 'error') {
      nodeState.completed = true;
      nodeState.pulseTimer = undefined;
      nodeState.pulseEnabled = false;
    }
    this.emitNodeStatus(flowId, nodeId, status);
  }

  private emitMessageActivity(
    flowId: string,
    nodeId: string,
    schemaId: string,
    responses: unknown[],
    finalMessage: Record<string, unknown>,
  ) {
    this.activitySubject.next({
      flowId,
      nodeId,
      schemaId,
      batchSize: 1,
      receivedCount: this.countReceivedResponses(responses),
      sampleData: [finalMessage],
      sampleResponses: responses.slice(0, 1),
      timestamp: Date.now(),
    });
  }

  private countReceivedResponses(responses: unknown[]): number {
    let receivedCount = 0;

    for (const response of responses) {
      if (response && typeof response === 'object' && !('error' in response)) {
        receivedCount++;
      }
    }

    return receivedCount;
  }

  private recordPublishedMessage() {
    const generator = this.generatorService as GeneratorService & {
      recordPublished?: (count: number, trackTelemetry?: boolean) => void;
    };

    if (typeof generator.recordPublished === 'function') {
      generator.recordPublished(1);
    }
  }

  private resolveNodesToStart(flow: SimulationFlow): FlowNode[] {
    const entryNodes = this.findEntryNodes(flow);

    if (entryNodes.length > 0) {
      return entryNodes;
    }

    return flow.nodes;
  }

  private resolveNodePulseIntervalMs(node: FlowNode): number {
    const settings = node.settings ?? {};
    const frequency = settings.frequency ?? 1;
    return 1000 / frequency;
  }

  private resolveNodeSchema(node: FlowNode) {
    const schema = this.discoveryService.getSchema(node.schemaId);

    if (!schema) {
      this.logger.error(`Node "${node.id}" failed: Schema "${node.schemaId}" not found.`);
      return undefined;
    }

    return schema;
  }

  private async generateNodeMessage(
    node: FlowNode,
    schema: SchemaDefinition,
  ): Promise<GeneratedFlowMessage | null> {
    const batch = await this.generatorService.generateBatch(schema, 1);
    const generatedMessage = batch[0];

    if (!generatedMessage || typeof generatedMessage === 'string') {
      this.logger.error(`Node "${node.id}" produced no usable payload.`);
      return null;
    }

    return generatedMessage;
  }

  private scheduleDelayedEdge(
    flow: SimulationFlow,
    targetNode: FlowNode,
    state: FlowExecutionState,
    message: Record<string, unknown>,
    delayMs: number,
  ) {
    const timer = setTimeout(() => {
      void (async () => {
        try {
          await this.executeNode(flow, targetNode, state, message);
        } finally {
          state.activeTimers.delete(timer);
          this.maybeFinalizeFlow(flow.id);
        }
      })();
    }, delayMs);

    state.activeTimers.add(timer);
  }

  private maybeFinalizeFlow(flowId: string) {
    const state = this.activeFlows.get(flowId);
    if (!state) {
      return;
    }

    if (state.activeExecutions > 0 || state.activeTimers.size > 0) {
      return;
    }

    for (const nodeState of state.nodes.values()) {
      if (nodeState.pulseEnabled || nodeState.pulseTimer) {
        return;
      }
    }

    for (const node of state.flow.nodes) {
      const nodeState = state.nodes.get(node.id);
      if (!nodeState || nodeState.status === 'error' || nodeState.completed) {
        continue;
      }

      this.updateNodeStatus(flowId, node.id, nodeState, 'completed');
    }

    this.activeFlows.delete(flowId);
    this.lifecycleSubject.next({ flowId, status: 'stopped' });
    this.logger.log(`Flow completed: ${flowId}`);
  }

  private hasNodeId(flow: SimulationFlow, nodeId: string): boolean {
    for (const node of flow.nodes) {
      if (node.id === nodeId) {
        return true;
      }
    }

    return false;
  }

  private findNodeById(flow: SimulationFlow, nodeId: string): FlowNode | undefined {
    for (const node of flow.nodes) {
      if (node.id === nodeId) {
        return node;
      }
    }

    return undefined;
  }
}
