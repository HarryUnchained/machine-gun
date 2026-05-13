import { Component, inject, signal, computed, effect, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlowService } from '../../services/flow.service';
import { SocketService } from '../../services/socket.service';
import { NavigationService } from '../../services/navigation.service';
import { StorageService } from '../../services/storage.service';
import { IconComponent, type IconName } from '../icon/icon.component';
import { StepperComponent } from '../stepper/stepper.component';
import { SelectComponent, type SelectOption } from '../select/select.component';
import type {
  FlowNode,
  FlowEdge,
  SimulationFlow,
  SchemaField,
  SchemaDefinition,
} from '@machine-gun/common';
import { asInput, asSelect } from '../../utils/event-types';

@Component({
  selector: 'app-flow-canvas',
  imports: [CommonModule, IconComponent, StepperComponent, SelectComponent],
  templateUrl: './flow-canvas.component.html',
  styleUrl: './flow-canvas.component.css',
  host: {
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave()',
    '(drop)': 'onDrop($event)',
    '[class.bg-brand-primary/5]': 'isDraggingOver()',
    '[class.cursor-grab]': '!isPanning',
    '[class.cursor-grabbing]': 'isPanning',
  },
})
export class FlowCanvasComponent {
  private static readonly PENDING_VISUAL_DELAY_MS = 150;

  protected readonly asInput = asInput;
  protected readonly asSelect = asSelect;

  protected readonly flowService = inject(FlowService);
  protected readonly socketService = inject(SocketService);
  protected readonly navService = inject(NavigationService);
  protected readonly storageService = inject(StorageService);
  private readonly hostElement = inject(ElementRef);

  protected readonly activeFlow = this.flowService.activeFlow;
  protected readonly nodes = computed(() => this.activeFlow()?.nodes ?? []);
  protected readonly edges = computed(() => this.activeFlow()?.edges ?? []);
  protected readonly nodeStatuses = this.socketService.nodeStatuses;
  protected readonly activeFlowIds = this.socketService.activeFlowIds;
  protected readonly pendingFlowActions = this.socketService.pendingFlowActions;
  protected readonly flowNodeActivity = this.socketService.flowNodeActivity;

  private static readonly INITIAL_PAN = { x: 0, y: 0 };
  private static readonly INITIAL_ZOOM = 1;

  protected readonly pan = signal<{ x: number; y: number }>(FlowCanvasComponent.INITIAL_PAN);
  protected readonly zoom = signal<number>(FlowCanvasComponent.INITIAL_ZOOM);
  protected isPanning = false;

  private draggingNodeId = signal<string | null>(null);
  private dragOffset: { x: number; y: number };
  private lastMousePos: { x: number; y: number };

  protected readonly isFlowRunning = computed(() => {
    const flowId = this.activeFlow()?.id;
    if (!flowId) {
      return false;
    }

    return this.activeFlowIds().includes(flowId);
  });
  protected readonly flowPendingAction = computed(() => {
    const flowId = this.activeFlow()?.id;
    if (!flowId) {
      return null;
    }

    return this.pendingFlowActions()[flowId] ?? null;
  });
  protected readonly isFlowPending = computed(() => this.flowPendingAction() !== null);
  protected readonly showFlowPendingVisual = signal(false);

  // Interaction state
  protected readonly selectedNodeId = this.flowService.selectedNodeId;
  protected readonly selectedEdgeId = this.flowService.selectedEdgeId;
  protected readonly showNodeExplorer = this.flowService.showNodeExplorer;
  protected readonly isRightPanelOpen = this.flowService.isRightPanelOpen;
  protected readonly showHelp = this.flowService.showHelp;

  // New Flow Modal State
  protected readonly showCreateModal = signal(false);
  protected readonly newFlowName = signal('My New Flow');
  protected readonly layoutDirection = signal<'LR' | 'TB'>('LR');

  protected activeHelpField = signal<string | null>(null);
  protected showFlows = signal(false);

  // Delete Flow Modal State
  protected readonly showDeleteConfirmModal = signal(false);
  protected readonly flowToDelete = signal<SimulationFlow | null>(null);

  // Search state
  protected flowSearchQuery = signal('');
  protected nodeSearchQuery = signal('');

  protected readonly filteredFlows = computed(() => {
    const list = this.flowService.availableFlows();
    const query = this.flowSearchQuery().toLowerCase().trim();
    if (!query) return list;
    const result = [];
    for (const f of list) {
      if (f.name.toLowerCase().includes(query) || f.id.toLowerCase().includes(query))
        result.push(f);
    }
    return result;
  });

  protected readonly filteredNodes = computed(() => {
    const list = this.nodes();
    const query = this.nodeSearchQuery().toLowerCase().trim();
    if (!query) return list;
    const result = [];
    for (const n of list) {
      if (
        n.id.toLowerCase().includes(query) ||
        this.getSchemaName(n.schemaId).toLowerCase().includes(query)
      ) {
        result.push(n);
      }
    }
    return result;
  });

  // Edge creation state
  protected connectingEdge = signal<{ source: string; currentX: number; currentY: number } | null>(
    null,
  );
  private targetNodeId = signal<string | null>(null);

  protected readonly schemaMap = computed(() => {
    const map = new Map<string, SchemaDefinition>();
    for (const s of this.socketService.schemas()) {
      map.set(s.id, s);
    }
    return map;
  });

  protected readonly selectedNodeAncestors = computed(() => {
    const nodeId = this.selectedNodeId();
    const flow = this.activeFlow();
    if (!nodeId || !flow) return [];

    const ancestors: FlowNode[] = [];
    const queue = [nodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      for (const edge of flow.edges) {
        if (edge.target === currentId) {
          const sourceNode = flow.nodes.find((n) => n.id === edge.source);
          if (sourceNode) {
            ancestors.push(sourceNode);
            queue.push(sourceNode.id);
          }
        }
      }
    }
    return ancestors;
  });

  protected readonly availableContextPaths = computed(() => {
    const ancestors = this.selectedNodeAncestors();
    const results: { path: string; type: string }[] = [];

    for (const node of ancestors) {
      const schema = this.schemaMap().get(node.schemaId);
      if (schema) {
        results.push(...this.extractPaths(schema.fields, node.id));
      }
    }
    return results;
  });

  protected readonly bindingOptions = computed(() => {
    const context = this.availableContextPaths();
    const options: SelectOption<string>[] = [
      { value: '', label: 'No Binding (Random)', icon: 'close' },
    ];

    const typeIconMap: Record<string, IconName> = {
      string: 'string',
      int: 'number',
      float: 'number',
      boolean: 'toggle',
      datetime: 'timer',
      unix: 'timer',
      iso: 'timestamp',
      uuid: 'uuid',
      regex: 'regex',
      location: 'map',
      object: 'data_object',
      array: 'data_array',
    };

    for (const item of context) {
      const [nodeId, ...fieldParts] = item.path.split('.');
      this.nodes().find((n) => n.id === nodeId);
      const fieldPath = fieldParts.join('.');

      options.push({
        value: item.path,
        label: fieldPath,
        icon: typeIconMap[item.type] || 'key',
      });
    }
    return options;
  });

  protected readonly exampleParentId = computed(() => {
    const nodeId = this.selectedNodeId();
    const flow = this.activeFlow();
    if (!nodeId || !flow) return 'parent';

    // Prioritize direct parent for hints
    const parentEdge = flow.edges.find((e) => e.target === nodeId);
    return parentEdge?.source || 'parent';
  });

  constructor() {
    this.dragOffset = { x: 0, y: 0 };
    this.lastMousePos = { x: 0, y: 0 };
    effect(() => {
      if (this.showNodeExplorer() || this.flowService.showDiff()) {
        // If explorer or diff opens, close configuration
        this.selectedNodeId.set(null);
        this.selectedEdgeId.set(null);
      }
    });

    effect(() => {
      if (this.selectedNodeId() || this.selectedEdgeId()) {
        // If configuration opens, close explorer and diff
        this.showNodeExplorer.set(false);
        this.flowService.showDiff.set(false);
      }
    });

    effect(() => {
      if (this.showNodeExplorer()) {
        this.flowService.showDiff.set(false);
      }
    });

    effect(() => {
      if (this.flowService.showDiff()) {
        this.showNodeExplorer.set(false);
      }
    });

    effect((onCleanup) => {
      const pending = this.flowPendingAction();
      if (!pending) {
        this.showFlowPendingVisual.set(false);
        return;
      }

      const timer = setTimeout(() => {
        this.showFlowPendingVisual.set(true);
      }, FlowCanvasComponent.PENDING_VISUAL_DELAY_MS);

      onCleanup(() => {
        clearTimeout(timer);
        this.showFlowPendingVisual.set(false);
      });
    });

    // Restore canvas state
    const savedPan = this.storageService.get<{ x: number; y: number }>('canvas_pan');
    const savedZoom = this.storageService.get<number>('canvas_zoom');
    if (savedPan) this.pan.set(savedPan);
    if (savedZoom) this.zoom.set(savedZoom);

    // Save canvas state
    effect(() => {
      this.storageService.set('canvas_pan', this.pan());
      this.storageService.set('canvas_zoom', this.zoom());
    });
  }

  protected isNodeActive(status: string | undefined): boolean {
    return status === 'executing';
  }

  protected isNodeSettled(status: string | undefined): boolean {
    return status === 'idle' || status === 'completed' || status === 'error';
  }

  protected getNodeExecutionCount(nodeId: string): number {
    return this.flowNodeActivity()[nodeId]?.count ?? 0;
  }

  protected getNodeLastExecutionLabel(nodeId: string): string {
    const timestamp = this.flowNodeActivity()[nodeId]?.lastTimestamp;
    if (!timestamp) {
      return 'Never';
    }

    const elapsedMs = Date.now() - timestamp;
    if (elapsedMs < 1000) {
      return 'Just now';
    }

    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    if (elapsedSeconds < 60) {
      return `${elapsedSeconds}s ago`;
    }

    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) {
      return `${elapsedMinutes}m ago`;
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    return `${elapsedHours}h ago`;
  }

  protected extractPaths(fields: SchemaField[], prefix: string): { path: string; type: string }[] {
    const results: { path: string; type: string }[] = [];
    for (const f of fields) {
      const path = `${prefix}.${f.name}`;
      results.push({ path, type: f.type });
      if (f.fields && f.fields.length > 0) {
        results.push(...this.extractPaths(f.fields, path));
      }
    }
    return results;
  }

  selectFlow(flow: SimulationFlow) {
    this.flowService.activeFlow.set(flow);
    this.showFlows.set(false);
  }

  deleteFlowFromLibrary(event: MouseEvent, id: string) {
    event.stopPropagation();
    const flow = this.flowService.availableFlows().find((f) => f.id === id);
    if (flow) {
      this.flowToDelete.set(flow);
      this.showDeleteConfirmModal.set(true);
      this.showFlows.set(false);
    }
  }

  confirmDeleteFlow() {
    const flow = this.flowToDelete();
    if (flow) {
      if (flow.source === 'static') {
        this.flowService.resetFlow(flow.id);
      } else {
        this.flowService.deleteFlow(flow.id);
      }
      this.showDeleteConfirmModal.set(false);
      this.flowToDelete.set(null);
    }
  }

  createNewFlow() {
    this.newFlowName.set(`My Flow ${this.flowService.flows().length + 1}`);
    this.showCreateModal.set(true);
    this.showFlows.set(false);
    this.showHelp.set(false);
  }

  confirmCreateFlow() {
    const name = this.newFlowName().trim();
    if (!name) return;

    this.flowService.createFlow(name);
    this.showCreateModal.set(false);
  }

  onNodeClick(event: MouseEvent, node: FlowNode) {
    event.stopPropagation();
    this.selectedNodeId.set(node.id);
  }

  onNodeMouseDown(event: MouseEvent, node: FlowNode) {
    event.stopPropagation();
    if (this.selectedNodeId() !== node.id) {
      this.selectedNodeId.set(node.id);
    }

    const z = this.zoom();
    const startX = (event.clientX - this.pan().x) / z;
    const startY = (event.clientY - this.pan().y) / z;

    const initialNodeX = node.position.x;
    const initialNodeY = node.position.y;

    this.draggingNodeId.set(node.id);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentX = (moveEvent.clientX - this.pan().x) / z;
      const currentY = (moveEvent.clientY - this.pan().y) / z;

      const newPos = {
        x: Math.round(initialNodeX + (currentX - startX)),
        y: Math.round(initialNodeY + (currentY - startY)),
      };

      this.updateNodePosition(node.id, newPos);
    };

    const onMouseUp = () => {
      this.draggingNodeId.set(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  protected isDraggingOver = signal(false);

  onCanvasMouseDown(event: MouseEvent) {
    // If we clicked a node or something else, don't start panning the canvas
    if (
      (event.target as HTMLElement).closest('.node-container, .toolbar, .node-config, .edge-config')
    )
      return;

    this.isPanning = true;
    this.lastMousePos = { x: event.clientX, y: event.clientY };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!this.isPanning) return;

      const dx = moveEvent.clientX - this.lastMousePos.x;
      const dy = moveEvent.clientY - this.lastMousePos.y;

      this.pan.set({
        x: this.pan().x + dx,
        y: this.pan().y + dy,
      });

      this.lastMousePos = { x: moveEvent.clientX, y: moveEvent.clientY };
    };

    const onMouseUp = () => {
      this.isPanning = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  onCanvasWheel(event: WheelEvent) {
    if (
      (event.target as HTMLElement).closest('.toolbar, .node-config, .edge-config, .node-explorer')
    )
      return;

    event.preventDefault();
    const zoomSpeed = 0.001;
    const minZoom = 0.2;
    const maxZoom = 2;

    const delta = -event.deltaY;
    const oldZoom = this.zoom();
    const newZoom = Math.min(Math.max(oldZoom + delta * zoomSpeed, minZoom), maxZoom);

    if (oldZoom === newZoom) return;

    // zoom centered on mouse — keep the canvas point under the cursor stationary
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const zoomRatio = newZoom / oldZoom;
    const newPanX = mouseX - (mouseX - this.pan().x) * zoomRatio;
    const newPanY = mouseY - (mouseY - this.pan().y) * zoomRatio;

    this.zoom.set(newZoom);
    this.pan.set({ x: newPanX, y: newPanY });
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDraggingOver.set(true);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onDragLeave() {
    this.isDraggingOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDraggingOver.set(false);
    const schemaId = event.dataTransfer?.getData('schemaId');
    if (!schemaId) return;

    const canvasEl = this.hostElement.nativeElement as HTMLElement;
    const rect = canvasEl.getBoundingClientRect();
    const x = event.clientX - rect.left - this.pan().x;
    const y = event.clientY - rect.top - this.pan().y;

    this.flowService.addNode(schemaId, { x, y });
  }

  onHandleMouseDown(event: MouseEvent, node: FlowNode) {
    event.stopPropagation();

    const isHorizontal = this.flowService.layoutDirection() === 'LR';
    const startX = isHorizontal ? node.position.x + 256 : node.position.x + 128;
    const startY = isHorizontal ? node.position.y + 44 : node.position.y + 280;

    this.connectingEdge.set({
      source: node.id,
      currentX: startX,
      currentY: startY,
    });

    const onMouseMove = (moveEvent: MouseEvent) => {
      const edge = this.connectingEdge();
      if (!edge) return;

      const z = this.zoom();
      const offset = this.getCanvasOffset();
      this.connectingEdge.set({
        ...edge,
        currentX: (moveEvent.clientX - offset.x - this.pan().x) / z,
        currentY: (moveEvent.clientY - offset.y - this.pan().y) / z,
      });
    };

    const onMouseUp = () => {
      const edge = this.connectingEdge();
      const target = this.targetNodeId();

      if (edge && target && edge.source !== target) {
        this.createNewEdge(edge.source, target);
      }

      this.connectingEdge.set(null);
      this.targetNodeId.set(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  onHandleMouseEnter(node: FlowNode) {
    if (this.connectingEdge()) {
      this.targetNodeId.set(node.id);
    }
  }

  onHandleMouseLeave() {
    this.targetNodeId.set(null);
  }

  private getCanvasOffset() {
    const canvasEl = this.hostElement.nativeElement as HTMLElement;
    const rect = canvasEl.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  }

  private createNewEdge(source: string, target: string) {
    const flow = this.activeFlow();
    if (!flow) return;

    // Avoid duplicates
    if (flow.edges.some((e) => e.source === source && e.target === target)) return;

    const newEdge: FlowEdge = {
      id: `edge-${Date.now()}`,
      source,
      target,
      condition: 'immediate',
    };

    this.flowService.updateActiveFlow({
      edges: [...flow.edges, newEdge],
    });
  }

  addNode() {
    const schemas = this.socketService.schemas();
    if (schemas.length === 0) return;

    const randomSchema = schemas[Math.floor(Math.random() * schemas.length)]!;

    const x = 100 + Math.random() * 100 - this.pan().x;
    const y = 100 + Math.random() * 100 - this.pan().y;

    this.flowService.addNode(randomSchema.id, { x, y });
  }

  deleteNode(event: MouseEvent, nodeId: string) {
    event.stopPropagation();
    const flow = this.activeFlow();
    if (!flow) return;

    if (this.selectedNodeId() === nodeId) {
      this.selectedNodeId.set(null);
    }

    const newNodes = [];
    for (const n of flow.nodes) {
      if (n.id !== nodeId) newNodes.push(n);
    }
    const newEdges = [];
    for (const e of flow.edges) {
      if (e.source !== nodeId && e.target !== nodeId) newEdges.push(e);
    }
    this.flowService.updateActiveFlow({ nodes: newNodes, edges: newEdges });
  }

  deleteEdge(event: MouseEvent, edgeId: string) {
    event.stopPropagation();
    const flow = this.activeFlow();
    if (!flow) return;

    const newEdges = [];
    for (const e of flow.edges) {
      if (e.id !== edgeId) newEdges.push(e);
    }
    this.flowService.updateActiveFlow({ edges: newEdges });

    if (this.selectedEdgeId() === edgeId) {
      this.selectedEdgeId.set(null);
    }
  }

  resetFlow() {
    this.flowService.updateActiveFlow({ nodes: [], edges: [] });
  }

  runFlow() {
    this.flowService.runFlow();
  }

  stopFlow() {
    this.flowService.stopFlow();
  }

  magicLayout() {
    this.flowService.autoLayout();
    this.pan.set({ x: 0, y: 0 });
    this.zoom.set(1);
  }

  private updateNodePosition(nodeId: string, position: { x: number; y: number }) {
    const flow = this.activeFlow();
    if (!flow) return;

    const updatedNodes = [];
    for (const n of flow.nodes) {
      updatedNodes.push(n.id === nodeId ? { ...n, position } : n);
    }

    this.flowService.updateActiveFlow({ nodes: updatedNodes });
  }

  updateNodeSettings(
    nodeId: string,
    settings: Partial<{
      frequency: number;
      count: number;
      duration: number;
      filter: string;
      expressions: Record<string, string>;
    }>,
  ) {
    const flow = this.activeFlow();
    if (!flow) return;

    const updatedNodes = [];
    for (const n of flow.nodes) {
      if (n.id === nodeId) {
        updatedNodes.push({
          ...n,
          settings: { ...(n.settings || { frequency: 1, count: 100 }), ...settings },
        });
      } else {
        updatedNodes.push(n);
      }
    }

    this.flowService.updateActiveFlow({ nodes: updatedNodes });
  }

  updateEdgeSettings(edgeId: string, settings: Partial<FlowEdge>) {
    const flow = this.activeFlow();
    if (!flow) return;

    const updatedEdges = [];
    for (const e of flow.edges) {
      updatedEdges.push(e.id === edgeId ? { ...e, ...settings } : e);
    }

    this.flowService.updateActiveFlow({ edges: updatedEdges });
  }

  updateNodeExpression(nodeId: string, targetField: string, expression: string) {
    const flow = this.activeFlow();
    if (!flow) return;

    const updatedNodes = [];
    for (const n of flow.nodes) {
      if (n.id === nodeId) {
        const expressions = { ...(n.settings?.expressions || {}), [targetField]: expression };
        updatedNodes.push({ ...n, settings: { ...(n.settings || {}), expressions } });
      } else {
        updatedNodes.push(n);
      }
    }

    this.flowService.updateActiveFlow({ nodes: updatedNodes });
  }

  removeNodeExpression(nodeId: string, targetField: string) {
    const flow = this.activeFlow();
    if (!flow) return;

    const updatedNodes = [];
    for (const n of flow.nodes) {
      if (n.id === nodeId) {
        const expressions = { ...(n.settings?.expressions || {}) };
        delete expressions[targetField];
        updatedNodes.push({ ...n, settings: { ...(n.settings || {}), expressions } });
      } else {
        updatedNodes.push(n);
      }
    }

    this.flowService.updateActiveFlow({ nodes: updatedNodes });
  }

  updateNodeBinding(nodeId: string, targetField: string, sourcePath: string) {
    const flow = this.activeFlow();
    if (!flow) return;

    const updatedNodes = [];
    for (const n of flow.nodes) {
      if (n.id === nodeId) {
        const bindings = { ...(n.settings?.bindings || {}), [targetField]: sourcePath };
        updatedNodes.push({ ...n, settings: { ...(n.settings || {}), bindings } });
      } else {
        updatedNodes.push(n);
      }
    }

    this.flowService.updateActiveFlow({ nodes: updatedNodes });
  }

  removeNodeBinding(nodeId: string, targetField: string) {
    const flow = this.activeFlow();
    if (!flow) return;

    const updatedNodes = [];
    for (const n of flow.nodes) {
      if (n.id === nodeId) {
        const bindings = { ...(n.settings?.bindings || {}) };
        delete bindings[targetField];
        updatedNodes.push({ ...n, settings: { ...(n.settings || {}), bindings } });
      } else {
        updatedNodes.push(n);
      }
    }

    this.flowService.updateActiveFlow({ nodes: updatedNodes });
  }

  getSchemaName(schemaId: string): string {
    return (
      this.socketService.schemas().find((s: SchemaDefinition) => s.id === schemaId)?.name ??
      'Unknown'
    );
  }

  getEdgePath(edge: FlowEdge): string {
    const sourceNode = this.nodes().find((n) => n.id === edge.source);
    const targetNode = this.nodes().find((n) => n.id === edge.target);

    if (!sourceNode || !targetNode) return '';

    const isHorizontal = this.flowService.layoutDirection() === 'LR';

    const startX = isHorizontal ? sourceNode.position.x + 256 : sourceNode.position.x + 128;
    const startY = isHorizontal ? sourceNode.position.y + 44 : sourceNode.position.y + 280;
    const endX = isHorizontal ? targetNode.position.x : targetNode.position.x + 128;
    const endY = isHorizontal ? targetNode.position.y + 44 : targetNode.position.y;

    return this.calculateBezier(startX, startY, endX, endY);
  }

  getConnectingPath(): string {
    const edge = this.connectingEdge();
    if (!edge) return '';

    const sourceNode = this.nodes().find((n) => n.id === edge.source);
    if (!sourceNode) return '';

    const isHorizontal = this.flowService.layoutDirection() === 'LR';
    const startX = isHorizontal ? sourceNode.position.x + 256 : sourceNode.position.x + 128;
    const startY = isHorizontal ? sourceNode.position.y + 44 : sourceNode.position.y + 280;

    return this.calculateBezier(startX, startY, edge.currentX, edge.currentY);
  }

  private calculateBezier(sx: number, sy: number, ex: number, ey: number): string {
    const isHorizontal = this.flowService.layoutDirection() === 'LR';

    if (isHorizontal) {
      const dx = Math.abs(ex - sx) * 0.5;
      if (ex < sx - 20) {
        const dy = Math.max(100, Math.abs(ey - sy) + 50);
        return `M ${sx} ${sy} C ${sx + dx} ${sy - dy}, ${ex - dx} ${ey - dy}, ${ex} ${ey}`;
      }
      return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}`;
    } else {
      const dy = Math.max(Math.abs(ey - sy) * 0.5, 40);
      if (ey < sy - 20) {
        const dx = Math.max(150, Math.abs(ex - sx) + 100);
        return `M ${sx} ${sy} C ${sx - dx} ${sy + dy}, ${ex - dx} ${ey - dy}, ${ex} ${ey}`;
      }
      return `M ${sx} ${sy} C ${sx} ${sy + dy}, ${ex} ${ey - dy}, ${ex} ${ey}`;
    }
  }

  focusNode(nodeId: string) {
    const node = this.nodes().find((n) => n.id === nodeId);
    if (!node) return;

    this.selectedNodeId.set(nodeId);

    const canvasEl = this.hostElement.nativeElement as HTMLElement;
    const rect = canvasEl.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    this.pan.set({
      x: centerX - node.position.x - 112, // half of node width
      y: centerY - node.position.y - 40, // approx half of node height
    });
  }
}
