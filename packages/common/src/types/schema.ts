import type { SchemaField } from './fields';
import type { MessageDestination } from './transport';

/**
 * Main blueprint for payload generation and routing.
 */
export interface BaseSchemaDefinition {
  id: string;
  name: string;
  description?: string;
  fields: SchemaField[];
  destination: MessageDestination;
  defaultFrequency: number;
}

/**
 * Schemas that come pre-installed with the system.
 */
export interface StaticSchemaDefinition extends BaseSchemaDefinition {
  source: 'static';
  /** Track if the user messed with the defaults */
  isModified?: boolean;
}

/**
 * User-created schemas stored in the database.
 */
export interface DynamicSchemaDefinition extends BaseSchemaDefinition {
  source: 'dynamic';
}

export type SchemaDefinition = StaticSchemaDefinition | DynamicSchemaDefinition;

export interface BurstOptions {
  count: number;
  concurrency?: number;
}

export interface SchemaUpdateEvent {
  schemas: SchemaDefinition[];
}
