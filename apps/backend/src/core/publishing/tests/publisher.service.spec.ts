/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransportType, type MessageDestination } from '@machine-gun/common';
import { PublisherService } from '../publisher.service';

describe('PublisherService', () => {
  let service: PublisherService;
  let mockRabbitPublisherService: {
    brokerNotifications$: symbol;
    getInfrastructureStatus: ReturnType<typeof vi.fn>;
    prepareDestination: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    publishBatch: ReturnType<typeof vi.fn>;
  };
  let mockKafkaPublisherService: {
    getInfrastructureStatus: ReturnType<typeof vi.fn>;
    prepareDestination: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    publishBatch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRabbitPublisherService = {
      brokerNotifications$: Symbol('rabbitNotifications'),
      getInfrastructureStatus: vi.fn().mockReturnValue({
        rabbitmqConnected: true,
        rabbitmqConnecting: false,
        rabbitmqAvailable: true,
      }),
      prepareDestination: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(undefined),
      publishBatch: vi.fn().mockResolvedValue([{ status: 'sent' }]),
    };

    mockKafkaPublisherService = {
      getInfrastructureStatus: vi.fn().mockReturnValue({
        kafkaConnected: true,
        kafkaConnecting: false,
        kafkaAvailable: true,
      }),
      prepareDestination: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(undefined),
      publishBatch: vi.fn().mockResolvedValue([]),
    };

    service = new PublisherService(
      mockRabbitPublisherService as any,
      mockKafkaPublisherService as any,
    );
  });

  it('should expose broker notifications from the Rabbit publisher', () => {
    expect(service.brokerNotifications$).toBe(mockRabbitPublisherService.brokerNotifications$);
  });

  it('should merge infrastructure status from both publishers', () => {
    expect(service.getInfrastructureStatus()).toEqual({
      rabbitmqConnected: true,
      rabbitmqConnecting: false,
      rabbitmqAvailable: true,
      kafkaConnected: true,
      kafkaConnecting: false,
      kafkaAvailable: true,
    });
  });

  it('should route RabbitMQ prepareDestination to the Rabbit publisher', async () => {
    const destination: MessageDestination = {
      transport: TransportType.RABBITMQ,
      target: 'queue.test',
      targetType: 'queue',
    };

    await service.prepareDestination(destination);

    expect(mockRabbitPublisherService.prepareDestination).toHaveBeenCalledWith(destination);
    expect(mockKafkaPublisherService.prepareDestination).not.toHaveBeenCalled();
  });

  it('should route Kafka prepareDestination to the Kafka publisher', async () => {
    const destination: MessageDestination = {
      transport: TransportType.KAFKA,
      target: 'events.test',
    };

    await service.prepareDestination(destination);

    expect(mockKafkaPublisherService.prepareDestination).toHaveBeenCalledWith(destination);
    expect(mockRabbitPublisherService.prepareDestination).not.toHaveBeenCalled();
  });

  it('should prepare and publish through Kafka for single-message Kafka publishes', async () => {
    const destination: MessageDestination = {
      transport: TransportType.KAFKA,
      target: 'events.test',
    };

    await service.publish(destination, { hello: 'world' });

    expect(mockKafkaPublisherService.prepareDestination).toHaveBeenCalledWith(destination);
    expect(mockKafkaPublisherService.publish).toHaveBeenCalledWith(destination, { hello: 'world' });
    expect(mockRabbitPublisherService.publish).not.toHaveBeenCalled();
  });

  it('should publish through Rabbit without touching Kafka for single-message Rabbit publishes', async () => {
    const destination: MessageDestination = {
      transport: TransportType.RABBITMQ,
      target: 'queue.test',
      targetType: 'queue',
    };

    await service.publish(destination, { hello: 'world' });

    expect(mockRabbitPublisherService.publish).toHaveBeenCalledWith(destination, {
      hello: 'world',
    });
    expect(mockKafkaPublisherService.prepareDestination).not.toHaveBeenCalled();
    expect(mockKafkaPublisherService.publish).not.toHaveBeenCalled();
  });

  it('should prepare and publish batches through Kafka for Kafka batch publishes', async () => {
    const destination: MessageDestination = {
      transport: TransportType.KAFKA,
      target: 'events.batch',
    };

    const result = await service.publishBatch(destination, [{ id: 1 }]);

    expect(mockKafkaPublisherService.prepareDestination).toHaveBeenCalledWith(destination);
    expect(mockKafkaPublisherService.publishBatch).toHaveBeenCalledWith(destination, [{ id: 1 }]);
    expect(result).toEqual([]);
  });

  it('should publish batches through Rabbit for Rabbit batch publishes', async () => {
    const destination: MessageDestination = {
      transport: TransportType.RABBITMQ,
      target: 'queue.batch',
      targetType: 'queue',
    };

    const result = await service.publishBatch(destination, [{ id: 1 }]);

    expect(mockRabbitPublisherService.publishBatch).toHaveBeenCalledWith(destination, [{ id: 1 }]);
    expect(mockKafkaPublisherService.prepareDestination).not.toHaveBeenCalled();
    expect(result).toEqual([{ status: 'sent' }]);
  });
});
