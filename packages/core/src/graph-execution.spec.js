import { describe, expect, it } from 'vitest';
import {
  createGraphExecutionRecord,
  validateGraphExecutionRecord
} from './graph-execution.js';

const base = () => ({
  id: 'execution-1',
  graph: { id: 'graph-1', revision: 'revision-1' },
  profile: 'procedural-preview',
  status: 'succeeded',
  startedAt: '2026-11-16T10:00:00.000Z',
  completedAt: '2026-11-16T10:00:01.000Z',
  inputs: { amount: 3 },
  outputs: { result: 6 },
  nodeOutputs: { double: { result: 6 } },
  diagnostics: [],
  provenance: {
    nodes: [{ nodeId: 'double', operation: { provider: 'plugin.math', id: 'double', version: '1' } }],
    invocations: [{ nodeId: 'use-graph', graphId: 'child-graph', revision: 'child-revision' }]
  },
  readSet: { instances: [], relations: [], queries: [] },
  artifacts: []
});

describe('graph execution record', () => {
  it('creates immutable, versioned records with pinned graph and invocation provenance', () => {
    const record = createGraphExecutionRecord(base());
    expect(record.format).toBe('perigram.graph-execution');
    expect(record.graph.revision).toBe('revision-1');
    expect(record.provenance.invocations[0]).toMatchObject({ graphId: 'child-graph', revision: 'child-revision' });
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.outputs)).toBe(true);
  });

  it('requires stable identity, profile, status, and complete read-set sections', () => {
    expect(validateGraphExecutionRecord({ ...base(), graph: { id: 'graph-1' } }).some(item => item.code === 'invalid-graph-ref')).toBe(true);
    expect(validateGraphExecutionRecord({ ...base(), profile: 'unknown' }).some(item => item.code === 'invalid-profile')).toBe(true);
    expect(validateGraphExecutionRecord({ ...base(), readSet: { instances: [] } }).some(item => item.code === 'invalid-read-set')).toBe(true);
  });

  it('rejects non-JSON values and backwards timestamps', () => {
    expect(() => createGraphExecutionRecord({ ...base(), outputs: { value: undefined } })).toThrow(/JSON-compatible/);
    expect(() => createGraphExecutionRecord({ ...base(), outputs: { value: Number.NaN } })).toThrow(/JSON-compatible/);
    expect(() => createGraphExecutionRecord({ ...base(), outputs: { value: 1n } })).toThrow(/JSON-compatible/);
    expect(validateGraphExecutionRecord({ ...base(), completedAt: '2026-11-16T09:59:00.000Z' }).some(item => item.code === 'invalid-time-order')).toBe(true);
  });
});
