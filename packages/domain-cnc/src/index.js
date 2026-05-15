export const cncEntities = [
  { type: 'artifact', collection: 'artifacts', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'cassette', collection: 'cassettes', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'cassette_design', collection: 'cassette_designs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'cassette_instance', collection: 'cassette_instances', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'catalog', collection: 'catalogs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'] },
  { type: 'color', collection: 'colors', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'material_pile', collection: 'material_piles', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'nesting_run', collection: 'nesting_runs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'organization', collection: 'organizations', blocks: ['identity', 'origin', 'status', 'attachments', 'data'] },
  { type: 'project', collection: 'projects', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'] },
  { type: 'queue', collection: 'queues', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'] },
  { type: 'remnant', collection: 'remnants', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'requisition', collection: 'requisitions', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'sheet', collection: 'sheets', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'specs'] },
  { type: 'sheet_design', collection: 'sheet_designs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'user', collection: 'users', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'warehouse', collection: 'warehouses', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'] }
];

export const cncWorkflows = {
  project: {
    initial: 'DRAFT',
    states: { DRAFT: { canUpdateMeta: true }, ACTIVE: { canUpdateMeta: true }, CLOSED: { isTerminal: true } },
    transitions: [
      { from: 'DRAFT', to: 'ACTIVE', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'] },
      { from: 'ACTIVE', to: 'CLOSED', roles: ['SuperAdmin', 'ContractorAdmin', 'ADMIN'], hooks: [{ handler: 'propagateToChildren', params: { childType: 'queue', childState: 'CLOSED' } }] },
      { from: 'ACTIVE', to: 'DRAFT', roles: ['SuperAdmin', 'ContractorAdmin', 'ADMIN'] }
    ]
  },
  queue: {
    initial: 'DRAFT',
    states: { DRAFT: { canUpdateMeta: true }, NESTING: { canUpdateMeta: true }, READY: { canUpdateMeta: true }, CUT: { isTerminal: true }, CLOSED: { isTerminal: true } },
    transitions: [
      { from: 'DRAFT', to: 'NESTING', roles: ['SYSTEM', 'SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'READY', roles: ['SYSTEM', 'SuperAdmin'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'READY', to: 'CUT', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'], hooks: [{ handler: 'triggerAggregator' }, { handler: 'processPhysicalCut' }] },
      { from: 'READY', to: 'CLOSED', roles: ['SuperAdmin', 'ContractorAdmin', 'ADMIN', 'EDITOR'], hooks: [{ handler: 'triggerAggregator' }] }
    ]
  },
  nesting_run: {
    initial: 'NESTING',
    states: { NESTING: { canUpdateMeta: true }, COMPLETE: { canUpdateMeta: true }, ERROR: { isTerminal: true }, CHOSEN: { isTerminal: true }, REJECTED: { isTerminal: true } },
    transitions: [
      { from: 'NESTING', to: 'COMPLETE', roles: ['SYSTEM', 'SuperAdmin'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'NESTING', to: 'ERROR', roles: ['SYSTEM', 'SuperAdmin'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'COMPLETE', to: 'CHOSEN', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'], hooks: [{ handler: 'triggerAggregator' }, { handler: 'createPhysicalUnits' }] },
      { from: 'COMPLETE', to: 'REJECTED', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'], hooks: [{ handler: 'triggerAggregator' }] }
    ]
  },
  cassette: {
    initial: 'ACTIVE',
    states: { ACTIVE: { canUpdateMeta: true }, ARCHIVED: { isTerminal: true } },
    transitions: [{ from: 'ACTIVE', to: 'ARCHIVED', roles: ['SuperAdmin', 'ManufacturerAdmin', 'ContractorAdmin', 'ADMIN'] }]
  },
  sheet: {
    initial: 'AVAILABLE',
    states: { AVAILABLE: { canUpdateMeta: true }, 'IN-CUTTING': { canUpdateMeta: true }, MILLED: { canUpdateMeta: true }, SCRAP: { isTerminal: true } },
    transitions: [
      { from: 'AVAILABLE', to: 'IN-CUTTING', roles: ['SYSTEM', 'SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'OPERATOR'] },
      { from: 'IN-CUTTING', to: 'MILLED', roles: ['SYSTEM', 'SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'OPERATOR'] },
      { from: 'AVAILABLE', to: 'SCRAP', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'OPERATOR', 'ADMIN'] },
      { from: 'IN-CUTTING', to: 'SCRAP', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'OPERATOR', 'ADMIN'] }
    ]
  },
  cassette_instance: {
    initial: 'PRODUCED',
    states: { PRODUCED: {}, MILLED: {}, INSTALLED: {} },
    transitions: [
      { from: 'PRODUCED', to: 'MILLED', roles: ['SYSTEM', 'SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'OPERATOR'], hooks: [{ handler: 'triggerAggregator' }] },
      { from: 'MILLED', to: 'INSTALLED', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'OPERATOR'], hooks: [{ handler: 'triggerAggregator' }] }
    ]
  },
  requisition: {
    initial: 'DRAFT',
    states: { DRAFT: {}, SENT: {}, APPROVED: {}, FULFILLED: { isTerminal: true }, REJECTED: { isTerminal: true } },
    transitions: [
      { from: 'DRAFT', to: 'SENT', roles: ['SuperAdmin', 'ContractorAdmin', 'IndividualUser', 'ADMIN', 'EDITOR'] },
      { from: 'SENT', to: 'APPROVED', roles: ['SuperAdmin', 'ManufacturerAdmin', 'ADMIN'] },
      { from: 'SENT', to: 'REJECTED', roles: ['SuperAdmin', 'ManufacturerAdmin', 'ADMIN'] },
      { from: 'APPROVED', to: 'FULFILLED', roles: ['SuperAdmin', 'ManufacturerAdmin', 'ADMIN'] }
    ]
  }
};

export const cncSummaries = [
  { entityType: 'queue', parentType: 'project', parentIdKey: 'projectId', countField: 'queueCount' },
  { entityType: 'cassette_instance', parentType: 'project', parentIdKey: 'projectId', countField: 'instanceCount' },
  { entityType: 'nesting_run', parentType: 'queue', parentIdKey: 'queueId', countField: 'runCount' },
  { entityType: 'sheet', parentType: 'queue', parentIdKey: 'queueId', countField: 'sheetCount' },
  { entityType: 'color', parentType: 'catalog', parentIdKey: 'catalogId', countField: 'colorCount' }
];
