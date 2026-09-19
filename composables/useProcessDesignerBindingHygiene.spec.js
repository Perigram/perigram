// Binding hygiene: a species record bound to a type that exists nowhere
// (registry view or tree declaration) is dangling, not authored. The live
// interpreter must clear it — after a reload the wire-channel memory is
// empty and the dead binding would otherwise masquerade as authored data,
// minting producer outputs on unknown entity types (the reported
// "Producer output ... uses unknown entity type <type>"), sockets that
// never materialize, and wires dropped at save. Deleting the node that
// authored a producer output must also delete the producer-output record.
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { interpretDeclarationEdges } from '~/packages/processes/src/designer.js';
import { useProcessDesignerLiveGraph } from '~/composables/useProcessDesignerLiveGraph.js';
import { useProcessDesignerGraphEditing } from '~/composables/useProcessDesignerGraphEditing.js';

const construct = (id, typeId) => ({
  id,
  kind: 'cts.construct',
  ...(typeId !== undefined ? { typeId } : {}),
  label: '',
  inputs: [],
  outputs: []
});

describe('interpretDeclarationEdges: dangling bindings', () => {
  it('keeps a stored binding that names a known type', () => {
    const records = { c1: construct('c1', 'widget') };
    const { mutations } = interpretDeclarationEdges([], [], records, {}, {}, ['widget']);
    expect(mutations).toEqual([]);
  });

  it('clears a stored binding that names no known type (no wire, not in registry, not in tree)', () => {
    const records = { c1: construct('c1', 'raugh') };
    const { mutations, bindings } = interpretDeclarationEdges([], [], records, {}, {}, ['widget']);
    expect(bindings.c1).toBe('');
    expect(mutations).toEqual([{ scope: 'record', recordId: 'c1', key: 'typeId', value: '' }]);
  });

  it('keeps the binding while the class remains in the tree, without the registry', () => {
    const records = { c1: construct('c1', 'tree-type') };
    const nodes = [
      { id: 'cls', type: 'ctsClass', data: { refId: 'cls', typeId: 'tree-type', class: 'item', fields: 0, states: 0, payload: null, operators: [] } }
    ];
    const { mutations } = interpretDeclarationEdges(nodes, [], records, {}, {}, []);
    expect(mutations).toEqual([]);
  });

  it('clears the binding once the tree class is gone (the reload case, registry present)', () => {
    const records = { c1: construct('c1', 'tree-type') };
    const { mutations } = interpretDeclarationEdges([], [], records, {}, {}, ['widget']);
    expect(mutations).toEqual([{ scope: 'record', recordId: 'c1', key: 'typeId', value: '' }]);
  });

  it('keeps presets when no registry vocabulary is supplied (cannot judge)', () => {
    const records = { c1: construct('c1', 'anything') };
    const { mutations } = interpretDeclarationEdges([], [], records, {}, {}, []);
    expect(mutations).toEqual([]);
  });

  it('a wire binding to an unknown type still clears (wire present, source has no declaration)', () => {
    const records = { c1: construct('c1', '') };
    const nodes = [
      { id: 'ref', type: 'ctsType', data: { refId: 'ref', typeId: '' } },
      { id: 'c1node', type: 'processNode', data: { refId: 'c1' } }
    ];
    const edges = [{ id: 'bind', source: 'ref', target: 'c1node', role: 'type' }];
    const { bindings } = interpretDeclarationEdges(nodes, edges, records, {}, {}, []);
    expect(bindings.c1).toBe('');
  });
});

describe('useProcessDesignerLiveGraph: knownTypeIds plumbing', () => {
  it('threads the known type ids into interpretation and applies the clear', () => {
    const nodes = ref([]);
    const edges = ref([]);
    const draft = ref({ data: { processNodes: { c1: construct('c1', 'raugh') } } });
    const applied = [];
    // The page's apply writes record mutations onto the records.
    const apply = mutations => {
      applied.push(mutations);
      for (const mutation of mutations) {
        if (mutation.scope !== 'record') continue;
        const record = draft.value.data.processNodes[mutation.recordId];
        if (record) record.typeId = mutation.value;
      }
    };
    // The watcher's immediate first pass IS the reload case: the dangling
    // binding is cleared before the page ever paints.
    useProcessDesignerLiveGraph({
      nodes,
      edges,
      draft,
      apply,
      knownTypeIds: () => ['widget']
    });
    expect(applied.at(-1)).toEqual([{ scope: 'record', recordId: 'c1', key: 'typeId', value: '' }]);
    expect(draft.value.data.processNodes.c1.typeId).toBe('');
  });
});

describe('useProcessDesignerGraphEditing: owned records die with their node', () => {
  function setup() {
    const draft = ref({
      data: {
        processNodes: { c1: construct('c1', 'widget') },
        producerOutputs: {
          'c1:result': { producerOutputId: 'c1:result', nodeId: 'c1', entityType: 'widget' }
        }
      }
    });
    const nodes = ref([
      { id: 'n1', type: 'processNode', selected: true, data: { refId: 'c1' } },
      { id: 'j1', type: 'processNode', selected: false, data: { refId: 'j1' } }
    ]);
    draft.value.data.processNodes.j1 = {
      id: 'j1',
      kind: 'cts.join',
      typeId: 'widget',
      selectedProducerOutputId: 'c1:result',
      inputs: [],
      outputs: []
    };
    const edges = ref([{ id: 'e1', source: 'n1', target: 'j1', selected: false }]);
    const editing = useProcessDesignerGraphEditing({
      draft,
      nodes,
      edges,
      selectedNode: ref(nodes.value[0]),
      selectedNodeId: ref('n1'),
      selectedEdgeId: ref(null),
      recordKeyForType: type => (type === 'processNode' ? 'processNodes' : 'ctsTypes'),
      onGraphChange: () => {}
    });
    return { draft, nodes, edges, editing };
  }

  it('deleting a construct removes its producer output and resets join selections', () => {
    const { draft, editing } = setup();
    editing.deleteGraphSelection();
    expect(draft.value.data.processNodes.c1).toBeUndefined();
    expect(draft.value.data.producerOutputs['c1:result']).toBeUndefined();
    expect(draft.value.data.processNodes.j1.selectedProducerOutputId).toBe('');
  });
});
