import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConsumerRegistryService } from './consumer-registry.service';
import { KafkaConsumersService } from './kafka-consumers.service';
import { RabbitConsumersService } from './rabbit-consumers.service';

const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: isProd ? [] : ['.env'] }),
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const uri = configService.get<string>('RABBIT') ?? 'amqp://guest:guest@localhost:5672';

        return {
          uri,
          connectionInitOptions: {
            wait: true,
            timeout: 5000,
            skipDisconnectFailedLogging: true,
          },
          registerHandlers: false,
        };
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService, ConsumerRegistryService, RabbitConsumersService, KafkaConsumersService],
})
export class AppModule {}
