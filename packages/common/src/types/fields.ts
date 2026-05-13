export enum GeneratorFieldType {
  STRING = 'string',
  INT = 'int',
  FLOAT = 'float',
  BOOLEAN = 'boolean',
  NULL = 'null',
  DATETIME = 'datetime',
  UNIX_DATETIME = 'unix',
  CRON = 'cron',
  ISO_TIMESTAMP = 'iso',
  UUID = 'uuid',
  REGEX = 'regex',
  LOCATION = 'location',
  OBJECT = 'object',
  ARRAY = 'array',
}

export interface FieldOptions {
  min?: number;
  max?: number;

  faker?: string;
  pattern?: string;
  template?: string;

  choices?: string[];
  weights?: number[];

  format?: string;
  latitude?: number;
  longitude?: number;
  radius?: number; // km

  count?: number;
  countMode?: 'fixed' | 'random' | 'range';
  countMin?: number;
  countMax?: number;

  includeTime?: boolean;
}

/**
 * Single field entry. Can be nested for objects and arrays.
 */
export interface SchemaField {
  name: string;
  type: GeneratorFieldType;
  options?: FieldOptions;
  fields?: SchemaField[];
}
