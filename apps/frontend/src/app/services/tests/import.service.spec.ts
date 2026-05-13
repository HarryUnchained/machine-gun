import { TestBed } from '@angular/core/testing';
import { ImportService } from '../import.service';
import { describe, it, expect, beforeEach } from 'vitest';

describe('ImportService', () => {
  let service: ImportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ImportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should parse a valid JSON schema file', async () => {
    const mockSchema = {
      id: 'test-schema',
      name: 'Test Schema',
      fields: [{ name: 'id', type: 'uuid' }],
    };
    const blob = new Blob([JSON.stringify(mockSchema)], { type: 'application/json' });
    const file = new File([blob], 'test.json', { type: 'application/json' });

    const result = await service.parseJson(file);
    expect(result.id).toBe('test-schema');
    expect(result.name).toBe('Test Schema');
    expect(result.fields?.length).toBe(1);
  });

  it('should reject invalid JSON', async () => {
    const blob = new Blob(['invalid json'], { type: 'application/json' });
    const file = new File([blob], 'test.json', { type: 'application/json' });

    await expect(service.parseJson(file)).rejects.toThrowError(
      'Invalid JSON file. Please check for syntax errors.',
    );
  });

  it('should reject non-object JSON', async () => {
    const blob = new Blob(['"just a string"'], { type: 'application/json' });
    const file = new File([blob], 'test.json', { type: 'application/json' });

    await expect(service.parseJson(file)).rejects.toThrowError(
      'Invalid schema format. Expected a JSON object.',
    );
  });
});
