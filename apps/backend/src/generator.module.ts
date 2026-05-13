import { Module, Global, type DynamicModule, Logger } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { SchemaDiscoveryService } from './core/discovery.service';
import { GeneratorService } from './core/generator.service';
import { KafkaPublisherService } from './core/publishing/kafka-publisher.service';
import { PublisherService } from './core/publishing/publisher.service';
import { RabbitPublisherService } from './core/publishing/rabbit-publisher.service';
import { RabbitConnectionPool } from './core/publishing/rabbit-connection-pool';
import { StatusGateway } from './gateway/status.gateway';
import { SchemaPersistenceService } from './core/persistence.service';
import { CustomDataService } from './core/custom-data.service';
import { ConfigService } from '@nestjs/config';
import { FlowEngineService } from './core/flow-engine.service';

const logger = new Logger('GeneratorModule');

@Global()
@Module({})
export class GeneratorModule {
  static register(): DynamicModule {
    logger.log('Wiring up core generator infrastructure');

    return {
      module: GeneratorModule,
      global: true,
      imports: [
        RabbitMQModule.forRootAsync({
          useFactory: (configService: ConfigService) => {
            const uri = configService.get<string>('RABBIT');

            if (!uri) {
              logger.warn('RABBIT is missing. RabbitMQ transport will be disabled.');
              return { uri: '', connectionInitOptions: { wait: false } };
            }

            return {
              uri,
              connectionInitOptions: { wait: false, timeout: 3000 },
            };
          },
          inject: [ConfigService],
        }),
      ],
      providers: [
        SchemaPersistenceService,
        CustomDataService,
        SchemaDiscoveryService,
        GeneratorService,
        FlowEngineService,
        KafkaPublisherService,
        PublisherService,
        RabbitConnectionPool,
        RabbitPublisherService,
        StatusGateway,
      ],
      exports: [
        SchemaDiscoveryService,
        GeneratorService,
        FlowEngineService,
        PublisherService,
        CustomDataService,
        RabbitMQModule,
      ],
    };
  }
}
