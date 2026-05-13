import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  type BrokerTargetNotification,
  MessageDestination,
  getErrorMessage,
} from '@machine-gun/common';
import * as amqplib from 'amqplib';
import * as crypto from 'node:crypto';
import { Subject } from 'rxjs';
import { RabbitConnectionPool } from './rabbit-connection-pool';

type RabbitTargetType = 'exchange' | 'queue';
type PublishOptions = Record<string, unknown>;
type RpcRequestOptions = Parameters<AmqpConnection['request']>[0];

interface RawAmqpChannel {
  sendToQueue(queue: string, content: Buffer, options?: unknown): boolean;
  publish(exchange: string, routingKey: string, content: Buffer, options?: unknown): boolean;
  once(event: 'drain', listener: () => void): void;
}

interface AmqpChannelInternals {
  sendToQueue(queue: string, content: Buffer, options?: PublishOptions): boolean;
  publish(exchange: string, routingKey: string, content: Buffer, options?: PublishOptions): boolean;
  once(event: 'drain', listener: () => void): void;
  addSetup(setup: (channel: unknown) => Promise<unknown>): void;
  _rawChannel?: unknown;
  _drainPromise?: Promise<void> | null;
  _rawChannelSetup?: boolean;
}

interface AmqpConnectionInternals {
  createChannel(options: { name: string }): AmqpChannelInternals;
}

@Injectable()
export class RabbitPublisherService {
  private readonly logger = new Logger(RabbitPublisherService.name);

  // Default 16 channels; override with RABBIT_CHANNELS env var (max 32)
  private static readonly MAX_CHANNELS: number = Math.min(
    32,
    Math.max(1, parseInt(process.env.RABBIT_CHANNELS ?? '16', 10) || 16),
  );
  // How often (ms) we may log a WARN about sustained backpressure
  private static readonly BACKPRESSURE_WARN_COOLDOWN_MS = 1000;

  private rabbitConnected = false;
  private rabbitConnecting = false;
  private rabbitAvailable = false;

  private rawRabbitConnection: { createChannel: () => Promise<any> } | null = null;
  private readonly assertionCache = new Map<string, Promise<void>>();
  private channelPool: AmqpChannelInternals[] = [];
  private nextChannelIndex = 0;
  private backpressureActive = false;
  private lastBackpressureWarnAt = 0;
  private readonly brokerNotificationSubject = new Subject<BrokerTargetNotification>();

  readonly brokerNotifications$ = this.brokerNotificationSubject.asObservable();

  /** True when all publish channels (pool + fallback) are blocked. */
  get isBackpressured(): boolean {
    if (this.connectionPool.isReady) {
      return this.connectionPool.isFullySaturated;
    }
    return this.backpressureActive;
  }

  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly connectionPool: RabbitConnectionPool,
  ) {
    this.setupRabbitMq();
  }

  getInfrastructureStatus() {
    if (this.hasAmqpConnection()) {
      const isConnected = this.amqpConnection.managedConnection.isConnected();
      this.rabbitConnected = isConnected;

      if (isConnected) {
        this.rabbitConnecting = false;
      }
    }

    return {
      rabbitmqConnected: this.rabbitConnected,
      rabbitmqConnecting: this.rabbitConnecting,
      rabbitmqAvailable: this.rabbitAvailable,
    };
  }

  async prepareDestination(destination: MessageDestination) {
    if (!this.ensureRabbitConnection('prepare destination')) {
      return;
    }

    const targetType = this.resolveRabbitTargetType(destination);
    await this.assertRabbitDestination(destination, targetType);
  }

  async publish(destination: MessageDestination, data: unknown) {
    if (!this.ensureRabbitConnection('publish')) {
      return;
    }

    const targetType = this.resolveRabbitTargetType(destination);
    await this.assertRabbitDestination(destination, targetType);
    await this.publishToRabbit(destination, targetType, data);
  }

  async publishBatch(destination: MessageDestination, dataBatch: unknown[]): Promise<unknown[]> {
    if (!this.ensureRabbitConnection('publish')) {
      return [];
    }

    const targetType = this.resolveRabbitTargetType(destination);
    await this.assertRabbitDestination(destination, targetType);

    const publishOptions = this.buildPublishOptions(destination);

    if (destination.isRpc) {
      return await this.handleRpcBatch(targetType, destination, dataBatch);
    }

    return await this.handleStandardBatch(targetType, destination, dataBatch, publishOptions);
  }

  private setupRabbitMq() {
    if (!this.hasAmqpConnection()) {
      return;
    }

    this.rabbitAvailable = true;

    const managedConnection = this.amqpConnection.managedConnection;

    if (managedConnection.isConnected()) {
      this.rabbitConnected = true;
      this.rabbitConnecting = false;
    } else {
      this.rabbitConnecting = true;
    }

    managedConnection.on('connect', (payload: unknown) => {
      this.rabbitConnected = true;
      this.rabbitConnecting = false;
      this.logger.log('RabbitMQ link established.');

      if (payload && typeof payload === 'object' && 'connection' in payload) {
        this.rawRabbitConnection = payload.connection as { createChannel: () => Promise<any> };
      }

      this.initializeChannelPool();

      // Initialise the multi-connection publish pool (uses the same broker URL)
      const url = process.env.RABBIT;
      if (url && !this.connectionPool.isReady) {
        void this.connectionPool.initialize(url);
      }
    });

    managedConnection.on('disconnect', (error: { err?: { message?: string } }) => {
      this.resetRabbitConnectionState();
      this.logger.error(`RabbitMQ link dropped: ${error?.err?.message || 'Unknown error'}`);
    });

    managedConnection.on('connecting', () => {
      this.rabbitConnecting = true;
      this.logger.debug('Connecting to RabbitMQ cluster...');
    });
  }

  private initializeChannelPool() {
    this.channelPool = [];
    this.nextChannelIndex = 0;
    this.backpressureActive = false;

    const connection = this.amqpConnection.managedConnection as unknown as AmqpConnectionInternals;

    if (typeof connection.createChannel !== 'function') {
      return;
    }

    this.logger.log(
      `Setting up RabbitMQ channel pool: ${RabbitPublisherService.MAX_CHANNELS} channels`,
    );

    for (let index = 0; index < RabbitPublisherService.MAX_CHANNELS; index++) {
      const channel = connection.createChannel({
        name: `machine-gun-pool-${index}`,
      });

      void channel.addSetup((raw: unknown) => {
        channel._rawChannel = raw;
        return Promise.resolve();
      });

      this.channelPool.push(channel);
    }
  }

  private getChannel(): AmqpChannelInternals {
    if (this.channelPool.length === 0) {
      const channel = this.amqpConnection.channel as unknown as AmqpChannelInternals;
      if (!channel._rawChannelSetup && typeof channel.addSetup === 'function') {
        channel._rawChannelSetup = true;
        void channel.addSetup((raw: unknown) => {
          channel._rawChannel = raw;
          return Promise.resolve();
        });
      }
      return channel;
    }

    const channel = this.channelPool[this.nextChannelIndex % this.channelPool.length];
    this.nextChannelIndex++;
    if (!channel) {
      throw new Error('Failed to retrieve channel from pool');
    }
    return channel;
  }

  private buildPublishOptions(destination: MessageDestination): PublishOptions {
    const options: PublishOptions = {};

    if (destination.messageTtl !== undefined) {
      options['expiration'] = destination.messageTtl;
    }

    if (destination.persistent !== undefined) {
      options['persistent'] = destination.persistent;
    }

    if (destination.priority !== undefined) {
      options['priority'] = destination.priority;
    }

    if (destination.headers !== undefined) {
      options['headers'] = destination.headers;
    }

    return options;
  }

  private async publishToRabbit(
    destination: MessageDestination,
    targetType: RabbitTargetType,
    data: unknown,
  ) {
    const publishOptions = this.buildPublishOptions(destination);

    if (destination.isRpc) {
      const requestOptions = this.buildRabbitRequestOptions(destination, targetType, data);
      await this.amqpConnection.request(requestOptions);
      return;
    }

    if (targetType === 'queue') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await (this.amqpConnection.channel as any).sendToQueue(
        destination.target,
        this.createRabbitPayload(data),
        publishOptions,
      );
      return;
    }

    const routingKey = this.getRoutingKey(destination);

    await this.amqpConnection.publish(destination.target, routingKey, data, publishOptions);
  }

  private resolveRabbitTargetType(destination: MessageDestination): RabbitTargetType {
    if (destination.targetType === 'queue' || destination.targetType === 'exchange') {
      return destination.targetType;
    }

    throw new Error(`RabbitMQ targetType is required. Received: ${destination.targetType}`);
  }

  private async assertRabbitDestination(
    destination: MessageDestination,
    targetType: RabbitTargetType,
  ) {
    if (!destination.assertTarget) {
      return;
    }

    const cacheKey = this.buildAssertionCacheKey(destination, targetType);
    const cachedAssertion = this.assertionCache.get(cacheKey);

    if (cachedAssertion) {
      await cachedAssertion;
      return;
    }

    const assertion = this.createAssertionPromise(destination, targetType, cacheKey);
    this.assertionCache.set(cacheKey, assertion);
    await assertion;
  }

  private buildAssertionCacheKey(
    destination: MessageDestination,
    targetType: RabbitTargetType,
  ): string {
    return [
      targetType,
      destination.target,
      destination.exchangeType || '',
      destination.durableTarget ?? true,
      destination.autoDelete ?? false,
    ].join(':');
  }

  private createAssertionPromise(
    destination: MessageDestination,
    targetType: RabbitTargetType,
    cacheKey: string,
  ): Promise<void> {
    return (async () => {
      const alreadyExists = await this.checkResourceExists(targetType, destination.target);

      if (alreadyExists) {
        this.logger.debug(
          `Infrastructure verified: ${targetType} "${destination.target}" is already present.`,
        );
        return;
      }

      try {
        if (targetType === 'queue') {
          await this.assertQueue(destination);
        } else {
          await this.assertExchange(destination);
        }

        const notification: BrokerTargetNotification = {
          id: crypto.randomUUID(),
          transport: 'rabbitmq',
          targetType,
          target: destination.target,
        };

        if (targetType === 'exchange') {
          notification.exchangeType = destination.exchangeType || 'direct';
        }

        this.brokerNotificationSubject.next(notification);
      } catch (error: unknown) {
        this.assertionCache.delete(cacheKey);
        this.logger.error(
          `Critical error during ${targetType} assertion ("${destination.target}"): ${getErrorMessage(error)}`,
        );
        throw error;
      }
    })();
  }

  private async checkResourceExists(type: RabbitTargetType, name: string): Promise<boolean> {
    if (!this.rabbitConnected || !this.rawRabbitConnection) {
      return false;
    }

    interface MinimalChannel {
      on(event: string, listener: () => void): void;
      checkQueue(name: string): Promise<void>;
      checkExchange(name: string): Promise<void>;
      close(): Promise<void>;
    }

    let tempChannel: MinimalChannel | undefined;

    try {
      tempChannel = (await this.rawRabbitConnection.createChannel()) as MinimalChannel;
      tempChannel.on('error', () => {});

      if (type === 'queue') {
        await tempChannel.checkQueue(name);
      } else {
        await tempChannel.checkExchange(name);
      }

      await tempChannel.close();
      return true;
    } catch (error: unknown) {
      this.logger.debug(
        `Passive check failed for ${type} "${name}". Error: ${getErrorMessage(error)}`,
      );
      if (tempChannel) {
        try {
          await tempChannel.close();
        } catch {
          // Ignore
        }
      }
      return false;
    }
  }

  private async assertQueue(destination: MessageDestination) {
    const queueArguments = this.buildQueueArguments(destination);
    let argumentsOption: Record<string, unknown> | undefined = undefined;

    if (Object.keys(queueArguments).length > 0) {
      argumentsOption = queueArguments;
    }

    this.logger.log(`Attempting to assert queue: ${destination.target}`);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await (this.amqpConnection.channel as any).assertQueue(destination.target, {
      durable: destination.durableTarget ?? true,
      autoDelete: destination.autoDelete ?? false,
      exclusive: destination.exclusive ?? false,
      arguments: argumentsOption,
    });

    this.logger.log(
      `Infrastructure check complete. Successfully asserted queue: ${destination.target}`,
    );
  }

  private async assertExchange(destination: MessageDestination) {
    this.logger.log(
      `Attempting to assert exchange: ${destination.target} (${destination.exchangeType || 'direct'})`,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await (this.amqpConnection.channel as any).assertExchange(
      destination.target,
      destination.exchangeType || 'direct',
      {
        durable: destination.durableTarget ?? true,
        autoDelete: destination.autoDelete ?? false,
      },
    );

    this.logger.log(
      `Infrastructure check complete. Successfully asserted exchange: ${destination.target}`,
    );
  }

  private async handleStandardBatch(
    targetType: RabbitTargetType,
    destination: MessageDestination,
    batch: unknown[],
    options: PublishOptions,
  ): Promise<unknown[]> {
    const responses: { status: 'sent' }[] = [];
    const routingKey = this.getRoutingKey(destination);
    const amqpOptions = options as amqplib.Options.Publish;

    // Prefer the multi-connection pool; fall back to the legacy @golevelup pool
    // if the pool hasn't initialised yet (e.g. very first batch right after startup).
    if (this.connectionPool.isReady) {
      for (let index = 0; index < batch.length; index++) {
        const payload = this.createRabbitPayload(batch[index]);

        const accepted =
          targetType === 'queue'
            ? this.connectionPool.sendToQueue(destination.target, payload, amqpOptions)
            : this.connectionPool.publish(destination.target, routingKey, payload, amqpOptions);

        if (!accepted) {
          this.backpressureActive = true;
          await this.connectionPool.waitForAnyDrain();
          this.backpressureActive = false;
          // Retry this message after drain
          index--;
          continue;
        }

        if (index < 50) responses.push({ status: 'sent' });
      }
      return responses;
    }

    // --- Legacy fallback path (single @golevelup connection) ---
    const poolSize = this.channelPool.length;
    const maxTries = Math.max(1, poolSize);

    for (let index = 0; index < batch.length; index++) {
      const item = batch[index];
      const payload = this.createRabbitPayload(item);

      let writeAccepted = false;
      let triedChannels = 0;

      while (!writeAccepted && triedChannels < maxTries) {
        const channel = this.getChannel();
        if (channel._drainPromise) {
          triedChannels++;
          continue;
        }

        const raw = channel._rawChannel as RawAmqpChannel | undefined;
        const source: RawAmqpChannel = raw ?? channel;

        writeAccepted =
          targetType === 'queue'
            ? source.sendToQueue(destination.target, payload, options)
            : source.publish(destination.target, routingKey, payload, options);

        if (!writeAccepted) {
          if (!channel._drainPromise) {
            channel._drainPromise = new Promise<void>((resolve) => {
              const timer = setTimeout(() => {
                channel._drainPromise = null;
                resolve();
              }, 2000);
              source.once('drain', () => {
                clearTimeout(timer);
                channel._drainPromise = null;
                resolve();
              });
            });
          }
          triedChannels++;
        }
      }

      if (!writeAccepted) {
        this.backpressureActive = true;
        const now = Date.now();
        if (
          now - this.lastBackpressureWarnAt >
          RabbitPublisherService.BACKPRESSURE_WARN_COOLDOWN_MS
        ) {
          this.logger.warn(
            `RabbitMQ ${poolSize > 0 ? 'pool' : 'default channel'} under backpressure. Waiting for drain...`,
          );
          this.lastBackpressureWarnAt = now;
        }

        const drainRaces: Promise<void>[] = [];
        if (poolSize > 0) {
          this.channelPool.forEach((ch) => {
            if (ch._drainPromise) drainRaces.push(ch._drainPromise);
          });
        } else {
          const defaultChannel = this.getChannel();
          if (defaultChannel._drainPromise) drainRaces.push(defaultChannel._drainPromise);
        }

        if (drainRaces.length > 0) await Promise.race(drainRaces);
        this.backpressureActive = false;
      }

      if (index < 50) responses.push({ status: 'sent' });
    }

    return responses;
  }

  private async handleRpcBatch(
    targetType: RabbitTargetType,
    destination: MessageDestination,
    batch: unknown[],
  ): Promise<unknown[]> {
    const requests: Promise<unknown>[] = [];

    for (const payload of batch) {
      const requestOptions = this.buildRabbitRequestOptions(destination, targetType, payload);
      const request = this.amqpConnection.request(requestOptions).catch((error: Error) => ({
        error: error.message,
      }));
      requests.push(request);
    }

    return await Promise.all(requests);
  }

  private buildRabbitRequestOptions(
    destination: MessageDestination,
    targetType: RabbitTargetType,
    payload: unknown,
  ): RpcRequestOptions {
    const requestOptions: RpcRequestOptions = {
      exchange: targetType === 'queue' ? '' : destination.target,
      routingKey: targetType === 'queue' ? destination.target : this.getRoutingKey(destination),
      payload,
    };

    if (destination.rpcTimeout !== undefined) {
      requestOptions.timeout = destination.rpcTimeout;
    }

    if (destination.messageTtl !== undefined) {
      requestOptions.expiration = destination.messageTtl;
    }

    if (destination.headers !== undefined) {
      requestOptions.headers = destination.headers;
    }

    return requestOptions;
  }

  private hasAmqpConnection(): boolean {
    return !!this.amqpConnection;
  }

  private ensureRabbitConnection(action: 'publish' | 'prepare destination'): boolean {
    if (this.hasAmqpConnection() && this.rabbitConnected) {
      return true;
    }

    if (!this.hasAmqpConnection()) {
      this.logger.error(`Cannot ${action} to RabbitMQ: RABBIT is not configured`);
      return false;
    }

    this.logger.error(`Cannot ${action} to RabbitMQ: broker is not connected`);
    return false;
  }

  private resetRabbitConnectionState() {
    this.rabbitConnected = false;
    this.rabbitConnecting = false;
    this.rawRabbitConnection = null;
    this.channelPool = [];
  }

  private getRoutingKey(destination: MessageDestination): string {
    return destination.routingKey || '';
  }

  private serializeMessage(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }

    return JSON.stringify(data);
  }

  private createRabbitPayload(data: unknown): Buffer {
    return Buffer.from(this.serializeMessage(data));
  }

  private buildQueueArguments(destination: MessageDestination): Record<string, unknown> {
    const queueArguments: Record<string, unknown> = {};

    if (destination.deadLetterExchange) {
      queueArguments['x-dead-letter-exchange'] = destination.deadLetterExchange;
    }

    if (destination.deadLetterRoutingKey) {
      queueArguments['x-dead-letter-routing-key'] = destination.deadLetterRoutingKey;
    }

    if (destination.queueMessageTtl) {
      queueArguments['x-message-ttl'] = destination.queueMessageTtl;
    }

    if (destination.queueExpires) {
      queueArguments['x-expires'] = destination.queueExpires;
    }

    if (destination.maxLength) {
      queueArguments['x-max-length'] = destination.maxLength;
    }

    if (destination.maxPriority) {
      queueArguments['x-max-priority'] = destination.maxPriority;
    }

    return queueArguments;
  }
}
