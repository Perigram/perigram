export const cncSummaries = [
  { sourceType: 'cassette', targetType: 'library', targetIdKey: 'libraryId', countField: 'cassetteCount' },
  { sourceType: 'queue', targetType: 'project', targetIdKey: 'projectId', countField: 'queueCount' },
  { sourceType: 'cassette_instance', targetType: 'project', targetIdKey: 'projectId', countField: 'instanceCount' },
  { sourceType: 'nesting_run', targetType: 'queue', targetIdKey: 'queueId', countField: 'runCount' },
  { sourceType: 'sheet_design', targetType: 'queue', targetIdKey: 'queueId', countField: 'sheetDesignCount' },
  { sourceType: 'sheet', targetType: 'queue', targetIdKey: 'queueId', countField: 'sheetCount', sumFields: { area: 'totalArea' } },
  { sourceType: 'color', targetType: 'catalog', targetIdKey: 'catalogId', countField: 'colorCount' }
];

export const cncFrontendEntities = [
  { type: 'material', collection: 'materials', routes: { single: '/api/materials/:id', list: '/api/materials' } },
  { type: 'machine', collection: 'machines', routes: { single: '/api/machines/:id', list: '/api/machines' } },
  { type: 'project', collection: 'projects', routes: { single: '/api/project/:id', list: '/api/project' } },
  { type: 'queue', collection: 'queues', routes: { single: '/api/queue/:id', list: '/api/queue' } },
  { type: 'requisition', collection: 'requisitions', routes: { single: '/api/requisitions/:id', list: '/api/requisitions' } },
  { type: 'batch', collection: 'material-piles', routes: { single: '/api/material-piles/:id', list: '/api/material-piles' } },
  { type: 'pile', collection: 'material-piles', routes: { single: '/api/material-piles/:id', list: '/api/material-piles' } },
  { type: 'sheet', collection: 'sheets', routes: { single: '/api/sheets/:id', list: '/api/sheets' } },
  { type: 'sheetInstance', collection: 'sheet-instances', routes: { single: '/api/sheet-instances/:id', list: '/api/sheet-instances' } },
  { type: 'remnant', collection: 'remnants', routes: { single: '/api/remnants/:id', list: '/api/remnants' } },
  { type: 'library', collection: 'libraries', routes: { single: '/api/libraries/:id', list: '/api/libraries' } },
  { type: 'cassette', collection: 'cassettes', routes: { single: '/api/cassettes/:id', list: '/api/cassettes' } },
  { type: 'cassetteTemplate', collection: 'cassettes', routes: { single: '/api/cassettes/:id', list: '/api/cassettes' } },
  { type: 'cassetteInstance', collection: 'cassette-instances', routes: { single: '/api/cassette-instances/:id', list: '/api/cassette-instances' } },
  { type: 'cassetteDesign', collection: 'cassette-designs', routes: { single: '/api/cassette-designs/:id', list: '/api/cassette-designs' } },
  { type: 'sheetDesign', collection: 'sheet-designs', routes: { single: '/api/sheet-designs/:id', list: '/api/sheet-designs' } },
  { type: 'artifact', collection: 'artifacts', routes: { single: '/api/artifacts/:id/metadata', download: '/api/artifacts/:id', list: '/api/artifacts' } },
  { type: 'catalog', collection: 'catalogs', routes: { single: '/api/catalogs/:id', list: '/api/catalogs' } },
  { type: 'color', collection: 'colors', routes: { single: '/api/colors/:id', list: '/api/colors' } },
  { type: 'entityRevision', collection: 'entity-revisions', routes: { single: '/api/entity-revisions/:id', list: '/api/entity-revisions' } },
  { type: 'geometryCapture', collection: 'geometry-captures', routes: { single: '/api/geometry-captures/:id', list: '/api/geometry-captures' } },
  { type: 'profileTemplate', collection: 'profile-templates', routes: { single: '/api/profile-templates/:id', list: '/api/profile-templates' } },
  { type: 'warehouse', collection: 'warehouses', routes: { single: '/api/warehouses/:id', list: '/api/warehouses' } },
  { type: 'layerStandard', collection: 'layer-standards', routes: { single: '/api/layer-standards/:id', list: '/api/layer-standards' } },
  { type: 'user', collection: 'users', routes: { single: '/api/users/:id', list: '/api/users' } },
  { type: 'organization', collection: 'organizations', routes: { single: '/api/organizations/:id', list: '/api/organizations' } },
  { type: 'nestingRun', collection: 'nesting-runs', routes: { single: '/api/nesting-runs/:id', list: '/api/nesting-runs' } }
];
