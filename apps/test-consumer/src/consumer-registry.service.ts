import { Injectable } from '@nestjs/common';
import type { RabbitDummyConsumerReceipt, RabbitDummyConsumerSummary } from '@machine-gun/common';

@Injectable()
export class ConsumerRegistryService {
  private readonly receipts: RabbitDummyConsumerReceipt[];
  private totalCount: number;
  private readonly schemaCounts: Map<string, number>;
  private readonly exchangeCounts: Map<string, number>;
  private readonly queueCounts: Map<string, number>;
  private readonly topicCounts: Map<string, number>;

  constructor() {
    this.receipts = [];
    this.totalCount = 0;
    this.schemaCounts = new Map();
    this.exchangeCounts = new Map();
    this.queueCounts = new Map();
    this.topicCounts = new Map();
  }

  public record(receipt: RabbitDummyConsumerReceipt): void {
    this.totalCount++;

    const currentSchemaCount = this.schemaCounts.get(receipt.consumerId) || 0;
    this.schemaCounts.set(receipt.consumerId, currentSchemaCount + 1);

    if (receipt.exchange) {
      const currentExchangeCount = this.exchangeCounts.get(receipt.exchange) || 0;
      this.exchangeCounts.set(receipt.exchange, currentExchangeCount + 1);
    }

    if (receipt.queue) {
      const currentQueueCount = this.queueCounts.get(receipt.queue) || 0;
      this.queueCounts.set(receipt.queue, currentQueueCount + 1);
    }

    if (receipt.topic) {
      const currentTopicCount = this.topicCounts.get(receipt.topic) || 0;
      this.topicCounts.set(receipt.topic, currentTopicCount + 1);
    }

    this.receipts.unshift(receipt);

    if (this.receipts.length > 100) {
      this.receipts.pop();
    }
  }

  public list(): readonly RabbitDummyConsumerReceipt[] {
    return [...this.receipts];
  }

  public count(): number {
    return this.totalCount;
  }

  public getStats(): Record<string, unknown> {
    return {
      total: this.totalCount,
      schemas: Object.fromEntries(this.schemaCounts),
      exchanges: Object.fromEntries(this.exchangeCounts),
      queues: Object.fromEntries(this.queueCounts),
      topics: Object.fromEntries(this.topicCounts),
    };
  }

  public summary(): readonly RabbitDummyConsumerSummary[] {
    const summaries: RabbitDummyConsumerSummary[] = [];

    for (const entry of this.schemaCounts.entries()) {
      const [id, count] = entry;
      const name = this.receipts.find((r) => r.consumerId === id)?.consumerName || id;
      summaries.push({
        consumerId: id,
        consumerName: name,
        count,
      });
    }

    return summaries;
  }

  public clear(): void {
    this.receipts.length = 0;
    this.totalCount = 0;
    this.schemaCounts.clear();
    this.exchangeCounts.clear();
    this.queueCounts.clear();
    this.topicCounts.clear();
  }
}
