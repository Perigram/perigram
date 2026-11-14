// Canvas lifecycle harness: the real composables (selection, graph
// editing, live interpretation, inspector records) wired exactly like the
// page, driven through the authoring scenarios reported broken — node
// drops, declaration/target/binding wires, renames, deletions — asserting
// the structural invariants: no node loss, no record resurrection, no
// non-converging evaluation, no exceptions.
import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useProcessDesignerSelection } from '~/composables/useProcessDesignerSelection.js';
import { useProcessDesignerGraphEditing } from '~/composables/useProcessDesignerGraphEditing.js';
import { useProcessDesignerLiveGraph } from '~/composables/useProcessDesignerLiveGraph.js';
import { useProcessDesignerInspector } from '~/composables/useProcessDesignerInspector.js';
import { declarationWireLegality, declarationNodePorts } from '@perigram/processes/designer';

function createCanvas() {
  const nodes = ref([]);
  const edges = ref([]);
  const draft = ref({ data: {} });

  const decorateEdge = edge => edge;
  const selection = useProcessDesignerSelection({
    nodes, edges, decorateEdge, closePalette: () => {}, syncEdges: () => {}
  });

  const factories = {
    entity: id => ({ id }),
    action: id => ({ id }),
    service: id => ({ id }),
    socket: id => ({ id }),
    stateDefinition: id => ({ id }),
    valueInput: id => ({ id }),
    processNode: id => ({ id, kind: 'cts.construct', typeId: '', trigger: { mode: 'manual' }, access: { grants: [] } }),
    ctsClass: id => ({ id, kind: 'class', typeId: '', class: 'file', payload: null, operators: [] }),
    ctsField: id => ({ id, kind: 'field', typeId: null, name: '', descriptor: { base: 'string' } }),
    ctsState: id => ({ id, kind: 'state', typeId: null, value: '', initial: false, terminal: false }),
    ctsType: id => ({ id, kind: 'type', typeId: '' })
  };
  const inspector = useProcessDesignerInspector({ draft, selectedNode: selection.selectedNode, factories });

  const evaluationLog = [];
  // late-bound apply: the engine's first pass runs at instantiation, so
  // the application function resolves after the canvas object exists
  // (mirrors the page's ordering rule)
  let applyMutations = () => {};
  const liveGraph = useProcessDesignerLiveGraph({
    nodes,
    edges,
    draft,
    apply: mutations => applyMutations(mutations)
  });

  const editing = useProcessDesignerGraphEditing({
    draft,
    nodes,
    edges,
    selectedNode: selection.selectedNode,
    selectedNodeId: selection.selectedNodeId,
    selectedEdgeId: selection.selectedEdgeId,
    recordKeyForType: inspector.recordKeyForType,
    clearSemanticConnection: () => {},
    syncInferredActionInputs: () => canvas.syncNodeData(),
    onBlockedStatusNodes: () => {}
  });

  const canvas = {
    nodes, edges, draft, selection, inspector, editing, liveGraph, evaluationLog,
    evaluateNow: liveGraph.evaluateNow,
    applyMutations,

    addDeclarationNode(type, data) {
      const id = `${type}_${nodes.value.length + 1}`;
      const node = { id, type, position: { x: 0, y: 0 }, selected: true, data: { refId: id, ...data } };
      nodes.value = [...nodes.value.map(item => ({ ...item, selected: false })), node];
      inspector.ensureRecord(inspector.recordKeyForType(type), node, factories[type]);
      selection.selectedNodeId.value = id;
      return node;
    },

    addProcessNode(kind, preset = {}) {
      const id = `pn_${nodes.value.length + 1}`;
      const node = { id, type: 'processNode', position: { x: 0, y: 0 }, selected: true, data: { refId: id } };
      const record = inspector.ensureRecord('processNodes', node, factories.processNode);
      Object.assign(record, { id, kind, ...JSON.parse(JSON.stringify(preset)) });
      nodes.value = [...nodes.value.map(item => ({ ...item, selected: false })), node];
      selection.selectedNodeId.value = id;
      return node;
    },

    // the page's onConnect declaration branch, verbatim in behavior
    connect(source, target, sourceHandle, targetHandle) {
      const sourceNode = nodes.value.find(node => node.id === source);
      const targetNode = nodes.value.find(node => node.id === target);
      const targetNodeRecord = draft.value?.data?.processNodes?.[targetNode?.data?.refId];
      const legality = declarationWireLegality({
        sourceType: sourceNode?.type,
        targetType: targetNode?.type,
        targetRecord: targetNodeRecord
      });
      if (!legality) return false;
      if (legality === 'binds') {
        edges.value = edges.value.filter(edge => !(
          edge.role === 'type' && edge.label === 'type' && edge.target === targetNode.id
        ));
      }
      const declarationEdge = {
        id: `${legality}:${source}-${target}-${Date.now() + Math.random()}`,
        source, target, sourceHandle, targetHandle,
        type: 'default',
        role: 'type',
        label: legality === 'declares' ? (sourceNode.type === 'ctsField' ? 'field' : 'state')
          : legality === 'binds' ? 'type'
            : legality === 'targets' ? 'ref-target'
              : legality
      };
      selection.selectedEdgeId.value = null;
      edges.value.push(declarationEdge);
      liveGraph.evaluateNow();
      return true;
    },

    // the page's syncNodeData, structural subset (labels, declaration
    // records, declaration ports)
    syncNodeData() {
      for (const node of nodes.value) {
        if (!node.data?.refId) continue;
        try {
          const record = inspector.ensureRecord(inspector.recordKeyForType(node.type), node, factories[node.type]);
          if (node.type === 'ctsClass') {
            record.typeId = node.data.typeId || '';
            record.class = node.data.class || 'file';
            node.data.label = node.data.typeId || '';
          }
          if (node.type === 'ctsField') {
            record.typeId = node.data.typeId || null;
            record.name = node.data.name || '';
            record.descriptor = { ...(node.data.descriptor || { base: 'string' }) };
            node.data.label = node.data.name || '';
          }
          if (node.type === 'ctsState') {
            record.typeId = node.data.typeId || null;
            record.value = node.data.value || '';
            node.data.label = node.data.value || '';
          }
          if (['ctsClass', 'ctsField', 'ctsState', 'ctsType'].includes(node.type)) {
            const ports = declarationNodePorts(node, []) || {};
            node.data.inputSpecs = ports.inputSpecs || [];
            node.data.outputSpecs = ports.outputSpecs || [];
          }
        } catch (error) {
          throw new Error(`sync failed for ${node.type} ${node.id}: ${error.message}`);
        }
      }
    },

    async settle() {
      await nextTick();
      await nextTick();
    }
  };
  applyMutations = mutations => {
    evaluationLog.push(mutations);
    for (const mutation of mutations) {
      if (mutation.scope === 'node') {
        const node = nodes.value.find(candidate => candidate.id === mutation.nodeId);
        if (node) node.data[mutation.key] = mutation.value;
        continue;
      }
      const record = draft.value?.data?.processNodes?.[mutation.recordId];
      if (record) {
        if (record.kind.startsWith('cts.')) record.typeId = mutation.value;
        else record.typeId = mutation.value;
      }
    }
    canvas.syncNodeData();
  };

  return canvas;
}

describe('canvas lifecycle invariants', () => {
  it('keeps every node and record through declaration authoring, wiring, renaming, and deletion', async () => {
    const canvas = createCanvas();
    const cls = canvas.addDeclarationNode('ctsClass', { typeId: 'panel', class: 'item', fields: 0 });
    const field = canvas.addDeclarationNode('ctsField', { typeId: null, name: 'design', descriptor: { base: 'ref', accepts: [] } });
    const state = canvas.addDeclarationNode('ctsState', { typeId: null, value: 'raw' });
    await canvas.settle();

    expect(canvas.connect(field.id, cls.id, 'output:field', 'input:declare')).toBe(true);
    await canvas.settle();
    expect(field.data.typeId).toBe('panel');
    expect(cls.data).toMatchObject({ fields: 1 });

    // a second class wired as the ref target derives accepts
    const target = canvas.addDeclarationNode('ctsClass', { typeId: 'plate', class: 'item', fields: 0 });
    expect(canvas.connect(target.id, field.id, 'output:type', 'input:targets')).toBe(true);
    await canvas.settle();
    expect(field.data.descriptor.accepts).toEqual(['plate']);

    // renaming the target re-derives accepts live (through the reactive
    // proxy, as every page input does)
    canvas.nodes.value.find(node => node.id === target.id).data.typeId = 'sheet';
    await canvas.settle();
    expect(field.data.descriptor.accepts).toEqual(['sheet']);

    // deleting the target class keeps the field authored (accepts stay,
    // the wire is gone)
    canvas.selection.selectNode(target);
    canvas.editing.deleteGraphSelection();
    await canvas.settle();
    expect(canvas.nodes.value.map(node => node.id)).not.toContain(target.id);
    expect(canvas.nodes.value).toHaveLength(3);

    // deleting the field removes node, record, and its wires
    canvas.selection.selectNode(field);
    canvas.editing.deleteGraphSelection();
    await canvas.settle();
    expect(canvas.nodes.value.map(node => node.id)).toEqual([cls.id, state.id]);
    expect(Object.keys(canvas.draft.value.data.ctsTypes)).toHaveLength(2);
    expect(canvas.edges.value.filter(edge => edge.target === field.id || edge.source === field.id)).toHaveLength(0);

    // evaluation converged: a settled graph re-interprets to no writes
    expect(canvas.evaluateNow()).toEqual([]);
  });

  it('never resurrects deleted process nodes or their records', async () => {
    const canvas = createCanvas();
    const construct = canvas.addProcessNode('cts.construct', { typeId: 'panel', construction: { mode: 'genericCreate' } });
    const mutate = canvas.addProcessNode('cts.mutate', { typeId: '' });
    await canvas.settle();

    // entity stream adapts the mutate (resolver-less engine: binding by
    // edge simulation — direct record binding as the page resolver would)
    canvas.connect(construct.id, mutate.id, 'data:result', 'data:entity');

    canvas.selection.selectNode(mutate);
    canvas.editing.deleteGraphSelection();
    await canvas.settle();
    expect(canvas.nodes.value.map(node => node.id)).toEqual([construct.id]);
    expect(Object.keys(canvas.draft.value.data.processNodes)).toEqual([construct.data.refId]);

    canvas.selection.selectNode(construct);
    canvas.editing.deleteGraphSelection();
    await canvas.settle();
    expect(canvas.nodes.value).toHaveLength(0);
    expect(canvas.draft.value.data.processNodes).toEqual({});
    expect(canvas.edges.value).toHaveLength(0);
  });

  it('a class rename with a bound construct re-binds without losing the node', async () => {
    const canvas = createCanvas();
    const cls = canvas.addDeclarationNode('ctsClass', { typeId: 'panel', class: 'item', fields: 0 });
    const construct = canvas.addProcessNode('cts.construct', { typeId: '', construction: { mode: 'genericCreate' } });
    await canvas.settle();

    expect(canvas.connect(cls.id, construct.id, 'output:type', 'data:type')).toBe(true);
    await canvas.settle();
    expect(canvas.draft.value.data.processNodes[construct.data.refId].typeId).toBe('panel');

    canvas.nodes.value.find(node => node.id === cls.id).data.typeId = 'plate';
    await canvas.settle();
    expect(canvas.draft.value.data.processNodes[construct.data.refId].typeId).toBe('plate');
    expect(canvas.nodes.value).toHaveLength(2);
    // the class card label follows the rename
    expect(cls.data.label).toBe('plate');

    // deleting the class unbinds the construct but keeps it on canvas
    canvas.selection.selectNode(cls);
    canvas.editing.deleteGraphSelection();
    await canvas.settle();
    expect(canvas.nodes.value.map(node => node.id)).toEqual([construct.id]);
    expect(canvas.draft.value.data.processNodes[construct.data.refId].typeId).toBe('');
  });
});
