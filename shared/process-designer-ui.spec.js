import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ref } from 'vue';
import { definitionToCanvas } from '~/packages/processes/src/index.js';
import { useProcessDefinitionCatalog } from '~/composables/useProcessDefinitionCatalog.js';
import { useProcessDesignerSelection } from '~/composables/useProcessDesignerSelection.js';
import { useProcessDesignerPersistence } from '~/composables/useProcessDesignerPersistence.js';
import { useProcessDesignerGraphEditing } from '~/composables/useProcessDesignerGraphEditing.js';
import { useProcessDesignerInspector } from '~/composables/useProcessDesignerInspector.js';
import { useProcessDesignerScreens } from '~/composables/useProcessDesignerScreens.js';
import { compileScreens } from '~/packages/processes/src/compiler-core.js';
import { normalizeScreenContract, validateScreenContract } from '~/packages/processes/src/screen-contract.js';
import { createPersistedAcceptanceFixture } from '~/test-data/persisted-acceptance.js';

describe('process designer interaction boundaries', () => {
  it('uses producer-output ownership instead of the removed entity-profile helper', () => {
    const designer = readFileSync(new URL('../pages/organization/process.vue', import.meta.url), 'utf8');
    const nodeSync = readFileSync(new URL('../composables/useProcessDesignerNodeSync.js', import.meta.url), 'utf8');

    // The sync pass owns producer-output synchronization now.
    expect(nodeSync).toContain('syncProcessNodeProducerOutputs');
    expect(designer).not.toContain('requiredEntityProfileTypes');
    expect(designer).not.toContain('ensureRequiredEntityProfiles');
  });

  it('wires the live evaluation loop after every composable its sync pass reads', () => {
    const designer = readFileSync(new URL('../pages/organization/process.vue', import.meta.url), 'utf8');
    const engine = designer.indexOf('useProcessDesignerLiveGraph({');
    const preview = designer.indexOf('useProcessDesignerPreview({');

    expect(engine).toBeGreaterThan(-1);
    // the engine's watcher runs its first pass immediately, so any binding
    // the sync pass touches must already be initialized
    expect(engine).toBeGreaterThan(preview);
  });

  it('uses the shared annotated summary and typed grant editor without raw grant JSON', () => {
    const designer = readFileSync(new URL('../pages/organization/process.vue', import.meta.url), 'utf8');
    const team = readFileSync(new URL('../pages/organization/users.vue', import.meta.url), 'utf8');
    const editor = readFileSync(new URL('../components/PermissionEditor.vue', import.meta.url), 'utf8');
    expect(designer).toContain('deriveRoleAccessSummary');
    expect(designer).toContain('<PermissionEditor');
    expect(team).toContain('previewAssignmentAccess');
    expect(team).toContain("field.type === 'number'");
    expect(team).toContain("field.type === 'boolean'");
    expect(editor).not.toContain('advancedPermissionJson');
  });

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
    const selectedNode = ref({ id: 'construct-node', type: 'processNode', data: { refId: 'create-project' } });
    const inspector = useProcessDesignerInspector({
      draft,
      selectedNode,
      factories: {
        processNode: id => ({ id, kind: 'cts.construct', label: 'Create project' })
      }
    });

    expect(inspector.selectedProcessNode.value).toEqual({ id: 'create-project', kind: 'cts.construct', label: 'Create project' });
    expect(draft.value.data.processNodes['create-project']).toBe(inspector.selectedProcessNode.value);
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
    const onGraphChange = vi.fn();
    const editing = useProcessDesignerGraphEditing({
      draft,
      nodes,
      edges,
      selectedNode: ref(nodes.value[0]),
      selectedNodeId,
      selectedEdgeId,
      recordKeyForType: () => 'processNodes',
      onGraphChange
    });

    editing.deleteGraphSelection();

    expect(nodes.value.map(node => node.id)).toEqual(['target-node']);
    expect(edges.value).toEqual([]);
    expect(draft.value.data.processNodes).toEqual({ target: { id: 'target' } });
    expect(onGraphChange).toHaveBeenCalledOnce();
  });

  it('authors complete screen sources, regions, and typed bindings through the canonical contract', () => {
    const screen = {
      id: 'operations',
      label: 'Operations',
      template: 'table',
      typeId: 'queue',
      required: { feature: 'queues', level: 'read' },
      bindings: {},
      sources: [],
      regions: [],
      actions: []
    };
    const draft = ref({ data: { screens: { operations: screen } } });
    const screens = useProcessDesignerScreens({
      draft,
      selectedScreenId: ref('operations'),
      createScreen: vi.fn(),
      normalizeScreenContract,
      defaultTypeId: () => 'queue',
      featureForTypeId: typeId => `${typeId}s`
    });

    screens.sync(screen);
    const source = screen.sources[0];
    screens.renameSource(screen, source, 'queue_source');
    source.label = 'Queue source';
    source.required = { feature: 'queues', level: 'write' };
    screens.addScalar(source.filters, 'status', 'READY');
    screens.setScalarType(source.filters, 'status', 'number');
    source.filters.status = 3;
    Object.assign(screens.addLineageBinding(source), {
      childTypeId: 'queue', parentTypeId: 'project', lineageKey: 'projectId',
      sourceNode: 'project-source', sourceSocket: 'project', consumingNode: 'queue-source', consumingSocket: 'queue'
    });
    const region = screen.regions[0];
    region.id = 'queue_table';
    region.label = 'Queue table';
    region.slot = 'supporting';
    region.surface = 'table';
    region.actions = ['start'];
    screens.addScalar(screen.bindings, 'limit');
    screens.setScalarType(screen.bindings, 'limit', 'number');
    screen.bindings.limit = 25;
    screens.addScalar(screen.bindings, 'enabled');
    screens.setScalarType(screen.bindings, 'enabled', 'boolean');
    screens.addScalar(screen.bindings, 'title', 'Queues');
    screens.addScalar(screen.bindings, 'projectId');
    screens.setScalarType(screen.bindings, 'projectId', 'assignment');
    screen.bindings.projectId = '$assignment.projectId';

    const errors = [];
    const normalized = validateScreenContract(screen, {
      screenId: screen.id,
      entities: new Set(['queue', 'project']),
      actions: { start: {} },
      errors
    });
    const compiled = compileScreens({ operations: normalized }).operations;

    expect(errors).toEqual([]);
    expect(compiled.bindings).toEqual({ limit: 25, enabled: false, title: 'Queues', projectId: '$assignment.projectId' });
    expect(compiled.sources[0]).toMatchObject({
      id: 'queue_source', label: 'Queue source', typeId: 'queue', mode: 'list',
      required: { feature: 'queues', level: 'write' }, filters: { status: 3 }
    });
    expect(compiled.sources[0].lineageBindings).toEqual([{
      childTypeId: 'queue', parentTypeId: 'project', lineageKey: 'projectId',
      sourceNode: 'project-source', sourceSocket: 'project', consumingNode: 'queue-source', consumingSocket: 'queue'
    }]);
    expect(compiled.regions[0]).toEqual({
      id: 'queue_table', label: 'Queue table', slot: 'supporting', sourceId: 'queue_source', surface: 'table', actions: ['start']
    });
  });

  it('switches source modes without retaining fields invalid for the canonical mode', () => {
    const screen = normalizeScreenContract({
      id: 'detail', template: 'table', typeId: 'queue', required: { feature: 'queues', level: 'read' },
      bindings: { entityId: '$assignment.queueId' },
      sources: [{ id: 'queues', typeId: 'queue', mode: 'list', filters: { status: 'READY' }, lineageBindings: [{ lineageKey: 'projectId' }] }],
      regions: [{ id: 'main', slot: 'main', sourceId: 'queues', surface: 'table', actions: [] }]
    });
    const screens = useProcessDesignerScreens({
      draft: ref({ data: { screens: { detail: screen } } }), selectedScreenId: ref('detail'), createScreen: vi.fn(),
      normalizeScreenContract, defaultTypeId: () => 'queue', featureForTypeId: () => 'queues'
    });

    screens.setSourceMode(screen, screen.sources[0], 'single');
    expect(screen.sources[0]).toMatchObject({ mode: 'single', identifier: '$assignment.entityId', filters: {}, lineageBindings: [] });
    const errors = [];
    validateScreenContract(screen, { screenId: screen.id, entities: new Set(['queue']), errors });
    expect(errors).toEqual([]);
    expect(compileScreens({ detail: screen }).detail.sources[0].identifier).toBe('$assignment.entityId');
    screens.setSourceMode(screen, screen.sources[0], 'list');
    expect(screen.sources[0]).toMatchObject({ mode: 'list', identifier: null, filters: {}, lineageBindings: [] });
  });
});
