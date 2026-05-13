/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransportType, type MessageDestination } from '@machine-gun/common';
import { Partitioners, logLevel } from 'kafkajs';
import { KafkaPublisherService } from '../kafka-publisher.service';

const { kafkaCtor, mockAdmin, mockProducer, mockProducerFactory, mockAdminFactory } = vi.hoisted(
  () => ({
    mockProducer: {
      connect: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    },
    mockAdmin: {
      connect: vi.fn().mockResolvedValue(undefined),
      createTopics: vi.fn().mockResolvedValue(true),
    },
    mockProducerFactory: vi.fn(),
    mockAdminFactory: vi.fn(),
    kafkaCtor: vi.fn(function () {}),
  }),
);

vi.mock('kafkajs', () => ({
  Kafka: kafkaCtor,
  Partitioners: {
    DefaultPartitioner: 'default-partitioner',
  },
  logLevel: {
    NOTHING: 0,
  },
}));

describe('KafkaPublisherService', () => {
  let service: KafkaPublisherService;
  let mockConfig: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProducerFactory.mockImplementation(() => mockProducer);
    mockAdminFactory.mockImplementation(() => mockAdmin);
    kafkaCtor.mockImplementation(function () {
      return {
        producer: mockProducerFactory,
        admin: mockAdminFactory,
      };
    });

    mockConfig = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'KAFKA') {
          return 'localhost:9094, localhost:19094';
        }

        return null;
      }),
    };

    service = new KafkaPublisherService(mockConfig as any);
  });

  it('should split broker lists correctly', () => {
    expect(kafkaCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        brokers: ['localhost:9094', 'localhost:19094'],
        logLevel: logLevel.NOTHING,
      }),
    );
  });

  it('should create the producer with an explicit partitioner', () => {
    expect(mockProducerFactory).toHaveBeenCalledWith({
      createPartitioner: Partitioners.DefaultPartitioner,
    });
  });

  it('should connect the producer on module init', async () => {
    await service.onModuleInit();

    expect(mockProducer.connect).toHaveBeenCalledTimes(1);
    expect(service.getInfrastructureStatus()).toEqual({
      kafkaConnected: true,
      kafkaConnecting: false,
      kafkaAvailable: true,
    });
  });

  it('should assert a Kafka topic when requested', async () => {
    const destination: MessageDestination = {
      transport: TransportType.KAFKA,
      target: 'events.users',
      assertTarget: true,
      kafkaPartition: 2,
    };

    await service.prepareDestination(destination);

    expect(mockAdmin.connect).toHaveBeenCalledTimes(1);
    expect(mockAdmin.createTopics).toHaveBeenCalledWith({
      waitForLeaders: true,
      topics: [
        {
          topic: 'events.users',
          numPartitions: 3,
        },
      ],
    });
  });

  it('should publish a keyed Kafka message with partition override', async () => {
    const destination: MessageDestination = {
      transport: TransportType.KAFKA,
      target: 'events.users',
      kafkaPartition: 1,
      kafkaKey: {
        mode: 'custom',
        customValue: 'tenant-1',
      },
    };

    await service.onModuleInit();
    await service.publish(destination, { hello: 'world' });

    expect(mockProducer.send).toHaveBeenCalledWith({
      topic: 'events.users',
      messages: [
        {
          value: JSON.stringify({ hello: 'world' }),
          key: 'tenant-1',
          partition: 1,
        },
      ],
    });
  });

  it('should publish Kafka batches', async () => {
    const destination: MessageDestination = {
      transport: TransportType.KAFKA,
      target: 'events.batch',
      kafkaKey: { mode: 'none' },
    };

    await service.onModuleInit();
    await service.publishBatch(destination, [{ id: 1 }, { id: 2 }]);

    expect(mockProducer.send).toHaveBeenCalledWith({
      topic: 'events.batch',
      messages: [
        {
          value: JSON.stringify({ id: 1 }),
          key: null,
        },
        {
          value: JSON.stringify({ id: 2 }),
          key: null,
        },
      ],
    });
  });
});
