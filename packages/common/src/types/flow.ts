/**
 * A workflow of generation steps (nodes) and their connections (edges).
 */
export interface SimulationFlow {
  id: string;
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  source?: 'static' | 'dynamic';
  isModified?: boolean;
}

export interface FlowNode {
  id: string;
  schemaId: string;
  position: { x: number; y: number };

  settings?: {
    frequency?: number;
    count?: number;
    duration?: number;
    filter?: string;
    expressions?: Record<string, string>;
    bindings?: Record<string, string>;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  condition: 'immediate' | 'wait' | 'random';
  delayMs?: number;
  delayExpression?: string;
}

export interface FlowExecutionUpdate {
  flowId: string;
  nodeId: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  messagesSent: number;
  lastMessage?: any;
}

export type FlowNodeRuntimeStatus = 'completed' | 'error' | 'executing' | 'idle';

export interface FlowNodeStatusEvent {
  flowId: string;
  nodeId: string;
  status: FlowNodeRuntimeStatus;
}

export interface FlowNodeMessageEvent {
  flowId: string;
  nodeId: string;
  schemaId: string;
  batchSize: number;
  receivedCount: number;
  sampleData: Record<string, unknown>[];
  sampleResponses: unknown[];
  timestamp: number;
}
