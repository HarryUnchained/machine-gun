import { Injectable } from '@nestjs/common';
import { MessageDestination, TransportType } from '@machine-gun/common';
import { KafkaPublisherService } from './kafka-publisher.service';
import { RabbitPublisherService } from './rabbit-publisher.service';

@Injectable()
export class PublisherService {
  public readonly brokerNotifications$;

  constructor(
    private readonly rabbit: RabbitPublisherService,
    private readonly kafka: KafkaPublisherService,
  ) {
    this.brokerNotifications$ = this.rabbit.brokerNotifications$;
  }

  public getInfrastructureStatus() {
    return {
      ...this.rabbit.getInfrastructureStatus(),
      ...this.kafka.getInfrastructureStatus(),
    };
  }

  public isBackpressured(): boolean {
    return this.rabbit.isBackpressured;
  }

  public async prepareDestination(destination: MessageDestination) {
    if (destination.transport === TransportType.KAFKA) {
      await this.kafka.prepareDestination(destination);
      return;
    }

    await this.rabbit.prepareDestination(destination);
  }

  public async publish(destination: MessageDestination, data: unknown) {
    if (destination.transport === TransportType.KAFKA) {
      await this.kafka.prepareDestination(destination);
      await this.kafka.publish(destination, data);
      return;
    }

    await this.rabbit.publish(destination, data);
  }

  public async publishBatch(destination: MessageDestination, batch: unknown[]): Promise<any[]> {
    if (destination.transport === TransportType.KAFKA) {
      await this.kafka.prepareDestination(destination);
      return await this.kafka.publishBatch(destination, batch);
    }

    return await this.rabbit.publishBatch(destination, batch);
  }
}
