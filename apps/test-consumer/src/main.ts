import 'dotenv/config';
import { LogLevel, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

function getLogLevels(): LogLevel[] {
  const rawLevels = process.env.LOG_LEVELS;

  if (!rawLevels) {
    return ['log', 'error', 'warn'];
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
  const logger = new Logger('Bootstrap');
  const logLevels = getLogLevels();

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: false,
    logger: logLevels,
  });

  const port = Number(process.env.TEST_CONSUMER_PORT || 3001);
  await app.listen(port, '0.0.0.0');

  logger.log(`Test consumer online: http://localhost:${port}`);
}

bootstrap().catch((err: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(`Launch failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
