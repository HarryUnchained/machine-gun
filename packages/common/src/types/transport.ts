/**
 * Broker transports supported by the publishing engine.
 */
export enum TransportType {
  RABBITMQ = 'rabbitmq',
  KAFKA = 'kafka',
}

export interface KafkaKeyConfig {
  mode: 'none' | 'uuid' | 'field' | 'custom';
  fieldPath?: string;
  customValue?: string;
}

/**
 * Shared destination settings configuring where and how payloads are published.
 */
export interface MessageDestination {
  transport: TransportType;
  target: string;
  routingKey?: string;
  isRpc?: boolean;

  targetType?: 'exchange' | 'queue';
  assertTarget?: boolean;
  durableTarget?: boolean;
  autoDelete?: boolean;
  exclusive?: boolean;
  exchangeType?: 'direct' | 'topic' | 'fanout' | 'headers';
  deadLetterExchange?: string;
  deadLetterRoutingKey?: string;
  queueMessageTtl?: number;
  queueExpires?: number;
  maxLength?: number;
  maxPriority?: number;
  rpcTimeout?: number;
  messageTtl?: number;
  persistent?: boolean;
  priority?: number;
  headers?: Record<string, string>;

  kafkaPartition?: number;
  kafkaKey?: KafkaKeyConfig;
}

export const RabbitMQHeaderHints = {
  keys: [
    'x-delay',
    'x-dead-letter-exchange',
    'x-dead-letter-routing-key',
    'x-message-ttl',
    'x-priority',
    'content-type',
    'content-encoding',
    'cc',
    'bcc',
    'user_id',
    'app_id',
  ],
  values: {
    'content-type': [
      'application/json',
      'application/xml',
      'text/plain',
      'application/octet-stream',
    ],
    'content-encoding': ['gzip', 'identity'],
  },
} as const;
