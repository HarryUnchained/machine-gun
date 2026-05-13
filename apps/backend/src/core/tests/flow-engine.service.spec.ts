/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { FlowEngineService } from '../flow-engine.service';
import { FlowNode, SimulationFlow, TransportType } from '@machine-gun/common';

describe('FlowEngineService', () => {
  let service: FlowEngineService;
  let mockGenerator: { generateBatch: Mock };
  let mockPublisher: { publishBatch: Mock };
  let mockDiscovery: { getSchema: Mock };

  const sampleFlow: SimulationFlow = {
    id: 'test-flow',
    name: 'Test Flow',
    nodes: [
      {
        id: 'node-1',
        schemaId: 'schema-1',
        position: { x: 0, y: 0 },
        settings: { frequency: 10, count: 5 },
      },
      {
        id: 'node-2',
        schemaId: 'schema-2',
        position: { x: 100, y: 100 },
        settings: {
          expressions: {
            value: 'parent.amount * 2',
          },
        },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        condition: 'immediate',
      },
    ],
  };

  const sampleSchema = {
    id: 'schema-1',
    name: 'Schema 1',
    destination: { transport: TransportType.RABBITMQ, target: 'test-target' },
    fields: [],
  };

  beforeEach(() => {
    vi.useFakeTimers();

    mockGenerator = {
      generateBatch: vi.fn().mockResolvedValue([{ amount: 100 }]),
    };
    mockPublisher = {
      publishBatch: vi.fn().mockResolvedValue([]),
    };
    mockDiscovery = {
      getSchema: vi.fn().mockReturnValue(sampleSchema),
    };

    service = new FlowEngineService(
      mockGenerator as any,
      mockPublisher as any,
      mockDiscovery as any,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should identify and start root nodes', async () => {
    service.startFlow(sampleFlow);

    // Root node (node-1) should have started a pulse
    // We force one pulse by advancing time
    await vi.advanceTimersByTimeAsync(100); // 1000/10 frequency = 100ms

    expect(mockDiscovery.getSchema).toHaveBeenCalledWith('schema-1');
    expect(mockPublisher.publishBatch).toHaveBeenCalled();
  });

  it('should propagate data to children with expression evaluation', async () => {
    // Manual execution of node 1 to trigger propagation
    // We mock the schema discovery for node 2 as well
    mockDiscovery.getSchema.mockImplementation((id: string) => {
      return {
        id,
        destination: { transport: TransportType.RABBITMQ, target: 'target-' + id },
        fields: [],
      };
    });

    service.startFlow(sampleFlow);

    // Advance to trigger node-1
    await vi.advanceTimersByTimeAsync(100);

    // Node 1 should have published
    expect(mockPublisher.publishBatch).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'target-schema-1' }),
      [expect.any(Object)],
    );

    // Node 2 should be triggered immediately (condition: immediate)
    // but the engine uses a setTimeout(0) for propagation
    await vi.advanceTimersByTimeAsync(0);

    // Node 2 should have published with calculated value (100 * 2 = 200)
    expect(mockPublisher.publishBatch).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'target-schema-2' }),
      [expect.objectContaining({ value: 200 })],
    );
  });

  it('should respect node count limits', async () => {
    const baseNode = sampleFlow.nodes[0]!;
    const rootNode: FlowNode = {
      id: baseNode.id,
      schemaId: baseNode.schemaId,
      position: baseNode.position,
      settings: { frequency: 100, count: 2 },
    };

    const limitedFlow: SimulationFlow = {
      ...sampleFlow,
      nodes: [rootNode],
      edges: [],
    };

    service.startFlow(limitedFlow);

    await vi.runAllTimersAsync();

    expect(mockPublisher.publishBatch).toHaveBeenCalledTimes(2);
  });

  it('should evaluate filters', async () => {
    const baseNode = sampleFlow.nodes[0]!;
    const filteredNode: FlowNode = {
      id: baseNode.id,
      schemaId: baseNode.schemaId,
      position: baseNode.position,
      settings: { frequency: 10, count: 1, filter: '1 > 2' },
    };

    const filteredFlow: SimulationFlow = {
      ...sampleFlow,
      nodes: [filteredNode],
      edges: [],
    };

    service.startFlow(filteredFlow);
    await vi.advanceTimersByTimeAsync(100);

    expect(mockPublisher.publishBatch).not.toHaveBeenCalled();
  });
});
