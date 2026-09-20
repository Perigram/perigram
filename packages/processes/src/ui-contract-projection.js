// The UI-contract projection: the single emit boundary between the process
// compiler's internals and every UI consumer. Compiled screens and actions
// speak the CTS vocabulary (`typeId`, `typeList`/`instanceDetail`,
// `createInstance`/`link`/`runCommand`) that `#shared/ui-mapping`
// (`composeScreen`) and the ui-mapping component registry consume. There is
// no second screen/action vocabulary: what leaves the compiler through here
// is the only shape renderers see.
//
// Screen source scoping follows the ui-mapping contract:
// - `mode: 'list'` unscoped renders the whole type collection;
// - `mode: 'single'` resolves by `scope.instanceId` (route-provided) with
//   identifier fallback;
// - a child collection source whose filters scope one lineage key to the
//   screen's entity becomes `lineage: { sourceId, key }` against the
//   detail main source — the same reference `composeScreen` resolves
//   through the origin instance.
const TEMPLATE_BY_LEGACY = Object.freeze({
  entityList: 'typeList',
  entityDetail: 'instanceDetail'
});

const ACTION_KIND_BY_LEGACY = Object.freeze({
  createEntity: 'createInstance',
  updateEntity: 'updateInstance',
  changeStatus: 'updateInstance',
  deleteEntity: 'deleteInstance',
  runCommand: 'runCommand'
});

// Actions with no generated-UI surface stay runtime-only: they are never
// projected into the manifest.
const RUNTIME_ONLY_ACTION_KINDS = new Set(['sendToOrganization']);

function typeIdOfRecord(record = {}) {
  return record.typeId || record.entityType || null;
}

export function projectUiScreen(screen = {}) {
  const typeId = typeIdOfRecord(screen);
  const mainSourceId = screen.sources?.find(source => source.mode === 'single')?.id || typeId || screen.id;
  return {
    id: screen.id,
    screenKey: screen.screenKey || screen.id,
    label: screen.label || screen.id,
    kind: screen.kind || 'route',
    template: TEMPLATE_BY_LEGACY[screen.template] || screen.template,
    route: screen.route || '',
    sourceRoute: screen.sourceRoute || screen.route || '',
    placement: screen.placement || 'hub',
    typeId,
    required: screen.required || null,
    roleIds: screen.roleIds || [],
    scope: screen.scope || {},
    bindings: screen.bindings || {},
    sources: (screen.sources || []).map(source => projectUiSource(source, mainSourceId)),
    regions: (screen.regions || []).map(region => ({ ...region })),
    actions: screen.actions || []
  };
}

function projectUiSource(source = {}, mainSourceId) {
  const projected = {
    id: source.id,
    label: source.label || null,
    typeId: typeIdOfRecord(source),
    mode: source.mode === 'single' ? 'single' : 'list',
    required: source.required || null,
    identifier: source.identifier || null,
    filters: source.filters || {}
  };
  const lineage = lineageRefOfSource(source, mainSourceId);
  if (lineage) projected.lineage = lineage;
  if (source.relation) projected.relation = { ...source.relation };
  return projected;
}

// A child-collection source scopes one lineage key to the screen's entity
// (`filters: { [lineageKey]: '$screen.scope.entityId' }`); project it to the
// ui-mapping `lineage` reference against the detail main source.
function lineageRefOfSource(source = {}, mainSourceId) {
  if (source.mode === 'single') return null;
  if (source.lineage) return { ...source.lineage };
  const filters = source.filters || {};
  const entries = Object.entries(filters).filter(([, value]) => value === '$screen.scope.entityId');
  if (entries.length === 1) {
    return { sourceId: mainSourceId, key: entries[0][0] };
  }
  return null;
}

// Node labels default to the record's kind string; a button caption that is
// just the kind leaks machinery vocabulary instead of the target entity.
const DEFAULT_ACTION_LABELS = new Set(['cts.construct', 'effect.createEntity', 'effect.runProducer', 'Action', 'action', 'Create', 'create']);

export function projectUiAction(action = {}, { typeLabels = new Map() } = {}) {
  const legacyKind = action.actionKind || 'createEntity';
  if (RUNTIME_ONLY_ACTION_KINDS.has(legacyKind)) return null;
  const relationOperation = action.relationMutation?.operation;
  const actionKind = relationOperation === 'link' || relationOperation === 'unlink'
    ? relationOperation
    : ACTION_KIND_BY_LEGACY[legacyKind] || null;
  if (!actionKind) return null;
  const typeId = typeIdOfRecord(action);
  const typeLabel = typeLabels.get(typeId) || null;
  const rawLabel = action.label || action.id || action.actionId;
  const label = typeLabel && DEFAULT_ACTION_LABELS.has(String(rawLabel))
    ? (actionKind === 'createInstance' || actionKind === 'link' ? `New ${typeLabel}` : typeLabel)
    : rawLabel;
  const projected = {
    id: action.id || action.actionId,
    label,
    actionKind,
    typeId,
    trigger: { mode: action.trigger?.mode || 'manual' },
    access: {
      level: action.access?.level || 'write',
      grants: action.access?.grants || []
    }
  };
  if (action.producerOutputId) projected.producerOutputId = action.producerOutputId;
  if (action.commandId) projected.commandId = action.commandId;
  if (action.status?.to) projected.status = { to: action.status.to };
  if (action.construction?.mode) {
    projected.construction = {
      mode: action.construction.mode,
      inputs: (action.construction.inputs || []).map(input => input.id || input.name).filter(Boolean)
    };
  }
  if (action.relationMutation) {
    projected.relation = {
      key: action.relationMutation.key,
      targetType: action.relationMutation.targetType,
      cardinality: action.relationMutation.cardinality || 'scalar'
    };
  }
  if (action.inputPolicy?.fields?.length) {
    projected.fields = action.inputPolicy.fields
      .filter(field => field.display !== 'hidden')
      .map(field => field.id || field.path || field.name)
      .filter(Boolean);
  }
  return projected;
}

// Project the compiled contract's screen/action channels. Pure: the roles,
// permissions, workflows, producer outputs, and services channels pass
// through untouched — only the UI-facing vocabulary is translated here.
export function projectUiContractChannels(compiled = {}) {
  const actions = {};
  for (const action of Object.values(compiled.actions || {})) {
    const projected = projectUiAction(action);
    if (projected) actions[projected.id] = projected;
  }
  const screens = {};
  for (const [id, screen] of Object.entries(compiled.screens || {})) {
    const projected = projectUiScreen(screen);
    screens[projected.id || id] = projected;
  }
  return { screens, actions };
}

export const UI_CONTRACT_TEMPLATES = Object.freeze(['typeList', 'instanceDetail']);
export const UI_CONTRACT_ACTION_KINDS = Object.freeze([
  'createInstance',
  'updateInstance',
  'deleteInstance',
  'link',
  'unlink',
  'runCommand'
]);
