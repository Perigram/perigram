import { describe, expect, it } from 'vitest';
import { migrateProcessDataflowDefinition } from './dataflow-migration.js';

describe('process data-flow migration', () => {
  it('separates literals, entity decomposition, list selection, and block modification', () => {
    const result = migrateProcessDataflowDefinition({
      compiled: { stale: true },
      valueInputs: {
        name: { id: 'name', block: 'identity', path: 'identity.name', valueType: 'string', value: 'A' }
      },
      processNodes: {
        decompose: { id: 'decompose', kind: 'fieldRead', entityType: 'queue', outputs: [{ id: 'identity', kind: 'block' }] },
        select: { id: 'select', kind: 'collection', operation: 'first', entityType: 'queue' },
        modify: { id: 'modify', kind: 'blockCompose', block: 'identity', path: 'name' },
        fallback: { id: 'fallback', kind: 'logic', operation: 'coalesce', valueType: 'string' }
      },
      graph: {
        nodes: [
          { id: 'decompose', type: 'processNode' },
          { id: 'select', type: 'processNode', data: { inputs: [{ id: 'items' }] } },
          { id: 'modify', type: 'processNode' },
          { id: 'fallback', type: 'processNode' }
        ],
        edges: [
          { source: 'decompose', target: 'modify', targetHandle: 'input:block' },
          { source: 'decompose', target: 'select', targetHandle: 'input:items' }
        ]
      }
    });

    expect(result.changed).toBe(true);
    expect(result.value.compiled).toBeNull();
    expect(result.value.valueInputs.name).toEqual({
      id: 'name',
      valueType: 'string',
      structure: 'item',
      value: 'A'
    });
    expect(result.value.processNodes.decompose.kind).toBe('entityDecompose');
    expect(result.value.processNodes.select).toMatchObject({ kind: 'entitySelect', operation: 'first' });
    expect(result.value.processNodes.modify.kind).toBe('blockModify');
    expect(result.value.processNodes.modify.path).toBe('identity.name');
    expect(result.value.processNodes.fallback).toMatchObject({ kind: 'fallback', operation: '' });
    expect(result.value.processNodes.modify.inputs).toEqual([]);
    expect(result.value.graph.edges[1].targetHandle).toBe('input:entities');
    expect(result.value.graph.nodes[1].data.inputs).toBeUndefined();
  });

  it('stops rather than guessing how to migrate an unknown node kind', () => {
    expect(() => migrateProcessDataflowDefinition({
      processNodes: { mystery: { id: 'mystery', kind: 'placeholder' } }
    })).toThrow('Cannot migrate process node mystery');
  });

  it('replaces entity mask bookkeeping with a field predicate', () => {
    const result = migrateProcessDataflowDefinition({
      processNodes: {
        query: { id: 'query', kind: 'entityQuery', entityType: 'queue' },
        status: { id: 'status', kind: 'entityField', entityType: 'queue', path: 'status.state.primary', valueType: 'string', structure: 'list' },
        equals: { id: 'equals', kind: 'compare', operation: 'eq', valueType: 'string', structure: 'list' },
        filter: { id: 'filter', kind: 'entityFilter', entityType: 'queue' }
      },
      valueInputs: {
        ready: { id: 'ready', valueType: 'string', value: 'READY' }
      },
      graph: {
        nodes: [
          ...['query', 'status', 'equals', 'filter'].map(id => ({ id, type: 'processNode' })),
          { id: 'ready', type: 'valueInput' }
        ],
        edges: [
          { source: 'query', target: 'status', targetHandle: 'input:entity' },
          { source: 'status', target: 'equals', targetHandle: 'input:left' },
          { source: 'ready', target: 'equals', targetHandle: 'input:right' },
          { source: 'query', target: 'filter', targetHandle: 'input:entities' },
          { source: 'equals', target: 'filter', targetHandle: 'input:mask' }
        ]
      }
    });

    expect(result.value.dataflowVersion).toBe(2);
    expect(result.value.processNodes.equals).toMatchObject({
      kind: 'entityCondition',
      entityType: 'queue',
      path: 'status.state.primary',
      operation: 'eq',
      structure: 'item'
    });
    expect(result.value.processNodes.status).toBeUndefined();
    expect(result.value.graph.nodes.map(node => node.id)).not.toContain('status');
    expect(result.value.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'ready', target: 'equals', targetHandle: 'input:value' }),
      expect.objectContaining({ source: 'equals', target: 'filter', targetHandle: 'input:predicate' })
    ]));
  });
});
