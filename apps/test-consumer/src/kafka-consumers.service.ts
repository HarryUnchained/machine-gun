import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  KAFKA_TEST_SCENARIOS,
  TransportType,
  type KafkaTestScenario,
  type RabbitDummyConsumerReceipt,
} from '@machine-gun/common';
import { ConsumerRegistryService } from './consumer-registry.service';
import { Consumer, Kafka, type EachMessagePayload } from 'kafkajs';

@Injectable()
export class KafkaConsumersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumersService.name);
  private readonly isVerbose: boolean;
  private readonly brokers: string[];
  private readonly scenarioByTopic: Map<string, KafkaTestScenario>;
  private consumer?: Consumer;

  constructor(private readonly consumerRegistry: ConsumerRegistryService) {
    this.isVerbose = process.env['CONSUMER_VERBOSE'] === 'true';
    this.brokers = this.parseBrokers(process.env['KAFKA']);
    this.scenarioByTopic = this.buildScenarioMap();
  }

  public async onModuleInit(): Promise<void> {
    if (this.brokers.length === 0) {
      this.logger.warn('Kafka disabled');
      return;
    }

    const kafka = new Kafka({
      clientId: process.env['KAFKA_CLIENT_ID'] ?? 'machine-gun-test-consumer',
      brokers: this.brokers,
    });

    this.consumer = kafka.consumer({
      groupId: process.env['KAFKA_GROUP_ID'] ?? 'machine-gun-test-consumer',
    });

    await this.consumer.connect();

    const topics = this.getTopics();
    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    await this.consumer.run({
      eachMessage: ({ topic, partition, message }: EachMessagePayload) => {
        this.handleMessage(
          topic,
          partition,
          message.key?.toString() ?? null,
          this.parsePayload(message.value),
        );
        return Promise.resolve();
      },
    });

    this.logger.log(`Kafka connected: ${this.brokers.length} brokers`);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.consumer) {
      return;
    }

    await this.consumer.disconnect();
  }

  private handleMessage(
    topic: string,
    partition: number,
    key: string | null,
    payload: unknown,
  ): void {
    const scenario: KafkaTestScenario | undefined = this.scenarioByTopic.get(topic);
    if (!scenario) {
      this.logger.warn(`Unmanaged topic: ${topic}`);
      return;
    }

    const receipt: RabbitDummyConsumerReceipt = {
      consumerId: scenario.id,
      consumerName: scenario.name,
      transport: TransportType.KAFKA,
      kind: 'subscribe',
      receivedAt: new Date().toISOString(),
      payload,
      topic,
      partition,
      key,
    };

    if (this.isVerbose) {
      this.logger.verbose(
        `[KAFKA] Received on ${topic} (p${partition}): ${JSON.stringify(payload)}`,
      );
    }

    this.consumerRegistry.record(receipt);
  }

  private parsePayload(rawValue: Buffer | null): unknown {
    if (!rawValue) {
      return null;
    }

    const text = rawValue.toString('utf8');

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  private parseBrokers(rawValue: string | undefined): string[] {
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

  private buildScenarioMap(): Map<string, KafkaTestScenario> {
    const scenarioByTopic = new Map<string, KafkaTestScenario>();

    for (const scenario of KAFKA_TEST_SCENARIOS as unknown as KafkaTestScenario[]) {
      scenarioByTopic.set(scenario.destination.target, scenario);
    }

    return scenarioByTopic;
  }

  private getTopics(): string[] {
    const topics: string[] = [];
    const seenTopics = new Set<string>();

    for (const scenario of KAFKA_TEST_SCENARIOS as unknown as KafkaTestScenario[]) {
      const topic = scenario.destination.target;

      if (seenTopics.has(topic)) {
        continue;
      }

      seenTopics.add(topic);
      topics.push(topic);
    }

    return topics;
  }
}
