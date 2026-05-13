import type { SimulationFlow, FlowNode } from '@machine-gun/common';
import * as dagre from 'dagre';

export function layoutFlow(flow: SimulationFlow, direction: 'LR' | 'TB' = 'LR'): SimulationFlow {
  const nodes = [...flow.nodes];
  const edges = flow.edges;

  if (nodes.length === 0) return flow;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 100, ranksep: 180, marginx: 100, marginy: 150 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { width: 256, height: 280 });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const updatedNodes: FlowNode[] = [];
  for (const node of nodes) {
    const dagreNode = g.node(node.id);
    updatedNodes.push({
      ...node,
      position: {
        // Dagre centers nodes, we need to offset by half width/height to get top-left
        x: Math.round(dagreNode.x - dagreNode.width / 2),
        y: Math.round(dagreNode.y - dagreNode.height / 2),
      },
    });
  }

  return {
    ...flow,
    nodes: updatedNodes,
  };
}
