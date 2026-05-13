import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import {
  SchemaDefinition,
  StaticSchemaDefinition,
  SimulationFlow,
  TransportType,
  getErrorMessage,
} from '@machine-gun/common';
import { SchemaPersistenceService } from './persistence.service';
import { STATIC_SCHEMAS } from '../library/schemas';
import { STATIC_FLOWS } from '../library/flows';

@Injectable()
export class SchemaDiscoveryService implements OnModuleInit {
  private readonly logger = new Logger(SchemaDiscoveryService.name);

  private loadedSchemas: SchemaDefinition[] = [];
  private loadedFlows: SimulationFlow[] = [];

  constructor(private readonly persistenceService: SchemaPersistenceService) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<SchemaDefinition[]> {
    try {
      this.loadedSchemas = await this.loadSchemas();
      this.loadedFlows = await this.loadFlows();
      this.logSchemaSummary(this.loadedSchemas);
      this.logger.log(`Active flows: ${this.loadedFlows.length}`);
      return this.loadedSchemas;
    } catch (error: unknown) {
      this.logger.error(`Failed to refresh schema discovery: ${getErrorMessage(error)}`);
      return [];
    }
  }

  getSchemas(): SchemaDefinition[] {
    return this.loadedSchemas;
  }

  getSchema(id: string): SchemaDefinition | undefined {
    for (const schema of this.loadedSchemas) {
      if (schema.id === id) {
        return schema;
      }
    }

    return undefined;
  }

  getFlows(): SimulationFlow[] {
    return this.loadedFlows;
  }

  async createDynamicSchema(schema: SchemaDefinition): Promise<void> {
    try {
      const isStatic = this.isReservedStaticSchemaId(schema.id);
      if (isStatic) {
        throw new BadRequestException(`Schema ID "${schema.id}" is reserved by the system.`);
      }

      const validated = this.validateSchema(schema);
      await this.persistenceService.saveSchema(validated);
      await this.refresh();
    } catch (error: unknown) {
      this.logger.error(`Failed to create schema: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  async updateDynamicSchema(originalId: string, schema: SchemaDefinition): Promise<void> {
    try {
      const validated = this.validateSchema(schema);

      if (originalId !== schema.id) {
        await this.persistenceService.deleteSchema(originalId);
      }

      await this.persistenceService.saveSchema(validated);
      await this.refresh();
    } catch (error: unknown) {
      this.logger.error(`Failed to update schema: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  async deleteDynamicSchema(id: string): Promise<void> {
    try {
      await this.persistenceService.deleteSchema(id);
      await this.refresh();
    } catch (error: unknown) {
      this.logger.error(`Failed to delete schema: ${getErrorMessage(error)}`);
    }
  }

  async saveFlow(flow: SimulationFlow): Promise<void> {
    try {
      await this.persistenceService.saveFlow(flow);
      await this.refresh();
    } catch (error: unknown) {
      this.logger.error(`Failed to save flow: ${getErrorMessage(error)}`);
    }
  }

  async deleteFlow(id: string): Promise<void> {
    try {
      await this.persistenceService.deleteFlow(id);
      await this.refresh();
    } catch (error: unknown) {
      this.logger.error(`Failed to delete flow: ${getErrorMessage(error)}`);
    }
  }

  private validateSchema(schema: SchemaDefinition): SchemaDefinition {
    if (schema.destination.transport === TransportType.RABBITMQ) {
      if (
        schema.destination.targetType !== 'queue' &&
        schema.destination.targetType !== 'exchange'
      ) {
        throw new BadRequestException(
          'RabbitMQ targetType is required and must be queue or exchange',
        );
      }

      if (!schema.destination.target?.trim()) {
        throw new BadRequestException('RabbitMQ target is required');
      }

      return schema;
    }

    if (!schema.destination.target?.trim()) {
      throw new BadRequestException('Kafka topic is required');
    }

    if (schema.destination.kafkaPartition !== undefined && schema.destination.kafkaPartition < 0) {
      throw new BadRequestException('Kafka partition must be zero or greater');
    }

    if (
      schema.destination.kafkaKey?.mode === 'field' &&
      !schema.destination.kafkaKey.fieldPath?.trim()
    ) {
      throw new BadRequestException('Kafka field key path is required');
    }

    if (
      schema.destination.kafkaKey?.mode === 'custom' &&
      !schema.destination.kafkaKey.customValue?.trim()
    ) {
      throw new BadRequestException('Kafka custom key value is required');
    }

    return schema;
  }

  private async loadSchemas(): Promise<SchemaDefinition[]> {
    const staticSchemas = STATIC_SCHEMAS;
    const dynamicSchemas = await this.persistenceService.listSchemas();
    const mergedSchemas = new Map<string, SchemaDefinition>();

    for (const schema of staticSchemas) {
      mergedSchemas.set(schema.id, schema);
    }

    for (const schema of dynamicSchemas) {
      const isOverride = this.containsSchemaId(staticSchemas, schema.id);

      if (isOverride) {
        this.logger.warn(`Schema "${schema.id}" overrides a built-in schema`);

        const overriddenSchema: StaticSchemaDefinition = {
          ...(schema as Omit<StaticSchemaDefinition, 'source'>),
          source: 'static',
          isModified: true,
        };

        mergedSchemas.set(schema.id, overriddenSchema);
        continue;
      }

      mergedSchemas.set(schema.id, schema);
    }

    return Array.from(mergedSchemas.values());
  }

  private async loadFlows(): Promise<SimulationFlow[]> {
    const dynamicFlows = await this.persistenceService.listFlows();
    const mergedFlows = new Map<string, SimulationFlow>();

    for (const flow of STATIC_FLOWS) {
      mergedFlows.set(flow.id, { ...flow, source: 'static', isModified: false });
    }

    for (const flow of dynamicFlows) {
      const isOverride = mergedFlows.has(flow.id);

      mergedFlows.set(flow.id, {
        ...flow,
        source: isOverride ? 'static' : 'dynamic',
        isModified: isOverride,
      });
    }

    return Array.from(mergedFlows.values());
  }

  private logSchemaSummary(schemas: SchemaDefinition[]) {
    let systemCount = 0;
    let customCount = 0;
    let overrideCount = 0;
    let rabbitCount = 0;
    let kafkaCount = 0;

    for (const schema of schemas) {
      if (schema.destination.transport === TransportType.RABBITMQ) {
        rabbitCount++;
      } else if (schema.destination.transport === TransportType.KAFKA) {
        kafkaCount++;
      }

      if (schema.source === 'static') {
        systemCount++;

        if (schema.isModified) {
          overrideCount++;
        }

        continue;
      }

      customCount++;
    }

    this.logger.log(
      `Active schemas: ${schemas.length} (${systemCount} system, ${customCount} custom, ${overrideCount} overrides, ${rabbitCount} RabbitMQ, ${kafkaCount} Kafka)`,
    );

    this.logVerboseSchemaDetails(schemas);
  }

  private logVerboseSchemaDetails(schemas: SchemaDefinition[]) {
    for (const schema of schemas) {
      this.logger.verbose(this.buildSchemaDetailLine(schema));
    }
  }

  private buildSchemaDetailLine(schema: SchemaDefinition): string {
    const parts = [
      `Schema ${schema.id}`,
      `name="${schema.name}"`,
      `source=${schema.source}`,
      `transport=${schema.destination.transport}`,
      `target=${schema.destination.target}`,
      `fields=${schema.fields.length}`,
      `defaultFrequency=${schema.defaultFrequency}`,
    ];

    if (schema.source === 'static' && schema.isModified) {
      parts.push('modified=true');
    }

    if (schema.destination.transport === TransportType.RABBITMQ) {
      parts.push(`targetType=${schema.destination.targetType ?? 'unknown'}`);

      if (schema.destination.exchangeType) {
        parts.push(`exchangeType=${schema.destination.exchangeType}`);
      }

      if (schema.destination.routingKey) {
        parts.push(`routingKey=${schema.destination.routingKey}`);
      }
    } else {
      if (schema.destination.kafkaPartition !== undefined) {
        parts.push(`partition=${schema.destination.kafkaPartition}`);
      }

      if (schema.destination.kafkaKey?.mode) {
        parts.push(`keyMode=${schema.destination.kafkaKey.mode}`);
      }
    }

    return parts.join(' | ');
  }

  private isReservedStaticSchemaId(schemaId: string): boolean {
    return this.containsSchemaId(STATIC_SCHEMAS, schemaId);
  }

  private containsSchemaId(schemas: SchemaDefinition[], schemaId: string): boolean {
    for (const schema of schemas) {
      if (schema.id === schemaId) {
        return true;
      }
    }

    return false;
  }
}
