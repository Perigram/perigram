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
  runCommand: 'runCommand',
  // Already-projected kinds pass through: the assignment channel emits
  // projected records, and this seam is the single projection — running
  // it twice must stay a no-op, never a drop.
  createInstance: 'createInstance',
  updateInstance: 'updateInstance',
  deleteInstance: 'deleteInstance',
  link: 'link',
  unlink: 'unlink'
});

// Actions with no generated-UI surface stay runtime-only: they are never
// projected into the manifest.
const RUNTIME_ONLY_ACTION_KINDS = new Set(['sendToOrganization']);

function typeIdOfRecord(record = {}) {
  return record.typeId || null;
}

export function projectUiScreen(screen = {}) {
  const typeId = typeIdOfRecord(screen);
  const mainSourceId = screen.sources?.find(source => source.mode === 'single')?.id || typeId || screen.id;
  // Spread-based: the projection overrides the vocabulary keys and leaves
  // every authored/app key (labelKey, icon, systemScreens, systemActions,
  // scope contracts…) intact. A whitelist rebuild silently dropped the
  // system surfaces' button contracts once — this seam translates, it
  // never amputates.
  return {
    ...screen,
    id: screen.id,
    screenKey: screen.screenKey || screen.id,
    label: screen.label || screen.id,
    template: TEMPLATE_BY_LEGACY[screen.template] || screen.template,
    typeId,
    sources: (screen.sources || []).map(source => projectUiSource(source, mainSourceId)),
    regions: (screen.regions || []).map(region => ({ ...region })),
    actions: screen.actions || []
  };
}

function projectUiSource(source = {}, mainSourceId) {
  // Spread-based like projectUiScreen: translate the vocabulary keys,
  // keep every authored key (lineageBindings, label, scope contracts…).
  const projected = {
    ...source,
    label: source.label || null,
    typeId: typeIdOfRecord(source),
    mode: source.mode === 'single' ? 'single' : 'list',
    required: source.required || null,
    filters: source.filters || {}
  };
  const lineage = lineageRefOfSource(source, mainSourceId);
  if (lineage) projected.lineage = lineage;
  if (source.relation) projected.relation = { ...source.relation };
  return projected;
}

// A child-collection source scopes one lineage key to the screen's entity
// (`filters: { [lineageKey]: '$screen.scope.instanceId' }`); project it to the
// ui-mapping `lineage` reference against the detail main source.
function lineageRefOfSource(source = {}, mainSourceId) {
  if (source.mode === 'single') return null;
  if (source.lineage) return { ...source.lineage };
  const filters = source.filters || {};
  const entries = Object.entries(filters).filter(([, value]) => value === '$screen.scope.instanceId');
  if (entries.length === 1) {
    return { sourceId: mainSourceId, key: entries[0][0] };
  }
  return null;
}

// Node labels default to the record's kind string; a button caption that is
// just the kind leaks machinery vocabulary instead of the target entity.
const DEFAULT_ACTION_LABELS = new Set(['cts.construct', 'Action', 'action', 'Create', 'create']);

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
  if (action.state?.to || action.state?.from) {
    projected.state = {
      ...(action.state.from ? { from: action.state.from } : {}),
      ...(action.state.to ? { to: action.state.to } : {})
    };
  }
  if (action.construction?.mode) {
    projected.construction = {
      mode: action.construction.mode,
      // Idempotent: assignment access already projects inputs to id
      // strings, and hydration projects a second time — strings pass
      // through instead of dropping to [].
      inputs: (action.construction.inputs || [])
        .map(input => typeof input === 'string' ? input : (input.id || input.name))
        .filter(Boolean)
    };
  }
  if (action.relationMutation) {
    projected.relation = {
      key: action.relationMutation.key,
      targetTypes: action.relationMutation.targetTypes || [],
      cardinality: action.relationMutation.cardinality || 'scalar',
      // The target domain (SPEC §6): pickers filter options through the
      // same expression the write boundary enforces.
      ...(action.relationMutation.where ? { where: action.relationMutation.where } : {})
    };
  }
  if (action.inputPolicy?.fields?.length) {
    projected.fields = action.inputPolicy.fields
      .filter(field => field.display !== 'hidden')
      .map(field => typeof field === 'string' ? field : (field.id || field.path || field.name))
      .filter(Boolean);
  }
  // The create dialog resolves file inputs against the prompt policy:
  // without it, upload-protocol creates render a name-only form even
  // though the manifest action carries the file field.
  if (action.inputPolicy) {
    projected.inputPolicy = action.inputPolicy;
  }
  // The exposure inputs (the run dialog's parameter rows) ride both
  // action channels — the manifest and the contract — so every renderer
  // prompts from one vocabulary.
  if (Array.isArray(action.inputs)) {
    projected.inputs = action.inputs;
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

// The manifest action record: the projected UI contract plus the rich
// execution fields the action surfaces consume (prompt policy, relation
// mutation, status window, parent context, permission feature) — under
// the projected vocabulary. There is exactly one key per concept: `id`
// (never `actionId`), `typeId` (never `typeId`), `parentTypeId`
// (never `parentTypeId`). The compiled execution channel keeps its
// internal names; everything the browser reads comes through here.
export function projectManifestAction(action = {}, { typeLabels = new Map() } = {}) {
  const projected = projectUiAction(action, { typeLabels });
  if (!projected) return null;
  return {
    ...projected,
    level: action.access?.level || 'write',
    feature: action.feature || null,
    contracts: action.contracts || null,
    inputPolicy: action.inputPolicy || { prompt: false, fields: [] },
    relationMutation: action.relationMutation || null,
    // The exposure input contracts (entity inputs row binding consumes);
    // their descriptors keep the compiler prompt-form field vocabulary.
    inputs: action.inputs || [],
    ...(action.state ? { state: { ...action.state } } : {}),
    ...(action.parentTypeId ? { parentTypeId: action.parentTypeId } : {}),
    ...(action.parentRevision ? { parentRevision: action.parentRevision } : {})
  };
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
