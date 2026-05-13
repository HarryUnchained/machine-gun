/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { GeneratorService } from '../generator.service';
import Piscina from 'piscina';
import { GeneratorFieldType, type SchemaDefinition, TransportType } from '@machine-gun/common';

vi.mock('piscina', () => {
  return {
    default: class {
      run = vi.fn().mockResolvedValue({ id: 1 });
      destroy = vi.fn().mockResolvedValue(undefined);
    },
  };
});

describe('GeneratorService', () => {
  let service: GeneratorService;
  let mockCustomData: { getModules: Mock };
  let mockPool: Piscina;

  const mockSchema: SchemaDefinition = {
    id: 'test-schema',
    name: 'Test Schema',
    fields: [{ name: 'test', type: GeneratorFieldType.STRING }],
    destination: { transport: TransportType.RABBITMQ, target: 'test-queue' },
    defaultFrequency: 1,
    source: 'dynamic',
  };

  beforeEach(() => {
    mockCustomData = {
      getModules: vi.fn().mockReturnValue([]),
    };

    service = new GeneratorService(mockCustomData as any);
    // Access the private pool created in constructor
    mockPool = (service as unknown as { pool: Piscina }).pool;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should generate a batch of 1 record via worker pool', async () => {
    vi.mocked(mockPool.run).mockResolvedValue([{ id: 1 }]);
    const result = await service.generateBatch(mockSchema, 1);
    expect(mockPool.run).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: mockSchema.fields,
        count: 1,
      }),
    );
    expect(result).toEqual([{ id: 1 }]);
  });

  it('should generate a batch of records', async () => {
    vi.mocked(mockPool.run).mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const result = await service.generateBatch(mockSchema, 2);
    expect(mockPool.run).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 2,
      }),
    );
    expect(result).toHaveLength(2);
  });

  it('should normalize a singleton batch result from the worker', async () => {
    vi.mocked(mockPool.run).mockResolvedValue({ id: 1 });

    const result = await service.generateBatch(mockSchema, 1);

    expect(result).toEqual([{ id: 1 }]);
  });

  it('should manage load test intervals', async () => {
    vi.useFakeTimers();
    const onData = vi.fn();
    vi.mocked(mockPool.run).mockResolvedValue({ id: 1 });

    void service.startLoadTest(mockSchema, 10, onData); // 10 msg/s = 100ms interval

    expect(service.getActiveTestsCount()).toBe(1);

    // Advance time by 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(onData).toHaveBeenCalled();
    expect(mockPool.run).toHaveBeenCalled();

    service.stopLoadTest(mockSchema.id);
    expect(service.getActiveTestsCount()).toBe(0);
  });

  it('should not queue more load batches while the previous batch is still in flight', async () => {
    vi.useFakeTimers();
    const onData = vi.fn().mockResolvedValue(undefined);
    let resolveRun: (value: unknown) => void = () => {};

    vi.mocked(mockPool.run).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );

    service.startLoadTest(mockSchema, 1000, onData);

    await vi.advanceTimersByTimeAsync(100);
    expect(mockPool.run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(mockPool.run).toHaveBeenCalledTimes(1);

    resolveRun([{ id: 1 }]);
    await vi.advanceTimersByTimeAsync(50);

    expect(mockPool.run).toHaveBeenCalledTimes(2);
    service.stopLoadTest(mockSchema.id);
  });

  it('should pause load scheduling while the cpu governor is saturated', async () => {
    vi.useFakeTimers();
    const onData = vi.fn().mockResolvedValue(undefined);
    vi.mocked(mockPool.run).mockResolvedValue({ id: 1 });
    const cpuSpy = vi
      .spyOn(
        service as unknown as { isLoadTestCpuSaturated: () => boolean },
        'isLoadTestCpuSaturated',
      )
      .mockReturnValue(true);

    service.startLoadTest(mockSchema, 1000, onData);

    await vi.advanceTimersByTimeAsync(200);
    expect(mockPool.run).not.toHaveBeenCalled();

    cpuSpy.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(50);

    expect(mockPool.run).toHaveBeenCalledTimes(1);
    service.stopLoadTest(mockSchema.id);
  });

  it('should stop load test before starting a new one for same ID', () => {
    const onData = vi.fn();
    void service.startLoadTest(mockSchema, 10, onData);
    const stopSpy = vi.spyOn(service, 'stopLoadTest');

    void service.startLoadTest(mockSchema, 20, onData);
    expect(stopSpy).toHaveBeenCalledWith(mockSchema.id);
  });

  it('should handle burst generation in chunks', async () => {
    const onBatch = vi.fn().mockResolvedValue(undefined);
    vi.mocked(mockPool.run).mockResolvedValue(Array(5).fill({ id: 1 }));

    await service.burst(mockSchema, 5, onBatch);

    expect(onBatch).toHaveBeenCalledTimes(1);
    expect(onBatch).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 1 })]),
    );
  });

  it('should handle burst generation when the worker returns a singleton for count=1', async () => {
    const onBatch = vi.fn().mockResolvedValue(undefined);
    vi.mocked(mockPool.run).mockResolvedValue({ id: 1 });

    await service.burst(mockSchema, 1, onBatch);

    expect(onBatch).toHaveBeenCalledTimes(1);
    expect(onBatch).toHaveBeenCalledWith([{ id: 1 }]);
  });
});
