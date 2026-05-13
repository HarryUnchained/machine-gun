import { Injectable, signal, computed, inject, NgZone } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import {
  type BrokerTargetNotification,
  type FlowNodeMessageEvent,
  type FlowNodeStatusEvent,
  type SchemaDefinition,
  type ConnectionStatus,
  type CustomTemplate,
  type CustomModule,
  type SimulationFlow,
  type SchemaStats,
} from '@machine-gun/common';
import { AuthService } from './auth.service';

export type TestClampEvent = {
  schemaId: string;
  requested: number;
  actual: number;
  reason?: 'global_budget_exhausted';
};

export type PendingSchemaAction = 'starting' | 'stopping';
export type PendingFlowAction = 'starting' | 'stopping';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private static readonly BACKEND_URL =
    window.location.port === '4200' ? 'http://localhost:3000' : window.location.origin;
  private static readonly UPDATE_DELAY = 200;
  private static readonly MIN_NODE_ACTIVE_MS = 350;

  private readonly socket: Socket;
  private readonly authService = inject(AuthService);
  private readonly ngZone = inject(NgZone);
  private readonly nodeStatusTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly nodeActiveSince = new Map<string, number>();

  public readonly connected = signal(false);
  public readonly socketConnecting = signal(false);
  public readonly schemas = signal<SchemaDefinition[]>([]);
  public readonly fakerNamespaces = signal<string[]>([]);
  public readonly customTemplates = signal<CustomTemplate[]>([]);
  public readonly customModules = signal<CustomModule[]>([]);
  public readonly status = signal<ConnectionStatus | null>(null);
  public readonly rabbitConnected = signal(false);
  public readonly rabbitConnecting = signal(false);
  public readonly rabbitAvailable = signal(false);
  public readonly kafkaConnected = signal(false);
  public readonly kafkaConnecting = signal(false);
  public readonly kafkaAvailable = signal(false);
  public readonly telemetryHistory = signal<
    { throughput: number; total: number; timestamp: number }[]
  >([]);
  public readonly flows = signal<SimulationFlow[]>([]);
  public readonly flowsLoaded = signal(false);
  public readonly nodeStatuses = signal<Record<string, string>>({});
  public readonly activeFlowIds = signal<string[]>([]);
  public readonly pendingFlowActions = signal<Record<string, PendingFlowAction>>({});
  public readonly flowNodeActivity = signal<
    Record<string, { count: number; lastTimestamp: number; schemaId: string; flowId: string }>
  >({});
  public readonly activeSchemaIds = computed(() => this.status()?.activeSchemaIds || []);
  public readonly pendingSchemaActions = signal<Record<string, PendingSchemaAction>>({});
  public readonly brokerTargetNotification = signal<BrokerTargetNotification | null>(null);

  public readonly rpcResponses = signal<Record<string, unknown>>({});
  public readonly liveHistory = signal<
    { schemaId: string; payload: unknown; response: unknown; timestamp: number; isRpc: boolean }[]
  >([]);
  public readonly schemaStats = signal<Record<string, SchemaStats>>({});
  public readonly clampedEvent = signal<TestClampEvent | null>(null);
  public readonly activeBurstIds = signal<string[]>([]);

  constructor() {
    this.socket = io(SocketService.BACKEND_URL, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      auth: (cb: (data: Record<string, unknown>) => void) => {
        cb({ token: this.authService.token() });
      },
    });

    this.socket.on('connect', () => {
      this.connected.set(true);
      this.socketConnecting.set(false);
    });

    this.socket.on('connect_error', () => {
      this.socketConnecting.set(true);
      this.resetInfrastructureStatus();
    });

    this.socket.on('disconnect', () => {
      this.connected.set(false);
      this.socketConnecting.set(true);
      this.resetFlowRuntimeState();
      this.pendingSchemaActions.set({});
      this.pendingFlowActions.set({});
      this.resetInfrastructureStatus();
    });

    this.socket.on('schemas_loaded', (data: { schemas: SchemaDefinition[] }) => {
      this.schemas.set(data.schemas);
    });

    this.socket.on('flows_loaded', (data: { flows: SimulationFlow[] }) => {
      this.flows.set(data.flows);
      this.flowsLoaded.set(true);
    });

    this.socket.on('flow_node_status', (data: FlowNodeStatusEvent) => {
      this.ngZone.run(() => {
        this.handleFlowNodeStatus(data);
      });
    });

    this.socket.on('flow_node_message', (data: FlowNodeMessageEvent) => {
      this.ngZone.run(() => {
        this.flowNodeActivity.update((prev) => {
          const current = prev[data.nodeId];
          return {
            ...prev,
            [data.nodeId]: {
              count: (current?.count ?? 0) + data.batchSize,
              lastTimestamp: data.timestamp,
              schemaId: data.schemaId,
              flowId: data.flowId,
            },
          };
        });
      });
    });

    this.socket.on('test_started', (data: { schemaId: string }) => {
      this.ngZone.run(() => {
        this.pendingSchemaActions.update((prev) => {
          const next = { ...prev };
          delete next[data.schemaId];
          return next;
        });
      });
    });

    this.socket.on('test_stopped', (data: { schemaId: string }) => {
      this.ngZone.run(() => {
        this.pendingSchemaActions.update((prev) => {
          const next = { ...prev };
          delete next[data.schemaId];
          return next;
        });
      });
    });

    this.socket.on('flow_started', (data: { flowId: string }) => {
      this.ngZone.run(() => {
        this.activeFlowIds.update((ids) => [...new Set([...ids, data.flowId])]);
        this.pendingFlowActions.update((prev) => {
          const next = { ...prev };
          delete next[data.flowId];
          return next;
        });
      });
    });

    this.socket.on('flow_stopped', (data: { flowId: string }) => {
      this.ngZone.run(() => {
        this.activeFlowIds.update((ids) => ids.filter((id) => id !== data.flowId));
        this.pendingFlowActions.update((prev) => {
          const next = { ...prev };
          delete next[data.flowId];
          return next;
        });
      });
    });

    this.socket.on(
      'messages_batch_sent',
      (data: {
        schemaId: string;
        batchSize: number;
        receivedCount?: number;
        sampleData: unknown[];
        sampleResponses: unknown[];
      }) => {
        this.schemaStats.update((prev) => {
          const current = prev[data.schemaId] || { sent: 0, received: 0 };
          return {
            ...prev,
            [data.schemaId]: {
              sent: current.sent + data.batchSize,
              received: current.received + (data.receivedCount || 0),
            },
          };
        });

        if (data.sampleData && data.sampleData.length > 0) {
          const isRpc = data.sampleResponses.some(
            (r: unknown) =>
              r !== null && typeof r === 'object' && !('status' in (r as Record<string, unknown>)),
          );

          if (isRpc) {
            this.rpcResponses.update((prev) => ({
              ...prev,
              [data.schemaId]: data.sampleResponses[0],
            }));
          }

          this.liveHistory.update((prev) => {
            const newEntries = [];
            for (let i = 0; i < data.sampleData.length; i++) {
              newEntries.push({
                schemaId: data.schemaId,
                payload: data.sampleData[i],
                response: data.sampleResponses[i],
                timestamp: Date.now(),
                isRpc,
              });
            }
            return [...newEntries, ...prev].slice(0, 50);
          });
        }
      },
    );

    this.socket.on('faker_namespaces_loaded', (data: { namespaces: string[] }) => {
      this.fakerNamespaces.set(data.namespaces);
    });

    this.socket.on(
      'custom_data_loaded',
      (data: { templates: CustomTemplate[]; modules: CustomModule[] }) => {
        this.customTemplates.set(data.templates);
        this.customModules.set(data.modules);
      },
    );

    this.socket.on('status_update', (status: ConnectionStatus) => {
      this.status.set(status);
      this.rabbitConnected.set(status.rabbitmqConnected);
      this.rabbitConnecting.set(status.rabbitmqConnecting);
      this.rabbitAvailable.set(status.rabbitmqAvailable);
      this.kafkaConnected.set(status.kafkaConnected);
      this.kafkaConnecting.set(status.kafkaConnecting);
      this.kafkaAvailable.set(status.kafkaAvailable);
      this.reconcilePendingSchemaActions(status.activeSchemaIds ?? []);
    });

    this.socket.on(
      'telemetry_update',
      (data: { throughput: number; totalMessagesSent: number }) => {
        this.status.update((curr) =>
          curr
            ? { ...curr, throughput: data.throughput, totalMessagesSent: data.totalMessagesSent }
            : null,
        );

        this.telemetryHistory.update((history) => {
          const newSample = {
            throughput: data.throughput || 0,
            total: data.totalMessagesSent || 0,
            timestamp: Date.now(),
          };
          const updated = [...history, newSample];
          if (updated.length > 100) {
            return updated.slice(updated.length - 100);
          }
          return updated;
        });
      },
    );

    this.socket.on('test_clamped', (data: TestClampEvent) => {
      this.clampedEvent.set(data);
      setTimeout(() => this.clampedEvent.set(null), 3000);
    });

    this.socket.on('broker_target_missing', (data: BrokerTargetNotification) => {
      this.brokerTargetNotification.set(data);
    });

    this.socket.on('burst_started', (data: { schemaId: string }) => {
      this.ngZone.run(() => {
        this.activeBurstIds.update((ids) => [...new Set([...ids, data.schemaId])]);
      });
    });

    this.socket.on('burst_finished', (data: { schemaId: string }) => {
      this.ngZone.run(() => {
        this.activeBurstIds.update((ids) => {
          const newIds = [];
          for (const id of ids) {
            if (id !== data.schemaId) newIds.push(id);
          }
          return newIds;
        });
      });
    });
  }

  private resetInfrastructureStatus() {
    this.rabbitConnected.set(false);
    this.rabbitConnecting.set(false);
    this.kafkaConnected.set(false);
    this.kafkaConnecting.set(false);
  }

  private handleFlowNodeStatus(data: FlowNodeStatusEvent) {
    if (data.status === 'executing') {
      this.clearNodeStatusTimer(data.nodeId);
      this.nodeActiveSince.set(data.nodeId, Date.now());
      this.nodeStatuses.update((prev) => ({ ...prev, [data.nodeId]: data.status }));
      return;
    }

    const activeSince = this.nodeActiveSince.get(data.nodeId);
    const elapsedMs = activeSince ? Date.now() - activeSince : SocketService.MIN_NODE_ACTIVE_MS;
    const remainingMs = Math.max(0, SocketService.MIN_NODE_ACTIVE_MS - elapsedMs);

    this.clearNodeStatusTimer(data.nodeId);

    if (remainingMs === 0) {
      this.nodeActiveSince.delete(data.nodeId);
      this.nodeStatuses.update((prev) => ({ ...prev, [data.nodeId]: data.status }));
      return;
    }

    const timer = setTimeout(() => {
      this.ngZone.run(() => {
        this.nodeActiveSince.delete(data.nodeId);
        this.nodeStatuses.update((prev) => ({ ...prev, [data.nodeId]: data.status }));
        this.nodeStatusTimers.delete(data.nodeId);
      });
    }, remainingMs);

    this.nodeStatusTimers.set(data.nodeId, timer);
  }

  private clearNodeStatusTimer(nodeId: string) {
    const timer = this.nodeStatusTimers.get(nodeId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.nodeStatusTimers.delete(nodeId);
  }

  private clearFlowRuntimeState(flowId: string) {
    const flow = this.flows().find((item) => item.id === flowId);
    if (!flow) {
      return;
    }

    for (const node of flow.nodes) {
      this.clearNodeStatusTimer(node.id);
      this.nodeActiveSince.delete(node.id);
    }

    this.nodeStatuses.update((prev) => {
      const next = { ...prev };
      for (const node of flow.nodes) {
        delete next[node.id];
      }
      return next;
    });

    this.flowNodeActivity.update((prev) => {
      const next = { ...prev };
      for (const node of flow.nodes) {
        delete next[node.id];
      }
      return next;
    });
  }

  private reconcilePendingSchemaActions(activeSchemaIds: string[]) {
    const activeIds = new Set(activeSchemaIds);

    this.pendingSchemaActions.update((prev) => {
      const next = { ...prev };

      for (const [schemaId, action] of Object.entries(prev)) {
        const isActive = activeIds.has(schemaId);
        if ((action === 'starting' && isActive) || (action === 'stopping' && !isActive)) {
          delete next[schemaId];
        }
      }

      return next;
    });
  }

  private resetFlowRuntimeState(flow?: SimulationFlow) {
    for (const nodeId of this.nodeStatusTimers.keys()) {
      this.clearNodeStatusTimer(nodeId);
    }

    this.nodeActiveSince.clear();
    this.activeFlowIds.set([]);
    this.nodeStatuses.set({});

    if (!flow) {
      return;
    }

    this.flowNodeActivity.update((prev) => {
      const next = { ...prev };
      for (const node of flow.nodes) {
        delete next[node.id];
      }
      return next;
    });
  }

  public resetSchemaStats(schemaId: string) {
    this.schemaStats.update((prev) => ({
      ...prev,
      [schemaId]: { sent: 0, received: 0 },
    }));
  }

  public startTest(schemaId: string, frequency: number) {
    this.pendingSchemaActions.update((prev) => ({ ...prev, [schemaId]: 'starting' }));
    this.socket.emit('start_test', { schemaId, frequency });
  }

  public burstTest(schemaId: string, count: number, schema?: SchemaDefinition) {
    this.socket.emit('burst_test', { schemaId, count, schema });
  }

  public stopTest(schemaId: string) {
    this.pendingSchemaActions.update((prev) => ({ ...prev, [schemaId]: 'stopping' }));
    this.socket.emit('stop_test', { schemaId });
  }

  public createSchema(schema: SchemaDefinition) {
    this.socket.emit('create_schema', schema);
  }

  public updateSchema(originalId: string, schema: SchemaDefinition) {
    this.socket.emit('update_schema', { originalId, schema });
  }

  public deleteSchema(id: string) {
    this.socket.emit('delete_schema', { id });
  }

  public refreshSchemas() {
    this.socket.emit('refresh_schemas');
  }

  public saveCustomTemplate(template: CustomTemplate) {
    this.socket.emit('save_custom_template', template);
  }

  public deleteCustomTemplate(id: string) {
    this.socket.emit('delete_custom_template', id);
  }

  public saveCustomModule(module: CustomModule) {
    this.socket.emit('save_custom_module', module);
  }

  public deleteCustomModule(id: string) {
    this.socket.emit('delete_custom_module', id);
  }

  public saveFlow(flow: SimulationFlow) {
    this.socket.emit('save_flow', flow);
  }

  public startFlow(flow: SimulationFlow) {
    this.clearFlowRuntimeState(flow.id);
    this.pendingFlowActions.update((prev) => ({ ...prev, [flow.id]: 'starting' }));
    this.socket.emit('start_flow', flow);
  }

  public stopFlow(flowId: string) {
    this.pendingFlowActions.update((prev) => ({ ...prev, [flowId]: 'stopping' }));
    this.socket.emit('stop_flow', { flowId });
  }

  public deleteFlow(id: string) {
    this.socket.emit('delete_flow', { id });
  }
}
