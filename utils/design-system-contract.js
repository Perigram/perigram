// Field descriptors are declared on the type; the map stays empty as the
// consumers' import surface.
export const DESIGN_SYSTEM_FIELD_GROUPS = {};

export function getEntityFieldGroups(entityKey) {
  return DESIGN_SYSTEM_FIELD_GROUPS[entityKey] || {};
}

// Surface chrome vocabulary; which groups a surface shows resolves at runtime in `utils/instance-display-contract.js`.
export const DESIGN_SURFACES = ['inline', 'compact', 'card', 'detail', 'table', 'picker', 'workspace'];
export const DESIGN_PREVIEW_MODES = ['none', 'icon', 'thumbnail', 'hero', 'canvas', 'attachment'];
export const DESIGN_DATA_DISPLAYS = ['inline', 'compact', 'grid', 'sectioned', 'table', 'custom'];
export const DESIGN_RELATION_DISPLAYS = ['none', 'inlineRefs', 'summary', 'expanded'];
export const DESIGN_ACTION_DISPLAYS = ['none', 'menu', 'footer', 'toolbar', 'primaryOnly'];

const previewFor = () => 'none';

export function createEntitySurfaceContracts(entityContracts = []) {
  return Object.fromEntries(entityContracts.map((entry) => {
    const key = entry.key;
    const preview = previewFor(key);
    return [key, {
      key,
      typeId: entry.typeId,
      status: entry.status,
      trace: entry.trace,
      surfaces: {
        inline: {
          preview: 'none',
          fieldGroups: [],
          fieldLimit: 1,
          dataDisplay: 'inline',
          relations: 'none',
          actions: 'none',
          status: entry.status === 'interactive' ? 'readonly' : 'hidden',
          trace: 'hidden'
        },
        compact: {
          preview: preview === 'hero' ? 'thumbnail' : preview,
          fieldGroups: [],
          fieldLimit: 3,
          dataDisplay: 'compact',
          relations: 'summary',
          actions: 'menu',
          status: entry.status,
          trace: 'hidden'
        },
        card: {
          preview: preview === 'canvas' ? 'hero' : preview,
          fieldGroups: [],
          dataDisplay: 'grid',
          relations: 'inlineRefs',
          actions: 'footer',
          status: entry.status,
          trace: 'hidden'
        },
        detail: {
          preview: preview === 'none' ? 'none' : 'hero',
          fieldGroups: [],
          dataDisplay: 'sectioned',
          relations: 'expanded',
          actions: 'toolbar',
          status: entry.status,
          trace: entry.trace ? 'full' : 'hidden'
        }
      }
    }];
  }));
}

export function getEntitySurfaceContract(surfaceContracts, entityKey) {
  return surfaceContracts?.[entityKey] || null;
}


export const DESIGN_SYSTEM_VARIANTS = ['card', 'compact', 'inline'];

export const DESIGN_SYSTEM_GROUPS = [
  { id: 'production', labelKey: 'uiLab.groups.production' },
  { id: 'material', labelKey: 'uiLab.groups.material' },
  { id: 'master', labelKey: 'uiLab.groups.master' },
  { id: 'system', labelKey: 'uiLab.groups.system' }
];

export const DESIGN_SYSTEM_PRIMITIVES = [
  { key: 'InstanceCard', kind: 'entity-chrome', componentPath: 'components/shared/InstanceCard.vue', purpose: 'Standard entity card chrome with identity, optional trace, optional status, content, and footer slots.' },
  { key: 'InstanceSelect', kind: 'entity-input', componentPath: 'components/shared/InstanceSelect.vue', purpose: 'PrimeVue Select wrapper rendering entity options and the selected value as one-line instance option rows (preview thumb, identifier title, state and type meta).' },
  { key: 'InstanceMultiSelect', kind: 'entity-input', componentPath: 'components/shared/InstanceMultiSelect.vue', purpose: 'PrimeVue MultiSelect wrapper rendering entity options as instance option rows and selected entities as glyph chips inside the control.' },
  { key: 'DataBlock', kind: 'block', componentPath: 'components/shared/blocks/DataBlock.vue', purpose: 'Canonical label/value rows for fact surfaces; descriptors resolve from the compiled type view (render.groups), rendered with the declared display policies.' },
  { key: 'InstanceState', kind: 'status', componentPath: 'components/shared/state/InstanceState.vue', purpose: 'Interactive status display and workflow-derived transition actions.' },
  { key: 'StateHistory', kind: 'status', componentPath: 'components/shared/state/StateHistory.vue', purpose: 'Status audit timeline for entity lifecycle events.' },
  { key: 'DrawingCanvas', kind: 'block', componentPath: 'components/shared/DrawingCanvas.vue', purpose: 'Shared layer-aware SVG canvas for geometry previews, DXF drawings, and sketch scenes.' },
  { key: 'DesignerSurface', kind: 'layout', componentPath: 'components/shared/DesignerSurface.vue', purpose: 'Shared full-height flex boundary for operational designer route, pane, and dialog hosts.' },
  { key: 'DesignerWorkspace', kind: 'layout', componentPath: 'components/shared/DesignerWorkspace.vue', purpose: 'Shared responsive palette/canvas/inspector workspace for operational designers.' },
  { key: 'DesignerDialog', kind: 'layout', componentPath: 'components/shared/DesignerDialog.vue', purpose: 'Viewport-sized dialog host for standalone designer launches.' },
  { key: 'GeometryPreview', kind: 'block', componentPath: 'components/shared/GeometryPreview.vue', purpose: 'Token-backed SVG preview for a resolved previewSource drawing value.' },
  { key: 'TraceLink', kind: 'trace', componentPath: 'components/shared/links/TraceLink.vue', purpose: 'Single related-entity link used inside rows, status locations, and custom relation fields; TraceChain is for full ancestry.' },
  { key: 'TraceChain', kind: 'trace', componentPath: 'components/shared/links/TraceChain.vue', purpose: 'Canonical lineage breadcrumb chain for entity ancestry.' },
  { key: 'ActionToolbar', kind: 'layout', componentPath: 'components/shared/ActionToolbar.vue', purpose: 'Shared section/header action row used by hubs, tabs, and list pages instead of ad hoc header flex markup.' },
  { key: 'ResponsiveGrid', kind: 'layout', componentPath: 'components/shared/ResponsiveGrid.vue', purpose: 'Token-backed responsive repeated-item grid.' },
  { key: 'StateBlock', kind: 'layout', componentPath: 'components/shared/StateBlock.vue', purpose: 'Standard loading, empty, and error states.' },
  { key: 'TableFrame', kind: 'layout', componentPath: 'components/shared/TableFrame.vue', purpose: 'Standard token-backed frame for PrimeVue DataTable surfaces, including table header background.' },
  { key: 'StandardDialog', kind: 'layout', componentPath: 'components/shared/StandardDialog.vue', purpose: 'Standard modal shell with footer and responsive sizing.' },
  { key: 'StandardPage', kind: 'layout', componentPath: 'components/shared/StandardPage.vue', purpose: 'Standard page shell with header and breadcrumbs.' }
];


export const DESIGN_SYSTEM_ENTITY_CONTRACTS = [
  ['entityRevision', 'entity_revision', 'system', 'entities.entityRevision', 'revision', 'createMockEntityRevision', 'hidden', true],
  ['penTemplate', 'pen_template', 'master', 'entities.penTemplate', 'pen', 'createMockPenTemplate', 'hidden', false],
  ['layerStandard', 'layer_standard', 'master', 'entities.layerStandard', 'standard', 'createMockLayerStandard', 'hidden', false],
  ['user', 'user', 'system', 'entities.user', 'user', 'createMockUser', 'hidden', false],
  ['organization', 'organization', 'system', 'entities.organization', 'organization', 'createMockOrganization', 'hidden', false]
].map(([key, typeId, group, labelKey, propName, factoryName, status, trace]) => ({
  key,
  typeId,
  group,
  labelKey,
  propName,
  factoryName,
  status,
  trace
}));

export const DESIGN_SYSTEM_SURFACE_CONTRACTS = createEntitySurfaceContracts(DESIGN_SYSTEM_ENTITY_CONTRACTS);

// The design-system entity contracts keyed by type id and legacy key —
// the one lookup both label seams (ui-mapping type labels, generated
// labels) resolve `labelKey` through.
export const ENTITY_CONTRACT_BY_TYPE = new Map(DESIGN_SYSTEM_ENTITY_CONTRACTS.flatMap(entry => [
  [entry.typeId, entry],
  [entry.key, entry]
]));

export function labelKeyForType(typeIdOrKey = '') {
  return ENTITY_CONTRACT_BY_TYPE.get(typeIdOrKey)?.labelKey || '';
}

export const DESIGN_SYSTEM_CONTRACT = {
  variants: DESIGN_SYSTEM_VARIANTS,
  groups: DESIGN_SYSTEM_GROUPS,
  primitives: DESIGN_SYSTEM_PRIMITIVES,
  contracts: DESIGN_SYSTEM_ENTITY_CONTRACTS,
  fieldGroups: DESIGN_SYSTEM_FIELD_GROUPS,
  surfaces: DESIGN_SYSTEM_SURFACE_CONTRACTS
};


// Per-entity surface chrome contracts died with the legacy domain package
// that authored them; instance surfaces resolve from the compiled CTS
// bundle today. The export stays (empty) so design-system consumers keep
// one import surface until their own cutover removes it.
export const DESIGN_SYSTEM_SURFACES = {};

export function validateDesignSystemContracts(entries = DESIGN_SYSTEM_ENTITY_CONTRACTS) {
  return entries.flatMap((entry) => {
    const issues = [];
    if (!entry.key) issues.push('missing key');
    if (!entry.typeId) issues.push('missing entity type');
    if (!entry.group) issues.push('missing group');
    if (!entry.labelKey) issues.push('missing label key');
    if (!entry.propName) issues.push('missing prop name');
    if (!entry.factoryName) issues.push('missing factory name');
    if (!['interactive', 'hidden', 'readonly'].includes(entry.status)) issues.push('invalid status policy');
    if (typeof entry.trace !== 'boolean') issues.push('invalid trace policy');
    if (!DESIGN_SYSTEM_SURFACE_CONTRACTS[entry.key]) issues.push('missing surface contract');

    return issues.map((issue) => ({ key: entry.key || 'unknown', issue }));
  });
}

export function validateDesignSystemDisplayContracts(entries = DESIGN_SYSTEM_ENTITY_CONTRACTS) {
  return entries.flatMap((entry) => {
    const contract = DESIGN_SYSTEM_SURFACE_CONTRACTS[entry.key];
    const groups = DESIGN_SYSTEM_FIELD_GROUPS[entry.key] || {};
    const issues = [];

    for (const surface of ['inline', 'compact', 'card', 'detail']) {
      if (!contract?.surfaces?.[surface]) issues.push({ surface, issue: 'missing required surface' });
    }

    for (const [surface, definition] of Object.entries(contract?.surfaces || {})) {
      if (!DESIGN_PREVIEW_MODES.includes(definition.preview || 'none')) issues.push({ surface, issue: 'invalid preview mode' });
      if (!DESIGN_DATA_DISPLAYS.includes(definition.dataDisplay || 'grid')) issues.push({ surface, issue: 'invalid data display' });
      if (!DESIGN_RELATION_DISPLAYS.includes(definition.relations || 'none')) issues.push({ surface, issue: 'invalid relation display' });
      if (!DESIGN_ACTION_DISPLAYS.includes(definition.actions || 'none')) issues.push({ surface, issue: 'invalid action display' });

      for (const groupName of definition.fieldGroups || []) {
        const fields = groups[groupName];
        if (!fields) {
          issues.push({ surface, group: groupName, issue: 'missing field group' });
          continue;
        }

        for (const field of fields) {
          const paths = [field.path, ...(field.fallbackPaths || [])].filter(Boolean);
          for (const path of paths) {
            if (!findEntityFieldPolicy(entry.typeId, path)) {
              issues.push({ surface, group: groupName, path, issue: 'field path missing access policy' });
            }
          }
        }
      }
    }

    return issues.map(issue => ({ key: entry.key || 'unknown', ...issue }));
  });
}
