import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchemaDiscoveryService } from '../discovery.service';
import { TransportType, type SchemaDefinition } from '@machine-gun/common';
import { SchemaPersistenceService } from '../persistence.service';

// Mock the static schemas to have a controlled test environment
vi.mock('../../library/schemas', () => ({
  STATIC_SCHEMAS: [
    {
      id: 'StaticSchema',
      name: 'Static',
      fields: [],
      destination: { transport: 'rabbitmq', target: 'q' },
      defaultFrequency: 1,
      source: 'static',
    },
  ],
}));

describe('SchemaDiscoveryService', () => {
  let service: SchemaDiscoveryService;
  let mockPersistence: SchemaPersistenceService;

  const dynamicSchema: SchemaDefinition = {
    id: 'DynamicSchema',
    name: 'Dynamic',
    fields: [],
    destination: {
      transport: TransportType.KAFKA,
      target: 't',
    },
    defaultFrequency: 5,
    source: 'dynamic',
  };

  beforeEach(() => {
    mockPersistence = {
      listSchemas: vi.fn().mockResolvedValue([]),
      saveSchema: vi.fn().mockResolvedValue(undefined),
      deleteSchema: vi.fn().mockResolvedValue(undefined),
      listFlows: vi.fn().mockResolvedValue([]),
      saveFlow: vi.fn().mockResolvedValue(undefined),
      deleteFlow: vi.fn().mockResolvedValue(undefined),
    } as unknown as SchemaPersistenceService;

    service = new SchemaDiscoveryService(mockPersistence);
  });

  it('should refresh and merge schemas', async () => {
    // Force a collision for merge testing
    const collisionSchema: SchemaDefinition = { ...dynamicSchema, id: 'StaticSchema' };
    vi.mocked(mockPersistence.listSchemas).mockResolvedValue([collisionSchema]);

    const result = await service.refresh();

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('StaticSchema');
    expect(result[0]?.source).toBe('static'); // Overrides are treated as modified static schemas
  });

  it('should create a dynamic schema and refresh', async () => {
    const refreshSpy = vi.spyOn(service, 'refresh');
    await service.createDynamicSchema(dynamicSchema);

    expect(vi.mocked(mockPersistence.saveSchema)).toHaveBeenCalledWith(dynamicSchema);
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('should block creation with static ID', async () => {
    const collisionSchema: SchemaDefinition = { ...dynamicSchema, id: 'StaticSchema' };
    await expect(service.createDynamicSchema(collisionSchema)).rejects.toThrow();
  });

  it('should update a dynamic schema and refresh', async () => {
    const refreshSpy = vi.spyOn(service, 'refresh');
    await service.updateDynamicSchema(dynamicSchema.id, dynamicSchema);

    expect(vi.mocked(mockPersistence.saveSchema)).toHaveBeenCalledWith(dynamicSchema);
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('should reject creating a RabbitMQ schema without targetType', async () => {
    const invalidRabbitSchema: SchemaDefinition = {
      ...dynamicSchema,
      destination: {
        transport: TransportType.RABBITMQ,
        target: 'events.invalid',
      },
    };

    await expect(service.createDynamicSchema(invalidRabbitSchema)).rejects.toThrow(/targetType/i);
  });

  it('should reject updating a RabbitMQ schema without targetType', async () => {
    const invalidRabbitSchema: SchemaDefinition = {
      ...dynamicSchema,
      destination: {
        transport: TransportType.RABBITMQ,
        target: 'events.invalid',
      },
    };

    await expect(
      service.updateDynamicSchema(dynamicSchema.id, invalidRabbitSchema),
    ).rejects.toThrow(/targetType/i);
  });

  it('should reject creating a Kafka schema without topic', async () => {
    const invalidKafkaSchema: SchemaDefinition = {
      ...dynamicSchema,
      destination: {
        transport: TransportType.KAFKA,
        target: '',
      },
    };

    await expect(service.createDynamicSchema(invalidKafkaSchema)).rejects.toThrow(/topic/i);
  });

  it('should reject a Kafka schema with field key mode and no field path', async () => {
    const invalidKafkaSchema: SchemaDefinition = {
      ...dynamicSchema,
      destination: {
        transport: TransportType.KAFKA,
        target: 'events.invalid',
        kafkaKey: { mode: 'field' },
      },
    };

    await expect(service.createDynamicSchema(invalidKafkaSchema)).rejects.toThrow(
      /field key path/i,
    );
  });

  it('should delete a dynamic schema and refresh', async () => {
    const refreshSpy = vi.spyOn(service, 'refresh');
    await service.deleteDynamicSchema('test-id');

    expect(vi.mocked(mockPersistence.deleteSchema)).toHaveBeenCalledWith('test-id');
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('should delete a flow and refresh', async () => {
    const refreshSpy = vi.spyOn(service, 'refresh');
    await service.deleteFlow('flow-id');

    expect(vi.mocked(mockPersistence.deleteFlow)).toHaveBeenCalledWith('flow-id');
    expect(refreshSpy).toHaveBeenCalled();
  });
});
