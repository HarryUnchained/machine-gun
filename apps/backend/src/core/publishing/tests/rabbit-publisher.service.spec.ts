/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BrokerTargetNotification,
  type MessageDestination,
  TransportType,
} from '@machine-gun/common';
import { RabbitPublisherService } from '../rabbit-publisher.service';

describe('RabbitPublisherService', () => {
  let service: RabbitPublisherService;
  let mockAmqp: any;
  let mockRawConnection: any;
  let mockTempChannel: any;
  let connectCallback: (payload: any) => void;

  beforeEach(() => {
    mockTempChannel = {
      checkQueue: vi.fn(),
      checkExchange: vi.fn(),
      on: vi.fn(),
      close: vi.fn(),
    };

    mockRawConnection = {
      createChannel: vi.fn().mockResolvedValue(mockTempChannel),
    };

    mockAmqp = {
      managedConnection: {
        on: vi.fn((event: string, callback: any) => {
          if (event === 'connect') {
            connectCallback = callback;
          }
        }),
        isConnected: vi.fn().mockReturnValue(true),
      },
      channel: {
        assertQueue: vi.fn(),
        assertExchange: vi.fn(),
        sendToQueue: vi.fn().mockReturnValue(true),
      },
      publish: vi.fn(),
      request: vi.fn(),
    };

    const mockConnectionPool = {
      isReady: false,
      isFullySaturated: false,
      initialize: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockReturnValue(true),
      sendToQueue: vi.fn().mockReturnValue(true),
      waitForAnyDrain: vi.fn().mockResolvedValue(undefined),
      onModuleDestroy: vi.fn().mockResolvedValue(undefined),
    };

    service = new RabbitPublisherService(mockAmqp, mockConnectionPool as any);
  });

  it('should initialize infrastructure availability based on config', () => {
    const status = service.getInfrastructureStatus();
    expect(status.rabbitmqAvailable).toBe(true);
  });

  describe('RabbitMQ Publishing', () => {
    const dest: MessageDestination = {
      transport: TransportType.RABBITMQ,
      target: 'test-queue',
      targetType: 'queue',
    };

    it('should publish to a queue using sendToQueue', async () => {
      await service.publish(dest, { foo: 'bar' });
      expect(mockAmqp.channel.sendToQueue).toHaveBeenCalledWith(
        'test-queue',
        expect.any(Buffer),
        expect.any(Object),
      );
    });

    it('should assert queue if assertTarget is true and not found on broker', async () => {
      connectCallback({ connection: mockRawConnection });
      mockTempChannel.checkQueue.mockRejectedValueOnce(new Error('404 Not Found'));
      const notifications: BrokerTargetNotification[] = [];
      service.brokerNotifications$.subscribe((notification) => {
        notifications.push(notification);
      });

      const assertDest = { ...dest, assertTarget: true };
      await service.publish(assertDest, { foo: 'bar' });

      expect(mockTempChannel.checkQueue).toHaveBeenCalledWith('test-queue');
      expect(mockAmqp.channel.assertQueue).toHaveBeenCalledWith('test-queue', {
        durable: true,
        autoDelete: false,
        exclusive: false,
        arguments: undefined,
      });
      expect(notifications).toEqual([
        expect.objectContaining({
          transport: 'rabbitmq',
          targetType: 'queue',
          target: 'test-queue',
        }),
      ]);
    });

    it('should skip assertion if verified on broker (passive check succeeds)', async () => {
      connectCallback({ connection: mockRawConnection });
      mockTempChannel.checkQueue.mockResolvedValueOnce(undefined);

      const assertDest = { ...dest, assertTarget: true };
      await service.publish(assertDest, { foo: 'bar' });

      expect(mockTempChannel.checkQueue).toHaveBeenCalledWith('test-queue');
      expect(mockAmqp.channel.assertQueue).not.toHaveBeenCalled();
    });

    it('should skip broker probe and assertion if already in memory cache', async () => {
      connectCallback({ connection: mockRawConnection });
      mockTempChannel.checkQueue.mockRejectedValueOnce(new Error('404 Not Found'));

      const assertDest = { ...dest, assertTarget: true };
      await service.publish(assertDest, { foo: 'bar' });
      await service.publish(assertDest, { foo: 'bar' });

      expect(mockTempChannel.checkQueue).toHaveBeenCalledTimes(1);
      expect(mockAmqp.channel.assertQueue).toHaveBeenCalledTimes(1);
    });

    it('should assert before batch publishing too', async () => {
      connectCallback({ connection: mockRawConnection });
      mockTempChannel.checkQueue.mockRejectedValueOnce(new Error('404 Not Found'));

      await service.publishBatch({ ...dest, assertTarget: true }, [{ foo: 'bar' }]);

      expect(mockAmqp.channel.assertQueue).toHaveBeenCalledTimes(1);
      expect(mockAmqp.channel.sendToQueue).toHaveBeenCalledTimes(1);
    });

    it('should use publish method for exchanges', async () => {
      const exchangeDest: MessageDestination = {
        transport: TransportType.RABBITMQ,
        target: 'test-ex',
        targetType: 'exchange',
        routingKey: 'r-key',
      };
      await service.publish(exchangeDest, { foo: 'bar' });
      expect(mockAmqp.publish).toHaveBeenCalledWith(
        'test-ex',
        'r-key',
        { foo: 'bar' },
        expect.any(Object),
      );
    });

    it('should reject RabbitMQ publish when targetType is missing', async () => {
      const exchangeDestWithoutType: MessageDestination = {
        transport: TransportType.RABBITMQ,
        target: 'security.audits',
        routingKey: 'audit.log',
        exchangeType: 'topic',
        assertTarget: true,
      };

      await expect(service.publish(exchangeDestWithoutType, { foo: 'bar' })).rejects.toThrow(
        /targetType/i,
      );

      expect(mockAmqp.channel.assertExchange).not.toHaveBeenCalled();
      expect(mockAmqp.publish).not.toHaveBeenCalled();
    });

    it('should handle RPC requests', async () => {
      const rpcDest: MessageDestination = {
        transport: TransportType.RABBITMQ,
        target: 'rpc-queue',
        targetType: 'queue',
        isRpc: true,
      };
      await service.publish(rpcDest, { q: 'a' });
      expect(mockAmqp.request).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: { q: 'a' },
          routingKey: 'rpc-queue',
        }),
      );
    });
  });

  it('should log an error if RabbitMQ is not configured but requested', async () => {
    const unconfiguredService = new RabbitPublisherService(
      undefined as unknown as any,
      { isReady: false } as any,
    );
    const loggerSpy = vi.spyOn(
      (unconfiguredService as unknown as { logger: { error: (msg: string) => void } }).logger,
      'error',
    );

    await unconfiguredService.publish({ transport: TransportType.RABBITMQ, target: 'x' }, {});

    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('RABBIT is not configured'));
  });
});
