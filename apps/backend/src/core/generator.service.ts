import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SchemaDefinition, TransportType, getErrorMessage } from '@machine-gun/common';
import { CustomDataService } from './custom-data.service';
import Piscina from 'piscina';
import * as path from 'path';
import * as os from 'os';
import { Subject } from 'rxjs';

type GeneratedRecord = Record<string, unknown> | string;
type ActiveLoadTestState = {
  timer: NodeJS.Timeout | null;
  running: boolean;
  inFlightBatches: number;
  isPublisherBackpressured?: (() => boolean) | undefined;
};
type TelemetryBucket = {
  timestamp: number;
  count: number;
};
export type LoadTestStartResult = {
  requested: number;
  actual: number;
  reason?: 'global_budget_exhausted';
};
type CpuSample = {
  timestamp: number;
  usage: NodeJS.CpuUsage;
};

function resolvePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsedValue = parseInt(value, 10);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

function resolvePercentage(value: string | undefined, fallback: number): number {
  return Math.min(100, resolvePositiveInteger(value, fallback));
}

@Injectable()
export class GeneratorService implements OnModuleDestroy {
  private readonly logger = new Logger(GeneratorService.name);
  private static readonly CPU_COUNT: number = Math.max(1, os.cpus().length);
  private static readonly TELEMETRY_WINDOW: number = 3000;
  private static readonly GLOBAL_LIMIT: number = 100000;
  private static readonly DEFAULT_BATCH_SIZE: number = 2500;
  private static readonly DEFAULT_MAX_IN_FLIGHT_BATCHES: number = 1;
  private static readonly DEFAULT_MAX_BACKLOG_MS: number = 100;
  private static readonly DEFAULT_MAX_CPU_PERCENT: number = 85;
  private static readonly BATCH_SIZE: number = resolvePositiveInteger(
    process.env.GENERATOR_BATCH_SIZE,
    GeneratorService.DEFAULT_BATCH_SIZE,
  );
  private static readonly MAX_IN_FLIGHT_BATCHES: number = resolvePositiveInteger(
    process.env.LOAD_TEST_MAX_IN_FLIGHT_BATCHES,
    GeneratorService.DEFAULT_MAX_IN_FLIGHT_BATCHES,
  );
  private static readonly MAX_BACKLOG_MS: number = resolvePositiveInteger(
    process.env.LOAD_TEST_MAX_BACKLOG_MS,
    GeneratorService.DEFAULT_MAX_BACKLOG_MS,
  );
  private static readonly MAX_CPU_PERCENT: number = resolvePercentage(
    process.env.LOAD_TEST_MAX_CPU_PERCENT,
    GeneratorService.DEFAULT_MAX_CPU_PERCENT,
  );
  private static readonly TELEMETRY_INTERVAL_MS: number = 100;
  private static readonly LOAD_TEST_TICK_MS: number = 50;
  private static readonly BUCKET_SIZE_MS: number = 100;

  private pool: Piscina;
  private readonly activeIntervals: Map<string, ActiveLoadTestState>;
  private readonly activeFrequencies: Map<string, number>;
  private cpuSample: CpuSample;

  public readonly telemetry$ = new Subject<{ throughput: number; messagesSent: number }>();

  private publishedCount: number = 0;
  private producedCount: number = 0;
  private buckets: TelemetryBucket[];

  constructor(private readonly customDataService: CustomDataService) {
    this.activeIntervals = new Map<string, ActiveLoadTestState>();
    this.activeFrequencies = new Map<string, number>();
    this.cpuSample = {
      timestamp: performance.now(),
      usage: process.cpuUsage(),
    };
    this.buckets = [];
    this.pool = this.createWorkerPool();

    this.logger.log(`GeneratorService online (Cap: ${GeneratorService.GLOBAL_LIMIT} msg/s)`);
    this.startTelemetryLoop();
  }

  private recordProduced(count: number) {
    this.producedCount += count;
  }

  public recordPublished(count: number, trackTelemetry = true) {
    const now = Date.now();
    this.publishedCount += count;

    if (!trackTelemetry) {
      return;
    }

    const bucketTime =
      Math.floor(now / GeneratorService.BUCKET_SIZE_MS) * GeneratorService.BUCKET_SIZE_MS;
    const lastBucket = this.buckets[this.buckets.length - 1];

    if (lastBucket && lastBucket.timestamp === bucketTime) {
      lastBucket.count += count;
    } else {
      this.buckets.push({ timestamp: bucketTime, count });
    }

    const cutoff = now - GeneratorService.TELEMETRY_WINDOW;
    while (this.buckets.length > 0 && (this.buckets[0]?.timestamp ?? 0) < cutoff) {
      this.buckets.shift();
    }
  }

  public getTelemetry() {
    const now = Date.now();
    const cutoff = now - GeneratorService.TELEMETRY_WINDOW;
    let totalInWindow = 0;

    for (const bucket of this.buckets) {
      if (bucket.timestamp >= cutoff) {
        totalInWindow += bucket.count;
      }
    }

    const throughput = Math.round(totalInWindow / (GeneratorService.TELEMETRY_WINDOW / 1000));

    return {
      messagesSent: this.publishedCount,
      throughput,
    };
  }

  public async generateBatch(
    schema: SchemaDefinition,
    count: number,
    callback?: (chunk: GeneratedRecord[]) => Promise<void>,
    serialize = false,
    trackTelemetry = true,
  ): Promise<GeneratedRecord[]> {
    try {
      const customModules = this.customDataService.getModules();
      const chunkSize = GeneratorService.BATCH_SIZE;
      let remaining = count;
      const results: GeneratedRecord[] = [];
      const tasks: Promise<void>[] = [];

      while (remaining > 0) {
        const batchSize = Math.min(remaining, chunkSize);
        remaining -= batchSize;

        const task = this.runWorkerTask(
          schema,
          batchSize,
          customModules,
          serialize,
          results,
          callback,
        );

        tasks.push(task);
      }

      await Promise.all(tasks);

      const producedCount = callback ? count : results.length;
      if (trackTelemetry) {
        this.recordProduced(producedCount);
      }

      return results;
    } catch (error: unknown) {
      this.logger.error(`Generation failed for ${schema.name}: ${getErrorMessage(error)}`);
      return [];
    }
  }

  async burst(
    schema: SchemaDefinition,
    count: number,
    callback: (data: GeneratedRecord[]) => Promise<void>,
  ) {
    this.logger.log(`Executing burst: ${schema.name} (${count} messages)`);

    try {
      await this.generateBatch(
        schema,
        count,
        callback,
        this.shouldSerializeForPublisher(schema),
        false,
      );
      this.logger.log(`Burst finished for ${schema.name}`);
    } catch (error: unknown) {
      this.logger.error(`Burst failed for ${schema.name}: ${getErrorMessage(error)}`);
    }
  }

  startLoadTest(
    schema: SchemaDefinition,
    frequency: number,
    callback: (batch: (Record<string, unknown> | string)[]) => Promise<void>,
    isPublisherBackpressured?: () => boolean,
  ): LoadTestStartResult {
    if (this.activeIntervals.has(schema.id)) {
      this.stopLoadTest(schema.id);
    }

    const budgetRemaining = this.calculateRemainingBudget();

    if (budgetRemaining <= 0) {
      this.logger.warn(`Global budget exhausted. Cannot start "${schema.name}"`);
      return { requested: frequency, actual: 0, reason: 'global_budget_exhausted' };
    }

    const actualFrequency = Math.min(frequency, budgetRemaining);
    this.activeFrequencies.set(schema.id, actualFrequency);

    const state: ActiveLoadTestState = {
      timer: null,
      running: true,
      inFlightBatches: 0,
      isPublisherBackpressured,
    };
    this.activeIntervals.set(schema.id, state);

    this.logger.log(`Load test started: ${schema.name} at ${actualFrequency} msg/s`);
    this.startLoadTestLoop(schema, actualFrequency, state, callback);

    return { requested: frequency, actual: actualFrequency };
  }

  public stopLoadTest(schemaId: string) {
    const state = this.activeIntervals.get(schemaId);
    if (!state) {
      return;
    }

    state.running = false;

    if (state.timer) {
      clearTimeout(state.timer);
    }

    this.activeIntervals.delete(schemaId);
    this.activeFrequencies.delete(schemaId);
    this.logger.log(`Load test stopped: ${schemaId}`);
  }

  getActiveTestsCount(): number {
    return this.activeIntervals.size;
  }

  getActiveSchemaIds(): string[] {
    return Array.from(this.activeIntervals.keys());
  }

  onModuleDestroy() {
    this.logger.log('GeneratorService shutting down. Cleaning up workers...');
    for (const [id] of this.activeIntervals) {
      this.stopLoadTest(id);
    }
    void this.pool.destroy();
  }

  private normalizeBatchResult(result: GeneratedRecord[] | GeneratedRecord): GeneratedRecord[] {
    if (Array.isArray(result)) {
      return result;
    }

    return [result];
  }

  private createWorkerPool(): Piscina {
    const maxThreads = this.resolveMaxThreads();
    const minThreads = Math.min(this.resolveMinThreads(), maxThreads);

    return new Piscina({
      filename: path.resolve(__dirname, 'worker/generator.worker.js'),
      minThreads,
      maxThreads,
    });
  }

  private resolveMinThreads(): number {
    return resolvePositiveInteger(
      process.env.PISCINA_MIN_THREADS,
      Math.max(1, Math.floor(GeneratorService.CPU_COUNT / 2)),
    );
  }

  private resolveMaxThreads(): number {
    return resolvePositiveInteger(process.env.PISCINA_MAX_THREADS, GeneratorService.CPU_COUNT);
  }

  private startTelemetryLoop() {
    setInterval(() => {
      const stats = this.getTelemetry();

      if (this.shouldEmitTelemetry(stats)) {
        this.telemetry$.next(stats);
      }
    }, GeneratorService.TELEMETRY_INTERVAL_MS);
  }

  private shouldEmitTelemetry(stats: { throughput: number; messagesSent: number }): boolean {
    if (stats.throughput > 0) {
      return true;
    }

    if (this.publishedCount > 0) {
      return true;
    }

    return this.activeIntervals.size > 0;
  }

  private runWorkerTask(
    schema: SchemaDefinition,
    count: number,
    customModules: unknown[],
    serialize: boolean,
    results: GeneratedRecord[],
    callback?: (chunk: GeneratedRecord[]) => Promise<void>,
  ): Promise<void> {
    return this.pool
      .run({ fields: schema.fields, count, customModules, serialize })
      .then(async (result: GeneratedRecord[] | GeneratedRecord) => {
        const normalizedBatch = this.normalizeBatchResult(result);

        if (callback) {
          await callback(normalizedBatch);
          return;
        }

        for (const item of normalizedBatch) {
          results.push(item);
        }
      });
  }

  private calculateRemainingBudget(): number {
    let currentTotal = 0;

    for (const frequency of this.activeFrequencies.values()) {
      currentTotal += frequency;
    }

    return Math.max(0, GeneratorService.GLOBAL_LIMIT - currentTotal);
  }

  private startLoadTestLoop(
    schema: SchemaDefinition,
    frequency: number,
    state: ActiveLoadTestState,
    callback: (batch: (Record<string, unknown> | string)[]) => Promise<void>,
  ) {
    let accumulator = 0;
    let lastTick = performance.now();

    const tick = () => {
      if (!state.running) {
        return;
      }

      try {
        const now = performance.now();
        const delta = now - lastTick;
        lastTick = now;

        accumulator += (delta / 1000) * frequency;
        accumulator = this.capLoadTestBacklog(accumulator, frequency);

        if (
          this.isLoadTestSaturated(state) ||
          this.isLoadTestCpuSaturated() ||
          state.isPublisherBackpressured?.()
        ) {
          state.timer = setTimeout(tick, GeneratorService.LOAD_TEST_TICK_MS);
          return;
        }

        if (accumulator >= 1) {
          const count = Math.min(
            Math.floor(accumulator),
            this.resolveMaxBacklogMessages(frequency),
          );
          accumulator -= count;
          this.runBackgroundGeneration(schema, count, state, callback);
        }

        state.timer = setTimeout(tick, GeneratorService.LOAD_TEST_TICK_MS);
      } catch (error: unknown) {
        this.logger.error(`Generator panic for ${schema.name}: ${getErrorMessage(error)}`);
        this.stopLoadTest(schema.id);
      }
    };

    void tick();
  }

  private runBackgroundGeneration(
    schema: SchemaDefinition,
    count: number,
    state: ActiveLoadTestState,
    callback: (batch: (Record<string, unknown> | string)[]) => Promise<void>,
  ) {
    state.inFlightBatches++;
    void this.generateBatch(schema, count, callback, this.shouldSerializeForPublisher(schema))
      .catch((err: unknown) => {
        this.logger.error(`Background generation error [${schema.name}]: ${getErrorMessage(err)}`);
      })
      .finally(() => {
        state.inFlightBatches = Math.max(0, state.inFlightBatches - 1);
      });
  }

  private isLoadTestSaturated(state: ActiveLoadTestState): boolean {
    return state.inFlightBatches >= GeneratorService.MAX_IN_FLIGHT_BATCHES;
  }

  private capLoadTestBacklog(accumulator: number, frequency: number): number {
    return Math.min(accumulator, this.resolveMaxBacklogMessages(frequency));
  }

  private resolveMaxBacklogMessages(frequency: number): number {
    return Math.max(1, Math.floor((frequency * GeneratorService.MAX_BACKLOG_MS) / 1000));
  }

  private isLoadTestCpuSaturated(): boolean {
    const now = performance.now();
    const elapsedMs = now - this.cpuSample.timestamp;

    if (elapsedMs < GeneratorService.LOAD_TEST_TICK_MS) {
      return false;
    }

    const deltaUsage = process.cpuUsage(this.cpuSample.usage);
    this.cpuSample = {
      timestamp: now,
      usage: process.cpuUsage(),
    };

    const consumedCpuMs = (deltaUsage.user + deltaUsage.system) / 1000;
    const availableCpuMs = Math.max(1, elapsedMs * GeneratorService.CPU_COUNT);
    const cpuPercent = (consumedCpuMs / availableCpuMs) * 100;

    if (cpuPercent > GeneratorService.MAX_CPU_PERCENT) {
      this.logger.warn(
        `CPU Saturation reached: ${cpuPercent.toFixed(1)}% > ${
          GeneratorService.MAX_CPU_PERCENT
        }%. Throttling load generation.`,
      );
      return true;
    }

    return false;
  }

  private shouldSerializeForPublisher(schema: SchemaDefinition): boolean {
    const destination = schema.destination;

    if (destination.isRpc) {
      return false;
    }

    if (destination.transport === TransportType.RABBITMQ) {
      return true;
    }

    if (destination.transport === TransportType.KAFKA) {
      return destination.kafkaKey?.mode !== 'field';
    }

    return false;
  }
}
