const withReferenceBlocks = definition => ({
  ...definition,
  blocks: [...new Set([...(definition.blocks || []), 'relations', 'provenance'])]
});

export const cncEntities = [
  { type: 'artifact', collection: 'artifacts', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'cassette', collection: 'cassettes', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'cassette_design', collection: 'cassette_designs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'cassette_instance', collection: 'cassette_instances', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'catalog', collection: 'catalogs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'] },
  { type: 'color', collection: 'colors', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'entity_revision', collection: 'entity_revisions', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'geometry_capture', collection: 'geometry_captures', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'specs'] },
  { type: 'layer_standard', collection: 'layer_standards', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'library', feature: 'libraries', collection: 'libraries', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'], operations: { delete: true } },
  { type: 'machine', feature: 'machines', collection: 'machines', meta: true, blocks: ['identity', 'lineage', 'attachments', 'data'], operations: { delete: true } },
  { type: 'material', collection: 'materials', blocks: ['identity', 'origin', 'status', 'attachments', 'data'] },
  { type: 'material_pile', collection: 'material_piles', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'nesting_run', collection: 'nesting_runs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'organization', collection: 'organizations', meta: true, blocks: ['identity', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'pen_template', collection: 'pen_templates', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'process_definition', collection: 'process_definitions', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'profile_template', collection: 'profile_templates', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'project', collection: 'projects', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'], operations: { delete: true } },
  { type: 'queue', collection: 'queues', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'], operations: { delete: true } },
  { type: 'remnant', collection: 'remnants', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'requisition', collection: 'requisitions', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'sheet', collection: 'sheets', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'specs'] },
  { type: 'sheet_design', collection: 'sheet_designs', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'tool_profile', collection: 'tool_profiles', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'] },
  { type: 'user', collection: 'users', meta: true, blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data'], operations: { delete: true } },
  { type: 'warehouse', collection: 'warehouses', blocks: ['identity', 'lineage', 'origin', 'status', 'attachments', 'data', 'summary'] }
].map(withReferenceBlocks);
