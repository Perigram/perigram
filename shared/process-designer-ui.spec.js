import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { definitionToCanvas } from '~/packages/processes/src/index.js';
import { useProcessDefinitionCatalog } from '~/composables/useProcessDefinitionCatalog.js';
import { useProcessDesignerSelection } from '~/composables/useProcessDesignerSelection.js';
import { useProcessDesignerPersistence } from '~/composables/useProcessDesignerPersistence.js';
import { useProcessDesignerGraphEditing } from '~/composables/useProcessDesignerGraphEditing.js';
import { useProcessDesignerInspector } from '~/composables/useProcessDesignerInspector.js';
import { createPersistedAcceptanceFixture } from '~/test-data/persisted-acceptance.js';

describe('process designer interaction boundaries', () => {
  it('orders active, draft, and archived process definitions and selects a projectable definition', () => {
    const catalog = useProcessDefinitionCatalog({ definitionToCanvas });
    const current = createPersistedAcceptanceFixture().processDefinition;
    const archived = { ...current, _id: 'archived', status: { state: { primary: 'ARCHIVED' } } };
    const draft = { ...current, _id: 'draft', status: { state: { primary: 'DRAFT' } } };
    const active = { ...current, _id: 'active', status: { state: { primary: 'ACTIVE' } } };

    const list = catalog.normalizeProcessList(active, [archived, draft, active]);

    expect(list.map(item => item._id)).toEqual(['active', 'draft', 'archived']);
    expect(catalog.pickInitialProcess(active, list)).toBe(active);
  });

  it('falls through an unprojectable active record to a current draft', () => {
    const catalog = useProcessDefinitionCatalog({
      definitionToCanvas: definition => {
        if (definition.invalid) throw new Error('invalid authored graph');
        return definitionToCanvas(definition);
      }
    });
    const current = createPersistedAcceptanceFixture().processDefinition;
    const invalid = { ...current, _id: 'invalid', data: { invalid: true } };
    const draft = { ...current, _id: 'draft', status: { state: { primary: 'DRAFT' } } };

    expect(catalog.pickInitialProcess(invalid, [invalid, draft])).toBe(draft);
  });

  it('keeps node and edge selection mutually exclusive', () => {
    const nodes = ref([{ id: 'a', selected: false }, { id: 'b', selected: false }]);
    const edges = ref([{ id: 'a-b', selected: false }]);
    const syncEdges = vi.fn();
    const selection = useProcessDesignerSelection({
      nodes,
      edges,
      decorateEdge: edge => edge,
      closePalette: vi.fn(),
      syncEdges
    });

    selection.selectNode(nodes.value[0]);
    expect(selection.selectedNode.value?.id).toBe('a');
    expect(selection.selectedEdgeId.value).toBeNull();

    selection.selectEdge(edges.value[0]);
    expect(selection.selectedNode.value).toBeNull();
    expect(selection.selectedEdgeId.value).toBe('a-b');
    expect(syncEdges).toHaveBeenCalledTimes(2);
  });

  it('clears runtime selection without deleting authored graph records', () => {
    const nodes = ref([{ id: 'a', selected: true }, { id: 'b', selected: true }]);
    const edges = ref([{ id: 'a-b', selected: true, source: 'a', target: 'b' }]);
    const closePalette = vi.fn();
    const selection = useProcessDesignerSelection({
      nodes,
      edges,
      decorateEdge: edge => ({ ...edge, decorated: true }),
      closePalette,
      syncEdges: vi.fn()
    });
    selection.selectNode(nodes.value[0]);

    selection.clearGraphSelection();

    expect(nodes.value).toEqual([{ id: 'a', selected: false }, { id: 'b', selected: false }]);
    expect(edges.value).toEqual([{ id: 'a-b', selected: false, source: 'a', target: 'b', decorated: true }]);
    expect(selection.selectedNodeId.value).toBeNull();
    expect(closePalette).toHaveBeenCalledOnce();
  });

  it('keeps Save as draft persistence and Apply as explicit validation plus activation', async () => {
    const request = vi.fn(async (url) => ({ url, ok: true }));
    const persistence = useProcessDesignerPersistence({ request });
    const draft = { dataflowVersion: 4, graph: { nodes: [], edges: [] } };

    await persistence.saveDraft('draft-1', draft);
    expect(request).toHaveBeenLastCalledWith('/api/process-definitions/draft-1', {
      method: 'PATCH',
      body: { data: draft }
    });
    expect(request.mock.calls.some(([url]) => url.endsWith('/validate'))).toBe(false);

    await persistence.validateDraft('draft-1');
    await persistence.activateDraft('draft-1');
    expect(request.mock.calls.slice(-2).map(([url]) => url)).toEqual([
      '/api/process-definitions/draft-1/validate',
      '/api/process-definitions/draft-1/activate'
    ]);
  });

  it('keeps inspector record creation inside the authored record boundary', () => {
    const draft = ref({ data: {} });
    const selectedNode = ref({ id: 'action-node', type: 'action', data: { refId: 'create-artifact' } });
    const inspector = useProcessDesignerInspector({
      draft,
      selectedNode,
      factories: {
        entity: id => ({ id }),
        action: id => ({ id, label: 'Create artifact' })
      }
    });

    expect(inspector.selectedAction.value).toEqual({ id: 'create-artifact', label: 'Create artifact' });
    expect(draft.value.data.actions['create-artifact']).toBe(inspector.selectedAction.value);
    expect(inspector.selectedEntity.value).toEqual({});
  });

  it('deletes graph selection and its authored records through the graph-editing boundary', () => {
    const draft = ref({ data: { processNodes: { source: { id: 'source' }, target: { id: 'target' } } } });
    const nodes = ref([
      { id: 'source-node', type: 'processNode', selected: true, data: { refId: 'source' } },
      { id: 'target-node', type: 'processNode', selected: false, data: { refId: 'target' } }
    ]);
    const edges = ref([{ id: 'connection', source: 'source-node', target: 'target-node', selected: false }]);
    const selectedNodeId = ref('source-node');
    const selectedEdgeId = ref(null);
    const clearSemanticConnection = vi.fn();
    const syncInferredActionInputs = vi.fn();
    const editing = useProcessDesignerGraphEditing({
      draft,
      nodes,
      edges,
      selectedNode: ref(nodes.value[0]),
      selectedNodeId,
      selectedEdgeId,
      recordKeyForType: () => 'processNodes',
      clearSemanticConnection,
      syncInferredActionInputs,
      onBlockedStatusNodes: vi.fn()
    });

    editing.deleteGraphSelection();

    expect(nodes.value.map(node => node.id)).toEqual(['target-node']);
    expect(edges.value).toEqual([]);
    expect(draft.value.data.processNodes).toEqual({ target: { id: 'target' } });
    expect(clearSemanticConnection).toHaveBeenCalledWith(expect.objectContaining({ id: 'connection' }));
    expect(syncInferredActionInputs).toHaveBeenCalledOnce();
  });
});
