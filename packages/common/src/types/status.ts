/**
 * Aggregated live connection and throughput snapshot.
 */
export interface ConnectionStatus {
  socketConnected: boolean;

  rabbitmqConnected: boolean;
  rabbitmqConnecting: boolean;
  rabbitmqAvailable: boolean;

  kafkaConnected: boolean;
  kafkaConnecting: boolean;
  kafkaAvailable: boolean;

  activeSchemas: number;
  totalMessagesSent: number;
  throughput: number;
  activeSchemaIds?: string[];
}

export interface BrokerTargetNotification {
  id: string;
  transport: 'rabbitmq';
  targetType: 'exchange' | 'queue';
  target: string;
  exchangeType?: 'direct' | 'topic' | 'fanout' | 'headers';
}

export interface SchemaStats {
  sent: number;
  received: number;
}
