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

export const cncServiceContracts = {
  nesting: {
    service: 'nesting',
    label: 'Nesting service',
    inputs: ['queue', 'sheet', 'remnant', 'tool_profile'],
    outputs: ['nesting_run', 'sheet_design'],
    actions: ['solveNesting'],
    triggers: ['queue.nestingRequested']
  },
  artifacts: {
    service: 'artifacts',
    label: 'Artifacts service',
    inputs: ['sheet_design', 'nesting_run', 'cassette_design', 'cassette_instance'],
    outputs: ['artifact'],
    actions: ['generateArtifact'],
    triggers: ['artifact.generationRequested']
  },
  cassettes: {
    service: 'cassettes',
    label: 'Cassette template service',
    inputs: ['cassette'],
    outputs: ['cassette', 'cassette_design'],
    actions: ['saveCassetteTemplate'],
    triggers: ['cassette.templateSaved']
  }
};

export const cncOperations = {
  saveCassetteTemplate: {
    id: 'saveCassetteTemplate',
    service: 'cassettes',
    action: 'saveTemplate',
    label: 'Save cassette template',
    input: {
      entities: [{ name: 'cassette', type: 'cassette' }],
      parameters: [
        { name: 'name', label: 'Name', type: 'string', required: true },
        { name: 'type', label: 'Template type', type: 'enum', options: ['PARAMETRIC', 'STANDARD'], default: 'PARAMETRIC' },
        { name: 'definition', label: 'Designer definition', type: 'object', required: true },
        { name: 'parameters', label: 'Parameters', type: 'array', default: [] }
      ]
    },
    triggers: [{ event: 'cassette.templateSaved' }],
    output: {
      entities: ['cassette'],
      processes: ['cassette.bakeTemplate'],
      events: ['cassette.templateSaved']
    },
    access: {
      permissions: [{ feature: 'cassettes', level: 'write' }]
    }
  },
  solveNesting: {
    id: 'solveNesting',
    service: 'nesting',
    action: 'solve',
    label: 'Solve nesting',
    input: {
      entities: [{ name: 'queue', type: 'queue', required: true }],
      parameters: [
        { name: 'materialMode', label: 'Material mode', type: 'enum', options: ['VIRTUAL', 'INVENTORY'], default: 'VIRTUAL' },
        { name: 'width', label: 'Sheet width', type: 'number', default: 1220, min: 1, unit: 'mm' },
        { name: 'height', label: 'Sheet height', type: 'number', default: 2440, min: 1, unit: 'mm' },
        { name: 'spacing', label: 'Spacing', type: 'number', default: 5, min: 0, unit: 'mm' },
        { name: 'sheet_polygon', label: 'Sheet polygon', type: 'object', display: 'hidden', source: 'scenario.sheetSource.geometry' },
        { name: 'inventoryItems', label: 'Inventory items', type: 'array', default: [], display: 'hidden', source: 'scenario.inventorySource.items' },
        { name: 'toolProfileId', label: 'Tool profile', type: 'entityId', entityType: 'tool_profile' }
      ]
    },
    triggers: [{ event: 'queue.nestingRequested' }],
    output: {
      entities: ['nesting_run', 'sheet_design'],
      jobs: ['process_run'],
      events: ['nesting.solveStarted', 'nesting.solveCompleted', 'nesting.solveFailed']
    },
    access: {
      permissions: [
        { feature: 'queues', level: 'write' },
        { feature: 'nesting_runs', level: 'write' }
      ]
    }
  },
  generateArtifact: {
    id: 'generateArtifact',
    service: 'artifacts',
    action: 'generate',
    label: 'Generate artifact',
    input: {
      entities: [
        { name: 'sheetDesign', type: 'sheet_design' },
        { name: 'nestingRun', type: 'nesting_run' }
      ],
      parameters: [
        { name: 'type', label: 'Artifact type', type: 'enum', options: ['LAYOUT_DXF', 'PDF_PASSPORT'], required: true },
        { name: 'pdfTemplateId', label: 'PDF template', type: 'string', display: 'hidden', source: 'artifactTemplate' }
      ]
    },
    triggers: [{ event: 'artifact.generationRequested' }],
    output: {
      artifacts: ['LAYOUT_DXF', 'PDF_PASSPORT'],
      events: ['artifact.generationQueued', 'artifact.generationCompleted', 'artifact.generationFailed']
    },
    access: {
      permissions: [
        { feature: 'artifacts', level: 'write' }
      ]
    }
  }
};

export const cncServiceActions = cncOperations;

export const cncProcesses = {
  dxfParseUpload: {
    id: 'dxf.parseUpload',
    service: 'files',
    label: 'Parse uploaded DXF',
    executor: { type: 'worker', target: 'file-processing' },
    input: {
      entities: [{ name: 'upload', type: 'artifact', required: true }],
      parameters: [
        { name: 'workerTag', label: 'Worker tag', type: 'string', default: 'normal' }
      ]
    },
    output: {
      artifacts: ['DXF_SOURCE', 'SVG_PREVIEW'],
      data: ['layers', 'geometry', 'entityCount']
    }
  },
  cassetteBakeTemplate: {
    id: 'cassette.bakeTemplate',
    service: 'cassettes',
    label: 'Bake cassette template',
    executor: { type: 'worker', target: 'cassette-processing' },
    input: {
      entities: [{ name: 'cassette', type: 'cassette', required: true }],
      parameters: [
        { name: 'parameters', label: 'Template parameters', type: 'object', default: {} }
      ]
    },
    output: {
      entities: ['cassette_design'],
      artifacts: ['CASSETTE_DXF'],
      data: ['geometry']
    }
  },
  nestingSolve: {
    id: 'nesting.solve',
    service: 'nesting',
    label: 'Solve nesting',
    executor: { type: 'http', target: 'nesting-worker', endpoint: '/nest' },
    input: cncOperations.solveNesting.input,
    output: {
      entities: ['nesting_run', 'sheet_design'],
      artifacts: ['LAYOUT_DXF', 'LAYOUT_SVG'],
      jobs: ['process_run'],
      events: ['nesting.solveStarted', 'nesting.solveCompleted', 'nesting.solveFailed']
    }
  },
  artifactGenerate: {
    id: 'artifact.generate',
    service: 'artifacts',
    label: 'Generate artifact',
    executor: { type: 'server', target: 'artifacts' },
    input: cncOperations.generateArtifact.input,
    output: cncOperations.generateArtifact.output
  }
};

export const cncHookContracts = {
  triggerAggregator: {
    id: 'triggerAggregator',
    label: 'Trigger parent summary aggregator',
    parameters: []
  },
  propagateToChildren: {
    id: 'propagateToChildren',
    label: 'Propagate status to child entities',
    parameters: [
      { name: 'childType', label: 'Child type', type: 'entityType', required: true },
      { name: 'childState', label: 'Child state', type: 'workflowState', required: true, dependsOn: 'childType' }
    ]
  },
  processPhysicalCut: {
    id: 'processPhysicalCut',
    label: 'Process physical cut',
    parameters: []
  },
  createPhysicalUnits: {
    id: 'createPhysicalUnits',
    label: 'Create physical units',
    parameters: []
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
  { type: 'artifact', collection: 'artifacts', routes: { single: '/api/artifacts/:id/metadata', download: '/api/artifacts/:id', list: '/api/artifacts' } },
  { type: 'catalog', collection: 'catalogs', routes: { single: '/api/catalogs/:id', list: '/api/catalogs' } },
  { type: 'color', collection: 'colors', routes: { single: '/api/colors/:id', list: '/api/colors' } },
  { type: 'warehouse', collection: 'warehouses', routes: { single: '/api/warehouses/:id', list: '/api/warehouses' } },
  { type: 'user', collection: 'users', routes: { single: '/api/users/:id', list: '/api/users' } },
  { type: 'organization', collection: 'organizations', routes: { single: '/api/organizations/:id', list: '/api/organizations' } },
  { type: 'nestingRun', collection: 'nesting-runs', routes: { single: '/api/nesting-runs/:id', list: '/api/nesting-runs' } }
];

export const cncArtifactTypes = {
  DXF_SOURCE: {
    type: 'DXF_SOURCE',
    bucket: 'userDxf',
    mimeType: 'application/dxf',
    preview: { kind: 'download' }
  },
  SVG_PREVIEW: {
    type: 'SVG_PREVIEW',
    bucket: 'userDxfFilesSvg',
    mimeType: 'image/svg+xml',
    preview: { kind: 'svg' }
  },
  CASSETTE_DXF: {
    type: 'CASSETTE_DXF',
    bucket: 'cassettes',
    mimeType: 'application/dxf',
    preview: { kind: 'download' }
  },
  LAYOUT_DXF: {
    type: 'LAYOUT_DXF',
    bucket: 'nestDxf',
    mimeType: 'application/dxf',
    preview: { kind: 'dxf' }
  },
  LAYOUT_SVG: {
    type: 'LAYOUT_SVG',
    bucket: 'nestSvg',
    mimeType: 'image/svg+xml',
    preview: { kind: 'svg' }
  },
  PDF_PASSPORT: {
    type: 'PDF_PASSPORT',
    bucket: 'artifacts',
    mimeType: 'application/pdf',
    preview: { kind: 'pdf' }
  }
};

export const cncStatusUi = {
  DRAFT: { label: 'status.draft', severity: 'info', icon: 'pi pi-pencil' },
  NESTING: { label: 'status.nesting', severity: 'warn', icon: 'pi pi-cog' },
  READY: { label: 'status.ready', severity: 'success', icon: 'pi pi-check' },
  CUT: { label: 'status.cut', severity: 'success', icon: 'pi pi-scissors' },
  CLOSED: { label: 'status.closed', severity: 'secondary', icon: 'pi pi-lock' },
  ARCHIVED: { label: 'status.archived', severity: 'secondary', icon: 'pi pi-archive' },
  COMPLETE: { label: 'status.complete', severity: 'success', icon: 'pi pi-check-circle' },
  ERROR: { label: 'status.error', severity: 'danger', icon: 'pi pi-times-circle' },
  CHOSEN: { label: 'status.chosen', severity: 'success', icon: 'pi pi-star' },
  ACTIVE: { label: 'status.active', severity: 'success', icon: 'pi pi-check-circle' },
  AVAILABLE: { label: 'status.available', severity: 'success', icon: 'pi pi-box' },
  'IN-CUTTING': { label: 'status.inCutting', severity: 'warn', icon: 'pi pi-scissors' },
  MILLED: { label: 'status.milled', severity: 'success', icon: 'pi pi-check-square' },
  SENT: { label: 'status.sent', severity: 'info', icon: 'pi pi-send' },
  APPROVED: { label: 'status.approved', severity: 'success', icon: 'pi pi-check-circle' },
  FULFILLED: { label: 'status.fulfilled', severity: 'success', icon: 'pi pi-box' },
  REJECTED: { label: 'status.rejected', severity: 'danger', icon: 'pi pi-times-circle' },
  PRODUCED: { label: 'status.produced', severity: 'info', icon: 'pi pi-box' },
  INSTALLED: { label: 'status.installed', severity: 'success', icon: 'pi pi-check' },
  GENERATING: { label: 'status.generating', severity: 'warn', icon: 'pi pi-spin pi-cog' },
  FAILED: { label: 'status.error', severity: 'danger', icon: 'pi pi-times-circle' },
  SCRAP: { label: 'status.scrap', severity: 'danger', icon: 'pi pi-trash' }
};

export const cncDesignSystemVariants = ['card', 'compact', 'inline'];

export const cncDesignSystemGroups = [
  { id: 'production', labelKey: 'uiLab.groups.production' },
  { id: 'material', labelKey: 'uiLab.groups.material' },
  { id: 'master', labelKey: 'uiLab.groups.master' },
  { id: 'system', labelKey: 'uiLab.groups.system' }
];

export const cncDesignSystemPrimitives = [
  { key: 'EntityCard', kind: 'entity-chrome', componentPath: 'components/shared/EntityCard.vue', purpose: 'Standard entity card chrome with identity, optional trace, optional status, content, and footer slots.', docs: ['components/shared/README.md'] },
  { key: 'EntityPage', kind: 'entity-layout', componentPath: 'components/shared/EntityPage.vue', purpose: 'Standard detail-page shell with trace, identity, status, info, actions, body, and sidebar slots.', docs: ['components/shared/README.md'] },
  { key: 'IdentityBlock', kind: 'block', componentPath: 'components/shared/blocks/IdentityBlock.vue', purpose: 'Canonical identity rendering for names, slugs, serials, references, and inline trace labels.', docs: ['components/shared/README.md'] },
  { key: 'DataBlock', kind: 'block', componentPath: 'components/shared/blocks/DataBlock.vue', purpose: 'Canonical label/value rows for generated entity data fields.', docs: ['components/shared/README.md', 'utils/README.md'] },
  { key: 'SpecsBlock', kind: 'block', componentPath: 'components/shared/blocks/SpecsBlock.vue', purpose: 'Canonical width, length, area, and thickness display for entities with specs.', docs: ['components/shared/README.md'] },
  { key: 'StatusBadge', kind: 'status', componentPath: 'components/shared/blocks/StatusBadge.vue', purpose: 'Read-only status tag using the shared status mapping.', docs: ['components/shared/README.md', 'utils/README.md'] },
  { key: 'EntityStatus', kind: 'status', componentPath: 'components/shared/status/EntityStatus.vue', purpose: 'Interactive status display and workflow-derived transition actions.', docs: ['components/shared/README.md', 'utils/README.md'] },
  { key: 'StatusLocation', kind: 'status', componentPath: 'components/shared/status/StatusLocation.vue', purpose: 'Typed current lifecycle location rendering from status.lifecycle.data.location.', docs: ['components/shared/README.md', 'docs/DESIGN_SYSTEM.md'] },
  { key: 'StatusHistory', kind: 'status', componentPath: 'components/shared/status/StatusHistory.vue', purpose: 'Status audit timeline for entity lifecycle events.', docs: ['components/shared/README.md'] },
  { key: 'GeometryPreview', kind: 'block', componentPath: 'components/shared/GeometryPreview.vue', purpose: 'Token-backed SVG preview for DXF layers and polygon geometry stored in data.geometry.preview.', docs: ['components/shared/README.md', 'docs/DESIGN_SYSTEM.md'] },
  { key: 'TraceLink', kind: 'trace', componentPath: 'components/shared/links/TraceLink.vue', purpose: 'Single related-entity link used inside rows, status locations, and custom relation fields; TraceChain is for full ancestry.', docs: ['components/shared/README.md'] },
  { key: 'TraceChain', kind: 'trace', componentPath: 'components/shared/links/TraceChain.vue', purpose: 'Canonical lineage breadcrumb chain for entity ancestry.', docs: ['components/shared/README.md'] },
  { key: 'ActionToolbar', kind: 'layout', componentPath: 'components/shared/ActionToolbar.vue', purpose: 'Shared section/header action row used by hubs, tabs, and list pages instead of ad hoc header flex markup.', docs: ['components/shared/README.md'] },
  { key: 'ResponsiveGrid', kind: 'layout', componentPath: 'components/shared/ResponsiveGrid.vue', purpose: 'Token-backed responsive repeated-item grid.', docs: ['components/shared/README.md'] },
  { key: 'StateBlock', kind: 'layout', componentPath: 'components/shared/StateBlock.vue', purpose: 'Standard loading, empty, and error states.', docs: ['components/shared/README.md'] },
  { key: 'TableFrame', kind: 'layout', componentPath: 'components/shared/TableFrame.vue', purpose: 'Standard token-backed frame for PrimeVue DataTable surfaces, including table header background.', docs: ['components/shared/README.md'] },
  { key: 'StandardDialog', kind: 'layout', componentPath: 'components/shared/StandardDialog.vue', purpose: 'Standard modal shell with footer and responsive sizing.', docs: ['components/shared/README.md'] },
  { key: 'StandardPage', kind: 'layout', componentPath: 'components/shared/StandardPage.vue', purpose: 'Standard page shell with header and breadcrumbs.', docs: ['components/shared/README.md'] }
];

const workflowStatus = (entityType) => cncWorkflows[entityType] ? 'interactive' : 'hidden';

export const cncDesignSystemEntityContracts = [
  ['project', 'project', 'production', 'entities.project', 'project', 'createMockProject', workflowStatus('project'), true, ['components/entities/Project/README.md', 'server/features/projects/README.md']],
  ['queue', 'queue', 'production', 'entities.queue', 'queue', 'createMockQueue', workflowStatus('queue'), true, ['server/features/queues/README.md']],
  ['nestingRun', 'nesting_run', 'production', 'entities.nestingRun', 'run', 'createMockNestingRun', workflowStatus('nesting_run'), true, ['server/features/nesting-runs/README.md']],
  ['sheetDesign', 'sheet_design', 'production', 'entities.sheetDesign', 'design', 'createMockSheetDesign', workflowStatus('sheet_design'), true, ['server/features/sheet-designs/README.md']],
  ['cassette', 'cassette', 'production', 'entities.cassette', 'cassette', 'createMockCassette', workflowStatus('cassette'), true, ['components/entities/Cassette/README.md', 'server/features/cassettes/README.md']],
  ['cassetteDesign', 'cassette_design', 'production', 'entities.cassetteDesign', 'design', 'createMockCassetteDesign', 'hidden', true, ['server/features/cassette-designs/README.md']],
  ['cassetteTemplate', 'cassette_template', 'production', 'entities.cassetteTemplate', 'template', 'createMockCassetteTemplate', 'hidden', true, ['server/features/cassettes/README.md']],
  ['cassetteInstance', 'cassette_instance', 'production', 'entities.cassetteInstance', 'instance', 'createMockCassetteInstance', workflowStatus('cassette_instance'), true, ['server/features/cassette-instances/README.md']],
  ['requisition', 'requisition', 'production', 'entities.requisition', 'requisition', 'createMockRequisition', workflowStatus('requisition'), true, ['server/features/requisitions/README.md']],
  ['material', 'material', 'material', 'entities.material', 'material', 'createMockMaterial', 'hidden', false, ['components/entities/Material/README.md', 'server/DATA_MODEL.md']],
  ['materialPile', 'material_pile', 'material', 'entities.materialPile', 'pile', 'createMockPile', workflowStatus('material_pile'), true, ['components/entities/MaterialPile/README.md', 'server/features/material-piles/README.md']],
  ['batchPile', 'material_pile', 'material', 'entities.batchPile', 'pile', 'createMockBatchPile', workflowStatus('material_pile'), true, ['components/entities/BatchPile/README.md', 'server/features/material-piles/README.md']],
  ['sheet', 'sheet', 'material', 'entities.sheet', 'sheet', 'createMockSheet', workflowStatus('sheet'), true, ['server/features/sheets/README.md']],
  ['remnant', 'remnant', 'material', 'entities.remnant', 'remnant', 'createMockRemnant', workflowStatus('remnant'), true, ['server/features/remnants/README.md']],
  ['catalog', 'catalog', 'master', 'entities.catalog', 'catalog', 'createMockCatalog', 'hidden', true, ['server/features/catalogs/README.md']],
  ['color', 'color', 'master', 'entities.color', 'color', 'createMockColor', 'hidden', true, ['server/features/colors/README.md']],
  ['warehouse', 'warehouse', 'master', 'entities.warehouse', 'warehouse', 'createMockWarehouse', workflowStatus('warehouse'), true, ['server/features/warehouses/README.md']],
  ['toolProfile', 'tool_profile', 'master', 'entities.toolProfile', 'tool', 'createMockToolProfile', 'hidden', false, ['server/features/tool-profiles/README.md']],
  ['penTemplate', 'pen_template', 'master', 'entities.penTemplate', 'pen', 'createMockPenTemplate', 'hidden', false, ['server/features/pen-templates/README.md']],
  ['layerStandard', 'layer_standard', 'master', 'entities.layerStandard', 'standard', 'createMockLayerStandard', 'hidden', false, ['server/features/layer-standards/README.md']],
  ['user', 'user', 'system', 'entities.user', 'user', 'createMockUser', workflowStatus('user'), false, ['server/features/users/README.md']],
  ['organization', 'organization', 'system', 'entities.organization', 'organization', 'createMockOrganization', 'hidden', false, ['server/features/organizations/README.md']],
  ['artifact', 'artifact', 'system', 'entities.artifact', 'artifact', 'createMockArtifact', workflowStatus('artifact'), true, ['server/features/artifacts/README.md']]
].map(([key, entityType, group, labelKey, propName, factoryName, status, trace, docs]) => ({
  key,
  entityType,
  group,
  labelKey,
  propName,
  factoryName,
  status,
  trace,
  docs
}));

export const cncDesignSystem = {
  variants: cncDesignSystemVariants,
  groups: cncDesignSystemGroups,
  primitives: cncDesignSystemPrimitives,
  contracts: cncDesignSystemEntityContracts
};

export const cncUiSurfaces = cncFrontendEntities.map(definition => ({
  key: definition.type,
  entityType: definition.collection?.replace(/-/g, '_').replace(/s$/, '') || definition.type,
  routes: definition.routes,
  icon: iconForType(definition.type),
  display: {
    status: cncWorkflows[definition.type] || cncWorkflows[definition.collection?.replace(/-/g, '_').replace(/s$/, '')] ? 'interactive' : 'hidden',
    trace: !['material', 'tool_profile', 'pen_template', 'organization'].includes(definition.type),
    title: 'identity.name'
  }
}));

export const cncDomain = {
  id: 'cnc',
  label: 'CutKit CNC',
  entities: cncEntities,
  workflows: cncWorkflows,
  services: cncServiceContracts,
  operations: cncOperations,
  serviceActions: cncOperations,
  processes: cncProcesses,
  artifacts: cncArtifactTypes,
  artifactTypes: cncArtifactTypes,
  hooks: cncHookContracts,
  summaries: cncSummaries,
  ui: {
    endpoints: cncFrontendEntities,
    surfaces: cncUiSurfaces,
    status: cncStatusUi,
    designSystem: cncDesignSystem
  }
};

function iconForType(type) {
  const icons = {
    project: 'pi pi-folder',
    queue: 'pi pi-list',
    nestingRun: 'pi pi-list-check',
    sheetDesign: 'pi pi-map',
    cassette: 'pi pi-box',
    cassetteDesign: 'pi pi-pencil',
    cassetteTemplate: 'pi pi-palette',
    cassetteInstance: 'pi pi-box',
    artifact: 'pi pi-file',
    warehouse: 'pi pi-building',
    user: 'pi pi-user',
    organization: 'pi pi-building'
  };
  return icons[type] || 'pi pi-box';
}
