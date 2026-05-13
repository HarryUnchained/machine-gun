import { TransportType, type MessageDestination } from '../types/transport';
import { GeneratorFieldType, type SchemaField } from '../types/fields';
import { type StaticSchemaDefinition } from '../types/schema';

export interface RabbitTestScenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly destination: MessageDestination;
}

export interface RabbitDummyConsumerReceipt {
  readonly consumerId: string;
  readonly consumerName: string;
  readonly transport?: TransportType;
  readonly kind: 'subscribe' | 'rpc';
  readonly receivedAt: string;
  readonly payload: unknown;
  readonly exchange?: string;
  readonly routingKey?: string;
  readonly queue?: string;
  readonly topic?: string;
  readonly partition?: number;
  readonly key?: string | null;
}

export interface RabbitDummyConsumerSummary {
  readonly consumerId: string;
  readonly consumerName: string;
  readonly count: number;
}

export interface RabbitDummyConsumerResponse {
  readonly ok: true;
  readonly consumerId: string;
  readonly consumerName: string;
  readonly receivedAt: string;
  readonly payload: unknown;
}

export const RABBIT_TEST_SCENARIOS: readonly RabbitTestScenario[] = [
  {
    id: 'rmq-exchange-direct',
    name: 'RMQ Direct Exchange',
    description: 'Tests publishing to a direct exchange with a specific routing key.',
    destination: {
      transport: TransportType.RABBITMQ,
      target: 'test.direct',
      targetType: 'exchange',
      exchangeType: 'direct',
      routingKey: 'test.direct.key',
      assertTarget: true,
      durableTarget: true,
    },
  },
  {
    id: 'rmq-exchange-topic',
    name: 'RMQ Topic Exchange',
    description: 'Tests publishing to a topic exchange with wildcard routing.',
    destination: {
      transport: TransportType.RABBITMQ,
      target: 'test.topic',
      targetType: 'exchange',
      exchangeType: 'topic',
      routingKey: 'test.topic.updates',
      assertTarget: true,
      durableTarget: true,
    },
  },
  {
    id: 'rmq-exchange-fanout',
    name: 'RMQ Fanout Exchange',
    description: 'Tests publishing to a fanout exchange (broadcast).',
    destination: {
      transport: TransportType.RABBITMQ,
      target: 'test.fanout',
      targetType: 'exchange',
      exchangeType: 'fanout',
      assertTarget: true,
      durableTarget: true,
    },
  },
  {
    id: 'rmq-exchange-headers',
    name: 'RMQ Headers Exchange',
    description: 'Tests publishing to a headers exchange with custom header matching.',
    destination: {
      transport: TransportType.RABBITMQ,
      target: 'test.headers',
      targetType: 'exchange',
      exchangeType: 'headers',
      headers: {
        'x-match': 'all',
        category: 'test',
        priority: 'high',
      },
      assertTarget: true,
      durableTarget: true,
    },
  },
  {
    id: 'rmq-queue-direct',
    name: 'RMQ Direct Queue',
    description: 'Tests publishing directly to a queue (default exchange).',
    destination: {
      transport: TransportType.RABBITMQ,
      target: 'test.direct.queue',
      targetType: 'queue',
      routingKey: 'test.direct.queue',
      assertTarget: true,
      durableTarget: true,
    },
  },
  {
    id: 'rmq-queue-autodelete',
    name: 'RMQ Queue Auto-Delete',
    description: 'Tests a queue that deletes itself when no longer in use.',
    destination: {
      transport: TransportType.RABBITMQ,
      target: 'test.autodelete.queue',
      targetType: 'queue',
      routingKey: 'test.autodelete.queue',
      assertTarget: true,
      durableTarget: false,
      autoDelete: true,
    },
  },
  {
    id: 'rmq-rpc-queue',
    name: 'RMQ RPC via Queue',
    description: 'Tests Request-Response pattern over a direct queue.',
    destination: {
      transport: TransportType.RABBITMQ,
      target: 'test.rpc.queue',
      targetType: 'queue',
      routingKey: 'test.rpc.queue',
      isRpc: true,
      assertTarget: true,
      durableTarget: true,
    },
  },
  {
    id: 'rmq-rpc-exchange',
    name: 'RMQ RPC via Exchange',
    description: 'Tests Request-Response pattern over an exchange.',
    destination: {
      transport: TransportType.RABBITMQ,
      target: 'test.rpc.exchange',
      targetType: 'exchange',
      exchangeType: 'direct',
      routingKey: 'test.rpc.key',
      isRpc: true,
      assertTarget: true,
      durableTarget: true,
    },
  },
  {
    id: 'rmq-message-ttl',
    name: 'RMQ Message TTL',
    description: 'Tests messages that expire after a set time.',
    destination: {
      transport: TransportType.RABBITMQ,
      target: 'test.ttl.queue',
      targetType: 'queue',
      routingKey: 'test.ttl.queue',
      messageTtl: 5000,
      assertTarget: true,
      durableTarget: true,
    },
  },
  {
    id: 'rmq-priority',
    name: 'RMQ Priority Queue',
    description: 'Tests a queue with message priority support.',
    destination: {
      transport: TransportType.RABBITMQ,
      target: 'test.priority.queue',
      targetType: 'queue',
      routingKey: 'test.priority.queue',
      maxPriority: 10,
      assertTarget: true,
      durableTarget: true,
    },
  },
];

const baseFields: SchemaField[] = [
  { name: 'consumerId', type: GeneratorFieldType.UUID },
  { name: 'endpoint', type: GeneratorFieldType.STRING },
  { name: 'receivedAt', type: GeneratorFieldType.ISO_TIMESTAMP },
  { name: 'acknowledged', type: GeneratorFieldType.BOOLEAN },
];

export function createRabbitTestSchema(scenario: RabbitTestScenario): StaticSchemaDefinition {
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
