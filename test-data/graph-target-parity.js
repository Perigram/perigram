// SPEC §30.13 convergence proof point 7 — cross-target parity fixture.
//
// Target-specific limitation: browser evaluation resolves pinned Use Graph
// subgraphs from the session's graph catalog (current payloads) and cannot
// execute server-only managed operations; server evaluation resolves
// installed packages and historical pinned revisions. Parity is asserted
// over the intersection: canonical documents whose operations declare both
// targets.
import {
  CORE_GRAPH_PROVIDER,
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION
} from '#packages/core';

export const PARITY_PROVIDER = 'parity.provider';
export const PARITY_DOUBLE_OPERATION = 'math.double';

export const parityDoubleDefinition = () => ({
  provider: PARITY_PROVIDER,
  id: PARITY_DOUBLE_OPERATION,
  version: '1',
  label: 'Double',
  palette: { group: 'numeric-operations', label: 'Numeric operations' },
  inputs: [{ id: 'value', required: true, shape: 'item', semantic: { base: 'number' } }],
  outputs: [{ id: 'result', required: true, shape: 'item', semantic: { base: 'number' } }],
  execution: { kind: 'pure', targets: ['browser', 'server'], capabilities: [], deterministic: true, idempotent: true },
  packagePin: { pluginId: 'parity', version: '1', runtimeId: 'parity-worker', operationId: PARITY_DOUBLE_OPERATION }
});

export const parityDoubleExecutor = (_definition, { inputs }) => ({ result: inputs.value * 2 });

export const parityGraphDocument = () => ({
  format: GRAPH_DOCUMENT_FORMAT,
  version: GRAPH_DOCUMENT_VERSION,
  id: 'graph.parity',
  revision: 'rev-parity-1',
  name: 'Cross-target parity slice',
  interface: {
    inputs: [{ id: 'value', label: 'Value', contract: { shape: 'item', semantic: { base: 'number' } } }],
    outputs: [{ id: 'result', label: 'Result', contract: { shape: 'item', semantic: { base: 'number' } } }]
  },
  nodes: [
    { id: 'input-value', operation: { provider: CORE_GRAPH_PROVIDER, id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'value' } },
    { id: 'double', operation: { provider: PARITY_PROVIDER, id: PARITY_DOUBLE_OPERATION, version: '1' }, config: {} },
    { id: 'output-result', operation: { provider: CORE_GRAPH_PROVIDER, id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
  ],
  edges: [
    { id: 'edge-value', source: { node: 'input-value', port: 'value' }, target: { node: 'double', port: 'value' } },
    { id: 'edge-result', source: { node: 'double', port: 'result' }, target: { node: 'output-result', port: 'value' } }
  ]
});

export const PARITY_INPUT_BINDINGS = Object.freeze({ value: 21 });
export const PARITY_EXPECTED_OUTPUTS = Object.freeze({ result: 42 });
