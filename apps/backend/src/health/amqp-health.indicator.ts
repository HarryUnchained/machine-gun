import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { PublisherService } from '../core/publishing/publisher.service';

/**
 * Health check for RabbitMQ.
 */
@Injectable()
export class AmqpHealthIndicator {
  private readonly logger = new Logger(AmqpHealthIndicator.name);

  constructor(
    private readonly health: HealthIndicatorService,
    private readonly publisher: PublisherService,
  ) {}

  public check(key: string): HealthIndicatorResult {
    const status = this.publisher.getInfrastructureStatus();
    const indicator = this.health.check(key);

    if (!status.rabbitmqAvailable) {
      return indicator.up({ configured: false });
    }

    if (status.rabbitmqConnecting) {
      return indicator.up({ configured: true, connected: false, connecting: true });
    }

    if (!status.rabbitmqConnected) {
      this.logger.warn('RabbitMQ disconnected');
      return indicator.down({ configured: true, connected: false, connecting: false });
    }

    return indicator.up({ configured: true, connected: true });
  }
}
