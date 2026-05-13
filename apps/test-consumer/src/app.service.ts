import { Injectable } from '@nestjs/common';
import { ConsumerRegistryService } from './consumer-registry.service';
import { RabbitConsumersService } from './rabbit-consumers.service';

@Injectable()
export class AppService {
  constructor(
    private readonly consumerRegistry: ConsumerRegistryService,
    private readonly rabbitConsumersService: RabbitConsumersService,
  ) {}

  public async getStatus() {
    return {
      ok: true,
      service: 'test-consumer',
      rabbitmq: !!process.env['RABBIT'],
      kafka: !!process.env['KAFKA'],
      receipts: this.consumerRegistry.count(),
      summaries: this.consumerRegistry.summary(),
      rabbitStatus: await this.rabbitConsumersService.refreshStatus(),
    };
  }
}
