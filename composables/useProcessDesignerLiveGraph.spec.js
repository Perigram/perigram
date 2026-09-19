import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useProcessDesignerLiveGraph } from '~/composables/useProcessDesignerLiveGraph.js';

function graphState() {
  return {
    nodes: [
      { id: 'cls', type: 'ctsClass', position: { x: 0, y: 0 }, data: { refId: 'cls', typeId: 'panel', class: 'item', fields: 0, states: 0 } },
      { id: 'f1', type: 'ctsField', position: { x: 1, y: 1 }, data: { refId: 'f1', typeId: null, name: 'width' } },
      { id: 'ctor', type: 'processNode', position: { x: 2, y: 2 }, data: { refId: 'ctor' } }
    ],
    edges: [
      { id: 'd1', source: 'f1', target: 'cls', role: 'type', label: 'field' },
      { id: 'b1', source: 'cls', target: 'ctor', role: 'type', label: 'type' }
    ],
    records: { ctor: { id: 'ctor', kind: 'cts.construct', typeId: '' } }
  };
}

function wireEngine(state) {
  const nodes = ref(state.nodes);
  const edges = ref(state.edges);
  const draft = ref({ data: { processNodes: state.records } });
  const apply = vi.fn(mutations => {
    for (const mutation of mutations) {
      if (mutation.scope === 'node') {
        nodes.value.find(node => node.id === mutation.nodeId).data[mutation.key] = mutation.value;
      } else {
        draft.value.data.processNodes[mutation.recordId].typeId = mutation.value;
      }
    }
  });
  const engine = useProcessDesignerLiveGraph({ nodes, edges, draft, apply });
  return { nodes, edges, draft, apply, engine };
}

describe('process designer live graph', () => {
  it('interprets declaration wires on load and after every authoring change', async () => {
    const state = graphState();
    const { nodes, apply } = wireEngine(state);
    await nextTick();
    expect(apply).toHaveBeenCalled();
    expect(nodes.value.find(node => node.id === 'f1').data.typeId).toBe('panel');
    expect(state.records.ctor.typeId).toBe('panel');
    expect(nodes.value.find(node => node.id === 'cls').data.fields).toBe(1);
  });

  it('propagates a class rename to wired descendants in the same tick', async () => {
    const state = graphState();
    const { nodes } = wireEngine(state);
    await nextTick();
    nodes.value.find(node => node.id === 'cls').data.typeId = 'plate';
    await nextTick();
    expect(nodes.value.find(node => node.id === 'f1').data.typeId).toBe('plate');
    expect(state.records.ctor.typeId).toBe('plate');
  });

  it('unbinds a record when its binding wire is deleted', async () => {
    const state = graphState();
    const { edges } = wireEngine(state);
    await nextTick();
    edges.value = edges.value.filter(edge => edge.id !== 'b1');
    await nextTick();
    expect(state.records.ctor.typeId).toBe('');
  });

  it('does not re-evaluate on position drags or selection churn', async () => {
    const state = graphState();
    const { nodes, apply } = wireEngine(state);
    await nextTick();
    const calls = apply.mock.calls.length;
    nodes.value = nodes.value.map(node => ({ ...node, position: { x: 99, y: 99 }, selected: true }));
    await nextTick();
    expect(apply.mock.calls.length).toBe(calls);
  });

  it('evaluateNow applies interpretation synchronously', () => {
    const state = graphState();
    const { nodes, engine } = wireEngine(state);
    nodes.value.find(node => node.id === 'cls').data.typeId = 'sheet';
    const mutations = engine.evaluateNow();
    expect(mutations.length).toBeGreaterThan(0);
    expect(state.records.ctor.typeId).toBe('sheet');
  });

  it('reset drops wire-binding memory so a draft switch never unbinds by id collision', async () => {
    const state = graphState();
    const { nodes, edges, draft, engine } = wireEngine(state);
    await nextTick();
    expect(state.records.ctor.typeId).toBe('panel');
    engine.reset();
    // a new draft whose record reuses the id, with no binding wire yet
    const nextRecords = { ctor: { id: 'ctor', kind: 'cts.construct', typeId: 'panel' } };
    draft.value = { data: { processNodes: nextRecords } };
    nodes.value = [];
    edges.value = [];
    await nextTick();
    expect(nextRecords.ctor.typeId).toBe('panel');
  });
});
