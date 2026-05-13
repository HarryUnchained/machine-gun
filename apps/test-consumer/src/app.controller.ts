import { Controller, Delete, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ConsumerRegistryService } from './consumer-registry.service';
import type { RabbitDummyConsumerReceipt, RabbitDummyConsumerSummary } from '@machine-gun/common';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly consumerRegistry: ConsumerRegistryService,
  ) {}

  @Get('health')
  public async getStatus() {
    return await this.appService.getStatus();
  }

  @Get('receipts')
  public getReceipts(): readonly RabbitDummyConsumerReceipt[] {
    return this.consumerRegistry.list();
  }

  @Get('receipts/summary')
  public getSummary(): readonly RabbitDummyConsumerSummary[] {
    return this.consumerRegistry.summary();
  }

  @Get('receipts/stats')
  public getStats() {
    return this.consumerRegistry.getStats();
  }

  @Delete('receipts')
  public clear() {
    this.consumerRegistry.clear();
    return { ok: true };
  }
}
