export const cncSummaries = [
  { entityType: 'queue', parentType: 'project', parentIdKey: 'projectId', countField: 'queueCount' },
  { entityType: 'cassette_instance', parentType: 'project', parentIdKey: 'projectId', countField: 'instanceCount' },
  { entityType: 'nesting_run', parentType: 'queue', parentIdKey: 'queueId', countField: 'runCount' },
  { entityType: 'sheet_design', parentType: 'queue', parentIdKey: 'queueId', countField: 'sheetDesignCount' },
  { entityType: 'sheet', parentType: 'queue', parentIdKey: 'queueId', countField: 'sheetCount', sumFields: { area: 'totalArea' } },
  { entityType: 'color', parentType: 'catalog', parentIdKey: 'catalogId', countField: 'colorCount' }
];

export const cncFrontendEntities = [
  { type: 'material', collection: 'materials', routes: { single: '/api/materials/:id', list: '/api/materials' } },
  { type: 'project', collection: 'projects', routes: { single: '/api/project/:id', list: '/api/project' } },
  { type: 'queue', collection: 'queues', routes: { single: '/api/queue/:id', list: '/api/queue' } },
  { type: 'requisition', collection: 'requisitions', routes: { single: '/api/requisitions/:id', list: '/api/requisitions' } },
  { type: 'batch', collection: 'material-piles', routes: { single: '/api/material-piles/:id', list: '/api/material-piles' } },
  { type: 'pile', collection: 'material-piles', routes: { single: '/api/material-piles/:id', list: '/api/material-piles' } },
  { type: 'sheet', collection: 'sheets', routes: { single: '/api/sheets/:id', list: '/api/sheets' } },
  { type: 'remnant', collection: 'remnants', routes: { single: '/api/remnants/:id', list: '/api/remnants' } },
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
  { type: 'user', collection: 'users', routes: { single: '/api/users/:id', list: '/api/users' } },
  { type: 'organization', collection: 'organizations', routes: { single: '/api/organizations/:id', list: '/api/organizations' } },
  { type: 'nestingRun', collection: 'nesting-runs', routes: { single: '/api/nesting-runs/:id', list: '/api/nesting-runs' } }
];
