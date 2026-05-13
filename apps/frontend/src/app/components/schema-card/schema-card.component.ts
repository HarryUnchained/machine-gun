import {
  Component,
  input,
  inject,
  signal,
  effect,
  output,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { GeneratorFieldType, TransportType } from '@machine-gun/common';
import type { SchemaDefinition } from '@machine-gun/common';
import { SocketService, type TestClampEvent } from '../../services/socket.service';
import { NotificationService } from '../../services/notification.service';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../icon/icon.component';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-schema-card',
  imports: [CommonModule, IconComponent],
  templateUrl: './schema-card.component.html',
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchemaCardComponent {
  private static readonly DEFAULT_FREQ = 10;
  private static readonly DEFAULT_BURST = 1000;
  private static readonly MAX_LIMIT = 1000000;
  private static readonly PENDING_VISUAL_DELAY_MS = 150;

  public readonly schema = input.required<SchemaDefinition>();
  public readonly edit = output<SchemaDefinition>();
  public readonly duplicate = output<SchemaDefinition>();

  protected readonly isModified = computed(() => {
    const s = this.schema();
    return s.source === 'static' ? s.isModified : false;
  });

  protected readonly frequency = signal<number | null>(SchemaCardComponent.DEFAULT_FREQ);
  protected readonly burstCount = signal<number | null>(SchemaCardComponent.DEFAULT_BURST);
  protected readonly isRunning = computed(() =>
    this.socketService.activeSchemaIds().includes(this.schema().id),
  );
  protected readonly isBursting = computed(() =>
    this.socketService.activeBurstIds().includes(this.schema().id),
  );
  protected readonly isExpanded = signal(false);
  protected readonly showConfirmModal = signal(false);
  protected readonly confirmType = signal<'reset' | 'delete' | null>(null);
  protected readonly pendingAction = computed(
    () => this.socketService.pendingSchemaActions()[this.schema().id] ?? null,
  );
  protected readonly isPending = computed(() => this.pendingAction() !== null);
  protected readonly showPendingVisual = signal(false);
  protected readonly primaryActionLabel = computed(() => {
    const pending = this.showPendingVisual() ? this.pendingAction() : null;
    if (pending === 'starting') {
      return 'STARTING...';
    }
    if (pending === 'stopping') {
      return 'STOPPING...';
    }
    return this.isRunning() ? 'STOP' : 'START';
  });
  protected readonly primaryActionIcon = computed(() => {
    const pending = this.showPendingVisual() ? this.pendingAction() : null;
    if (pending) {
      return 'refresh';
    }
    return this.isRunning() ? 'stop' : 'play';
  });
  protected readonly primaryActionClass = computed(() =>
    this.isRunning()
      ? 'bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-400/15'
      : 'bg-brand-primary hover:opacity-90 text-brand-primary-fg',
  );

  protected readonly loadInterval = computed(() => {
    const freq = this.frequency();
    if (freq === null || freq <= 0) {
      return '...';
    }
    const ms = 1000 / freq;

    if (ms >= 1) {
      return ms.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' ms';
    }
    return (ms * 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' μs';
  });

  protected readonly burstSummary = computed(() => {
    const count = this.burstCount();
    if (count === null) {
      return '...';
    }
    if (count >= 1000000) {
      return (count / 1000000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'M events';
    } else if (count >= 1000) {
      return (count / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'K events';
    }
    return count.toLocaleString() + ' events';
  });

  protected readonly schemaStats = computed(() => {
    return this.socketService.schemaStats()[this.schema().id];
  });

  private readonly socketService = inject(SocketService);
  private readonly notificationService = inject(NotificationService);

  protected readonly connected = this.socketService.connected;
  protected readonly rabbitConnected = this.socketService.rabbitConnected;
  protected readonly rabbitConnecting = this.socketService.rabbitConnecting;
  protected readonly rabbitAvailable = this.socketService.rabbitAvailable;
  protected readonly kafkaConnected = this.socketService.kafkaConnected;
  protected readonly kafkaConnecting = this.socketService.kafkaConnecting;
  protected readonly kafkaAvailable = this.socketService.kafkaAvailable;

  protected readonly GeneratorFieldType = GeneratorFieldType;
  protected readonly TransportType = TransportType;
  protected readonly Math = Math;

  private readonly freqUpdate$ = new Subject<number>();

  constructor() {
    this.initializeDefaults();
    this.initializeFreqUpdate();
    this.initializeClampListener();
    this.initializePendingVisuals();
  }

  private initializeDefaults(): void {
    effect(() => {
      const s = this.schema();
      if (s) {
        this.frequency.set(s.defaultFrequency || SchemaCardComponent.DEFAULT_FREQ);
      }
    });
  }

  private initializeFreqUpdate(): void {
    this.freqUpdate$.pipe(debounceTime(1000), takeUntilDestroyed()).subscribe((freq) => {
      if (this.isRunning()) {
        this.socketService.startTest(this.schema().id, freq);
      }
    });
  }

  private initializeClampListener(): void {
    effect(() => {
      const event = this.socketService.clampedEvent();
      if (event && event.schemaId === this.schema().id) {
        this.frequency.set(event.actual);
        this.showClampNotification(event);
      }
    });
  }

  private initializePendingVisuals(): void {
    effect((onCleanup) => {
      const pending = this.pendingAction();
      if (!pending) {
        this.showPendingVisual.set(false);
        return;
      }

      const timer = setTimeout(() => {
        this.showPendingVisual.set(true);
      }, SchemaCardComponent.PENDING_VISUAL_DELAY_MS);

      onCleanup(() => {
        clearTimeout(timer);
        this.showPendingVisual.set(false);
      });
    });
  }

  private showClampNotification(event: TestClampEvent): void {
    if (event.reason === 'global_budget_exhausted') {
      this.notificationService.show(
        `Global throughput budget exhausted. Stop another running test before starting "${this.schema().name}".`,
        'warning',
      );
      return;
    }

    this.notificationService.show(
      `System load capped! Throughput for "${this.schema().name}" adjusted to ${event.actual.toLocaleString()} msg/s to stay within 100k limit.`,
      'warning',
    );
  }

  protected onFrequencyChange(target: HTMLInputElement): void {
    const val = target.value.replace(/[^0-9]/g, '');
    if (!val) {
      this.frequency.set(null);
      return;
    }
    const num = parseInt(val, 10);
    const clamped = Math.min(SchemaCardComponent.MAX_LIMIT, num);
    this.frequency.set(clamped);
    this.freqUpdate$.next(clamped);
  }

  protected onFrequencyBlur(target: HTMLInputElement): void {
    const current = this.frequency();
    if (current === null || current < 1) {
      this.frequency.set(1);
      target.value = '1';
    } else {
      target.value = current.toString();
    }
  }

  protected onBurstChange(target: HTMLInputElement): void {
    const val = target.value.replace(/[^0-9]/g, '');
    if (!val) {
      this.burstCount.set(null);
      return;
    }
    const num = parseInt(val, 10);
    this.burstCount.set(Math.min(SchemaCardComponent.MAX_LIMIT, num));
  }

  protected onBurstBlur(target: HTMLInputElement): void {
    const current = this.burstCount();
    if (current === null || current < 1) {
      this.burstCount.set(1);
      target.value = '1';
    } else {
      target.value = current.toString();
    }
  }

  protected start(): void {
    const freq = this.frequency() || 1;
    this.socketService.startTest(this.schema().id, freq);
  }

  protected stop(): void {
    this.socketService.stopTest(this.schema().id);
  }

  protected toggleRunState(): void {
    if (this.isPending()) {
      return;
    }

    if (this.isRunning()) {
      this.stop();
      return;
    }

    this.start();
  }

  protected burst(): void {
    const count = this.burstCount() || 1;
    this.socketService.burstTest(this.schema().id, count);
  }

  protected resetStats(): void {
    this.socketService.resetSchemaStats(this.schema().id);
  }

  protected delete(): void {
    this.confirmType.set('delete');
    this.showConfirmModal.set(true);
  }

  protected resetToDefault(): void {
    this.confirmType.set('reset');
    this.showConfirmModal.set(true);
  }

  protected confirmAction(): void {
    const type = this.confirmType();
    if (type === 'delete' || type === 'reset') {
      this.socketService.deleteSchema(this.schema().id);
    }
    this.showConfirmModal.set(false);
    this.confirmType.set(null);
  }
}
