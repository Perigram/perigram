export const DESIGN_SYSTEM_VARIANTS = ['card', 'compact', 'inline'];

export const DESIGN_SYSTEM_GROUPS = [
  { id: 'production', labelKey: 'uiLab.groups.production' },
  { id: 'material', labelKey: 'uiLab.groups.material' },
  { id: 'master', labelKey: 'uiLab.groups.master' },
  { id: 'system', labelKey: 'uiLab.groups.system' }
];

export const DESIGN_SYSTEM_ENTITY_CONTRACTS = [
  ['project', 'project', 'production', 'entities.project', 'project', 'createMockProject', 'interactive', true, ['components/entities/Project/README.md', 'server/features/projects/README.md']],
  ['queue', 'queue', 'production', 'entities.queue', 'queue', 'createMockQueue', 'interactive', true, ['server/features/queues/README.md']],
  ['nestingRun', 'nesting_run', 'production', 'entities.nestingRun', 'run', 'createMockNestingRun', 'interactive', true, ['server/features/nesting-runs/README.md']],
  ['sheetDesign', 'sheet_design', 'production', 'entities.sheetDesign', 'design', 'createMockSheetDesign', 'interactive', true, ['server/features/sheet-designs/README.md']],
  ['cassetteDesign', 'cassette_design', 'production', 'entities.cassetteDesign', 'design', 'createMockCassetteDesign', 'hidden', true, ['server/features/cassette-designs/README.md']],
  ['cassetteTemplate', 'cassette_template', 'production', 'entities.cassetteTemplate', 'template', 'createMockCassetteTemplate', 'interactive', true, ['server/features/cassettes/README.md']],
  ['cassetteInstance', 'cassette_instance', 'production', 'entities.cassetteInstance', 'instance', 'createMockCassetteInstance', 'interactive', true, ['server/features/cassette-instances/README.md']],
  ['requisition', 'requisition', 'production', 'entities.requisition', 'requisition', 'createMockRequisition', 'interactive', true, ['server/features/requisitions/README.md']],
  ['materialPile', 'material_pile', 'material', 'entities.materialPile', 'pile', 'createMockPile', 'interactive', true, ['server/features/material-piles/README.md']],
  ['batchPile', 'material_pile', 'material', 'entities.batchPile', 'pile', 'createMockBatchPile', 'interactive', true, ['server/features/material-piles/README.md']],
  ['sheet', 'sheet', 'material', 'entities.sheet', 'sheet', 'createMockSheet', 'interactive', true, ['server/features/sheets/README.md']],
  ['remnant', 'remnant', 'material', 'entities.remnant', 'remnant', 'createMockRemnant', 'interactive', true, ['server/features/remnants/README.md']],
  ['catalog', 'catalog', 'master', 'entities.catalog', 'catalog', 'createMockCatalog', 'hidden', true, ['server/features/catalogs/README.md']],
  ['color', 'color', 'master', 'entities.color', 'color', 'createMockColor', 'hidden', true, ['server/features/colors/README.md']],
  ['warehouse', 'warehouse', 'master', 'entities.warehouse', 'warehouse', 'createMockWarehouse', 'interactive', true, ['server/features/warehouses/README.md']],
  ['toolProfile', 'tool_profile', 'master', 'entities.toolProfile', 'tool', 'createMockToolProfile', 'hidden', false, ['server/features/tool-profiles/README.md']],
  ['penTemplate', 'pen_template', 'master', 'entities.penTemplate', 'pen', 'createMockPenTemplate', 'hidden', false, ['server/features/pen-templates/README.md']],
  ['layerStandard', 'layer_standard', 'master', 'entities.layerStandard', 'standard', 'createMockLayerStandard', 'hidden', false, ['server/features/layer-standards/README.md']],
  ['user', 'user', 'system', 'entities.user', 'user', 'createMockUser', 'interactive', false, ['server/features/users/README.md']],
  ['organization', 'organization', 'system', 'entities.organization', 'organization', 'createMockOrganization', 'hidden', false, ['server/features/organizations/README.md']],
  ['artifact', 'artifact', 'system', 'entities.artifact', 'artifact', 'createMockArtifact', 'interactive', true, ['server/features/artifacts/README.md']]
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

export function validateDesignSystemContracts(entries = DESIGN_SYSTEM_ENTITY_CONTRACTS) {
  return entries.flatMap((entry) => {
    const issues = [];
    if (!entry.key) issues.push('missing key');
    if (!entry.entityType) issues.push('missing entity type');
    if (!entry.group) issues.push('missing group');
    if (!entry.labelKey) issues.push('missing label key');
    if (!entry.propName) issues.push('missing prop name');
    if (!entry.factoryName) issues.push('missing factory name');
    if (!['interactive', 'hidden', 'readonly'].includes(entry.status)) issues.push('invalid status policy');
    if (typeof entry.trace !== 'boolean') issues.push('invalid trace policy');
    if (!Array.isArray(entry.docs) || entry.docs.length === 0) issues.push('missing docs');

    return issues.map((issue) => ({ key: entry.key || 'unknown', issue }));
  });
}
