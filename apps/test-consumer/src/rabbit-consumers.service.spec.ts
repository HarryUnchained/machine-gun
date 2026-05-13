import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConsumerRegistryService } from './consumer-registry.service';
import { RabbitConsumersService } from './rabbit-consumers.service';

describe('RabbitConsumersService', () => {
  let connectHandler: (() => void) | undefined;
  let service: RabbitConsumersService;

  beforeEach(() => {
    connectHandler = undefined;

    service = new RabbitConsumersService(new ConsumerRegistryService(), {
      managedConnection: {
        isConnected: vi.fn().mockReturnValue(true),
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'connect') {
            connectHandler = handler;
          }
        }),
      },
      connection: undefined,
      createRpc: vi.fn(),
      createSubscriber: vi.fn(),
    } as unknown as AmqpConnection);
  });

  it('registers handlers during module init when RabbitMQ is already connected', async () => {
    const refreshSpy = vi.spyOn(service, 'refreshStatus').mockResolvedValue(service.getStatus());

    await service.onModuleInit();

    expect(refreshSpy).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();
  });

  it('retries handler registration when RabbitMQ connects later', async () => {
    const refreshSpy = vi.spyOn(service, 'refreshStatus').mockResolvedValue(service.getStatus());

    await service.onModuleInit();
    connectHandler?.();

    expect(connectHandler).toBeTypeOf('function');
    expect(refreshSpy).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
  });
});
