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
    'instance-revisions', 'facades', 'facade-patterns', 'geometry-captures',
    'nesting-runs', 'organizations', 'process-definitions', 'sheet-designs', 'users'
  ]);
  if (restBacked.has(routeBase)) {
    return { single, list: `/api/${routeBase}` };
  }
  const instanceBase = `/api/instances/${String(type).replace(/_/g, '-')}`;
  return { single: `${instanceBase}/:id`, list: instanceBase };
}

export const cncEntities = [
  { type: 'artifact', collection: 'artifacts', blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], operations: { delete: true } },
  { type: 'artifact_template', collection: 'artifact_templates', meta: true, blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], operations: { delete: true } },
  { type: 'cassette', collection: 'cassettes', blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], operations: { delete: true } },
  { type: 'cassette_instance', instanceService: true, feature: 'instances', collection: 'cassette_instances', blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], routes: { single: '/api/instances/cassette-instance/:id', list: '/api/instances/cassette-instance' } },
  { type: 'queue', instanceService: true, feature: 'instances', collection: 'queues', blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], routes: { single: '/api/instances/queue/:id', list: '/api/instances/queue' } },
  { type: 'solve_run', instanceService: true, feature: 'instances', collection: 'nesting_runs', blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], routes: { single: '/api/instances/solve-run/:id', list: '/api/instances/solve-run' } },
  { type: 'cassette_design', collection: 'cassette_designs', blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], operations: { delete: true } },
  // The framework revision type keeps its persisted id and collection; its
  // feature directory and REST route carry the instance vocabulary.
  { type: 'entity_revision', collection: 'entity_revisions', feature: 'instance-revisions', meta: true, blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'] },
  { type: 'layer_standard', collection: 'layer_standards', meta: true, blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'] },
  { type: 'machine', feature: 'machines', collection: 'machines', meta: true, blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], operations: { delete: true } },
  { type: 'organization', collection: 'organizations', meta: true, blocks: ['identity', 'origin', 'states', 'attachments', 'data'], operations: { delete: true } },
  { type: 'pen_template', collection: 'pen_templates', meta: true, blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], routes: { single: '/api/instances/pen-template/:id', list: '/api/instances/pen-template' } },
  { type: 'process_definition', collection: 'process_definitions', meta: true, blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'] },
  { type: 'project', instanceService: true, feature: 'instances', collection: 'projects', blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], routes: { single: '/api/instances/project/:id', list: '/api/instances/project' } },
  { type: 'library', instanceService: true, feature: 'instances', collection: 'libraries', blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], routes: { single: '/api/instances/library/:id', list: '/api/instances/library' } },
  { type: 'sheet', instanceService: true, feature: 'instances', collection: 'sheets', blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], routes: { single: '/api/instances/sheet/:id', list: '/api/instances/sheet' } },
  { type: 'remnant', instanceService: true, feature: 'instances', collection: 'remnants', blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], routes: { single: '/api/instances/remnant/:id', list: '/api/instances/remnant' } },
  { type: 'geometry_capture', instanceService: true, feature: 'files', collection: 'files', meta: true, blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], routes: { single: '/api/instances/geometry-capture/:id', list: '/api/instances/geometry-capture' } },
  { type: 'profile_template', collection: 'profile_templates', meta: true, blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], operations: { delete: true } },
  { type: 'sheet_design', collection: 'sheet_designs', blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'] },
  { type: 'tool_profile', collection: 'tool_profiles', meta: true, blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], routes: { single: '/api/instances/tool-profile/:id', list: '/api/instances/tool-profile' } },
  { type: 'user', collection: 'users', meta: true, blocks: ['identity', 'lineage', 'origin', 'states', 'attachments', 'data'], operations: { delete: true } },
].map(withReferenceBlocks).map(withRoutes).map(withIdentityProjection);

export function canonicalTypeId(value = '') {
  const candidate = String(value || '');
  const normalizedRouteType = candidate.replace(/-/g, '_');
  return cncEntities.find(entity => (
    entity.type === candidate
    || entity.type === normalizedRouteType
    || entity.surfaceKey === candidate
  ))?.type || '';
}

export function entitySurfaceKey(value = '') {
  const canonical = canonicalTypeId(value);
  return cncEntities.find(entity => entity.type === canonical)?.surfaceKey || '';
}
