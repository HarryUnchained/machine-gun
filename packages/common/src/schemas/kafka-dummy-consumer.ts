import { TransportType, type MessageDestination } from '../types/transport';
import { GeneratorFieldType, type SchemaField } from '../types/fields';
import { type StaticSchemaDefinition } from '../types/schema';

export interface KafkaTestScenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly destination: MessageDestination;
}

export const KAFKA_TEST_SCENARIOS: readonly KafkaTestScenario[] = [
  {
    id: 'kafka-topic-basic',
    name: 'Kafka Basic Topic',
    description: 'Tests publishing to a Kafka topic without an explicit message key.',
    destination: {
      transport: TransportType.KAFKA,
      target: 'test.kafka.basic',
      assertTarget: true,
    },
  },
  {
    id: 'kafka-topic-routing-key',
    name: 'Kafka Topic With Routing Key Fallback',
    description: 'Tests Kafka publishing that falls back to routingKey as the message key.',
    destination: {
      transport: TransportType.KAFKA,
      target: 'test.kafka.routing',
      routingKey: 'test.kafka.routing.key',
      assertTarget: true,
    },
  },
  {
    id: 'kafka-topic-custom-key',
    name: 'Kafka Topic With Custom Key',
    description: 'Tests Kafka publishing with a custom static partition key.',
    destination: {
      transport: TransportType.KAFKA,
      target: 'test.kafka.custom-key',
      kafkaKey: {
        mode: 'custom',
        customValue: 'machine-gun-static-key',
      },
      assertTarget: true,
    },
  },
  {
    id: 'kafka-topic-field-key',
    name: 'Kafka Topic With Field Key',
    description: 'Tests Kafka publishing with a key derived from the generated payload.',
    destination: {
      transport: TransportType.KAFKA,
      target: 'test.kafka.field-key',
      kafkaKey: {
        mode: 'field',
        fieldPath: 'consumerId',
      },
      assertTarget: true,
    },
  },
];

const baseFields: SchemaField[] = [
  { name: 'consumerId', type: GeneratorFieldType.UUID },
  { name: 'endpoint', type: GeneratorFieldType.STRING },
  { name: 'receivedAt', type: GeneratorFieldType.ISO_TIMESTAMP },
  { name: 'acknowledged', type: GeneratorFieldType.BOOLEAN },
];

export function createKafkaTestSchema(scenario: KafkaTestScenario): StaticSchemaDefinition {
  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    source: 'static',
    fields: [...baseFields],
    destination: { ...scenario.destination },
    defaultFrequency: 1,
  };
}
