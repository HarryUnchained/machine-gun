import helmet from '@fastify/helmet';
import { getErrorMessage } from '@machine-gun/common';
import { LogLevel, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

function getLogLevels(): LogLevel[] {
  const rawLevels = process.env.LOG_LEVELS;

  if (!rawLevels) {
    return ['log', 'error', 'warn', 'debug'];
  }

  const levels: LogLevel[] = [];
  const parts = rawLevels.split(',');

  for (const part of parts) {
    const level = part.trim();

    if (level) {
      levels.push(level as LogLevel);
    }
  }

  return levels;
}

async function bootstrap() {
  const logger = new Logger('Main');
  const logLevels = getLogLevels();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: false,
    logger: logLevels,
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  await app.register(helmet as any, {
    contentSecurityPolicy: false,
  });
  app.setGlobalPrefix('api');

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.APP_PORT || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Backend online: http://localhost:${port}`);
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Main');
  logger.error(`Failed to start backend: ${getErrorMessage(error)}`);
  process.exit(1);
});
