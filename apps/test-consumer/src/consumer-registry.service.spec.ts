import { TransportType } from '@machine-gun/common';
import { describe, expect, it } from 'vitest';
import { ConsumerRegistryService } from './consumer-registry.service';

describe('ConsumerRegistryService', () => {
  it('records, summarizes, and clears receipts', () => {
    const service = new ConsumerRegistryService();

    service.record({
      consumerId: 'rabbit-dummy-topic-consumer',
      consumerName: 'Rabbit Dummy Topic Consumer',
      transport: TransportType.RABBITMQ,
      kind: 'subscribe',
      receivedAt: '2026-04-26T23:00:00.000Z',
      payload: { hello: 'world' },
      exchange: 'dummy.topic.consumer',
      routingKey: 'dummy.topic.#',
    });

    service.record({
      consumerId: 'rabbit-dummy-topic-consumer',
      consumerName: 'Rabbit Dummy Topic Consumer',
      transport: TransportType.KAFKA,
      kind: 'subscribe',
      receivedAt: '2026-04-26T23:00:01.000Z',
      payload: { hello: 'again' },
      topic: 'test.kafka.basic',
      key: 'dummy.topic.#',
    });

    expect(service.count()).toBe(2);
    expect(service.list()).toHaveLength(2);
    expect(service.summary()).toEqual([
      {
        consumerId: 'rabbit-dummy-topic-consumer',
        consumerName: 'Rabbit Dummy Topic Consumer',
        count: 2,
      },
    ]);
    expect(service.getStats().topics).toEqual({
      'test.kafka.basic': 1,
    });

    service.clear();
    expect(service.count()).toBe(0);
  });
});
