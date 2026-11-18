import { describe, expect, it } from 'vitest';
import { normalizeActions, normalizeGraph, normalizeRecord } from './compiler-core.js';

describe('graph and action normalization', () => {
  it('preserves declaration wire roles and authored labels', () => {
    const graph = normalizeGraph({
      nodes: [{ id: 12, position: { x: '4', y: 8 }, data: { refId: 'record-1' } }],
      edges: [{
        id: 'edge-1',
        source: 12,
        target: 'node-2',
        sourceHandle: 'output:class',
        targetHandle: 'input:declares',
        role: 'type',
        label: 'declares'
      }]
    });

    expect(graph.nodes[0]).toMatchObject({
      id: '12',
      position: { x: 4, y: 8 },
      data: { refId: 'record-1' }
    });
    expect(graph.edges[0]).toMatchObject({
      source: '12',
      target: 'node-2',
      role: 'type',
      label: 'declares',
      sourceHandle: 'output:class',
      targetHandle: 'input:declares'
    });
    expect(graph.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('normalizes legacy changeStatus actions into the current update contract', () => {
    const actions = normalizeActions({
      approve: {
        actionKind: 'changeStatus',
        typeId: 'panel',
        state: { from: 'draft', to: 'review' }
      }
    });

    expect(actions.approve).toMatchObject({
      actionKind: 'updateEntity',
      typeId: 'panel',
      inputs: [
        { id: 'entity', kind: 'entity', typeId: 'panel', required: false },
        { id: 'state', kind: 'state', state: 'review', required: false }
      ],
      mutation: { fields: [] },
      access: { stateFrom: 'draft', stateTo: 'review' }
    });
  });

  it('normalizes non-record values to an empty record', () => {
    expect(normalizeRecord(null)).toEqual({});
    expect(normalizeRecord(['not', 'a', 'record'])).toEqual({});
  });
});
