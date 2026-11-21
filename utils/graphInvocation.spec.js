import { describe, expect, it } from 'vitest';
import { graphInvocationConsumers, graphInvocationName } from './graphInvocation.js';
import { GRAPH_INVOKE_OPERATION } from '@perigram/core';

const documents = [
  { _id: '1', name: 'Report graph', fields: { graphId: 'graph.report' }, graph: { id: 'graph.report', name: 'Report graph', nodes: [] } },
  { _id: '2', name: 'Report runner', fields: { graphId: 'graph.runner' }, graph: { id: 'graph.runner', name: 'Report runner', nodes: [
    { id: 'n1', operation: { id: GRAPH_INVOKE_OPERATION }, config: { graphId: 'graph.report' } }
  ] } },
  { _id: '3', name: 'Unrelated', fields: { graphId: 'graph.other' }, graph: { id: 'graph.other', name: 'Unrelated', nodes: [
    { id: 'n2', operation: { id: GRAPH_INVOKE_OPERATION }, config: { graphId: 'graph.different' } }
  ] } },
  { _id: '4', name: 'Unreadable', fields: { graphId: 'graph.broken' }, graph: null }
];

describe('graphInvocationName', () => {
  it('resolves the pinned graph name from the catalog record', () => {
    expect(graphInvocationName({ graphId: 'graph.report' }, documents, 'Use Graph')).toBe('Report graph');
  });

  it('falls back for an unknown or unset identity', () => {
    expect(graphInvocationName({ graphId: 'graph.missing' }, documents, 'Use Graph')).toBe('Use Graph');
    expect(graphInvocationName({}, documents, 'Use Graph')).toBe('Use Graph');
  });
});

describe('graphInvocationConsumers', () => {
  it('lists readable graphs that pin the edited graph', () => {
    expect(graphInvocationConsumers(documents, 'graph.report')).toEqual([{ id: '2', name: 'Report runner' }]);
  });

  it('skips the edited graph itself and unreadable payloads', () => {
    expect(graphInvocationConsumers(documents, 'graph.runner')).toEqual([]);
    expect(graphInvocationConsumers(documents, 'graph.broken')).toEqual([]);
  });

  it('reports no consumers without an identity', () => {
    expect(graphInvocationConsumers(documents, '')).toEqual([]);
  });
});
