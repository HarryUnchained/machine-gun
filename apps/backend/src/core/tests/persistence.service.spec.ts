/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchemaPersistenceService } from '../persistence.service';
import * as fs from 'fs';
import {
  GeneratorFieldType,
  TransportType,
  type SchemaDefinition,
  type SimulationFlow,
} from '@machine-gun/common';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  promises: {
    writeFile: vi.fn(),
    unlink: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}));

describe('SchemaPersistenceService', () => {
  let service: SchemaPersistenceService;

  const mockSchema: SchemaDefinition = {
    id: 'test-schema',
    name: 'Test Schema',
    fields: [{ name: 'test', type: GeneratorFieldType.STRING }],
    destination: { transport: TransportType.RABBITMQ, target: 'test-queue' },
    defaultFrequency: 1,
    source: 'dynamic',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SchemaPersistenceService();
  });

  it('should ensure the schemas directory exists on initialization', () => {
    expect(fs.existsSync).toHaveBeenCalled();
  });

  it('should save a schema to disk', async () => {
    await service.saveSchema(mockSchema);
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('test-schema.json'),
      expect.stringContaining('"id": "test-schema"'),
      'utf-8',
    );
  });

  it('should delete a schema from disk if it exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    await service.deleteSchema('test-schema');
    expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining('test-schema.json'));
  });

  it('should list and parse valid schemas from disk', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValue(['schema1.json', 'invalid.txt'] as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockSchema));

    const result = await service.listSchemas();

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('test-schema');
    expect(fs.promises.readFile).toHaveBeenCalledTimes(1);
  });

  it('should skip invalid schema files', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValue(['invalid.json'] as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify({ not: 'a schema' }));

    const result = await service.listSchemas();
    expect(result).toHaveLength(0);
  });

  it('should save a flow to disk', async () => {
    const mockFlow: SimulationFlow = {
      id: 'test-flow',
      name: 'Test Flow',
      nodes: [],
      edges: [],
    };
    await service.saveFlow(mockFlow);
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('test-flow.json'),
      expect.stringContaining('"id": "test-flow"'),
      'utf-8',
    );
  });

  it('should list flows from disk', async () => {
    const storedFlow: SimulationFlow = {
      id: 'f1',
      name: 'F1',
      nodes: [],
      edges: [],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.promises.readdir).mockResolvedValue(['flow1.json'] as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(storedFlow));

    const result = await service.listFlows();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('f1');
  });

  it('should delete a flow from disk', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    await service.deleteFlow('test-flow');
    expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining('test-flow.json'));
  });
});
