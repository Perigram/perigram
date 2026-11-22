import {
  CORE_GRAPH_PROVIDER,
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION
} from '#packages/core';

export const LARGE_GRAPH_PROVIDER = 'perf.provider';
export const LARGE_GRAPH_PASSTHROUGH = 'perf.pass';

export const largeGraphDefinition = () => ({
  provider: LARGE_GRAPH_PROVIDER,
  id: LARGE_GRAPH_PASSTHROUGH,
  version: '1',
  label: 'Pass through',
  palette: { group: 'values', label: 'Values' },
  inputs: [{ id: 'value', label: 'Value', shape: 'item', semantic: { base: 'string' }, required: true }],
  outputs: [{ id: 'value', label: 'Value', shape: 'item', semantic: { base: 'string' }, required: false }],
  execution: { kind: 'pure', capabilities: [], deterministic: true, idempotent: true }
});

export function largeGraphDocument({ operations = 250 } = {}) {
  const nodes = [
    {
      id: 'input-value',
      operation: { provider: CORE_GRAPH_PROVIDER, id: GRAPH_INPUT_OPERATION, version: '1' },
      config: { interfaceId: 'value' },
      position: { x: 0, y: 0 }
    }
  ];
  const edges = [];
  let previous = 'input-value';
  for (let index = 0; index < operations; index += 1) {
    const id = `pass-${index}`;
    nodes.push({
      id,
      operation: { provider: LARGE_GRAPH_PROVIDER, id: LARGE_GRAPH_PASSTHROUGH, version: '1' },
      config: {},
      position: { x: (index + 1) * 240, y: 0 }
    });
    edges.push({
      id: `edge-${index}`,
      source: { node: previous, port: 'value' },
      target: { node: id, port: 'value' }
    });
    previous = id;
  }
  nodes.push({
    id: 'output-value',
    operation: { provider: CORE_GRAPH_PROVIDER, id: GRAPH_OUTPUT_OPERATION, version: '1' },
    config: { interfaceId: 'value' },
    position: { x: (operations + 1) * 240, y: 0 }
  });
  edges.push({
    id: 'edge-output',
    source: { node: previous, port: 'value' },
    target: { node: 'output-value', port: 'value' }
  });
  return {
    format: GRAPH_DOCUMENT_FORMAT,
    version: GRAPH_DOCUMENT_VERSION,
    id: 'graph.large-editor',
    revision: 'rev-large-editor-1',
    name: 'Large editor fixture',
    interface: {
      inputs: [{ id: 'value', label: 'Value', contract: { shape: 'item', semantic: { base: 'string' } }, required: true }],
      outputs: [{ id: 'value', label: 'Value', contract: { shape: 'item', semantic: { base: 'string' } }, required: true }]
    },
    nodes,
    edges
  };
}
