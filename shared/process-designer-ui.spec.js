import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ref } from 'vue';
import { definitionToCanvas, compileProcessDefinition, redundantAuthoredScreens, compileScreens } from '#packages/processes';
import { useProcessDefinitionCatalog } from '~/composables/useProcessDefinitionCatalog.js';
import { useProcessDesignerSelection } from '~/composables/useProcessDesignerSelection.js';
import { useProcessDesignerPersistence } from '~/composables/useProcessDesignerPersistence.js';
import { useProcessDesignerGraphEditing } from '~/composables/useProcessDesignerGraphEditing.js';
import { useProcessDesignerInspector } from '~/composables/useProcessDesignerInspector.js';
import { useProcessDesignerScreens } from '~/composables/useProcessDesignerScreens.js';
import { normalizeScreenContract, validateScreenContract } from '@perigram/processes/screen-contract';
import { createPersistedAcceptanceFixture } from '~/test-data/persisted-acceptance.js';

describe('process designer interaction boundaries', () => {
  it('keeps process-node cards as socket manifests and moves all authoring into the inspector', () => {
    const card = readFileSync(new URL('../components/process-designer/ProcessNode.vue', import.meta.url), 'utf8');
    const inspector = readFileSync(new URL('../components/process-designer/inspector/ProcessNodeInspector.vue', import.meta.url), 'utf8');

    expect(card).toContain('socketRows.length');
    expect(card).toContain('DesignerSocketHandle');
    expect(card).not.toContain('TypedValueControl');
    expect(card).not.toContain('hasInlineConfiguration');
    expect(card).not.toContain('updateValueType');
    expect(inspector).toContain('TypedValueControl');
    expect(inspector).toContain('operationOptions');
    expect(inspector).toContain('base="json"');
    expect(inspector).toContain('setLiteralBase');
  });

  it('delegates producer-output ownership to the package record-sync pipeline', () => {
    const designer = readFileSync(new URL('../pages/organization/process.vue', import.meta.url), 'utf8');
    const nodeSync = readFileSync(new URL('../composables/useProcessDesignerNodeSync.js', import.meta.url), 'utf8');

    // Producer outputs sync inside the package pipeline the composable
    // delegates to (the same pass headless authoring runs).
    expect(nodeSync).toContain('createProcessRecordSync');
    expect(nodeSync).not.toContain('entityProfile');
    expect(designer).not.toContain('requiredEntityProfileTypes');
    expect(designer).not.toContain('ensureRequiredEntityProfiles');
  });

  it('wires the live evaluation loop after every composable its sync pass reads', () => {
    const graphSession = readFileSync(new URL('../composables/useProcessProfile.js', import.meta.url), 'utf8');
    const sync = graphSession.indexOf('useProcessDesignerNodeSync({');
    const preview = graphSession.indexOf('useProcessDesignerPreview({');
    const engine = graphSession.indexOf('useProcessDesignerLiveGraph({');

    expect(sync).toBeGreaterThan(-1);
    expect(preview).toBeGreaterThan(sync);
    // The live watcher runs its first pass immediately; all record and
    // preview bindings it reads must already exist.
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
    const archived = { ...current, _id: 'archived', states: { main: 'ARCHIVED' } };
    const draft = { ...current, _id: 'draft', states: { main: 'DRAFT' } };
    const active = { ...current, _id: 'active', states: { main: 'ACTIVE' } };

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
    const draft = { ...current, _id: 'draft', states: { main: 'DRAFT' } };

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
      bindings: { instanceId: '$assignment.queueId' },
      sources: [{ id: 'queues', typeId: 'queue', mode: 'list', filters: { status: 'READY' }, lineageBindings: [{ lineageKey: 'projectId' }] }],
      regions: [{ id: 'main', slot: 'main', sourceId: 'queues', surface: 'table', actions: [] }]
    });
    const screens = useProcessDesignerScreens({
      draft: ref({ data: { screens: { detail: screen } } }), selectedScreenId: ref('detail'),
      normalizeScreenContract, defaultTypeId: () => 'queue', featureForTypeId: () => 'queues'
    });

    screens.setSourceMode(screen, screen.sources[0], 'single');
    expect(screen.sources[0]).toMatchObject({ mode: 'single', identifier: '$assignment.instanceId', filters: {}, lineageBindings: [] });
    const errors = [];
    validateScreenContract(screen, { screenId: screen.id, entities: new Set(['queue']), errors });
    expect(errors).toEqual([]);
    expect(compileScreens({ detail: screen }).detail.sources[0].identifier).toBe('$assignment.instanceId');
    screens.setSourceMode(screen, screen.sources[0], 'list');
    expect(screen.sources[0]).toMatchObject({ mode: 'list', identifier: null, filters: {}, lineageBindings: [] });
  });

  it('offers no create-a-screen-from-nothing verb — authoring is station customization', () => {
    const designer = readFileSync(new URL('../pages/organization/process.vue', import.meta.url), 'utf8');
    const composable = readFileSync(new URL('../composables/useProcessDesignerScreens.js', import.meta.url), 'utf8');

    expect(designer).not.toContain('addScreen');
    expect(designer).not.toContain('createScreen');
    expect(composable).not.toContain('function add(');
    expect(designer).toContain('customizeStation');
  });

  it('customizes an inferred station by duplicating it into a projection-equal authored override', () => {
    const domain = {
      entities: [{ type: 'queue' }, { type: 'project' }],
      commands: {},
      summaries: [],
      containment: [{ childType: 'queue', parentType: 'project', lineageKey: 'projectId' }]
    };
    const base = {
      roleGrants: { role_operator: [{ feature: 'queues', level: 'write', typeId: 'queue' }] },
      producerOutputs: {},
      graph: { nodes: [], edges: [] },
      actions: {},
      assignments: {}
    };
    const compiled = compileProcessDefinition(base, domain, { roles: { role_operator: { id: 'role_operator' } } });
    const station = compiled.screens.auto_role_operator_queue;
    expect(station).toBeTruthy();
    // A compiled list station carries compile-attached lineage bindings
    // (withCompiledLineage); the authored duplicate must not own them.
    station.sources[0].lineageBindings = [{ childTypeId: 'queue', parentTypeId: 'project', lineageKey: 'projectId' }];

    const draft = ref({ data: {} });
    const selectedScreenId = ref(null);
    const screens = useProcessDesignerScreens({
      draft,
      selectedScreenId,
      normalizeScreenContract,
      defaultTypeId: () => 'queue',
      featureForTypeId: typeId => `${typeId}s`
    });
    const record = screens.customize(station);

    const [id] = Object.keys(draft.value.data.screens);
    expect(record.id).toBe(id);
    expect(record.route).toBe(`/screens/${id}`);
    expect(record.kind).toBe('typeList');
    expect(record.sources[0].lineageBindings).toEqual([]);
    expect(selectedScreenId.value).toBe(id);

    // An untouched duplicate stays projection-equal to inference, so the
    // redundancy guard refuses it at Apply until the author deviates.
    const untouched = { ...base, screens: { [id]: JSON.parse(JSON.stringify(record)) } };
    expect(redundantAuthoredScreens(untouched, domain, compiledRolesFor(untouched, domain))).toEqual([
      { id, roleId: 'role_operator', typeId: 'queue', template: 'typeList' }
    ]);
    record.label = 'Cutting queues';
    const customized = { ...base, screens: { [id]: record } };
    expect(redundantAuthoredScreens(customized, domain, compiledRolesFor(customized, domain))).toEqual([]);
  });
});

function compiledRolesFor(process, domain) {
  const compiled = compileProcessDefinition({ ...process, screens: {} }, domain, {
    roles: { role_operator: { id: 'role_operator' } }
  });
  return compiled.roles;
}
