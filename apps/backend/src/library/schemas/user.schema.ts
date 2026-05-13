import {
  GeneratorFieldType,
  type StaticSchemaDefinition,
  TransportType,
} from '@machine-gun/common';

/**
 * Example user event schema used to show the main generator options.
 */
export const UserCreatedSchema: StaticSchemaDefinition = {
  id: 'user-creation',
  name: 'Master Documentation Schema',
  source: 'static',
  description: 'Example user event schema for the demo flow and schema library.',

  fields: [
    {
      name: 'id',
      type: GeneratorFieldType.UUID,
    },
    {
      name: 'username',
      type: GeneratorFieldType.STRING,
      options: { faker: 'internet.userName' },
    },
    {
      name: 'bio',
      type: GeneratorFieldType.STRING,
      options: {
        template: 'A developer from {{location.city}} who loves {{hacker.adjective}} code.',
      },
    },
    {
      name: 'category',
      type: GeneratorFieldType.STRING,
      options: {
        choices: ['PREMIUM', 'STANDARD', 'TRIAL'],
        weights: [10, 80, 10],
      },
    },
    {
      name: 'internalCode',
      type: GeneratorFieldType.REGEX,
      options: { pattern: '[A-Z]{2}-[0-9]{4}' },
    },
    {
      name: 'age',
      type: GeneratorFieldType.INT,
      options: { min: 18, max: 99 },
    },
    {
      name: 'score',
      type: GeneratorFieldType.FLOAT,
      options: { min: 0.0, max: 10.0 },
    },
    {
      name: 'isActive',
      type: GeneratorFieldType.BOOLEAN,
    },
    {
      name: 'deletedAt',
      type: GeneratorFieldType.NULL,
    },
    {
      name: 'createdAt',
      type: GeneratorFieldType.ISO_TIMESTAMP,
    },
    {
      name: 'updatedAt',
      type: GeneratorFieldType.UNIX_DATETIME,
    },
    {
      name: 'schedule',
      type: GeneratorFieldType.CRON,
      options: { pattern: '0 0 * * *' },
    },
    {
      name: 'location',
      type: GeneratorFieldType.LOCATION,
      options: {
        latitude: 51.5074,
        longitude: -0.1278,
        radius: 5,
        format: 'object',
      },
    },
    {
      name: 'metadata',
      type: GeneratorFieldType.OBJECT,
      fields: [
        {
          name: 'version',
          type: GeneratorFieldType.STRING,
          options: { template: 'v1.{{number.int}}' },
        },
        {
          name: 'source',
          type: GeneratorFieldType.STRING,
          options: { choices: ['web', 'ios', 'android'] },
        },
      ],
    },
    {
      name: 'recent_orders',
      type: GeneratorFieldType.ARRAY,
      options: { count: 3 },
      fields: [
        { name: 'orderId', type: GeneratorFieldType.UUID },
        { name: 'amount', type: GeneratorFieldType.FLOAT, options: { min: 10, max: 1000 } },
      ],
    },
  ],

  destination: {
    transport: TransportType.RABBITMQ,
    targetType: 'exchange',
    target: 'user.events',
    routingKey: 'user.created',
    /** Topic exchange keeps routing flexible. */
    exchangeType: 'topic',
    /** Create the exchange automatically if it does not exist yet. */
    assertTarget: true,
    durableTarget: true,
  },

  /** Default rate in messages per second. */
  defaultFrequency: 5,
};
