export const cncEntities = [
  { type: 'artifact', collection: 'artifacts', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'cassette', collection: 'cassettes', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'cassette_design', collection: 'cassette_designs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'cassette_instance', collection: 'cassette_instances', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'catalog', collection: 'catalogs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'] },
  { type: 'color', collection: 'colors', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'layer_standard', collection: 'layer_standards', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'material', collection: 'materials', blocks: ['identity', 'origin', 'status', 'attachments', 'data'] },
  { type: 'material_pile', collection: 'material_piles', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'nesting_run', collection: 'nesting_runs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'organization', collection: 'organizations', blocks: ['identity', 'origin', 'status', 'attachments', 'data'] },
  { type: 'pen_template', collection: 'pen_templates', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'project', collection: 'projects', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'] },
  { type: 'queue', collection: 'queues', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'] },
  { type: 'remnant', collection: 'remnants', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'requisition', collection: 'requisitions', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'sheet', collection: 'sheets', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'specs'] },
  { type: 'sheet_design', collection: 'sheet_designs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'tool_profile', collection: 'tool_profiles', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'user', collection: 'users', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'warehouse', collection: 'warehouses', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'] }
];

export const cncWorkflows = {
  project: {
    initial: 'DRAFT',
    states: { DRAFT: { canUpdateMeta: true }, ACTIVE: { canUpdateMeta: true }, CLOSED: { isTerminal: true, canUpdateMeta: false } },
    transitions: [
      { from: 'DRAFT', to: 'ACTIVE', access: { permissions: [{ feature: 'projects', level: 'write' }] } },
      { from: 'ACTIVE', to: 'CLOSED', display: 'menu', access: { permissions: [{ feature: 'projects', level: 'admin' }] }, hooks: [{ handler: 'propagateToChildren', params: { childType: 'queue', childState: 'CLOSED' } }] },
      { from: 'ACTIVE', to: 'DRAFT', access: { permissions: [{ feature: 'projects', level: 'admin' }] } },
      { from: 'DRAFT', to: 'DRAFT', access: { permissions: [{ feature: 'projects', level: 'write' }] } },
      { from: 'ACTIVE', to: 'ACTIVE', access: { permissions: [{ feature: 'projects', level: 'write' }] } }
    ]
  },
  queue: {
    initial: 'DRAFT',
    states: { DRAFT: { canUpdateMeta: true }, NESTING: { canUpdateMeta: true }, READY: { canUpdateMeta: true }, CUT: { isTerminal: true, canUpdateMeta: false }, CLOSED: { isTerminal: true, canUpdateMeta: false } },
    transitions: [
      { from: 'DRAFT', to: 'NESTING', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'READY', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'READY', to: 'CUT', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }, { handler: 'processPhysicalCut' }] },
      { from: 'READY', to: 'CLOSED', display: 'menu', access: { permissions: [{ feature: 'queues', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'DRAFT', access: { permissions: [{ feature: 'queues', level: 'admin' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'READY', to: 'DRAFT', access: { permissions: [{ feature: 'queues', level: 'admin' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'CLOSED', to: 'DRAFT', access: { permissions: [{ feature: 'queues', level: 'admin' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'DRAFT', to: 'DRAFT', access: { permissions: [{ feature: 'queues', level: 'write' }] } },
      { from: 'NESTING', to: 'NESTING', access: { system: true } },
      { from: 'READY', to: 'READY', access: { permissions: [{ feature: 'queues', level: 'write' }] } }
    ]
  },
  nesting_run: {
    initial: 'NESTING',
    states: { NESTING: { canUpdateMeta: true }, COMPLETE: { canUpdateMeta: true }, ERROR: { isTerminal: true, canUpdateMeta: true }, CHOSEN: { isTerminal: true, canUpdateMeta: false }, REJECTED: { isTerminal: true, canUpdateMeta: false } },
    transitions: [
      { from: 'NESTING', to: 'COMPLETE', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'ERROR', access: { system: true }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'COMPLETE', to: 'CHOSEN', access: { permissions: [{ feature: 'nesting_runs', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }, { handler: 'createPhysicalUnits' }] },
      { from: 'COMPLETE', to: 'REJECTED', display: 'menu', access: { permissions: [{ feature: 'nesting_runs', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'CHOSEN', to: 'COMPLETE', access: { permissions: [{ feature: 'nesting_runs', level: 'write' }] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'NESTING', access: { system: true } },
      { from: 'COMPLETE', to: 'COMPLETE', access: { permissions: [{ feature: 'nesting_runs', level: 'write' }] } },
      { from: 'ERROR', to: 'ERROR', access: { system: true } }
    ]
  },
  cassette: {
    initial: 'ACTIVE',
    states: { ACTIVE: { canUpdateMeta: true }, ARCHIVED: { isTerminal: true } },
    transitions: [{ from: 'ACTIVE', to: 'ARCHIVED', display: 'menu', access: { permissions: [{ feature: 'cassettes', level: 'admin' }] } }]
  },
  sheet: {
    initial: 'AVAILABLE',
    states: {
      AVAILABLE: { canUpdateMeta: true },
      'IN-CUTTING': { canUpdateMeta: true },
      MILLED: { canUpdateMeta: true, canUpdateLifecycle: true, lifecycle: { actors: ['operator'], attachments: { geometry: { multiple: false }, photos: { multiple: true } }, data: true } },
      SCRAP: { isTerminal: true, canUpdateMeta: true, canUpdateLifecycle: true, lifecycle: { actors: ['operator'], attachments: { photos: { multiple: true } }, data: true } }
    },
    transitions: [
      { from: 'AVAILABLE', to: 'IN-CUTTING', access: { permissions: [{ feature: 'materials', level: 'write' }] } },
      { from: 'IN-CUTTING', to: 'MILLED', access: { permissions: [{ feature: 'materials', level: 'write' }], capabilities: ['operator'] } },
      { from: 'AVAILABLE', to: 'SCRAP', display: 'menu', access: { permissions: [{ feature: 'materials', level: 'write' }] } },
      { from: 'IN-CUTTING', to: 'SCRAP', display: 'menu', access: { permissions: [{ feature: 'materials', level: 'write' }] } }
    ]
  },
  cassette_instance: {
    initial: 'PRODUCED',
    states: {
      PRODUCED: { canUpdateLifecycle: true, lifecycle: { actors: ['engineering', 'operator', 'mounting'], attachments: { geometry: { multiple: false }, photos: { multiple: true } }, data: true } },
      MILLED: { canUpdateLifecycle: true, lifecycle: { actors: ['engineering', 'operator', 'mounting'], attachments: { geometry: { multiple: false }, photos: { multiple: true } }, data: true } },
      INSTALLED: { canUpdateLifecycle: true, lifecycle: { actors: ['mounting'], attachments: { geometry: { multiple: false }, photos: { multiple: true } }, data: true } }
    },
    transitions: [
      { from: 'PRODUCED', to: 'MILLED', access: { permissions: [{ feature: 'projects', level: 'write' }], capabilities: ['operator'] }, hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'MILLED', to: 'INSTALLED', access: { permissions: [{ feature: 'projects', level: 'write' }], capabilities: ['mounting'] }, hooks: [{ handler: 'triggerAggregator' }] }
    ]
  },
  requisition: {
    initial: 'DRAFT',
    states: { DRAFT: {}, SENT: {}, APPROVED: {}, FULFILLED: { isTerminal: true }, REJECTED: { isTerminal: true } },
    transitions: [
      { from: 'DRAFT', to: 'SENT', access: { permissions: [{ feature: 'requisitions', level: 'write' }] } },
      { from: 'SENT', to: 'APPROVED', access: { permissions: [{ feature: 'requisitions', level: 'admin' }] } },
      { from: 'SENT', to: 'REJECTED', display: 'menu', access: { permissions: [{ feature: 'requisitions', level: 'admin' }] } },
      { from: 'APPROVED', to: 'FULFILLED', access: { permissions: [{ feature: 'requisitions', level: 'admin' }] } }
    ]
  }
};

export const cncOperations = {
  'nesting.run': {
    id: 'nesting.run',
    label: 'Run nesting',
    input: {
      entities: [{ name: 'queue', type: 'queue', required: true }],
      data: true
    },
    output: {
      entities: ['nesting_run'],
      artifacts: ['LAYOUT_DXF', 'PDF_PASSPORT'],
      jobs: ['nesting_job']
    },
    access: {
      permissions: [
        { feature: 'queues', level: 'write' },
        { feature: 'nesting_runs', level: 'write' },
        { feature: 'artifacts', level: 'write' }
      ]
    }
  }
};

export const cncSummaries = [
  { entityType: 'queue', parentType: 'project', parentIdKey: 'projectId', countField: 'queueCount' },
  { entityType: 'cassette_instance', parentType: 'project', parentIdKey: 'projectId', countField: 'instanceCount' },
  { entityType: 'nesting_run', parentType: 'queue', parentIdKey: 'queueId', countField: 'runCount' },
  { entityType: 'sheet', parentType: 'queue', parentIdKey: 'queueId', countField: 'sheetCount', sumFields: { area: 'totalArea' } },
  { entityType: 'color', parentType: 'catalog', parentIdKey: 'catalogId', countField: 'colorCount' }
];

export const cncFrontendEntities = [
  { type: 'material', collection: 'materials', routes: { single: '/api/materials/:id', list: '/api/materials' } },
  { type: 'project', collection: 'projects', routes: { single: '/api/project/:id', list: '/api/project' } },
  { type: 'queue', collection: 'queues', routes: { single: '/api/queue/:id', list: '/api/queues' } },
  { type: 'requisition', collection: 'requisitions', routes: { single: '/api/requisitions/:id', list: '/api/requisitions' } },
  { type: 'batch', collection: 'material-piles', routes: { single: '/api/material-piles/:id', list: '/api/material-piles' } },
  { type: 'pile', collection: 'material-piles', routes: { single: '/api/material-piles/:id', list: '/api/material-piles' } },
  { type: 'sheet', collection: 'sheets', routes: { single: '/api/sheets/:id', list: '/api/sheets' } },
  { type: 'remnant', collection: 'remnants', routes: { single: '/api/remnants/:id', list: '/api/remnants' } },
  { type: 'cassetteInstance', collection: 'cassette-instances', routes: { single: '/api/cassette-instances/:id', list: '/api/cassette-instances' } },
  { type: 'cassetteDesign', collection: 'cassette-designs', routes: { single: '/api/cassette-designs/:id', list: '/api/cassette-designs' } },
  { type: 'sheetDesign', collection: 'sheet-designs', routes: { single: '/api/sheet-designs/:id', list: '/api/sheet-designs' } },
  { type: 'artifact', collection: 'artifacts', routes: { single: '/api/artifacts/:id', list: '/api/artifacts' } },
  { type: 'catalog', collection: 'catalogs', routes: { single: '/api/catalogs/:id', list: '/api/catalogs' } },
  { type: 'color', collection: 'colors', routes: { single: '/api/colors/:id', list: '/api/colors' } },
  { type: 'warehouse', collection: 'warehouses', routes: { single: '/api/warehouses/:id', list: '/api/warehouses' } },
  { type: 'user', collection: 'users', routes: { single: '/api/users/:id', list: '/api/users' } },
  { type: 'organization', collection: 'organizations', routes: { single: '/api/organizations/:id', list: '/api/organizations' } },
  { type: 'nestingRun', collection: 'nesting-runs', routes: { single: '/api/nesting-runs/:id', list: '/api/nesting-runs' } }
];
