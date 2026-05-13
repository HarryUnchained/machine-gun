import { AmqpConnection, type MessageHandlerOptions } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  TransportType,
  getErrorMessage,
  type RabbitDummyConsumerReceipt,
  type RabbitDummyConsumerResponse,
  RABBIT_TEST_SCENARIOS,
  type RabbitTestScenario,
} from '@machine-gun/common';
import { ConsumerRegistryService } from './consumer-registry.service';

type RabbitHandlerRegistration = {
  id: string;
  kind: 'subscribe' | 'rpc';
  targetType: 'exchange' | 'queue';
  target: string;
  options: MessageHandlerOptions;
  handler: (payload: unknown) => unknown;
};

@Injectable()
export class RabbitConsumersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitConsumersService.name);
  private static readonly RETRY_INTERVAL_MS = 5000;
  private readonly isVerbose: boolean;
  private readonly registeredHandlers: Set<string>;
  private readonly pendingHandlers: Set<string>;
  private readonly missingTargets: Set<string>;
  private refreshPromise: Promise<void> | undefined;
  private retryTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly consumerRegistry: ConsumerRegistryService,
    private readonly amqpConnection: AmqpConnection,
  ) {
    this.isVerbose = process.env['CONSUMER_VERBOSE'] === 'true';
    this.registeredHandlers = new Set();
    this.pendingHandlers = new Set();
    this.missingTargets = new Set();
  }

  public async onModuleInit() {
    const managedConnection = this.amqpConnection.managedConnection;

    if (managedConnection?.isConnected?.()) {
      await this.refreshStatus();
    }

    managedConnection?.on?.('connect', () => {
      void this.refreshStatus();
    });

    this.retryTimer = setInterval(() => {
      if (this.pendingHandlers.size > 0 || this.missingTargets.size > 0) {
        void this.refreshStatus();
      }
    }, RabbitConsumersService.RETRY_INTERVAL_MS);
  }

  public onModuleDestroy() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  public getStatus() {
    const missingExchanges: string[] = [];
    const missingQueues: string[] = [];
    const readyHandlers = Array.from(this.registeredHandlers).sort();
    const pendingHandlers = Array.from(this.pendingHandlers).sort();

    for (const registration of this.getHandlerRegistrations()) {
      if (this.registeredHandlers.has(registration.id)) {
        continue;
      }

      if (registration.targetType === 'exchange') {
        missingExchanges.push(registration.target);
        continue;
      }

      missingQueues.push(registration.target);
    }

    missingExchanges.sort();
    missingQueues.sort();

    return {
      readyHandlerCount: readyHandlers.length,
      readyHandlers,
      pendingHandlerCount: pendingHandlers.length,
      pendingHandlers,
      missingExchanges,
      missingQueues,
    };
  }

  public async refreshStatus() {
    if (!this.refreshPromise) {
      this.refreshPromise = this.registerRabbitHandlers().finally(() => {
        this.refreshPromise = undefined;
      });
    }

    await this.refreshPromise;
    return this.getStatus();
  }

  public handleDirect(payload: unknown) {
    this.record('rmq-exchange-direct', 'subscribe', payload, 'test-consumer-direct');
  }

  public handleTopic(payload: unknown) {
    this.record('rmq-exchange-topic', 'subscribe', payload, 'test-consumer-topic');
  }

  public handleFanout(payload: unknown) {
    this.record('rmq-exchange-fanout', 'subscribe', payload, 'test-consumer-fanout');
  }

  public handleHeaders(payload: unknown) {
    this.record('rmq-exchange-headers', 'subscribe', payload, 'test-consumer-headers');
  }

  public handleQueueDirect(payload: unknown) {
    this.record('rmq-queue-direct', 'subscribe', payload, 'test.direct.queue');
  }

  public handleAutoDelete(payload: unknown) {
    this.record('rmq-queue-autodelete', 'subscribe', payload, 'test.autodelete.queue');
  }

  public handleRpcQueue(payload: unknown) {
    return this.record('rmq-rpc-queue', 'rpc', payload, 'test.rpc.queue');
  }

  public handleRpcExchange(payload: unknown) {
    return this.record('rmq-rpc-exchange', 'rpc', payload, 'test-consumer-rpc-exchange');
  }

  public handleTtl(payload: unknown) {
    this.record('rmq-message-ttl', 'subscribe', payload, 'test.ttl.queue');
  }

  public handlePriority(payload: unknown) {
    this.record('rmq-priority', 'subscribe', payload, 'test.priority.queue');
  }

  private record(scenarioId: string, kind: 'subscribe' | 'rpc', payload: unknown, queue?: string) {
    const scenario = (RABBIT_TEST_SCENARIOS as unknown as RabbitTestScenario[]).find(
      (s) => s.id === scenarioId,
    );
    if (!scenario) {
      this.logger.warn(`Missing scenario for ID: ${scenarioId}`);
      return;
    }

    const receipt: RabbitDummyConsumerReceipt = {
      consumerId: scenario.id,
      consumerName: scenario.name,
      transport: TransportType.RABBITMQ,
      kind,
      receivedAt: new Date().toISOString(),
      payload,
      exchange: scenario.destination.target,
      ...(queue ? { queue } : {}),
      ...(scenario.destination.routingKey ? { routingKey: scenario.destination.routingKey } : {}),
    };

    if (this.isVerbose) {
      const source = queue || scenario.destination.target;
      this.logger.verbose(`[${kind}] Received on ${source}: ${JSON.stringify(payload)}`);
    }

    this.consumerRegistry.record(receipt);

    if (kind === 'rpc') {
      return {
        ok: true as const,
        consumerId: scenario.id,
        consumerName: scenario.name,
        receivedAt: new Date().toISOString(),
        payload,
      };
    }
    return undefined;
  }

  private async registerRabbitHandlers() {
    for (const registration of this.getHandlerRegistrations()) {
      if (
        this.registeredHandlers.has(registration.id) ||
        this.pendingHandlers.has(registration.id)
      ) {
        continue;
      }

      this.pendingHandlers.add(registration.id);

      try {
        const targetExists = await this.checkTargetExists(registration);
        if (!targetExists) {
          this.markMissingTarget(registration);
          continue;
        }

        await this.registerHandler(registration);
        this.registeredHandlers.add(registration.id);
        this.missingTargets.delete(registration.id);
      } catch (error: unknown) {
        if (this.isVerbose) {
          this.logger.debug(
            `Rabbit handler setup deferred for ${registration.id}: ${getErrorMessage(error)}`,
          );
        }
      } finally {
        this.pendingHandlers.delete(registration.id);
      }
    }
  }

  private async registerHandler(registration: RabbitHandlerRegistration) {
    if (registration.kind === 'rpc') {
      await this.amqpConnection.createRpc(
        (payload) => Promise.resolve(registration.handler(payload) as RabbitDummyConsumerResponse),
        registration.options,
      );
      return;
    }

    await this.amqpConnection.createSubscriber(
      (payload) => {
        registration.handler(payload);
        return Promise.resolve();
      },
      registration.options,
      registration.id,
    );
  }

  private async checkTargetExists(registration: RabbitHandlerRegistration): Promise<boolean> {
    interface AMQPChannel {
      on(event: string, listener: (...args: unknown[]) => void): void;
      checkExchange(exchange: string): Promise<unknown>;
      checkQueue(queue: string): Promise<unknown>;
      close(): Promise<void>;
    }

    let channel: AMQPChannel | undefined;

    try {
      if (!this.amqpConnection.connection) return false;
      const conn = this.amqpConnection.connection as unknown as {
        createChannel: () => Promise<unknown>;
      };
      channel = (await conn.createChannel()) as AMQPChannel;

      if (channel && typeof channel.on === 'function') {
        channel.on('error', () => {});
      }

      if (registration.targetType === 'exchange') {
        await channel.checkExchange(registration.target);
        return true;
      }

      await channel.checkQueue(registration.target);
      return true;
    } catch {
      return false;
    } finally {
      try {
        if (channel && typeof channel.close === 'function') {
          await channel.close();
        }
      } catch {
        // Ignore close error
      }
    }
  }

  private markMissingTarget(registration: RabbitHandlerRegistration) {
    this.missingTargets.add(registration.id);
  }

  private getHandlerRegistrations(): RabbitHandlerRegistration[] {
    return [
      {
        id: 'rmq-exchange-direct',
        kind: 'subscribe',
        targetType: 'exchange',
        target: 'test.direct',
        options: {
          exchange: 'test.direct',
          routingKey: 'test.direct.key',
          queue: 'test-consumer-direct',
        },
        handler: (payload) => this.handleDirect(payload),
      },
      {
        id: 'rmq-exchange-topic',
        kind: 'subscribe',
        targetType: 'exchange',
        target: 'test.topic',
        options: {
          exchange: 'test.topic',
          routingKey: 'test.topic.#',
          queue: 'test-consumer-topic',
        },
        handler: (payload) => this.handleTopic(payload),
      },
      {
        id: 'rmq-exchange-fanout',
        kind: 'subscribe',
        targetType: 'exchange',
        target: 'test.fanout',
        options: {
          exchange: 'test.fanout',
          routingKey: '',
          queue: 'test-consumer-fanout',
        },
        handler: (payload) => this.handleFanout(payload),
      },
      {
        id: 'rmq-exchange-headers',
        kind: 'subscribe',
        targetType: 'exchange',
        target: 'test.headers',
        options: {
          exchange: 'test.headers',
          routingKey: '',
          queue: 'test-consumer-headers',
          queueOptions: {
            bindQueueArguments: { 'x-match': 'all', category: 'test', priority: 'high' },
          },
        },
        handler: (payload) => this.handleHeaders(payload),
      },
      {
        id: 'rmq-queue-direct',
        kind: 'subscribe',
        targetType: 'queue',
        target: 'test.direct.queue',
        options: {
          queue: 'test.direct.queue',
          createQueueIfNotExists: false,
        },
        handler: (payload) => this.handleQueueDirect(payload),
      },
      {
        id: 'rmq-queue-autodelete',
        kind: 'subscribe',
        targetType: 'queue',
        target: 'test.autodelete.queue',
        options: {
          queue: 'test.autodelete.queue',
          queueOptions: { autoDelete: true },
          createQueueIfNotExists: false,
        },
        handler: (payload) => this.handleAutoDelete(payload),
      },
      {
        id: 'rmq-rpc-queue',
        kind: 'rpc',
        targetType: 'queue',
        target: 'test.rpc.queue',
        options: {
          exchange: '',
          routingKey: 'test.rpc.queue',
          queue: 'test.rpc.queue',
          createQueueIfNotExists: false,
        },
        handler: (payload) => this.handleRpcQueue(payload),
      },
      {
        id: 'rmq-rpc-exchange',
        kind: 'rpc',
        targetType: 'exchange',
        target: 'test.rpc.exchange',
        options: {
          exchange: 'test.rpc.exchange',
          routingKey: 'test.rpc.key',
          queue: 'test-consumer-rpc-exchange',
        },
        handler: (payload) => this.handleRpcExchange(payload),
      },
      {
        id: 'rmq-message-ttl',
        kind: 'subscribe',
        targetType: 'queue',
        target: 'test.ttl.queue',
        options: {
          queue: 'test.ttl.queue',
          queueOptions: { arguments: { 'x-message-ttl': 5000 } },
          createQueueIfNotExists: false,
        },
        handler: (payload) => this.handleTtl(payload),
      },
      {
        id: 'rmq-priority',
        kind: 'subscribe',
        targetType: 'queue',
        target: 'test.priority.queue',
        options: {
          queue: 'test.priority.queue',
          queueOptions: { arguments: { 'x-max-priority': 10 } },
          createQueueIfNotExists: false,
        },
        handler: (payload) => this.handlePriority(payload),
      },
    ];
  }
}
