import { getErrorMessage } from '@machine-gun/common';
import { Logger } from '@nestjs/common';
import Joi from 'joi';

const logger = new Logger('EnvironmentValidator');

const nodeEnvironments = ['development', 'production', 'test'] as const;

const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid(...nodeEnvironments)
    .default('development'),
  RABBIT: Joi.string().trim().optional(),
  KAFKA: Joi.string().trim().optional(),
  LOG_LEVELS: Joi.string().trim().optional(),
  GENERATOR_BATCH_SIZE: Joi.number().integer().positive().optional(),
  LOAD_TEST_MAX_IN_FLIGHT_BATCHES: Joi.number().integer().positive().optional(),
  LOAD_TEST_MAX_BACKLOG_MS: Joi.number().integer().positive().optional(),
  LOAD_TEST_MAX_CPU_PERCENT: Joi.number().integer().min(1).max(100).optional(),
  PISCINA_MIN_THREADS: Joi.number().integer().positive().optional(),
  PISCINA_MAX_THREADS: Joi.number().integer().positive().optional(),
  API_KEY: Joi.string().default('my-super-secret-key'),
  FRONTEND_URL: Joi.string().default('http://localhost:4200'),
})
  .or('RABBIT', 'KAFKA')
  .messages({
    'object.missing': 'No message broker configured. Set RABBIT or KAFKA.',
  });

export function validate(config: Record<string, unknown>) {
  const { error, value } = environmentSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  }) as { error?: Joi.ValidationError; value: Record<string, unknown> };

  if (error) {
    const message = getErrorMessage(error);
    logger.error(`Env validation failed: ${message}`);
    throw new Error(message);
  }

  return value;
}
