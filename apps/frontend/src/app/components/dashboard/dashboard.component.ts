import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  effect,
} from '@angular/core';
import { SocketService } from '../../services/socket.service';
import { NavigationService } from '../../services/navigation.service';
import { FlowService } from '../../services/flow.service';
import { SchemaCardComponent } from '../schema-card/schema-card.component';
import { ConnectionStatusComponent } from '../connection-status/connection-status.component';
import { SchemaBuilderComponent } from '../schema-builder/schema-builder.component';
import { ThemeSwitcherComponent } from '../theme-switcher/theme-switcher.component';
import { IconComponent } from '../icon/icon.component';
import { MachineGunLogoComponent } from '../machine-gun-logo/machine-gun-logo.component';
import { TelemetryChartComponent } from '../telemetry-chart/telemetry-chart.component';
import { FlowCanvasComponent } from '../flow-canvas/flow-canvas.component';
import { LiveHubComponent } from '../live-hub/live-hub.component';
import { StorageService } from '../../services/storage.service';
import type { SchemaDefinition } from '@machine-gun/common';
import { asInput } from '../../utils/event-types';

@Component({
  selector: 'app-dashboard',
  imports: [
    SchemaCardComponent,
    ConnectionStatusComponent,
    SchemaBuilderComponent,
    ThemeSwitcherComponent,
    IconComponent,
    MachineGunLogoComponent,
    TelemetryChartComponent,
    FlowCanvasComponent,
    LiveHubComponent,
  ],
  templateUrl: './dashboard.component.html',
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private static readonly BREAKPOINT_LG = 1024;

  protected readonly asInput = asInput;

  protected readonly socketService = inject(SocketService);
  protected readonly flowService = inject(FlowService);
  private readonly navService = inject(NavigationService);
  private readonly storageService = inject(StorageService);

  protected readonly schemas = this.socketService.schemas;
  protected readonly status = this.socketService.status;
  protected readonly showLibrary = this.navService.showLibrary;
  protected readonly windowWidth = signal(window.innerWidth);

  constructor() {
    this.initializeResizeListener();
    this.initializeLibraryEffect();
  }

  private initializeResizeListener(): void {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      this.windowWidth.set(width);

      if (width < DashboardComponent.BREAKPOINT_LG && this.showLibrary()) {
        this.showLibrary.set(false);
      } else if (width >= DashboardComponent.BREAKPOINT_LG && !this.showLibrary()) {
        this.showLibrary.set(true);
      }
    });
  }

  private initializeLibraryEffect(): void {
    effect(() => {
      this.storageService.set('showLibrary', this.showLibrary());
    });
  }

  protected searchQuery = signal('');
  protected onlyActive = signal(false);
  protected activeFilters = signal({
    static: true,
    'static-edited': true,
    dynamic: true,
  });

  protected readonly schemaStats = computed(() => {
    const list = this.schemas();
    let staticCount = 0;
    let staticEditedCount = 0;
    let dynamicCount = 0;

    for (const schema of list) {
      if (schema.source === 'static') {
        if (schema.isModified) {
          staticEditedCount++;
        } else {
          staticCount++;
        }
      } else if (schema.source === 'dynamic') {
        dynamicCount++;
      }
    }

    return {
      total: list.length,
      static: staticCount,
      'static-edited': staticEditedCount,
      dynamic: dynamicCount,
    };
  });

  protected readonly filteredSchemas = computed(() => {
    const list = this.schemas();
    const filters = this.activeFilters();
    const query = this.searchQuery().toLowerCase().trim();
    const activeIds = this.onlyActive() ? this.socketService.activeSchemaIds() : null;
    const allFiltersOff = !filters.static && !filters['static-edited'] && !filters.dynamic;

    const filtered: SchemaDefinition[] = [];

    for (const schema of list) {
      if (!this.matchesFilter(schema, filters, allFiltersOff)) {
        continue;
      }

      if (query && !this.matchesQuery(schema, query)) {
        continue;
      }

      if (activeIds && !activeIds.includes(schema.id)) {
        continue;
      }

      filtered.push(schema);
    }

    return filtered;
  });

  private matchesFilter(
    schema: SchemaDefinition,
    filters: Record<string, boolean>,
    allFiltersOff: boolean,
  ): boolean {
    if (allFiltersOff) {
      return true;
    }

    if (schema.source === 'dynamic') {
      return !!filters['dynamic'];
    }

    if (schema.source === 'static') {
      return schema.isModified ? !!filters['static-edited'] : !!filters['static'];
    }

    return true;
  }

  private matchesQuery(schema: SchemaDefinition, query: string): boolean {
    const nameMatch = schema.name.toLowerCase().includes(query);
    const idMatch = schema.id.toLowerCase().includes(query);
    const descriptionMatch = schema.description?.toLowerCase().includes(query);
    const targetMatch = schema.destination.target.toLowerCase().includes(query);
    const routingKeyMatch = schema.destination.routingKey?.toLowerCase().includes(query);
    const transportMatch = schema.destination.transport.toLowerCase().includes(query);

    return (
      nameMatch || idMatch || descriptionMatch || targetMatch || routingKeyMatch || transportMatch
    );
  }

  protected showBuilder = signal(false);
  protected showLiveHub = signal(false);
  protected viewMode = this.navService.viewMode;
  protected selectedSchema = signal<SchemaDefinition | null>(null);

  openBuilder(schema?: SchemaDefinition) {
    this.selectedSchema.set(schema || null);
    this.showBuilder.set(true);
  }

  duplicateSchema(schema: SchemaDefinition) {
    const clone = JSON.parse(JSON.stringify(schema)) as SchemaDefinition;
    clone.id = `${clone.id}-copy`;
    clone.name = `${clone.name}-copy`;
    clone.source = 'dynamic';
    this.openBuilder(clone);
  }

  toggleFilter(key: 'static' | 'static-edited' | 'dynamic') {
    this.activeFilters.update((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  closeBuilder() {
    this.showBuilder.set(false);
    this.selectedSchema.set(null);
  }

  refreshSchemas() {
    this.socketService.refreshSchemas();
  }

  stopAllTests() {
    const activeIds = this.socketService.activeSchemaIds();
    for (const id of activeIds) {
      this.socketService.stopTest(id);
    }
  }

  onSchemaDragStart(event: DragEvent, schema: SchemaDefinition) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('schemaId', schema.id);
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onSchemaDrop(event: DragEvent) {
    event.preventDefault();
    const schemaId = event.dataTransfer?.getData('schemaId');
    if (!schemaId) return;

    // Get the drop target (the canvas container)
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    // Precisely translate client coordinates to local canvas space
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.flowService.addNode(schemaId, { x, y });
  }
}
