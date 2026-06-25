export const SCREEN_TEMPLATES = ['entityList', 'entityDetail', 'workspaceLanes', 'table', 'formAction', 'home'];
export const SCREEN_SOURCE_MODES = ['list', 'single'];
export const SCREEN_REGION_SLOTS = ['main', 'left', 'center', 'right'];
export const GENERATED_SCREEN_ROUTE_PREFIX = '/screens';

const TEMPLATE_DEFAULT_MODE = {
  entityDetail: 'single',
  entityList: 'list',
  workspaceLanes: 'list',
  table: 'list',
  formAction: 'single'
};

export function generatedScreenRoute(screenKey) {
  return `${GENERATED_SCREEN_ROUTE_PREFIX}/${encodeURIComponent(String(screenKey || ''))}`;
}

export function normalizeScreenTemplate(screen = {}) {
  if (SCREEN_TEMPLATES.includes(screen.template)) return screen.template;
  if (screen.kind === 'entityDetail') return 'entityDetail';
  if (screen.kind === 'workspace') return 'workspaceLanes';
  return screen.entityType ? 'entityList' : 'formAction';
}

export function normalizeScreenContract(screen = {}) {
  const template = normalizeScreenTemplate(screen);
  const sourceDefaults = defaultSourcesForScreen(screen, template);
  const sources = normalizeSources(screen.sources?.length ? screen.sources : sourceDefaults, screen, template);
  const regions = normalizeRegions(screen.regions?.length ? screen.regions : defaultRegionsForScreen(sources, template));
  return {
    ...screen,
    template,
    sources,
    regions,
    actions: Array.isArray(screen.actions) ? screen.actions : []
  };
}

export function validateScreenContract(screen = {}, { screenId = screen.id, entities = new Set(), actions = {}, errors = [] } = {}) {
  const normalized = normalizeScreenContract(screen);
  if (!SCREEN_TEMPLATES.includes(normalized.template)) {
    errors.push(`Screen ${screenId} uses unknown template ${normalized.template}`);
  }
  for (const source of normalized.sources) {
    if (!source.id) errors.push(`Screen ${screenId} has a source without id`);
    if (!SCREEN_SOURCE_MODES.includes(source.mode)) errors.push(`Screen ${screenId} source ${source.id} uses unknown mode ${source.mode}`);
    if (!source.entityType) errors.push(`Screen ${screenId} source ${source.id} must define entityType`);
    if (source.entityType && entities.size && !entities.has(source.entityType)) errors.push(`Screen ${screenId} source ${source.id} uses unknown entity type ${source.entityType}`);
  }
  for (const region of normalized.regions) {
    if (!SCREEN_REGION_SLOTS.includes(region.slot)) errors.push(`Screen ${screenId} region ${region.id} uses unknown slot ${region.slot}`);
    if (region.sourceId && !normalized.sources.some(source => source.id === region.sourceId)) {
      errors.push(`Screen ${screenId} region ${region.id} references missing source ${region.sourceId}`);
    }
  }
  for (const actionId of normalized.actions) {
    if (!actions[actionId]) errors.push(`Screen ${screenId} references missing action ${actionId}`);
  }
  return normalized;
}

function defaultSourcesForScreen(screen = {}, template = 'entityList') {
  if (template === 'home') return [];
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
      filters: mode === 'list' && source.filters && typeof source.filters === 'object' ? source.filters : {}
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
