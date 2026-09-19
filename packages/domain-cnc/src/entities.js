const withReferenceBlocks = definition => ({
  ...definition,
  blocks: [...new Set([...(definition.blocks || []), 'relations', 'provenance'])]
});

const withRoutes = definition => ({
  ...definition,
  routes: definition.routes || defaultRoutes(definition)
});

const toSurfaceKey = type => String(type || '').replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase());

const withIdentityProjection = definition => ({
  ...definition,
  surfaceKey: definition.surfaceKey || toSurfaceKey(definition.type)
});

function defaultRoutes({ type = '', collection = '' }) {
  const routeBase = String(collection || `${type}s`).replace(/_/g, '-');
  const single = `/api/${routeBase}/:id`;
  if (type === 'artifact') {
    return { single: `${single}/metadata`, download: `/api/${routeBase}/:id`, list: `/api/${routeBase}` };
  }
  if (type === 'artifact_template') {
    return { single, download: `${single}/source`, list: `/api/${routeBase}` };
  }
  // REST-backed collections keep their feature routes; everything else
  // rides the generic instance transport (SPEC §13) — the legacy per-entity
  // REST surface was deleted.
  const restBacked = new Set([
    'artifacts', 'artifact-templates', 'cassettes', 'cassette-designs',
    'entity-revisions', 'facades', 'facade-patterns', 'geometry-captures',
    'nesting-runs', 'organizations', 'process-definitions', 'sheet-designs', 'users'
  ]);
  if (restBacked.has(routeBase)) {
    return { single, list: `/api/${routeBase}` };
  }
  const instanceBase = `/api/instances/${String(type).replace(/_/g, '-')}`;
  return { single: `${instanceBase}/:id`, list: instanceBase };
}

export const cncEntities = [
  { type: 'artifact', collection: 'artifacts', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'artifact_template', collection: 'artifact_templates', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'cassette', collection: 'cassettes', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'cassette_design', collection: 'cassette_designs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'cassette_instance', collection: 'cassette_instances', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'catalog', collection: 'catalogs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'] },
  { type: 'color', collection: 'colors', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'entity_revision', collection: 'entity_revisions', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'facade', collection: 'facades', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'facade_pattern', collection: 'facade_patterns', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'geometry_capture', collection: 'geometry_captures', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'specs'] },
  { type: 'layer_standard', collection: 'layer_standards', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'library', feature: 'libraries', collection: 'libraries', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'], operations: { delete: true } },
  { type: 'machine', feature: 'machines', collection: 'machines', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'material', collection: 'materials', blocks: ['identity', 'origin', 'status', 'attachments', 'data'] },
  { type: 'material_pile', collection: 'material_piles', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'nesting_run', collection: 'nesting_runs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'organization', collection: 'organizations', meta: true, blocks: ['identity', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'pen_template', collection: 'pen_templates', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], routes: { single: '/api/instances/pen-template/:id', list: '/api/instances/pen-template' } },
  { type: 'process_definition', collection: 'process_definitions', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'profile_template', collection: 'profile_templates', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'project', collection: 'projects', routes: { single: '/api/instances/project/:id', list: '/api/instances/project' }, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'], operations: { delete: true } },
  { type: 'queue', collection: 'queues', routes: { single: '/api/instances/queue/:id', list: '/api/instances/queue' }, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'], operations: { delete: true } },
  { type: 'remnant', collection: 'remnants', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'requisition', collection: 'requisitions', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'sheet', collection: 'sheets', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'specs'] },
  { type: 'sheet_design', collection: 'sheet_designs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'tool_profile', collection: 'tool_profiles', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], routes: { single: '/api/instances/tool-profile/:id', list: '/api/instances/tool-profile' } },
  { type: 'user', collection: 'users', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'warehouse', collection: 'warehouses', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'] }
].map(withReferenceBlocks).map(withRoutes).map(withIdentityProjection);

export function canonicalEntityType(value = '') {
  const candidate = String(value || '');
  const normalizedRouteType = candidate.replace(/-/g, '_');
  return cncEntities.find(entity => (
    entity.type === candidate
    || entity.type === normalizedRouteType
    || entity.surfaceKey === candidate
  ))?.type || '';
}

export function entitySurfaceKey(value = '') {
  const canonical = canonicalEntityType(value);
  return cncEntities.find(entity => entity.type === canonical)?.surfaceKey || '';
}
