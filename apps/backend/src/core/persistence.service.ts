import { Injectable, Logger } from '@nestjs/common';
import { SchemaDefinition, SimulationFlow, getErrorMessage } from '@machine-gun/common';
import * as fs from 'node:fs';
import * as path from 'node:path';

@Injectable()
export class SchemaPersistenceService {
  private readonly logger = new Logger(SchemaPersistenceService.name);
  private readonly schemasDir: string;
  private readonly flowsDir: string;

  constructor() {
    const root = process.cwd();
    this.schemasDir = path.join(root, 'data', 'schemas');
    this.flowsDir = path.join(root, 'data', 'flows');

    this.initializeStorage();
  }

  async saveSchema(schema: SchemaDefinition): Promise<void> {
    const filePath = this.getSchemaPath(schema.id);

    try {
      const payload = JSON.stringify(schema, null, 2);

      this.logger.log(`Saving schema ${schema.id}`);
      await fs.promises.writeFile(filePath, payload, 'utf-8');
    } catch (error: unknown) {
      this.logger.error(`Failed to save schema "${schema.id}": ${getErrorMessage(error)}`);
      throw error;
    }
  }

  async deleteSchema(id: string): Promise<void> {
    const filePath = this.getSchemaPath(id);

    try {
      if (!fs.existsSync(filePath)) {
        this.logger.warn(`Attempted to delete non-existent schema: ${id}`);
        return;
      }

      this.logger.log(`Deleting schema ${id}`);
      await fs.promises.unlink(filePath);
    } catch (error: unknown) {
      this.logger.error(`Failed to delete schema "${id}": ${getErrorMessage(error)}`);
    }
  }

  public async listSchemas(): Promise<SchemaDefinition[]> {
    try {
      const results = await this.readJsonCollection(this.schemasDir, (schema) =>
        this.isValidSchema(schema),
      );
      this.logger.log(`Loaded ${results.length} schemas from disk`);
      return results;
    } catch (error: unknown) {
      this.logger.error(`Failed to list schemas: ${getErrorMessage(error)}`);
      return [];
    }
  }

  async saveFlow(flow: SimulationFlow): Promise<void> {
    const filePath = this.getFlowPath(flow.id);

    try {
      this.logger.log(`Saving flow ${flow.id}`);
      await fs.promises.writeFile(filePath, JSON.stringify(flow, null, 2), 'utf-8');
    } catch (error: unknown) {
      this.logger.error(`Failed to save flow "${flow.id}": ${getErrorMessage(error)}`);
    }
  }

  async deleteFlow(id: string): Promise<void> {
    const filePath = this.getFlowPath(id);

    try {
      if (!fs.existsSync(filePath)) {
        return;
      }

      this.logger.log(`Deleting flow ${id}`);
      await fs.promises.unlink(filePath);
    } catch (error: unknown) {
      this.logger.error(`Failed to delete flow "${id}": ${getErrorMessage(error)}`);
    }
  }

  async listFlows(): Promise<SimulationFlow[]> {
    try {
      if (!fs.existsSync(this.flowsDir)) {
        return [];
      }

      this.logger.log('Reading flows from disk');
      return await this.readJsonCollection(this.flowsDir, (flow) => this.isValidFlow(flow));
    } catch (error: unknown) {
      this.logger.error(`Failed to list flows: ${getErrorMessage(error)}`);
      return [];
    }
  }

  private initializeStorage() {
    const storageDirectories = [this.schemasDir, this.flowsDir];

    for (const directory of storageDirectories) {
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
        this.logger.log(`Created required storage directory: ${directory}`);
      }
    }
  }

  private async readJsonCollection<T>(
    directory: string,
    validator: (value: unknown) => value is T,
  ): Promise<T[]> {
    const files = await fs.promises.readdir(directory);
    const results: T[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(directory, file);

      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(content) as unknown;

        if (!validator(parsed)) {
          this.logger.warn(`Skipping invalid JSON in ${file}`);
          continue;
        }

        results.push(parsed);
      } catch (error: unknown) {
        this.logger.error(`Failed to read ${file}: ${getErrorMessage(error)}`);
      }
    }

    return results;
  }

  private getSchemaPath(id: string): string {
    return path.join(this.schemasDir, `${id}.json`);
  }

  private getFlowPath(id: string): string {
    return path.join(this.flowsDir, `${id}.json`);
  }

  private isValidSchema(schema: unknown): schema is SchemaDefinition {
    return (
      !!schema &&
      typeof schema === 'object' &&
      typeof (schema as SchemaDefinition).id === 'string' &&
      Array.isArray((schema as SchemaDefinition).fields)
    );
  }

  private isValidFlow(flow: unknown): flow is SimulationFlow {
    return !!flow && typeof flow === 'object' && typeof (flow as SimulationFlow).id === 'string';
  }
}
