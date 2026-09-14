export const SCREEN_TEMPLATES = ['entityList', 'entityDetail', 'workspaceLanes', 'table', 'formAction', 'home', 'route', 'organizationOverview', 'organizationAccount'];
export const SCREEN_SOURCE_MODES = ['list', 'single'];
export const SCREEN_REGION_SLOTS = ['main', 'left', 'center', 'right', 'supporting'];
// Canonical registry of region surfaces the generated screen runtime renders:
// card/compact/table/workspace for list-mode regions, detail for single-mode.
export const SCREEN_REGION_SURFACES = ['card', 'compact', 'detail', 'table', 'workspace'];
export const SCREEN_LINEAGE_BINDING_FIELDS = [
  'childEntityType',
  'ancestorEntityType',
  'lineageKey',
  'sourceNode',
  'sourceSocket',
  'consumingNode',
  'consumingSocket'
];
export const GENERATED_SCREEN_ROUTE_PREFIX = '/screens';

const TEMPLATE_DEFAULT_MODE = {
  entityDetail: 'single',
  entityList: 'list',
  workspaceLanes: 'list',
  table: 'list',
  formAction: 'single'
};

// Per-template region rules: which slots the template's renderer consumes and
// whether a slot collapses to a single region (workspace lanes key regions by
// slot, so a second region in one slot would silently replace the first).
const TEMPLATE_REGION_RULES = {
  workspaceLanes: { slots: ['main', 'left', 'center', 'right'], uniqueSlots: true }
};

export function generatedScreenRoute(screenKey) {
  return `${GENERATED_SCREEN_ROUTE_PREFIX}/${encodeURIComponent(String(screenKey || ''))}`;
}

export function normalizeScreenTemplate(screen = {}) {
  const source = isPlainObject(screen) ? screen : {};
  if (SCREEN_TEMPLATES.includes(source.template)) return source.template;
  if (source.kind === 'entityDetail') return 'entityDetail';
  if (source.kind === 'workspace') return 'workspaceLanes';
  return source.entityType ? 'entityList' : 'formAction';
}

export function normalizeScreenContract(screen = {}) {
  const source = isPlainObject(screen) ? screen : {};
  const template = normalizeScreenTemplate(source);
  const sourceDefaults = defaultSourcesForScreen(source, template);
  const sources = normalizeSources(source.sources?.length ? source.sources : sourceDefaults, source, template);
  const regions = normalizeRegions(source.regions?.length ? source.regions : defaultRegionsForScreen(sources, template));
  return {
    ...source,
    template,
    sources,
    regions,
    actions: Array.isArray(source.actions) ? source.actions : []
  };
}

export function validateScreenContract(screen = {}, { screenId = isPlainObject(screen) ? screen.id : '', entities = new Set(), actions = {}, errors = [] } = {}) {
  if (!isPlainObject(screen)) {
    errors.push(`Screen ${screenId || '(unknown)'} must be an object`);
  }
  const normalized = normalizeScreenContract(screen);
  if (!SCREEN_TEMPLATES.includes(normalized.template)) {
    errors.push(`Screen ${screenId} uses unknown template ${normalized.template}`);
  }
  validateScreenBindings(normalized, screenId, errors);
  const sourceIds = new Set();
  for (const source of normalized.sources) {
    if (!source.id) errors.push(`Screen ${screenId} has a source without id`);
    if (source.id && sourceIds.has(source.id)) errors.push(`Screen ${screenId} has duplicate source id ${source.id}`);
    sourceIds.add(source.id);
    if (!SCREEN_SOURCE_MODES.includes(source.mode)) errors.push(`Screen ${screenId} source ${source.id} uses unknown mode ${source.mode}`);
    if (!source.entityType) errors.push(`Screen ${screenId} source ${source.id} must define entityType`);
    if (source.entityType && entities.size && !entities.has(source.entityType)) errors.push(`Screen ${screenId} source ${source.id} uses unknown entity type ${source.entityType}`);
    validateSourceIdentifier(source, normalized, screenId, errors);
    validateSourceFilters(source, normalized, screenId, errors);
  }
  const regionIds = new Set();
  const regionSlots = new Set();
  const regionRules = TEMPLATE_REGION_RULES[normalized.template] || null;
  for (const region of normalized.regions) {
    if (regionIds.has(region.id)) errors.push(`Screen ${screenId} has duplicate region id ${region.id}`);
    regionIds.add(region.id);
    if (!SCREEN_REGION_SLOTS.includes(region.slot)) errors.push(`Screen ${screenId} region ${region.id} uses unknown slot ${region.slot}`);
    if (regionRules && !regionRules.slots.includes(region.slot)) {
      errors.push(`Screen ${screenId} region ${region.id} uses slot ${region.slot} that template ${normalized.template} does not render`);
    }
    if (regionRules?.uniqueSlots) {
      if (regionSlots.has(region.slot)) errors.push(`Screen ${screenId} template ${normalized.template} allows only one region per slot (${region.slot})`);
      regionSlots.add(region.slot);
    }
    if (region.surface && !SCREEN_REGION_SURFACES.includes(region.surface)) {
      errors.push(`Screen ${screenId} region ${region.id} uses unknown surface ${region.surface}`);
    }
    if (region.sourceId && !normalized.sources.some(source => source.id === region.sourceId)) {
      errors.push(`Screen ${screenId} region ${region.id} references missing source ${region.sourceId}`);
    }
    for (const actionId of region.actions) {
      if (!actions[actionId]) errors.push(`Screen ${screenId} region ${region.id} references missing action ${actionId}`);
    }
  }
  for (const actionId of normalized.actions) {
    if (!actions[actionId]) errors.push(`Screen ${screenId} references missing action ${actionId}`);
  }
  return normalized;
}

// Bindings are statically resolvable only as literal scalars or $assignment
// references; anything else can never resolve at compile time.
function validateScreenBindings(screen = {}, screenId = '', errors = []) {
  if (screen.bindings === undefined || screen.bindings === null) return;
  if (!isPlainObject(screen.bindings)) {
    errors.push(`Screen ${screenId} bindings must be an object`);
    return;
  }
  for (const [key, value] of Object.entries(screen.bindings)) {
    if (isAssignmentReference(value)) continue;
    if (isScalar(value) && value !== '') continue;
    errors.push(`Screen ${screenId} binding ${key} must be a literal value or $assignment reference`);
  }
}

// A single-mode source resolves its entity from the identifier; without one the
// runtime can only render a missing-identifier error state.
function validateSourceIdentifier(source = {}, screen = {}, screenId = '', errors = []) {
  if (source.mode !== 'single') return;
  if (source.identifier === null || source.identifier === undefined || source.identifier === '') {
    errors.push(`Screen ${screenId} source ${source.id} is single-mode and must define an identifier`);
    return;
  }
  if (!isScalar(source.identifier)) {
    errors.push(`Screen ${screenId} source ${source.id} identifier must be a scalar or $screen/$assignment placeholder`);
    return;
  }
  validatePlaceholder(source.identifier, screen, screenId, `source ${source.id} identifier`, errors);
}

// Filters must be a flat map of scalar expected values; nested objects never
// match at runtime and placeholder strings must be well-formed references.
function validateSourceFilters(source = {}, screen = {}, screenId = '', errors = []) {
  if (source.mode !== 'list') return;
  if (source.filters === undefined || source.filters === null) return;
  if (!isPlainObject(source.filters)) {
    errors.push(`Screen ${screenId} source ${source.id} filters must be an object`);
    return;
  }
  for (const [path, value] of Object.entries(source.filters)) {
    if (!isScalar(value)) {
      errors.push(`Screen ${screenId} source ${source.id} filter ${path} must be a scalar or $screen/$assignment placeholder`);
      continue;
    }
    validatePlaceholder(value, screen, screenId, `source ${source.id} filter ${path}`, errors);
  }
}

function validatePlaceholder(value, screen = {}, screenId = '', label = 'value', errors = []) {
  if (typeof value !== 'string') return;
  if (value.startsWith('$assignment.') && !value.slice('$assignment.'.length)) {
    errors.push(`Screen ${screenId} ${label} uses an empty $assignment reference`);
  }
  if (!value.startsWith('$screen.')) return;
  if (!value.slice('$screen.'.length)) {
    errors.push(`Screen ${screenId} ${label} uses an empty $screen reference`);
    return;
  }
  if (value.startsWith('$screen.bindings.')) {
    const bindingKey = value.slice('$screen.bindings.'.length);
    if (!isPlainObject(screen.bindings) || !(bindingKey in screen.bindings)) {
      errors.push(`Screen ${screenId} ${label} references undeclared binding ${bindingKey}`);
    }
  }
}

function isAssignmentReference(value) {
  return typeof value === 'string' && value.startsWith('$assignment.') && Boolean(value.slice('$assignment.'.length));
}

function isScalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function defaultSourcesForScreen(screen = {}, template = 'entityList') {
  if (['home', 'route', 'organizationOverview', 'organizationAccount'].includes(template)) return [];
  if (!screen.entityType) return [];
  const sourceId = screen.sourceId || screen.entityType;
  const mode = TEMPLATE_DEFAULT_MODE[template] || 'list';
  return [{
    id: sourceId,
    entityType: screen.entityType,
    mode,
    required: screen.required || null,
    identifier: mode === 'single' ? defaultSingleIdentifier(screen) : null,
    filters: mode === 'list' ? (screen.filters || {}) : {}
  }];
}

function defaultSingleIdentifier(screen = {}) {
  return screen.scope?.entityId
    || screen.scope?.[`${screen.entityType}Id`]
    || screen.bindings?.entityId
    || screen.bindings?.[`${screen.entityType}Id`]
    || '';
}

function normalizeSources(sources = [], screen = {}, template = 'entityList') {
  const defaultMode = TEMPLATE_DEFAULT_MODE[template] || 'list';
  return sources.map((source, index) => {
    const entityType = source.entityType || screen.entityType || '';
    const mode = SCREEN_SOURCE_MODES.includes(source.mode) ? source.mode : defaultMode;
    return {
      id: source.id || entityType || `source_${index + 1}`,
      label: source.label || '',
      entityType,
      mode,
      required: source.required || screen.required || null,
      identifier: mode === 'single' ? (source.identifier || defaultSingleIdentifier({ ...screen, entityType })) : null,
      filters: mode === 'list' && source.filters !== undefined && source.filters !== null ? source.filters : {},
      lineageBindings: mode === 'list' && Array.isArray(source.lineageBindings)
        ? source.lineageBindings.map(binding => ({ ...binding }))
        : []
    };
  });
}

function defaultRegionsForScreen(sources = [], template = 'entityList') {
  const source = sources[0];
  if (!source) return [];
  const slot = template === 'workspaceLanes' ? 'center' : 'main';
  return [{
    id: 'main',
    slot,
    sourceId: source.id,
    surface: template === 'entityDetail' ? 'detail' : 'card',
    actions: []
  }];
}

function normalizeRegions(regions = []) {
  return regions.map((region, index) => ({
    id: region.id || `region_${index + 1}`,
    label: region.label || '',
    slot: SCREEN_REGION_SLOTS.includes(region.slot) ? region.slot : 'main',
    sourceId: region.sourceId || '',
    surface: region.surface || 'card',
    actions: Array.isArray(region.actions) ? region.actions : []
  }));
}
