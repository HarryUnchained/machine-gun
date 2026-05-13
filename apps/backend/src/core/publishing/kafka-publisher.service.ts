import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageDestination, getErrorMessage } from '@machine-gun/common';
import { Kafka, Partitioners, logLevel, type Admin, type Producer } from 'kafkajs';
import * as crypto from 'node:crypto';

const KAFKA_CLIENT_ID = 'machine-gun';

@Injectable()
export class KafkaPublisherService implements OnModuleInit {
  private readonly logger = new Logger(KafkaPublisherService.name);

  private kafkaProducer?: Producer;
  private kafkaAdmin?: Admin;
  private kafkaConnected = false;
  private kafkaConnecting = false;
  private kafkaAvailable = false;
  private kafkaAdminConnected = false;
  private readonly assertionCache = new Map<string, Promise<void>>();

  constructor(private readonly configService: ConfigService) {
    this.setupKafka();
  }

  public async onModuleInit() {
    if (!this.kafkaProducer) {
      return;
    }

    this.kafkaConnecting = true;

    try {
      await this.kafkaProducer.connect();
      this.kafkaConnected = true;
      this.logger.log('Kafka producer connected.');
    } catch (error) {
      this.kafkaConnected = false;
      this.logger.warn(`Kafka connection failed: ${getErrorMessage(error)}`);
    } finally {
      this.kafkaConnecting = false;
    }
  }

  getInfrastructureStatus() {
    return {
      kafkaConnected: this.kafkaConnected,
      kafkaConnecting: this.kafkaConnecting,
      kafkaAvailable: this.kafkaAvailable,
    };
  }

  async prepareDestination(destination: MessageDestination) {
    if (!destination.assertTarget) {
      return;
    }

    const cacheKey = this.buildAssertionCacheKey(destination);
    const cachedAssertion = this.assertionCache.get(cacheKey);
    if (cachedAssertion) {
      await cachedAssertion;
      return;
    }

    const assertion = this.createAssertionPromise(destination, cacheKey);
    this.assertionCache.set(cacheKey, assertion);
    await assertion;
  }

  async publish(destination: MessageDestination, data: unknown) {
    if (!this.ensureKafkaConnection()) {
      return;
    }

    const messages: Array<{ value: string; key: string | null; partition?: number }> = [];
    const message: { value: string; key: string | null; partition?: number } = {
      value: this.serializeMessage(data),
      key: this.resolveKafkaKey(destination, data),
    };

    if (destination.kafkaPartition !== undefined) {
      message.partition = destination.kafkaPartition;
    }

    messages.push(message);

    await this.kafkaProducer!.send({
      topic: destination.target,
      messages,
    });
  }

  async publishBatch(destination: MessageDestination, batch: unknown[]) {
    if (!this.ensureKafkaConnection()) {
      return [];
    }

    const messages: Array<{ value: string; key: string | null; partition?: number }> = [];

    for (const data of batch) {
      const message: { value: string; key: string | null; partition?: number } = {
        value: this.serializeMessage(data),
        key: this.resolveKafkaKey(destination, data),
      };

      if (destination.kafkaPartition !== undefined) {
        message.partition = destination.kafkaPartition;
      }

      messages.push(message);
    }

    await this.kafkaProducer!.send({
      topic: destination.target,
      messages,
    });

    return [];
  }

  private setupKafka() {
    const brokers = this.parseKafkaBrokers(this.configService.get<string>('KAFKA'));
    this.kafkaAvailable = brokers.length > 0;

    if (brokers.length === 0) {
      this.logger.warn('KAFKA not found in config. Kafka disabled.');
      return;
    }

    const kafka = new Kafka({
      clientId: KAFKA_CLIENT_ID,
      brokers,
      connectionTimeout: 3000,
      retry: { retries: 2 },
      logLevel: logLevel.NOTHING,
    });

    this.kafkaProducer = kafka.producer({
      createPartitioner: Partitioners.DefaultPartitioner,
    });
    this.kafkaAdmin = kafka.admin();

    this.kafkaProducer.on('producer.connect', () => {
      this.kafkaConnected = true;
    });

    this.kafkaProducer.on('producer.disconnect', () => {
      this.kafkaConnected = false;
      this.logger.warn('Kafka producer disconnected.');
    });
  }

  private buildAssertionCacheKey(destination: MessageDestination): string {
    return [
      destination.target,
      destination.kafkaPartition ?? '',
      destination.assertTarget ?? false,
    ].join(':');
  }

  private createAssertionPromise(destination: MessageDestination, cacheKey: string): Promise<void> {
    return (async () => {
      try {
        await this.ensureKafkaTopic(destination);
      } catch (error) {
        this.assertionCache.delete(cacheKey);
        this.logger.error(
          `Failed to ensure Kafka topic "${destination.target}": ${getErrorMessage(error)}`,
        );
        throw error;
      }
    })();
  }

  private async ensureKafkaTopic(destination: MessageDestination) {
    if (!this.kafkaAdmin) {
      this.logger.error('Kafka admin is not available. Cannot prepare topic.');
      return;
    }

    await this.ensureKafkaAdminConnected();

    const created = await this.kafkaAdmin.createTopics({
      waitForLeaders: true,
      topics: [
        {
          topic: destination.target,
          numPartitions: this.getRequiredPartitionCount(destination),
        },
      ],
    });

    if (created) {
      this.logger.warn(`Kafka topic "${destination.target}" was missing and has been created.`);
    }
  }

  private async ensureKafkaAdminConnected() {
    if (!this.kafkaAdmin || this.kafkaAdminConnected) {
      return;
    }

    await this.kafkaAdmin.connect();
    this.kafkaAdminConnected = true;
  }

  private getRequiredPartitionCount(destination: MessageDestination): number {
    if (destination.kafkaPartition === undefined) {
      return 1;
    }

    return Math.max(1, destination.kafkaPartition + 1);
  }

  private ensureKafkaConnection(): boolean {
    if (this.kafkaProducer && this.kafkaConnected) {
      return true;
    }

    this.logger.error('Kafka transport is not initialized or connected');
    return false;
  }

  private resolveKafkaKey(destination: MessageDestination, data: unknown): string | null {
    const keyConfig = destination.kafkaKey;

    if (!keyConfig) {
      return destination.routingKey ?? null;
    }

    switch (keyConfig.mode) {
      case 'none':
        return null;
      case 'uuid':
        return crypto.randomUUID();
      case 'custom':
        return keyConfig.customValue ?? null;
      case 'field':
        return this.resolveKafkaFieldKey(keyConfig.fieldPath, data);
      default:
        return null;
    }
  }

  private resolveKafkaFieldKey(fieldPath: string | undefined, data: unknown): string | null {
    if (!fieldPath) {
      return null;
    }

    const segments = fieldPath.split('.');
    let currentValue: unknown = data;

    for (const segment of segments) {
      if (currentValue === null || currentValue === undefined || typeof currentValue !== 'object') {
        currentValue = undefined;
        break;
      }

      currentValue = (currentValue as Record<string, unknown>)[segment];
    }

    if (currentValue === null || currentValue === undefined) {
      this.logger.warn(`Kafka key resolved to null/undefined for field path: ${fieldPath}`);
      return null;
    }

    if (typeof currentValue === 'string') {
      return currentValue;
    }

    if (typeof currentValue === 'number' || typeof currentValue === 'boolean') {
      return String(currentValue);
    }

    return JSON.stringify(currentValue);
  }

  private serializeMessage(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }

    return JSON.stringify(data);
  }

  private parseKafkaBrokers(rawValue: string | undefined): string[] {
    const brokers: string[] = [];

    if (!rawValue) {
      return brokers;
    }

    for (const entry of rawValue.split(',')) {
      const trimmedEntry = entry.trim();

      if (trimmedEntry.length > 0) {
        brokers.push(trimmedEntry);
      }
    }

    return brokers;
  }
}
