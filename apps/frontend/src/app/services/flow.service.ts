import { Injectable, signal, computed, inject, effect } from '@angular/core';
import type { SimulationFlow, FlowNode, FlowEdge, SchemaDefinition } from '@machine-gun/common';
import { SocketService } from './socket.service';
import { StorageService } from './storage.service';
import { layoutFlow } from '../utils/flow-layout';

export interface FlowDiffNodeDetail {
  id: string;
  name: string;
  type: 'added' | 'removed' | 'modified';
  changes?: string[];
}

export interface FlowDiffEdgeDetail {
  id: string;
  type: 'added' | 'removed' | 'modified';
  source: string;
  target: string;
  changes?: string[];
}

export interface FlowDiff {
  isNew: boolean;
  nodes: { added: number; removed: number; modified: number; details: FlowDiffNodeDetail[] };
  edges: { added: number; removed: number; modified: number; details: FlowDiffEdgeDetail[] };
}

@Injectable({
  providedIn: 'root',
})
export class FlowService {
  private readonly socketService = inject(SocketService);
  private readonly storageService = inject(StorageService);

  readonly flows = computed(() => this.socketService.flows());

  readonly activeFlow = signal<SimulationFlow | null>(null);
  readonly hasUnsavedChanges = computed(() => {
    const diff = this.activeDiff();
    if (!diff) return false;
    if (diff.isNew) return true;

    return (
      diff.nodes.added > 0 ||
      diff.nodes.removed > 0 ||
      diff.nodes.modified > 0 ||
      diff.edges.added > 0 ||
      diff.edges.removed > 0 ||
      diff.edges.modified > 0
    );
  });
  readonly availableFlows = computed(() => this.flows());

  readonly selectedNodeId = signal<string | null>(null);
  readonly selectedEdgeId = signal<string | null>(null);
  readonly showNodeExplorer = signal(false);
  readonly showHelp = signal(!this.storageService.get('lastOpenedFlowId'));

  readonly isRightPanelOpen = computed(
    () =>
      !!this.selectedNodeId() ||
      !!this.selectedEdgeId() ||
      this.showNodeExplorer() ||
      this.showDiff(),
  );

  readonly showDiff = signal(false);
  readonly layoutDirection = signal<'LR' | 'TB'>('LR');
  private isResetting = false;

  public readonly activeDiff = computed<FlowDiff | null>(() => {
    const active = this.activeFlow();
    if (!active) {
      return null;
    }

    const original = this.flows().find((f) => f.id === active.id);
    if (!original) {
      return this.createNewFlowDiff(active);
    }

    const diff: FlowDiff = {
      isNew: false,
      nodes: { added: 0, removed: 0, modified: 0, details: [] },
      edges: { added: 0, removed: 0, modified: 0, details: [] },
    };

    this.calculateNodeDiff(active, original, diff);
    this.calculateEdgeDiff(active, original, diff);

    return diff;
  });

  private createNewFlowDiff(active: SimulationFlow): FlowDiff {
    return {
      isNew: true,
      nodes: { added: active.nodes.length, removed: 0, modified: 0, details: [] },
      edges: { added: active.edges.length, removed: 0, modified: 0, details: [] },
    };
  }

  private calculateNodeDiff(active: SimulationFlow, original: SimulationFlow, diff: FlowDiff) {
    const activeNodeIds = new Set<string>();
    for (const n of active.nodes) {
      activeNodeIds.add(n.id);
    }

    const originalNodeIds = new Set<string>();
    for (const n of original.nodes) {
      originalNodeIds.add(n.id);
    }

    // Added
    for (const node of active.nodes) {
      if (!originalNodeIds.has(node.id)) {
        diff.nodes.added++;
        diff.nodes.details.push({
          id: node.id,
          name: this.getSchemaName(node.schemaId),
          type: 'added',
        });
      }
    }

    // Removed
    for (const node of original.nodes) {
      if (!activeNodeIds.has(node.id)) {
        diff.nodes.removed++;
        diff.nodes.details.push({
          id: node.id,
          name: this.getSchemaName(node.schemaId),
          type: 'removed',
        });
      }
    }

    // Modified
    for (const node of active.nodes) {
      const originalNode = original.nodes.find((o) => o.id === node.id);
      if (originalNode && JSON.stringify(originalNode) !== JSON.stringify(node)) {
        const changes = this.getNodeChanges(originalNode, node);
        if (changes.length > 0) {
          diff.nodes.modified++;
          diff.nodes.details.push({
            id: node.id,
            name: this.getSchemaName(node.schemaId),
            type: 'modified',
            changes,
          });
        }
      }
    }
  }

  private calculateEdgeDiff(active: SimulationFlow, original: SimulationFlow, diff: FlowDiff) {
    const activeEdgeIds = new Set<string>();
    for (const e of active.edges) {
      activeEdgeIds.add(e.id);
    }

    const originalEdgeIds = new Set<string>();
    for (const e of original.edges) {
      originalEdgeIds.add(e.id);
    }

    // Added
    for (const edge of active.edges) {
      if (!originalEdgeIds.has(edge.id)) {
        diff.edges.added++;
        diff.edges.details.push({
          id: edge.id,
          type: 'added',
          source: edge.source,
          target: edge.target,
        });
      }
    }

    // Removed
    for (const edge of original.edges) {
      if (!activeEdgeIds.has(edge.id)) {
        diff.edges.removed++;
        diff.edges.details.push({
          id: edge.id,
          type: 'removed',
          source: edge.source,
          target: edge.target,
        });
      }
    }

    // Modified
    for (const edge of active.edges) {
      const originalEdge = original.edges.find((o) => o.id === edge.id);
      if (originalEdge && JSON.stringify(originalEdge) !== JSON.stringify(edge)) {
        const changes = this.getEdgeChanges(originalEdge, edge);
        if (changes.length > 0) {
          diff.edges.modified++;
          diff.edges.details.push({
            id: edge.id,
            type: 'modified',
            source: edge.source,
            target: edge.target,
            changes,
          });
        }
      }
    }
  }

  private getSchemaName(schemaId: string): string {
    return (
      this.socketService.schemas().find((s: SchemaDefinition) => s.id === schemaId)?.name ||
      schemaId
    );
  }

  private getNodeChanges(oldNode: FlowNode, newNode: FlowNode): string[] {
    const changes: string[] = [];
    if (oldNode.position.x !== newNode.position.x || oldNode.position.y !== newNode.position.y) {
      changes.push('Position');
    }
    if (oldNode.settings?.frequency !== newNode.settings?.frequency) {
      changes.push('Frequency');
    }
    if (oldNode.settings?.count !== newNode.settings?.count) {
      changes.push('Msg Count');
    }
    if (oldNode.settings?.duration !== newNode.settings?.duration) {
      changes.push('Duration');
    }
    if (oldNode.settings?.filter !== newNode.settings?.filter) {
      changes.push('Filter');
    }
    if (JSON.stringify(oldNode.settings?.bindings) !== JSON.stringify(newNode.settings?.bindings)) {
      changes.push('Bindings');
    }
    if (
      JSON.stringify(oldNode.settings?.expressions) !==
      JSON.stringify(newNode.settings?.expressions)
    ) {
      changes.push('Expressions');
    }
    return changes;
  }

  private getEdgeChanges(oldEdge: FlowEdge, newEdge: FlowEdge): string[] {
    const changes: string[] = [];
    if (oldEdge.delayMs !== newEdge.delayMs) {
      changes.push('Delay');
    }
    if (oldEdge.delayExpression !== newEdge.delayExpression) {
      changes.push('Delay Expression');
    }
    if (oldEdge.condition !== newEdge.condition) {
      changes.push('Condition');
    }
    return changes;
  }

  constructor() {
    effect(() => {
      const currentFlows = this.flows();
      const loaded = this.socketService.flowsLoaded();

      if (!loaded || this.isResetting) return;

      const lastId = this.storageService.get<string>('lastOpenedFlowId');
      if (lastId && !this.activeFlow()) {
        const draft = this.storageService.get<SimulationFlow>(`flow_draft_${lastId}`);
        if (draft) {
          this.activeFlow.set(draft);
          return;
        }

        const found = currentFlows.find((f) => f.id === lastId);
        if (found) {
          this.activeFlow.set(found);
        }
      }

      if (currentFlows.length > 0 && !this.activeFlow()) {
        this.activeFlow.set(currentFlows[0] ?? null);
      }

      const active = this.activeFlow();
      if (active) {
        const updated = currentFlows.find((f) => f.id === active.id);
        if (
          updated &&
          JSON.stringify(updated) !== JSON.stringify(active) &&
          !this.hasUnsavedChanges()
        ) {
          this.activeFlow.set(updated);
        }
      }
    });

    effect(() => {
      const active = this.activeFlow();
      const hasUnsaved = this.hasUnsavedChanges();

      if (active) {
        this.storageService.set('lastOpenedFlowId', active.id);

        if (hasUnsaved) {
          this.storageService.set(`flow_draft_${active.id}`, active);
        } else {
          this.storageService.remove(`flow_draft_${active.id}`);
        }
      }
    });
  }

  createFlow(name: string = 'New Flow', id?: string) {
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const finalId = id || `${slug}-${Math.floor(Math.random() * 1000)}`;

    const newFlow: SimulationFlow = {
      id: finalId,
      name,
      nodes: [],
      edges: [],
    };
    this.socketService.saveFlow(newFlow);
    this.activeFlow.set(newFlow);
  }

  updateActiveFlow(update: Partial<SimulationFlow>) {
    const current = this.activeFlow();
    if (!current) return;

    const updated = { ...current, ...update };
    this.activeFlow.set(updated);
  }

  saveActiveFlow() {
    const current = this.activeFlow();
    if (!current) return;

    this.socketService.saveFlow(current);

    this.storageService.remove(`flow_draft_${current.id}`);
  }

  addNode(schemaId: string, position: { x: number; y: number }) {
    const current = this.activeFlow();
    if (!current) return;

    const baseId = `node-${schemaId}`;
    let finalId = baseId;
    let counter = 1;
    while (current.nodes.some((n) => n.id === finalId)) {
      counter++;
      finalId = `${baseId}-${counter}`;
    }

    const newNode: FlowNode = {
      id: finalId,
      schemaId,
      position,
      settings: {
        frequency: 1,
        count: 10,
      },
    };

    this.updateActiveFlow({
      nodes: [...current.nodes, newNode],
    });
  }

  removeNode(nodeId: string) {
    const current = this.activeFlow();
    if (!current) return;

    const newNodes = [];
    for (const n of current.nodes) {
      if (n.id !== nodeId) newNodes.push(n);
    }

    const newEdges = [];
    for (const e of current.edges) {
      if (e.source !== nodeId && e.target !== nodeId) newEdges.push(e);
    }

    this.activeFlow.set({
      ...current,
      nodes: newNodes,
      edges: newEdges,
    });
  }

  runFlow() {
    const current = this.activeFlow();
    if (!current) return;
    this.socketService.startFlow(current);
  }

  stopFlow() {
    const current = this.activeFlow();
    if (!current) return;
    this.socketService.stopFlow(current.id);
  }

  autoLayout(direction?: 'LR' | 'TB') {
    const current = this.activeFlow();
    if (!current) return;

    const finalDirection = direction || this.layoutDirection();
    const updated = layoutFlow(current, finalDirection);
    this.updateActiveFlow(updated);
  }

  deleteFlow(id: string) {
    this.isResetting = true;
    this.socketService.deleteFlow(id);
    this.storageService.remove(`flow_draft_${id}`);

    if (this.activeFlow()?.id === id) {
      this.activeFlow.set(null);
    }

    setTimeout(() => {
      this.isResetting = false;
    }, 500);
  }

  resetFlow(id: string) {
    this.isResetting = true;
    this.socketService.deleteFlow(id);
    this.storageService.remove(`flow_draft_${id}`);

    if (this.activeFlow()?.id === id) {
      this.activeFlow.set(null);
    }

    setTimeout(() => {
      this.isResetting = false;
    }, 500);
  }

  discardDraft() {
    const active = this.activeFlow();
    if (!active) return;

    this.storageService.remove(`flow_draft_${active.id}`);

    const serverVersion = this.flows().find((f) => f.id === active.id);
    if (serverVersion) {
      this.activeFlow.set(JSON.parse(JSON.stringify(serverVersion)) as SimulationFlow);
    }
  }

  copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text);
  }
}
