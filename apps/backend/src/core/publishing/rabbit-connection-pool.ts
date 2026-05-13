import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as amqplib from 'amqplib';
import { getErrorMessage } from '@machine-gun/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PoolSlot {
  channel: amqplib.Channel;
  drainPromise: Promise<void> | null;
}

interface ManagedConnection {
  conn: amqplib.ChannelModel;
  slots: PoolSlot[];
  alive: boolean;
  index: number;
  nextSlot: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class RabbitConnectionPool implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitConnectionPool.name);

  // Number of separate TCP connections to RabbitMQ (env: RABBIT_CONNECTIONS, default 2)
  static readonly CONNECTION_COUNT: number = Math.min(
    8,
    Math.max(1, parseInt(process.env.RABBIT_CONNECTIONS ?? '2', 10) || 2),
  );
  // Channels per TCP connection (env: RABBIT_CHANNELS_PER_CONN, default 8)
  static readonly CHANNELS_PER_CONN: number = Math.min(
    32,
    Math.max(1, parseInt(process.env.RABBIT_CHANNELS_PER_CONN ?? '8', 10) || 8),
  );

  private static readonly RECONNECT_DELAY_MS = 2000;
  private static readonly DRAIN_TIMEOUT_MS = 2000;
  private static readonly BACKPRESSURE_WARN_COOLDOWN_MS = 1000;

  private readonly connections: ManagedConnection[] = [];
  private nextConn = 0;
  private closing = false;
  private lastBackpressureWarnAt = 0;

  private url = '';
  private ready = false;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(url: string): Promise<void> {
    this.url = url;
    this.logger.log(
      `Opening ${RabbitConnectionPool.CONNECTION_COUNT} publish connections ` +
        `(${RabbitConnectionPool.CHANNELS_PER_CONN} channels each) to RabbitMQ...`,
    );

    await Promise.all(
      Array.from({ length: RabbitConnectionPool.CONNECTION_COUNT }, (_, i) =>
        this.openConnection(i),
      ),
    );

    this.ready = true;
    this.logger.log(
      `Publish pool ready: ${RabbitConnectionPool.CONNECTION_COUNT} connections × ` +
        `${RabbitConnectionPool.CHANNELS_PER_CONN} channels = ` +
        `${RabbitConnectionPool.CONNECTION_COUNT * RabbitConnectionPool.CHANNELS_PER_CONN} total channels`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;

    await Promise.allSettled(
      this.connections.map(async (mc) => {
        mc.alive = false;
        for (const slot of mc.slots) {
          await slot.channel.close().catch(() => {});
        }
        await mc.conn.close().catch(() => {});
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  get isReady(): boolean {
    return this.ready && !this.closing;
  }

  get isFullySaturated(): boolean {
    if (!this.ready) return false;
    return this.connections.every(
      (mc) => mc.alive && mc.slots.every((s) => s.drainPromise !== null),
    );
  }

  /**
   * Publish to the best available channel across all connections.
   * Returns false if all channels are currently draining (caller should wait).
   */
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: amqplib.Options.Publish,
  ): boolean {
    return this.writeToPool((ch) => ch.publish(exchange, routingKey, content, options));
  }

  sendToQueue(queue: string, content: Buffer, options?: amqplib.Options.Publish): boolean {
    return this.writeToPool((ch) => ch.sendToQueue(queue, content, options));
  }

  /** Wait for the first available channel across all connections to drain. */
  async waitForAnyDrain(): Promise<void> {
    const now = Date.now();
    if (now - this.lastBackpressureWarnAt > RabbitConnectionPool.BACKPRESSURE_WARN_COOLDOWN_MS) {
      const total = RabbitConnectionPool.CONNECTION_COUNT * RabbitConnectionPool.CHANNELS_PER_CONN;
      this.logger.warn(`All ${total} publish channels saturated. Waiting for drain...`);
      this.lastBackpressureWarnAt = now;
    }

    const draining: Promise<void>[] = [];
    for (const mc of this.connections) {
      for (const slot of mc.slots) {
        if (slot.drainPromise) draining.push(slot.drainPromise);
      }
    }

    if (draining.length > 0) {
      await Promise.race(draining);
    }

    this.logger.debug('Drain complete. Resuming publish.');
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private writeToPool(write: (ch: amqplib.Channel) => boolean): boolean {
    const connCount = this.connections.length;

    for (let i = 0; i < connCount; i++) {
      const mc = this.connections[this.nextConn % connCount]!;
      this.nextConn++;

      if (!mc.alive) continue;

      const slotCount = mc.slots.length;
      for (let j = 0; j < slotCount; j++) {
        const slot = mc.slots[mc.nextSlot % slotCount]!;
        mc.nextSlot++;

        if (slot.drainPromise) continue; // this slot is draining, skip

        const accepted = write(slot.channel);

        if (!accepted) {
          // Arm drain listener on this slot
          this.armDrain(slot);
        }

        return accepted;
      }
    }

    // No free slot found
    return false;
  }

  private armDrain(slot: PoolSlot): void {
    if (slot.drainPromise) return;

    slot.drainPromise = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        slot.drainPromise = null;
        resolve();
      }, RabbitConnectionPool.DRAIN_TIMEOUT_MS);

      slot.channel.once('drain', () => {
        clearTimeout(timer);
        slot.drainPromise = null;
        resolve();
      });
    });
  }

  private async openConnection(index: number): Promise<void> {
    if (this.closing) return;

    try {
      const conn = await amqplib.connect(this.url);

      const mc: ManagedConnection = {
        conn,
        slots: [],
        alive: true,
        index,
        nextSlot: 0,
      };

      // Create channels for this connection
      for (let i = 0; i < RabbitConnectionPool.CHANNELS_PER_CONN; i++) {
        const channel = await conn.createChannel();
        channel.on('error', () => {}); // prevent unhandled errors crashing node
        mc.slots.push({ channel, drainPromise: null });
      }

      conn.on('error', (err: Error) => {
        this.logger.error(`Publish connection ${index} error: ${err.message}`);
      });

      conn.on('close', () => {
        if (this.closing) return;
        mc.alive = false;
        mc.slots = [];
        this.logger.warn(
          `Publish connection ${index} closed. Reconnecting in ${RabbitConnectionPool.RECONNECT_DELAY_MS}ms...`,
        );
        setTimeout(() => void this.openConnection(index), RabbitConnectionPool.RECONNECT_DELAY_MS);
      });

      // Replace any existing dead connection at this index
      this.connections[index] = mc;
      this.logger.log(
        `Publish connection ${index} ready (${RabbitConnectionPool.CHANNELS_PER_CONN} channels)`,
      );
    } catch (error) {
      if (this.closing) return;
      this.logger.error(
        `Failed to open publish connection ${index}: ${getErrorMessage(error)}. Retrying in ${RabbitConnectionPool.RECONNECT_DELAY_MS}ms...`,
      );
      setTimeout(() => void this.openConnection(index), RabbitConnectionPool.RECONNECT_DELAY_MS);
    }
  }
}
