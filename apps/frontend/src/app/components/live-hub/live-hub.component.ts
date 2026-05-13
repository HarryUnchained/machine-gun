import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { SocketService } from '../../services/socket.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-live-hub',
  imports: [CommonModule, ScrollingModule, IconComponent],
  templateUrl: './live-hub.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveHubComponent {
  private readonly socketService = inject(SocketService);

  protected readonly history = this.socketService.liveHistory;
  protected isMaximized = signal(false);
  protected windowWidth = signal(window.innerWidth);
  protected sortOrder = signal<'desc' | 'asc'>('desc');
  protected filterType = signal<'all' | 'rpc' | 'live'>('all');
  protected selectedSchemas = signal<Set<string>>(new Set());

  public readonly close = output<void>();

  protected readonly availableSchemas = computed(() => {
    const schemas = new Set<string>();
    for (const item of this.history()) {
      schemas.add(item.schemaId);
    }
    return Array.from(schemas).sort();
  });

  protected readonly filteredHistory = computed(() => {
    const type = this.filterType();
    const selected = this.selectedSchemas();

    const filtered = [];
    for (const item of this.history()) {
      if (type === 'rpc' && !item.isRpc) {
        continue;
      }
      if (type === 'live' && item.isRpc) {
        continue;
      }
      if (selected.size > 0 && !selected.has(item.schemaId)) {
        continue;
      }
      filtered.push(item);
    }

    return filtered.sort((a, b) => {
      if (this.sortOrder() === 'desc') {
        return b.timestamp - a.timestamp;
      }
      return a.timestamp - b.timestamp;
    });
  });

  constructor() {
    this.initializeResizeListener();
  }

  private initializeResizeListener(): void {
    window.addEventListener('resize', () => {
      this.windowWidth.set(window.innerWidth);
    });
  }

  public toggleSchemaFilter(schemaId: string): void {
    this.selectedSchemas.update((prev) => {
      const next = new Set(prev);
      if (next.has(schemaId)) {
        next.delete(schemaId);
      } else {
        next.add(schemaId);
      }
      return next;
    });
  }

  public clearFilters(): void {
    this.selectedSchemas.set(new Set());
  }

  protected trackByTimestamp(
    _index: number,
    item: {
      schemaId: string;
      payload: unknown;
      response: unknown;
      timestamp: number;
      isRpc: boolean;
    },
  ): number {
    return item.timestamp;
  }

  protected clearHistory(): void {
    this.socketService.liveHistory.set([]);
  }

  protected async copyToClipboard(data: unknown): Promise<void> {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }
}
