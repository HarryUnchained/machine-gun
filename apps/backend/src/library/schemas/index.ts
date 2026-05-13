import { UserCreatedSchema } from './user.schema';
import { UserAuditSchema } from './audit.schema';
import {
  KAFKA_TEST_SCENARIOS,
  RABBIT_TEST_SCENARIOS,
  createKafkaTestSchema,
  createRabbitTestSchema,
  type StaticSchemaDefinition,
} from '@machine-gun/common';

const rabbitSchemas: StaticSchemaDefinition[] = [];
const kafkaSchemas: StaticSchemaDefinition[] = [];

for (const scenario of RABBIT_TEST_SCENARIOS) {
  rabbitSchemas.push(createRabbitTestSchema(scenario));
}

for (const scenario of KAFKA_TEST_SCENARIOS) {
  kafkaSchemas.push(createKafkaTestSchema(scenario));
}

export const STATIC_SCHEMAS: StaticSchemaDefinition[] = [
  UserCreatedSchema,
  UserAuditSchema,
  ...rabbitSchemas,
  ...kafkaSchemas,
];
