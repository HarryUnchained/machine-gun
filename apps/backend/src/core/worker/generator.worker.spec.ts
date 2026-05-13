import { describe, it, expect } from 'vitest';
import generate from './generator.worker';
import { GeneratorFieldType } from '@machine-gun/common';

describe('Generator Worker', () => {
  it('should generate a single record', () => {
    const fields = [
      { name: 'id', type: GeneratorFieldType.UUID },
      { name: 'name', type: GeneratorFieldType.STRING },
    ];

    const result = generate(fields) as Record<string, any>;

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('name');
    expect(typeof result.id).toBe('string');
    expect(result.id).toHaveLength(36); // UUID length
  });

  it('should generate multiple records', () => {
    const input = {
      fields: [{ name: 'id', type: GeneratorFieldType.INT }],
      count: 5,
    };

    const results = generate(input) as Record<string, any>[];

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(5);
    results.forEach((r) => {
      expect(typeof r.id).toBe('number');
    });
  });

  it('should handle numeric types with constraints', () => {
    const fields = [
      {
        name: 'score',
        type: GeneratorFieldType.INT,
        options: { min: 10, max: 20 },
      },
    ];

    const result = generate(fields) as Record<string, any>;
    expect(result.score).toBeGreaterThanOrEqual(10);
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it('should handle string choices', () => {
    const fields = [
      {
        name: 'status',
        type: GeneratorFieldType.STRING,
        options: { choices: ['active', 'inactive'] },
      },
    ];

    const result = generate(fields) as Record<string, any>;
    expect(['active', 'inactive']).toContain(result.status);
  });

  it('should handle faker modules', () => {
    const fields = [
      {
        name: 'email',
        type: GeneratorFieldType.STRING,
        options: { faker: 'internet.email' },
      },
    ];

    const result = generate(fields) as Record<string, any>;
    expect(result.email).toContain('@');
  });

  it('should handle custom templates', () => {
    const fields = [
      {
        name: 'greet',
        type: GeneratorFieldType.STRING,
        options: { template: 'Hello {{person.firstName}}' },
      },
    ];

    const result = generate(fields) as Record<string, any>;
    expect(result.greet).toMatch(/^Hello\s\w+/);
  });

  it('should handle regex generation', () => {
    const fields = [
      {
        name: 'code',
        type: GeneratorFieldType.REGEX,
        options: { pattern: '[A-Z]{2}[0-9]{2}' },
      },
    ];

    const result = generate(fields) as Record<string, any>;
    expect(result.code).toMatch(/^[A-Z]{2}[0-9]{2}$/);
  });

  it('should support custom modules via monkey-patching', () => {
    const input = {
      fields: [
        {
          name: 'myCustomField',
          type: GeneratorFieldType.STRING,
          options: { faker: 'custom.myModule' },
        },
      ],
      count: 1,
      customModules: [{ name: 'myModule', values: ['VALUE_A', 'VALUE_B'] }],
    };

    const result = generate(input) as Record<string, any>;
    expect(['VALUE_A', 'VALUE_B']).toContain(result.myCustomField);
  });

  it('should handle date types (ISO, UNIX, Native)', () => {
    const fields = [
      { name: 'iso', type: GeneratorFieldType.ISO_TIMESTAMP },
      { name: 'unix', type: GeneratorFieldType.UNIX_DATETIME },
      { name: 'native', type: GeneratorFieldType.DATETIME },
    ];

    const result = generate(fields) as Record<string, any>;

    expect(new Date(result.iso as string).toISOString()).toBe(result.iso);
    expect(typeof result.unix).toBe('number');
    expect(result.native instanceof Date).toBe(true);
  });

  it('should handle null types', () => {
    const fields = [{ name: 'nothing', type: GeneratorFieldType.NULL }];
    const result = generate(fields) as Record<string, any>;
    expect(result.nothing).toBeNull();
  });
});
