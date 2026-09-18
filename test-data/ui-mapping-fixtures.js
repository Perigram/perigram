// Synthetic UI-mapping fixtures: a theoretical complex compiler output.
// Pure data, factory-shaped per this directory's conventions — a CTS client
// bundle (compileClientBundle shape), a compiled process contract
// (screens/actions in the packages/processes compiler shape), and an
// instance graph in the CTS stored shape (SPEC §3). Never copied from
// production records.
//
// Consumed by pages/test/ui-mapping.vue and the specs beside it; the mapping
// contract itself lives in shared/ui-mapping (README.md there is canonical).

const ORGANIZATION_ID = 'org-fixture';

// --- CTS client bundle --------------------------------------------------------

function typeRecord(declaration) {
  return {
    id: declaration.id,
    class: declaration.class,
    scope: declaration.scope || 'system',
    version: declaration.version || 1,
    fields: declaration.fields || {},
    payload: declaration.payload || null,
    edges: declaration.edges || {},
    states: declaration.states || {},
    transitions: declaration.transitions || [],
    operators: declaration.operators || {},
    revisions: declaration.revisions || null,
    schema: null,
    render: declaration.render
  };
}

export function createUiMappingClientBundle() {
  return {
    ok: true,
    errors: [],
    organizationId: ORGANIZATION_ID,
    types: [
      typeRecord({
        id: 'material',
        class: 'group',
        fields: {
          grade: { base: 'string' },
          pricePerSheet: { base: 'quantity', unit: 'currency' }
        },
        edges: { children: { parts: { types: ['part'], onRemove: 'restrict' } } },
        render: { label: 'Material', icon: 'pi pi-box' }
      }),
      typeRecord({
        id: 'part',
        class: 'item',
        fields: {
          serial: { base: 'string' },
          thickness: { base: 'quantity', unit: 'mm' },
          finish: {
            base: 'enum',
            values: ['raw', 'ground', 'anodized', 'powder', 'paint', 'brushed', 'polished', 'bead-blast', 'passivated']
          },
          tolerance: {
            base: 'record',
            fields: { nominal: { base: 'quantity', unit: 'mm' }, note: { base: 'string', max: 200 } }
          },
          dueDate: { base: 'instant', nullable: true },
          tags: { base: 'list', itemType: { base: 'string' } },
          mounting: {
            base: 'variant',
            tags: ['bolt', 'weld', 'press'],
            payloads: {
              bolt: { base: 'record', fields: { size: { base: 'quantity', unit: 'mm' } } },
              weld: { base: 'record', fields: { seam: { base: 'string' } } },
              press: { base: 'record', fields: { fit: { base: 'enum', values: ['light', 'tight'] } } }
            }
          },
          machine: { base: 'ref', accepts: ['machine'] }
        },
        edges: { relations: { drawings: { types: ['drawing'], onRemove: 'detach' } } },
        states: { main: { initial: 'draft', values: ['draft', 'approved', 'scrapped'], terminal: ['scrapped'] } },
        transitions: [
          { from: 'draft', to: 'approved', intent: 'approvePart' },
          { from: 'approved', to: 'scrapped', intent: 'scrapPart' },
          { from: 'draft', to: 'scrapped', intent: 'scrapPart' }
        ],
        render: {
          label: 'Part',
          icon: 'pi pi-box',
          states: { approved: { severity: 'success' }, scrapped: { severity: 'danger' } }
        }
      }),
      typeRecord({
        id: 'drawing',
        class: 'file',
        payload: {
          mime: ['image/png', 'application/pdf'],
          accept: ['.png', '.pdf'],
          maxSize: 10 * 1024 * 1024,
          preview: 'image'
        },
        fields: { title: { base: 'string' }, page: { base: 'number', nullable: true } },
        render: { label: 'Drawing', icon: 'pi pi-file' }
      }),
      typeRecord({
        id: 'dxf_model',
        class: 'file',
        payload: { mime: ['application/dxf'], accept: ['.dxf'], preview: 'geometry' },
        fields: { layerCount: { base: 'number' } },
        render: { label: 'DXF model', icon: 'pi pi-objects-column' }
      }),
      typeRecord({
        id: 'report',
        class: 'file',
        payload: { mime: ['application/pdf'], maxSize: 5 * 1024 * 1024, preview: 'attachment' },
        fields: { summary: { base: 'string', max: 500 } },
        render: { label: 'Report', icon: 'pi pi-file-pdf' }
      }),
      typeRecord({
        id: 'machine',
        class: 'item',
        fields: {
          spindleSpeed: { base: 'quantity', unit: 'count' },
          dutyCycle: { base: 'quantity', unit: 'percent' },
          calibratedAt: { base: 'instant' },
          active: { base: 'boolean' }
        },
        states: { main: { initial: 'idle', values: ['idle', 'running', 'maintenance'], terminal: [] } },
        transitions: [
          { from: 'idle', to: 'running' },
          { from: 'running', to: 'idle' },
          { from: 'running', to: 'maintenance' }
        ],
        render: { label: 'Machine', icon: 'pi pi-cog', states: { running: { severity: 'info' } } }
      }),
      typeRecord({
        id: 'nesting_job',
        class: 'process',
        fields: {
          note: { base: 'string', max: 300 },
          priority: { base: 'enum', values: ['low', 'normal', 'high', 'urgent'] },
          operator: { base: 'ref', accepts: ['machine'] },
          params: {
            base: 'list',
            itemType: { base: 'record', fields: { key: { base: 'string' }, value: { base: 'quantity', unit: 'mm' } } }
          }
        },
        states: {
          main: { initial: 'queued', values: ['queued', 'solving', 'done', 'failed'], terminal: ['done', 'failed'] }
        },
        transitions: [
          { from: 'queued', to: 'solving' },
          { from: 'solving', to: 'done' },
          { from: 'solving', to: 'failed' }
        ],
        render: {
          label: 'Nesting job',
          icon: 'pi pi-sparkles',
          states: { done: { severity: 'success' }, failed: { severity: 'danger' } }
        }
      })
    ]
  };
}

// --- Compiled process contract -------------------------------------------------

export function createUiMappingCompiledContract() {
  const actions = {
    part_create: {
      id: 'part_create',
      label: 'Create part',
      actionKind: 'createEntity',
      entityType: 'part',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      construction: { mode: 'generic', inputs: ['serial', 'thickness', 'finish'] }
    },
    part_update: {
      id: 'part_update',
      label: 'Edit part',
      actionKind: 'updateEntity',
      entityType: 'part',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    part_approve: {
      id: 'part_approve',
      label: 'Approve',
      actionKind: 'updateEntity',
      entityType: 'part',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      status: { to: 'approved' }
    },
    part_scrap: {
      id: 'part_scrap',
      label: 'Scrap',
      actionKind: 'updateEntity',
      entityType: 'part',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] },
      status: { to: 'scrapped' }
    },
    part_delete: {
      id: 'part_delete',
      label: 'Delete part',
      actionKind: 'deleteEntity',
      entityType: 'part',
      trigger: { mode: 'manual' },
      access: { level: 'admin', grants: [] }
    },
    drawing_link: {
      id: 'drawing_link',
      label: 'Drawing',
      actionKind: 'link',
      entityType: 'part',
      relation: { key: 'drawings', targetType: 'drawing', cardinality: 'array' },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    drawing_unlink: {
      id: 'drawing_unlink',
      label: 'Unlink drawing',
      actionKind: 'unlink',
      entityType: 'part',
      relation: { key: 'drawings', targetType: 'drawing', cardinality: 'array' },
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    nesting_job_run: {
      id: 'nesting_job_run',
      label: 'Run nesting preview',
      actionKind: 'runCommand',
      commandId: 'nesting.preview',
      entityType: 'nesting_job',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [] }
    },
    part_sync_summary: {
      id: 'part_sync_summary',
      label: 'Sync part summary',
      actionKind: 'updateEntity',
      entityType: 'part',
      trigger: { mode: 'event' },
      access: { level: 'write', grants: [] }
    }
  };

  return {
    processId: 'proc_fixture_v1',
    dataflowVersion: 4,
    roles: {
      operator: { id: 'operator', label: 'Operator', grants: [{ feature: 'parts', level: 'write' }] }
    },
    screens: {
      home_operator: {
        id: 'home_operator',
        screenKey: 'home_operator',
        label: 'Operator home',
        kind: 'route',
        template: 'home',
        route: '/screens/home_operator',
        sourceRoute: '/screens/home_operator',
        placement: 'hub',
        entityType: null,
        required: null,
        roleIds: ['operator'],
        scope: {},
        bindings: {},
        sources: [{ id: 'parts', entityType: 'part', mode: 'list', required: null }],
        regions: [{ id: 'parts', slot: 'main', sourceId: 'parts', surface: 'list', actions: ['part_create'] }],
        actions: ['part_create']
      },
      auto_operator_part: {
        id: 'auto_operator_part',
        screenKey: 'auto_operator_part',
        label: 'Operator part',
        kind: 'entityList',
        template: 'entityList',
        route: '/screens/auto_operator_part',
        sourceRoute: '/screens/auto_operator_part',
        placement: 'hub',
        entityType: 'part',
        required: { feature: 'parts', level: 'read' },
        roleIds: ['operator'],
        scope: {},
        bindings: {},
        sources: [{ id: 'part', entityType: 'part', mode: 'list', required: { feature: 'parts', level: 'read' } }],
        regions: [{ id: 'main', slot: 'main', sourceId: 'part', surface: 'list', actions: ['part_create', 'drawing_link'] }],
        actions: ['part_create', 'drawing_link']
      },
      auto_operator_part_detail: {
        id: 'auto_operator_part_detail',
        screenKey: 'auto_operator_part_detail',
        label: 'Operator part detail',
        kind: 'entityDetail',
        template: 'entityDetail',
        route: '/screens/auto_operator_part_detail',
        sourceRoute: '/screens/auto_operator_part_detail',
        placement: 'detail',
        entityType: 'part',
        required: { feature: 'parts', level: 'read' },
        roleIds: ['operator'],
        scope: { entityId: null },
        bindings: {},
        sources: [
          { id: 'part', entityType: 'part', mode: 'single', required: { feature: 'parts', level: 'read' }, identifier: '$screen.scope.entityId' },
          { id: 'drawings', entityType: 'drawing', mode: 'list', required: null }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'part', surface: 'detail', actions: ['part_update', 'part_approve', 'part_scrap', 'part_delete', 'drawing_link'] },
          { id: 'drawings', slot: 'children', sourceId: 'drawings', surface: 'list', actions: ['drawing_link'] }
        ],
        actions: ['part_update', 'part_approve', 'part_scrap', 'part_delete', 'drawing_link', 'drawing_unlink']
      },
      auto_operator_material_detail: {
        id: 'auto_operator_material_detail',
        screenKey: 'auto_operator_material_detail',
        label: 'Operator material detail',
        kind: 'entityDetail',
        template: 'entityDetail',
        route: '/screens/auto_operator_material_detail',
        sourceRoute: '/screens/auto_operator_material_detail',
        placement: 'detail',
        entityType: 'material',
        required: null,
        roleIds: ['operator'],
        scope: { entityId: null },
        bindings: {},
        sources: [
          { id: 'material', entityType: 'material', mode: 'single', required: null, identifier: '$screen.scope.entityId' },
          { id: 'parts', entityType: 'part', mode: 'list', required: null }
        ],
        regions: [
          { id: 'main', slot: 'main', sourceId: 'material', surface: 'detail', actions: [] },
          { id: 'parts', slot: 'children', sourceId: 'parts', surface: 'list', actions: ['part_create'] }
        ],
        actions: ['part_create']
      }
    },
    actions,
    navigation: [{ label: 'Parts', screenKey: 'auto_operator_part', icon: 'pi pi-box' }]
  };
}

// --- Instances (CTS stored shape, SPEC §3) --------------------------------------

export function createDrawingInstance(overrides = {}) {
  return {
    id: 'drawing-1',
    type: 'drawing',
    typeVersion: 1,
    fields: { title: 'Bracket rev B', page: 2 },
    lineage: {},
    relations: {},
    states: {},
    payload: { fileId: 'gridfs-drawing-1', mime: 'image/png', size: 240_000 },
    ...overrides
  };
}

export function createPartInstance(overrides = {}) {
  return {
    id: 'part-1',
    type: 'part',
    typeVersion: 1,
    fields: {
      serial: 'BRK-0001',
      thickness: { value: 6, unit: 'mm' },
      finish: 'anodized',
      tolerance: { nominal: { value: 0.1, unit: 'mm' }, note: 'ISO 2768 medium band applies across the milled face.' },
      dueDate: null,
      tags: ['bracket', 'proto'],
      mounting: { tag: 'bolt', value: { size: { value: 8, unit: 'mm' } } },
      machine: { type: 'machine', id: 'machine-1' }
    },
    lineage: { parts: { type: 'material', id: 'material-1' } },
    relations: { drawings: [] },
    states: { main: 'draft' },
    payload: null,
    ...overrides
  };
}

export function createMaterialInstance(overrides = {}) {
  return {
    id: 'material-1',
    type: 'material',
    typeVersion: 1,
    fields: { grade: 'EN AW-5754', pricePerSheet: { value: 89.5, unit: 'currency' } },
    lineage: {},
    relations: {},
    states: {},
    payload: null,
    ...overrides
  };
}

export function createMachineInstance(overrides = {}) {
  return {
    id: 'machine-1',
    type: 'machine',
    typeVersion: 1,
    fields: {
      spindleSpeed: { value: 18000, unit: 'count' },
      dutyCycle: { value: 72, unit: 'percent' },
      calibratedAt: '2026-08-30T09:00:00.000Z',
      active: true
    },
    lineage: {},
    relations: {},
    states: { main: 'running' },
    payload: null,
    ...overrides
  };
}

export function createNestingJobInstance(overrides = {}) {
  return {
    id: 'job-1',
    type: 'nesting_job',
    typeVersion: 1,
    fields: {
      note: 'Batch 42 nesting preview with full-sheet utilisation target and remnant fallback.',
      priority: 'high',
      operator: { type: 'machine', id: 'machine-1' },
      params: [
        { key: 'kerf', value: { value: 0.2, unit: 'mm' } },
        { key: 'margin', value: { value: 5, unit: 'mm' } }
      ]
    },
    lineage: {},
    relations: {},
    states: { main: 'solving' },
    payload: null,
    ...overrides
  };
}

// The nested-showcase graph: one group whose four items carry 0, 1, 3, and 8
// related files — the variable-cardinality case budgets exist for.
export function createUiMappingInstances() {
  const drawings = Array.from({ length: 8 }, (_, index) => createDrawingInstance({
    id: `drawing-${index + 1}`,
    fields: { title: `Sheet ${index + 1} rev A`, page: index + 1 },
    payload: { fileId: `gridfs-drawing-${index + 1}`, mime: index % 3 === 2 ? 'application/pdf' : 'image/png', size: 90_000 + index * 10_000 }
  }));

  const partStates = ['draft', 'approved', 'scrapped', 'draft'];
  const parts = [0, 1, 3, 8].map((drawingCount, index) => createPartInstance({
    id: `part-${index + 1}`,
    fields: {
      ...createPartInstance().fields,
      serial: `BRK-000${index + 1}`,
      finish: ['raw', 'anodized', 'polished', 'powder'][index],
      mounting: [
        { tag: 'bolt', value: { size: { value: 8, unit: 'mm' } } },
        { tag: 'weld', value: { seam: 'continuous outer seam' } },
        { tag: 'press', value: { fit: 'tight' } },
        { tag: 'bolt', value: { size: { value: 12, unit: 'mm' } } }
      ][index]
    },
    relations: { drawings: drawings.slice(0, drawingCount).map(drawing => ({ type: 'drawing', id: drawing.id })) },
    states: { main: partStates[index] }
  }));

  return {
    materials: [createMaterialInstance()],
    parts,
    drawings: [
      ...drawings,
      createDrawingInstance({
        id: 'drawing-dxf-1',
        type: 'dxf_model',
        fields: { layerCount: 6 },
        payload: { fileId: 'gridfs-dxf-1', mime: 'application/dxf', size: 480_000 }
      }),
      createDrawingInstance({
        id: 'report-1',
        type: 'report',
        fields: { summary: 'Monthly utilisation report covering nesting density, remnant reuse, and saw-time distribution across lines.' },
        payload: { fileId: 'gridfs-report-1', mime: 'application/pdf', size: 1_200_000 }
      })
    ],
    machines: [
      createMachineInstance(),
      createMachineInstance({ id: 'machine-2', states: { main: 'idle' }, fields: { ...createMachineInstance().fields, active: false } })
    ],
    jobs: [createNestingJobInstance()]
  };
}
