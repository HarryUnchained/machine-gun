import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { AmqpHealthIndicator } from './amqp-health.indicator';
import { KafkaHealthIndicator } from './kafka-health.indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [AmqpHealthIndicator, KafkaHealthIndicator],
})
export class HealthModule {}
