import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck, MemoryHealthIndicator } from '@nestjs/terminus';
import { AmqpHealthIndicator } from './amqp-health.indicator';
import { KafkaHealthIndicator } from './kafka-health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly amqp: AmqpHealthIndicator,
    private readonly kafka: KafkaHealthIndicator,
  ) {}

  @Get('liveness')
  @HealthCheck()
  async liveness() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 256 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 512 * 1024 * 1024),
    ]);
  }

  @Get('readiness')
  @HealthCheck()
  async readiness() {
    return this.health.check([
      () => this.amqp.check('rabbitmq'),
      () => this.kafka.check('kafka'),
      () => this.memory.checkHeap('memory_heap', 256 * 1024 * 1024),
    ]);
  }
}
