import { cncEntities } from './entities.js';
import { cncWorkflows } from './workflows.js';
import { cncEntityFieldGroups } from './ui-fields.js';
import { createEntitySurfaceContracts } from './ui-surfaces.js';

export const cncStatusUi = {
  DRAFT: { label: 'status.draft', severity: 'info', icon: 'pi pi-pencil' },
  NESTING: { label: 'status.nesting', severity: 'warn', icon: 'pi pi-cog' },
  READY: { label: 'status.ready', severity: 'success', icon: 'pi pi-check' },
  CUT: { label: 'status.cut', severity: 'success', icon: 'pi pi-bolt' },
  CLOSED: { label: 'status.closed', severity: 'secondary', icon: 'pi pi-lock' },
  ARCHIVED: { label: 'status.archived', severity: 'secondary', icon: 'pi pi-bookmark' },
  COMPLETE: { label: 'status.complete', severity: 'success', icon: 'pi pi-check-circle' },
  ERROR: { label: 'status.error', severity: 'danger', icon: 'pi pi-times-circle' },
  CHOSEN: { label: 'status.chosen', severity: 'success', icon: 'pi pi-star' },
  ACTIVE: { label: 'status.active', severity: 'success', icon: 'pi pi-check-circle' },
  RECORDED: { label: 'status.recorded', severity: 'secondary', icon: 'pi pi-history' },
  AVAILABLE: { label: 'status.available', severity: 'success', icon: 'pi pi-box' },
  STOCKED: { label: 'status.stocked', severity: 'success', icon: 'pi pi-database' },
  DEPLETED: { label: 'status.depleted', severity: 'secondary', icon: 'pi pi-inbox' },
  USED: { label: 'status.used', severity: 'secondary', icon: 'pi pi-check-circle' },
  'IN-CUTTING': { label: 'status.inCutting', severity: 'warn', icon: 'pi pi-bolt' },
  MILLED: { label: 'status.milled', severity: 'success', icon: 'pi pi-check-square' },
  SENT: { label: 'status.sent', severity: 'info', icon: 'pi pi-send' },
  APPROVED: { label: 'status.approved', severity: 'success', icon: 'pi pi-check-circle' },
  FULFILLED: { label: 'status.fulfilled', severity: 'success', icon: 'pi pi-box' },
  REJECTED: { label: 'status.rejected', severity: 'danger', icon: 'pi pi-times-circle' },
  PRODUCED: { label: 'status.produced', severity: 'info', icon: 'pi pi-box' },
  INSTALLED: { label: 'status.installed', severity: 'success', icon: 'pi pi-check' },
  GENERATING: { label: 'status.generating', severity: 'warn', icon: 'pi pi-spin pi-cog' },
  PROCESSING: { label: 'status.processing', severity: 'warn', icon: 'pi pi-spin pi-cog' },
  FAILED: { label: 'status.error', severity: 'danger', icon: 'pi pi-times-circle' },
  PENDING: { label: 'status.pending', severity: 'warn', icon: 'pi pi-clock' },
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
  { key: 'EntitySelect', kind: 'entity-input', componentPath: 'components/shared/EntitySelect.vue', purpose: 'PrimeVue Select wrapper that renders canonical entity options as compact cards and selected entities outside the value area with a compact change trigger.', docs: ['components/shared/README.md', 'docs/DESIGN_SYSTEM.md'] },
  { key: 'EntityMultiSelect', kind: 'entity-input', componentPath: 'components/shared/EntityMultiSelect.vue', purpose: 'PrimeVue MultiSelect wrapper that renders entity options as compact cards and selected entities outside the chip area with a compact change trigger.', docs: ['components/shared/README.md', 'docs/DESIGN_SYSTEM.md'] },
  { key: 'IdentityBlock', kind: 'block', componentPath: 'components/shared/blocks/IdentityBlock.vue', purpose: 'Canonical identity rendering for names, slugs, serials, references, and inline trace labels.', docs: ['components/shared/README.md'] },
  { key: 'DataBlock', kind: 'block', componentPath: 'components/shared/blocks/DataBlock.vue', purpose: 'Canonical label/value rows for generated entity data fields.', docs: ['components/shared/README.md', 'utils/README.md'] },
  { key: 'SpecsBlock', kind: 'block', componentPath: 'components/shared/blocks/SpecsBlock.vue', purpose: 'Canonical width, length, area, and thickness display for entities with specs.', docs: ['components/shared/README.md'] },
  { key: 'StatusBadge', kind: 'status', componentPath: 'components/shared/blocks/StatusBadge.vue', purpose: 'Read-only status tag using the shared status mapping.', docs: ['components/shared/README.md', 'utils/README.md'] },
  { key: 'EntityStatus', kind: 'status', componentPath: 'components/shared/status/EntityStatus.vue', purpose: 'Interactive status display and workflow-derived transition actions.', docs: ['components/shared/README.md', 'utils/README.md'] },
  { key: 'StatusLocation', kind: 'status', componentPath: 'components/shared/status/StatusLocation.vue', purpose: 'Typed current lifecycle location rendering from status.lifecycle.data.location.', docs: ['components/shared/README.md', 'docs/DESIGN_SYSTEM.md'] },
  { key: 'StatusHistory', kind: 'status', componentPath: 'components/shared/status/StatusHistory.vue', purpose: 'Status audit timeline for entity lifecycle events.', docs: ['components/shared/README.md'] },
  { key: 'DrawingCanvas', kind: 'block', componentPath: 'components/shared/DrawingCanvas.vue', purpose: 'Shared layer-aware SVG canvas for geometry previews, DXF artifacts, cassette thumbnails, and cassette designer interactions.', docs: ['components/shared/README.md', 'utils/README.md'] },
  { key: 'DesignerSurface', kind: 'layout', componentPath: 'components/shared/DesignerSurface.vue', purpose: 'Shared full-height flex boundary for operational designer route, pane, and dialog hosts.', docs: ['components/designers/README.md', 'components/shared/README.md'] },
  { key: 'DesignerWorkspace', kind: 'layout', componentPath: 'components/shared/DesignerWorkspace.vue', purpose: 'Shared responsive palette/canvas/inspector workspace for operational designers.', docs: ['components/designers/README.md', 'components/shared/README.md'] },
  { key: 'DesignerDialog', kind: 'layout', componentPath: 'components/shared/DesignerDialog.vue', purpose: 'Viewport-sized dialog host for standalone designer launches.', docs: ['components/designers/README.md', 'components/shared/README.md'] },
  { key: 'ThreeViewport', kind: 'viewport', componentPath: 'components/shared/ThreeViewport.vue', purpose: 'Shared Three.js renderer lifecycle and selectable scene viewport for designers.', docs: ['components/designers/README.md', 'components/shared/README.md'] },
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

const workflowStatus = (typeId) => cncWorkflows[typeId] ? 'interactive' : 'hidden';

export const cncDesignSystemEntityContracts = [
  ['facade', 'facade', 'production', 'entities.facade', 'facade', 'createMockFacade', workflowStatus('facade'), true, ['components/entities/Facade/README.md', 'server/features/facades/README.md']],
  ['facadePattern', 'facade_pattern', 'master', 'entities.facadePattern', 'facadePattern', 'createMockFacadePattern', workflowStatus('facade_pattern'), true, ['components/entities/FacadePattern/README.md', 'server/features/facade-patterns/README.md']],
  ['project', 'project', 'production', 'entities.project', 'project', 'createMockProject', workflowStatus('project'), true, ['components/entities/Project/README.md', 'server/features/projects/README.md']],
  ['queue', 'queue', 'production', 'entities.queue', 'queue', 'createMockQueue', workflowStatus('queue'), true, ['server/features/queues/README.md']],
  ['nestingRun', 'nesting_run', 'production', 'entities.nestingRun', 'run', 'createMockNestingRun', workflowStatus('nesting_run'), true, ['server/features/nesting-runs/README.md']],
  ['sheetDesign', 'sheet_design', 'production', 'entities.sheetDesign', 'design', 'createMockSheetDesign', workflowStatus('sheet_design'), true, ['server/features/sheet-designs/README.md']],
  ['cassette', 'cassette', 'production', 'entities.cassette', 'cassette', 'createMockCassette', workflowStatus('cassette'), true, ['components/entities/Cassette/README.md', 'server/features/cassettes/README.md']],
  ['cassetteDesign', 'cassette_design', 'production', 'entities.cassetteDesign', 'design', 'createMockCassetteDesign', 'hidden', true, ['server/features/cassette-designs/README.md']],
  ['cassetteTemplate', 'cassette_template', 'production', 'entities.cassetteTemplate', 'template', 'createMockCassetteTemplate', 'hidden', true, ['components/entities/CassetteTemplate/README.md', 'server/features/cassettes/README.md']],
  ['cassetteInstance', 'cassette_instance', 'production', 'entities.cassetteInstance', 'instance', 'createMockCassetteInstance', workflowStatus('cassette_instance'), true, ['server/features/cassette-instances/README.md']],
  ['requisition', 'requisition', 'production', 'entities.requisition', 'requisition', 'createMockRequisition', workflowStatus('requisition'), true, ['server/features/requisitions/README.md']],
  ['library', 'library', 'master', 'entities.library', 'library', 'createMockLibrary', 'hidden', true, ['components/entities/Library/README.md', 'server/features/libraries/README.md']],
  ['material', 'material', 'material', 'entities.material', 'material', 'createMockMaterial', 'hidden', false, ['components/entities/Material/README.md', 'server/DATA_MODEL.md']],
  ['materialPile', 'material_pile', 'material', 'entities.materialPile', 'pile', 'createMockPile', workflowStatus('material_pile'), true, ['components/entities/MaterialPile/README.md', 'server/features/material-piles/README.md']],
  ['batchPile', 'material_pile', 'material', 'entities.batchPile', 'pile', 'createMockBatchPile', workflowStatus('material_pile'), true, ['components/entities/BatchPile/README.md', 'server/features/material-piles/README.md']],
  ['sheet', 'sheet', 'material', 'entities.sheet', 'sheet', 'createMockSheet', workflowStatus('sheet'), true, ['server/features/sheets/README.md']],
  ['remnant', 'remnant', 'material', 'entities.remnant', 'remnant', 'createMockRemnant', workflowStatus('remnant'), true, ['server/features/remnants/README.md']],
  ['catalog', 'catalog', 'master', 'entities.catalog', 'catalog', 'createMockCatalog', 'hidden', true, ['server/features/catalogs/README.md']],
  ['color', 'color', 'master', 'entities.color', 'color', 'createMockColor', 'hidden', true, ['server/features/colors/README.md']],
  ['entityRevision', 'entity_revision', 'system', 'entities.entityRevision', 'revision', 'createMockEntityRevision', 'hidden', true, ['components/entities/EntityRevision/README.md', 'server/features/entity-revisions/README.md']],
  ['geometryCapture', 'geometry_capture', 'production', 'entities.geometryCapture', 'capture', 'createMockGeometryCapture', workflowStatus('geometry_capture'), true, ['components/entities/GeometryCapture/README.md', 'server/features/geometry-captures/README.md']],
  ['profileTemplate', 'profile_template', 'master', 'entities.profileTemplate', 'profile', 'createMockProfileTemplate', 'hidden', false, ['server/features/profile-templates/README.md']],
  ['warehouse', 'warehouse', 'master', 'entities.warehouse', 'warehouse', 'createMockWarehouse', workflowStatus('warehouse'), true, ['server/features/warehouses/README.md']],
  ['toolProfile', 'tool_profile', 'master', 'entities.toolProfile', 'tool', 'createMockToolProfile', 'hidden', false, ['server/features/tool-profiles/README.md']],
  ['machine', 'machine', 'master', 'entities.machine', 'machine', 'createMockMachine', 'hidden', false, ['server/features/machines/README.md']],
  ['penTemplate', 'pen_template', 'master', 'entities.penTemplate', 'pen', 'createMockPenTemplate', 'hidden', false, ['server/features/pen-templates/README.md']],
  ['layerStandard', 'layer_standard', 'master', 'entities.layerStandard', 'standard', 'createMockLayerStandard', 'hidden', false, ['server/features/layer-standards/README.md']],
  ['user', 'user', 'system', 'entities.user', 'user', 'createMockUser', workflowStatus('user'), false, ['server/features/users/README.md']],
  ['organization', 'organization', 'system', 'entities.organization', 'organization', 'createMockOrganization', 'hidden', false, ['server/features/organizations/README.md']],
  ['artifact', 'artifact', 'system', 'entities.artifact', 'artifact', 'createMockArtifact', workflowStatus('artifact'), true, ['server/features/artifacts/README.md']],
  ['artifactTemplate', 'artifact_template', 'master', 'entities.artifactTemplate', 'artifactTemplate', 'createMockArtifactTemplate', 'hidden', false, ['server/features/artifact-templates/README.md']]
].map(([key, typeId, group, labelKey, propName, factoryName, status, trace, docs]) => ({
  key,
  typeId,
  group,
  labelKey,
  propName,
  factoryName,
  status,
  trace,
  docs
}));

export const cncEntitySurfaceContracts = createEntitySurfaceContracts(cncDesignSystemEntityContracts);

export const cncDesignSystem = {
  variants: cncDesignSystemVariants,
  groups: cncDesignSystemGroups,
  primitives: cncDesignSystemPrimitives,
  contracts: cncDesignSystemEntityContracts,
  fieldGroups: cncEntityFieldGroups,
  surfaces: cncEntitySurfaceContracts
};

export const cncUiSurfaces = cncEntities.map(definition => ({
  key: definition.surfaceKey,
  typeId: definition.type,
  routes: definition.routes,
  icon: iconForType(definition.surfaceKey),
  display: {
    status: cncWorkflows[definition.type] ? 'interactive' : 'hidden',
    trace: !['material', 'machine', 'tool_profile', 'pen_template', 'organization'].includes(definition.type),
    title: 'identity.name'
  }
}));

function iconForType(type) {
  const icons = {
    project: 'pi pi-folder',
    queue: 'pi pi-list',
    nestingRun: 'pi pi-list-check',
    sheetDesign: 'ck-entity-icon ck-entity-icon-sheet-design',
    sheet: 'ck-entity-icon ck-entity-icon-sheet-instance',
    remnant: 'ck-entity-icon ck-entity-icon-remnant',
    cassette: 'ck-entity-icon ck-entity-icon-cassette-template',
    cassetteDesign: 'ck-entity-icon ck-entity-icon-cassette-design',
    cassetteTemplate: 'ck-entity-icon ck-entity-icon-cassette-template',
    cassetteInstance: 'ck-entity-icon ck-entity-icon-cassette-instance',
    library: 'pi pi-book',
    artifact: 'pi pi-file',
    artifactTemplate: 'pi pi-file-edit',
    geometryCapture: 'pi pi-camera',
    warehouse: 'pi pi-building',
    machine: 'pi pi-cog',
    user: 'pi pi-user',
    organization: 'pi pi-building'
  };
  return icons[type] || 'pi pi-box';
}
