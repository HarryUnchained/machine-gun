import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { PublisherService } from '../core/publishing/publisher.service';

/**
 * Health check for Kafka.
 */
@Injectable()
export class KafkaHealthIndicator {
  private readonly logger = new Logger(KafkaHealthIndicator.name);

  constructor(
    private readonly health: HealthIndicatorService,
    private readonly publisher: PublisherService,
  ) {}

  public check(key: string): HealthIndicatorResult {
    const status = this.publisher.getInfrastructureStatus();
    const indicator = this.health.check(key);

    if (!status.kafkaAvailable) {
      return indicator.up({ configured: false });
    }

    if (status.kafkaConnecting) {
      return indicator.up({ configured: true, connected: false, connecting: true });
    }

    if (!status.kafkaConnected) {
      this.logger.warn('Kafka disconnected');
      return indicator.down({ configured: true, connected: false, connecting: false });
    }

    return indicator.up({ configured: true, connected: true });
  }
}
