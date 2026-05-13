import {
  GeneratorFieldType,
  type StaticSchemaDefinition,
  TransportType,
} from '@machine-gun/common';

/**
 * Example audit schema used by the demo flow.
 */
export const UserAuditSchema: StaticSchemaDefinition = {
  id: 'user-security-audit',
  name: 'Security Audit Log',
  source: 'static',
  description: 'Tracks security-related events for user accounts.',
  fields: [
    {
      name: 'auditId',
      type: GeneratorFieldType.UUID,
    },
    {
      name: 'userId',
      type: GeneratorFieldType.UUID,
    },
    {
      name: 'action',
      type: GeneratorFieldType.STRING,
      options: { choices: ['LOGIN_SUCCESS', 'PASSWORD_CHANGE', 'MFA_ENABLED'] },
    },
    {
      name: 'timestamp',
      type: GeneratorFieldType.ISO_TIMESTAMP,
    },
    {
      name: 'severity',
      type: GeneratorFieldType.STRING,
      options: { choices: ['INFO', 'LOW', 'MEDIUM', 'HIGH'] },
    },
  ],
  destination: {
    transport: TransportType.RABBITMQ,
    targetType: 'exchange',
    target: 'security.audits',
    routingKey: 'audit.log',
    exchangeType: 'topic',
    /** Create the exchange automatically if it does not exist yet. */
    assertTarget: true,
    durableTarget: true,
  },
  /** Lower default rate than the main user stream. */
  defaultFrequency: 1,
};
