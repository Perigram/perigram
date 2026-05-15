export const DESIGN_SYSTEM_VARIANTS = ['card', 'compact', 'inline'];

export const DESIGN_SYSTEM_GROUPS = [
  { id: 'production', labelKey: 'uiLab.groups.production' },
  { id: 'material', labelKey: 'uiLab.groups.material' },
  { id: 'master', labelKey: 'uiLab.groups.master' },
  { id: 'system', labelKey: 'uiLab.groups.system' }
];

export const DESIGN_SYSTEM_PRIMITIVES = [
  {
    key: 'EntityCard',
    kind: 'entity-chrome',
    componentPath: 'components/shared/EntityCard.vue',
    purpose: 'Standard entity card chrome with identity, optional trace, optional status, content, and footer slots.',
    docs: ['components/shared/README.md']
  },
  {
    key: 'EntityPage',
    kind: 'entity-layout',
    componentPath: 'components/shared/EntityPage.vue',
    purpose: 'Standard detail-page shell with trace, identity, status, info, actions, body, and sidebar slots.',
    docs: ['components/shared/README.md']
  },
  {
    key: 'IdentityBlock',
    kind: 'block',
    componentPath: 'components/shared/blocks/IdentityBlock.vue',
    purpose: 'Canonical identity rendering for names, slugs, serials, references, and inline trace labels.',
    docs: ['components/shared/README.md']
  },
  {
    key: 'DataBlock',
    kind: 'block',
    componentPath: 'components/shared/blocks/DataBlock.vue',
    purpose: 'Canonical label/value rows for generated entity data fields.',
    docs: ['components/shared/README.md', 'utils/README.md']
  },
  {
    key: 'SpecsBlock',
    kind: 'block',
    componentPath: 'components/shared/blocks/SpecsBlock.vue',
    purpose: 'Canonical width, length, area, and thickness display for entities with specs.',
    docs: ['components/shared/README.md']
  },
  {
    key: 'StatusBadge',
    kind: 'status',
    componentPath: 'components/shared/blocks/StatusBadge.vue',
    purpose: 'Read-only status tag using the shared status mapping.',
    docs: ['components/shared/README.md', 'utils/README.md']
  },
  {
    key: 'EntityStatus',
    kind: 'status',
    componentPath: 'components/shared/status/EntityStatus.vue',
    purpose: 'Interactive status display and workflow-derived transition actions.',
    docs: ['components/shared/README.md', 'utils/README.md']
  },
  {
    key: 'StatusHistory',
    kind: 'status',
    componentPath: 'components/shared/status/StatusHistory.vue',
    purpose: 'Status audit timeline for entity lifecycle events.',
    docs: ['components/shared/README.md']
  },
  {
    key: 'TraceLink',
    kind: 'trace',
    componentPath: 'components/shared/links/TraceLink.vue',
    purpose: 'Icon-aware link to a related entity.',
    docs: ['components/shared/README.md']
  },
  {
    key: 'TraceChain',
    kind: 'trace',
    componentPath: 'components/shared/links/TraceChain.vue',
    purpose: 'Canonical lineage breadcrumb chain for entity ancestry.',
    docs: ['components/shared/README.md']
  },
  {
    key: 'ActionToolbar',
    kind: 'layout',
    componentPath: 'components/shared/ActionToolbar.vue',
    purpose: 'Responsive title, subtitle, and action-row layout.',
    docs: ['components/shared/README.md']
  },
  {
    key: 'ResponsiveGrid',
    kind: 'layout',
    componentPath: 'components/shared/ResponsiveGrid.vue',
    purpose: 'Token-backed responsive repeated-item grid.',
    docs: ['components/shared/README.md']
  },
  {
    key: 'StateBlock',
    kind: 'layout',
    componentPath: 'components/shared/StateBlock.vue',
    purpose: 'Standard loading, empty, and error states.',
    docs: ['components/shared/README.md']
  },
  {
    key: 'TableFrame',
    kind: 'layout',
    componentPath: 'components/shared/TableFrame.vue',
    purpose: 'Standard frame for PrimeVue DataTable surfaces.',
    docs: ['components/shared/README.md']
  },
  {
    key: 'StandardDialog',
    kind: 'layout',
    componentPath: 'components/shared/StandardDialog.vue',
    purpose: 'Standard modal shell with footer and responsive sizing.',
    docs: ['components/shared/README.md']
  },
  {
    key: 'StandardPage',
    kind: 'layout',
    componentPath: 'components/shared/StandardPage.vue',
    purpose: 'Standard page shell with header and breadcrumbs.',
    docs: ['components/shared/README.md']
  }
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
