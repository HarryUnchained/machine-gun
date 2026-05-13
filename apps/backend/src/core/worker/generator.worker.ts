import { faker } from '@faker-js/faker';
import RandExp from 'randexp';
import { GeneratorFieldType, type FieldOptions, type SchemaField } from '@machine-gun/common';
import * as crypto from 'node:crypto';

type CustomModule = {
  name: string;
  values: string[];
};

type GeneratorWorkerInput =
  | SchemaField[]
  | {
      fields: SchemaField[];
      count: number;
      customModules?: CustomModule[];
      serialize?: boolean;
    };

type GeneratorWorkerOptions = {
  fields: SchemaField[];
  count: number;
  customModules: CustomModule[];
  serialize: boolean;
};

type FakerNamespace = Record<string, () => unknown>;
type FakerWithCustom = typeof faker & {
  custom?: Record<string, () => unknown>;
  [key: string]: unknown;
};

type GeneratedRecord = Record<string, unknown>;
type GeneratedOutput = GeneratedRecord | string | Array<GeneratedRecord | string>;

const DEFAULT_BATCH_SIZE = 1;
const DEFAULT_CRON = '* * * * *';
const DEFAULT_ARRAY_COUNT = 3;
const DEFAULT_RANDOM_ARRAY_MAX = 10;
const DEFAULT_INT_MIN = 0;
const DEFAULT_INT_MAX = 1000;
const DEFAULT_FLOAT_MIN = 0;
const DEFAULT_FLOAT_MAX = 1000;
const DEFAULT_LOCATION = {
  latitude: 51.5074,
  longitude: -0.1278,
  radius: 10,
};

export default function generate(input: GeneratorWorkerInput): GeneratedOutput {
  const options = normalizeInput(input);

  registerCustomModules(options.customModules);

  if (options.count <= 1) {
    return generateSingleOutput(options.fields, options.serialize);
  }

  return generateBatchOutput(options.fields, options.count, options.serialize);
}

function normalizeInput(input: GeneratorWorkerInput): GeneratorWorkerOptions {
  if (Array.isArray(input)) {
    return {
      fields: input,
      count: DEFAULT_BATCH_SIZE,
      customModules: [],
      serialize: false,
    };
  }

  return {
    fields: input.fields,
    count: input.count ?? DEFAULT_BATCH_SIZE,
    customModules: input.customModules ?? [],
    serialize: input.serialize ?? false,
  };
}

function registerCustomModules(customModules: CustomModule[]): void {
  if (customModules.length === 0) {
    return;
  }

  const fakerExtended = faker as FakerWithCustom;

  if (!fakerExtended.custom) {
    fakerExtended.custom = {};
  }

  for (const customModule of customModules) {
    fakerExtended.custom[customModule.name] = () => {
      return faker.helpers.arrayElement(customModule.values);
    };
  }
}

function generateSingleOutput(fields: SchemaField[], serialize: boolean): GeneratedRecord | string {
  const record = generateRecord(fields);

  if (serialize) {
    return JSON.stringify(record);
  }

  return record;
}

function generateBatchOutput(
  fields: SchemaField[],
  count: number,
  serialize: boolean,
): Array<GeneratedRecord | string> {
  const results: Array<GeneratedRecord | string> = [];

  for (let index = 0; index < count; index++) {
    const record = generateRecord(fields);

    if (serialize) {
      results.push(JSON.stringify(record));
    } else {
      results.push(record);
    }
  }

  return results;
}

function generateRecord(fields: SchemaField[]): GeneratedRecord {
  const record: GeneratedRecord = {};

  for (const field of fields) {
    record[field.name] = generateFieldValue(field);
  }

  return record;
}

function generateFieldValue(field: SchemaField): unknown {
  const options = field.options;

  switch (field.type) {
    case GeneratorFieldType.UUID:
      return crypto.randomUUID();

    case GeneratorFieldType.STRING:
      return generateStringValue(options);

    case GeneratorFieldType.BOOLEAN:
      return faker.datatype.boolean();

    case GeneratorFieldType.NULL:
      return null;

    case GeneratorFieldType.INT:
      return generateIntValue(options);

    case GeneratorFieldType.FLOAT:
      return generateFloatValue(options);

    case GeneratorFieldType.ISO_TIMESTAMP:
      return generateDateValue(options).toISOString();

    case GeneratorFieldType.UNIX_DATETIME:
      return Math.floor(generateDateValue(options).getTime() / 1000);

    case GeneratorFieldType.DATETIME:
      return generateDateValue(options);

    case GeneratorFieldType.REGEX:
      return generateRegexValue(options);

    case GeneratorFieldType.CRON:
      return generateCronValue(options);

    case GeneratorFieldType.LOCATION:
      return generateLocationValue(options);

    case GeneratorFieldType.OBJECT:
      return generateObjectValue(field);

    case GeneratorFieldType.ARRAY:
      return generateArrayValue(field.fields ?? [], options);

    default:
      return null;
  }
}

function generateIntValue(options?: FieldOptions): number {
  const min = options?.min ?? DEFAULT_INT_MIN;
  const max = options?.max ?? DEFAULT_INT_MAX;

  return faker.number.int({ min, max });
}

function generateFloatValue(options?: FieldOptions): number {
  const min = options?.min ?? DEFAULT_FLOAT_MIN;
  const max = options?.max ?? DEFAULT_FLOAT_MAX;

  return faker.number.float({ min, max });
}

function generateStringValue(options?: FieldOptions): string {
  if (options?.choices && options.choices.length > 0) {
    return pickChoice(options.choices, options.weights);
  }

  if (options?.faker) {
    return resolveFakerValue(options.faker);
  }

  if (options?.template) {
    return faker.helpers.fake(options.template);
  }

  return generateDefaultStringValue();
}

function generateDefaultStringValue(): string {
  return faker.word.sample();
}

function pickChoice(choices: string[], weights?: number[]): string {
  if (!weights || weights.length !== choices.length) {
    return faker.helpers.arrayElement(choices);
  }

  const weightedChoices: Array<{ value: string; weight: number }> = [];

  for (let index = 0; index < choices.length; index++) {
    weightedChoices.push({
      value: choices[index] ?? '',
      weight: weights[index] ?? 1,
    });
  }

  return faker.helpers.weightedArrayElement(weightedChoices);
}

function resolveFakerValue(path: string): string {
  const pathParts = path.split('.');

  if (pathParts.length !== 2) {
    return generateDefaultStringValue();
  }

  const namespaceName = pathParts[0];
  const methodName = pathParts[1];

  if (!namespaceName || !methodName) {
    return generateDefaultStringValue();
  }

  const fakerExtended = faker as FakerWithCustom;
  const namespace = fakerExtended[namespaceName] as FakerNamespace | undefined;

  if (!namespace) {
    return generateDefaultStringValue();
  }

  const method = namespace[methodName];

  if (typeof method !== 'function') {
    return generateDefaultStringValue();
  }

  return String(method());
}

function generateDateValue(options?: FieldOptions): Date {
  const hasMin = options?.min !== undefined;
  const hasMax = options?.max !== undefined;

  if (hasMin && hasMax) {
    const from = options.min as number;
    const to = options.max as number;

    return faker.date.between({
      from: Math.min(from, to),
      to: Math.max(from, to),
    });
  }

  return faker.date.recent();
}

function generateRegexValue(options?: FieldOptions): string {
  if (!options?.pattern) {
    return '';
  }

  try {
    const generator = new RandExp(options.pattern);
    return generator.gen();
  } catch {
    return '';
  }
}

function generateCronValue(options?: FieldOptions): string {
  if (options?.pattern) {
    return options.pattern;
  }

  return DEFAULT_CRON;
}

function generateObjectValue(field: SchemaField): GeneratedRecord {
  const nestedFields = field.fields ?? [];
  return generateRecord(nestedFields);
}

function generateLocationValue(
  options?: FieldOptions,
): { lat: number; lng: number } | [number, number] | number {
  const latitude = options?.latitude ?? DEFAULT_LOCATION.latitude;
  const longitude = options?.longitude ?? DEFAULT_LOCATION.longitude;
  const radius = options?.radius ?? DEFAULT_LOCATION.radius;

  const [lat, lng] = faker.location.nearbyGPSCoordinate({
    origin: [latitude, longitude],
    radius,
    isMetric: true,
  });

  const format = options?.format ?? 'object';

  if (format === 'array') {
    return [lat, lng];
  }

  if (format === 'lat') {
    return lat;
  }

  if (format === 'lng') {
    return lng;
  }

  return { lat, lng };
}

function generateArrayValue(fields: SchemaField[], options?: FieldOptions): GeneratedRecord[] {
  const itemCount = resolveArrayItemCount(options);
  const items: GeneratedRecord[] = [];

  for (let index = 0; index < itemCount; index++) {
    items.push(generateRecord(fields));
  }

  return items;
}

function resolveArrayItemCount(options?: FieldOptions): number {
  const mode = options?.countMode ?? 'fixed';

  if (mode === 'random') {
    const max = Math.max(0, normalizeWholeNumber(options?.countMax, DEFAULT_RANDOM_ARRAY_MAX));
    return faker.number.int({ min: 0, max });
  }

  if (mode === 'range') {
    const min = Math.max(1, normalizeWholeNumber(options?.countMin, 1));
    const max = Math.max(
      min,
      normalizeWholeNumber(options?.countMax, Math.max(min, DEFAULT_ARRAY_COUNT)),
    );
    return faker.number.int({ min, max });
  }

  return Math.max(0, normalizeWholeNumber(options?.count, DEFAULT_ARRAY_COUNT));
}

function normalizeWholeNumber(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return Math.floor(value);
}
