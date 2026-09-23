// Graph protocol v5 (SPEC §20): process definitions whose entity-bound
// records speak the type system. Species kinds, CTS type ids, row-relative
// field paths, declaration-owned state values. The pure value algebra
// (sources, values, collections/trees, control) is untouched — it is
// already V-honest.
//
// Direction:
// - migrateV4Definition: the one-way persisted rewrite (v4 vocabulary ->
//   v5). Syntactic: slot paths strip their data/specs block prefix unless
//   managed; entity ids kebab-case; kinds map through the species table.
// - resolveCtsDefinition: the compile-time lowering (v5 -> the executable
//   working shapes). Row paths regain their slot prefix by lookup in the
//   projected field schemas — the same single source the compiler reads.
//   The lowered form is internal: never authored, never persisted.
// - checkCtsGraphBindings: declaration-level binding validation (type
//   exists, state declared, field in row) beside R1-R6.
import { SPECIES_BY_EFFECT_KIND } from './process-grammar.js';

const CTS_KIND = Object.freeze({
  construct: 'cts.construct',
  mutate: 'cts.mutate',
  transition: 'cts.transition',
  remove: 'cts.remove',
  command: 'cts.command',
  conversion: 'cts.conversion',
  read: 'cts.read',
  field: 'cts.field',
  compose: 'cts.compose',
  decompose: 'cts.decompose',
  join: 'cts.join'
});

const CTS_SERVICE_KIND = 'cts.service';

const READ_SELECT_BY_KIND = Object.freeze({
  'read.currentEntity': 'current',
  'read.entityById': 'byId',
  'read.resolveEntityRef': 'byRef',
  'read.parent': 'parent',
  'read.children': 'children',
  'read.related': 'related',
  'read.queryEntities': 'query',
  'read.filterRecords': 'filter'
});

// v4 kind -> v5 mapping; flags disambiguate kinds that share a species.
// The reverse table is derived, so the pair cannot drift.
const V5_MAPPING = Object.freeze({
  'effect.createEntity': { kind: CTS_KIND.construct },
  'effect.runProducer': { kind: CTS_KIND.construct, producer: true },
  'effect.updateEntity': { kind: CTS_KIND.mutate },
  'effect.changeStatus': { kind: CTS_KIND.transition },
  'effect.archiveEntity': { kind: CTS_KIND.transition, archive: true },
  'effect.deleteEntity': { kind: CTS_KIND.remove },
  'effect.runCommand': { kind: CTS_KIND.command },
  'effect.sendEntity': { kind: CTS_KIND.command, send: true },
  'effect.generateAttachment': { kind: CTS_KIND.conversion },
  'record.getField': { kind: CTS_KIND.field },
  'record.composeBlock': { kind: CTS_KIND.compose, mode: 'compose' },
  'record.modifyBlock': { kind: CTS_KIND.compose, mode: 'modify' },
  'record.construct': { kind: CTS_KIND.compose, record: true },
  'record.entityDraft': { kind: CTS_KIND.compose, record: true, draft: true },
  'record.deconstruct': { kind: CTS_KIND.decompose },
  'record.getBlock': { kind: CTS_KIND.decompose, one: true },
  'producer.join': { kind: CTS_KIND.join },
  ...Object.fromEntries(Object.keys(READ_SELECT_BY_KIND).map(kind => [
    kind, { kind: CTS_KIND.read, select: READ_SELECT_BY_KIND[kind] }
  ]))
});

const V4_KIND_BY_V5 = buildReverseMapping();

function buildReverseMapping() {
  const reverse = new Map();
  for (const [v4Kind, mapping] of Object.entries(V5_MAPPING)) {
    const flags = ['producer', 'archive', 'send', 'record', 'draft', 'one', 'mode'];
    const key = v5Key(mapping.kind, mapping, flags);
    if (!reverse.has(key)) reverse.set(key, v4Kind);
  }
  // reads: select -> v4 kind
  for (const [v4Kind, select] of Object.entries(READ_SELECT_BY_KIND)) {
    reverse.set(`cts.read|select=${select}`, v4Kind);
  }
  return reverse;
}

function v5Key(kind, record, flagNames) {
  return [
    kind,
    ...flagNames.map(flag => (record[flag] === undefined ? '' : `${flag}=${record[flag]}`))
  ].filter(Boolean).join('|');
}

export function isCtsGraphDefinition(data = {}) {
  const source = data?.data || data;
  if (source?.graphProtocol === 5) return true;
  return Object.values(source?.processNodes || {}).some(node => String(node?.kind || '').startsWith('cts.'));
}

// The record vocabulary seam (SPEC §20): v5 species records bind a type
// through `typeId`. One accessor pair so
// the designer surfaces and the catalog never re-derive the branch.
export function typeIdOf(record = {}) {
  return record?.typeId || '';
}

export function setTypeBinding(record = {}, typeId = '') {
  if (!record) return;
  if (String(record.kind || '').startsWith('cts.')) record.typeId = typeId;
  else record.typeId = typeId;
}

// The operation kind of any record: v4 kinds are themselves; cts records map
// through the canonical table (flags + read selects included). The single
// seam every kind-matching consumer routes through — no duplicated
// vocabulary.
export function operationKindOf(node = {}) {
  const kind = String(node?.kind || '');
  if (kind === CTS_SERVICE_KIND) return 'effect.runCommand';
  if (!kind.startsWith('cts.')) return kind;
  return v4KindFor(node) || kind;
}

// Single-record resolution: one cts record -> its working twin (operation
// kind, storage entity id, slot paths). What resolveCtsDefinition does per
// collection, exposed for callers that hold one record (the designer's
// port/context resolution).
export function resolveCtsRecord(node = {}, domain = {}) {
  return resolveNode(node, domain, typeIdResolver(domain), [], '');
}

function kebab(value = '') {
  return String(value).replace(/_/g, '-');
}

function snake(value = '') {
  return String(value).replace(/-/g, '_');
}

// Type ids resolve against the projected entity list first (org types carry
// their kebab id as the storage id), falling back to the legacy snake form
// for system types.
function typeIdResolver(domain = {}) {
  const typeIds = new Set((domain.entities || []).map(entity => entity.type));
  return typeId => {
    if (!typeId) return null;
    if (typeIds.has(typeId)) return typeId;
    const snaked = snake(typeId);
    return typeIds.has(snaked) ? snaked : null;
  };
}

const ROW_BLOCKS = Object.freeze(['data', 'specs']);
const RESERVED_GENERIC = 'data.value';

// v4 slot path -> v5 row path (null = managed slot, keep as-is). Stripping
// is verified against the projected field schemas: a data/specs path the
// type does not declare (e.g. specs on a type without specs rows) stays
// slot-qualified so the round trip loses nothing.
function toRowPath(slotPath = '', typeId = '', domain = {}) {
  const path = String(slotPath);
  if (path === RESERVED_GENERIC || path.endsWith('*')) return null;
  const [block, ...rest] = path.split('.');
  if (!ROW_BLOCKS.includes(block) || !rest.length) return null;
  const rowPath = rest.join('.');
  return toSlotPath(rowPath, typeId, domain) === `${block}.${rowPath}` ? rowPath : null;
}

// v5 row path -> v4 slot path via the projected field schemas of one type.
// Returns null when the path is not a declared row field (managed slot).
function toSlotPath(rowPath = '', typeId = '', domain = {}) {
  const path = String(rowPath);
  const [block] = path.split('.');
  if (ROW_BLOCKS.includes(block)) return null; // already slot-qualified
  const schemas = schemasFor(domain, typeId);
  for (const slot of ROW_BLOCKS) {
    if (schemas.some(schema => schema.path === `${slot}.${path}`)) return `${slot}.${path}`;
  }
  return null;
}

function schemasFor(domain = {}, typeId = '') {
  const key = String(typeId || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  return domain.fieldSchemas?.[key] || domain.fieldSchemas?.[camel] || [];
}

// -- migration: v4 -> v5 (syntactic, one-way, persisted) --

// One-way vocabulary rewrite for definitions persisted before the typeId
// unification: records, port descriptors, prompt fields, lineage
// bindings, and screen templates authored under the legacy keys load as
// their typeId-vocabulary equivalents. Pure and total — applied at this
// seam because every load (validate, activate, hydrate, designer save)
// flows through it; the stored document self-heals on its next save.
const LEGACY_TYPE_KEYS = Object.freeze({
  entityType: 'typeId',
  childEntityType: 'childTypeId',
  ancestorEntityType: 'parentTypeId',
  parentEntityType: 'parentTypeId'
});
const LEGACY_TEMPLATES = Object.freeze({ entityList: 'typeList', entityDetail: 'instanceDetail' });

export function renameLegacyTypeKeys(value) {
  if (Array.isArray(value)) return value.map(renameLegacyTypeKeys);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  const renamed = {};
  for (const [key, entry] of Object.entries(value)) {
    if (Object.hasOwn(LEGACY_TYPE_KEYS, key)) {
      renamed[LEGACY_TYPE_KEYS[key]] = renameLegacyTypeKeys(entry);
      continue;
    }
    if (key === 'template' && Object.hasOwn(LEGACY_TEMPLATES, entry)) {
      renamed.template = LEGACY_TEMPLATES[entry];
      continue;
    }
    renamed[key] = renameLegacyTypeKeys(entry);
  }
  return renameLegacyStatusKeys(renamed);
}

const LEGACY_STATUS_KEYS = Object.freeze({
  statusDefinitions: 'stateDefinitions',
  statusRef: 'stateRef',
  statusWorkflows: 'stateWorkflows',
  primaryStatuses: 'primaryStates',
  primaryStatus: 'primaryState',
  stateTo: 'stateTo',
  stateFrom: 'stateFrom'
});

// One-way rewrite of the pre-state vocabulary on every load: the action and
// process-node `status` payload becomes `state`, the status-socket path
// becomes `states.main` (input ids, defaults, handles, construction
// inputs), and statusDefinition canvas nodes become stateDefinition. Old
// drafts and stored compiled contracts hydrate into the state vocabulary;
// the rewrite is idempotent and never re-introduces legacy keys.
export function renameLegacyStatusKeys(value) {
  if (Array.isArray(value)) return value.map(renameLegacyStatusKeys);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  const rewritten = {};
  for (const [key, entry] of Object.entries(value)) {
    if (Object.hasOwn(LEGACY_STATUS_KEYS, key)) {
      rewritten[LEGACY_STATUS_KEYS[key]] = renameLegacyStatusKeys(entry);
      continue;
    }
    if (key === 'status.state.primary') {
      rewritten['states.main'] = renameLegacyStatusKeys(entry);
      continue;
    }
    if ((key === 'status' || key === 'state')
      && value
      && typeof value === 'object'
      && (String(value.type || '').startsWith('cts.') || String(value.kind || '').startsWith('effect.') || String(value.kind || '').startsWith('cts.') || 'actionKind' in value)) {
      // Process-node and action records: the lifecycle payload rides the
      // state key.
      rewritten.state = renameLegacyStatusKeys(entry);
      continue;
    }
    if (key === 'type' && entry === 'statusDefinition') {
      rewritten.type = 'stateDefinition';
      continue;
    }
    if ((key === 'targetHandle' || key === 'sourceHandle') && typeof entry === 'string') {
      rewritten[key] = entry.replace(/\bstatus\.state\.primary\b/g, 'states.main');
      continue;
    }
    if (key === 'path' && entry === 'status.state.primary') {
      rewritten.path = 'states.main';
      continue;
    }
    rewritten[key] = renameLegacyStatusKeys(entry);
  }
  return rewritten;
}

export function migrateV4Definition(definition = {}, domain = {}) {
  const wrapper = renameLegacyTypeKeys(definition?.data ? { ...definition, data: definition.data } : definition);
  const data = wrapper?.data || wrapper;
  const diagnostics = [];

  const processNodes = Object.fromEntries(Object.entries(data.processNodes || {}).map(([id, node]) => {
    const migrated = migrateNode(node, domain, diagnostics, `processNodes.${id}`);
    return [id, migrated];
  }));
  const producerOutputs = mapRecords(data.producerOutputs, (output, id) => {
    const migrated = { ...output };
    if (migrated.typeId) {
      migrated.typeId = kebab(migrated.typeId);
    }
    if (migrated.fields) {
      migrated.fields = Object.fromEntries(Object.entries(migrated.fields).map(([level, paths]) => [
        level, (paths || []).map(path => toRowPath(path, output.typeId, domain) ?? path)
      ]));
    }
    return migrated;
  });
  const actions = mapRecords(data.actions, action => {
    const migrated = { ...action };
    if (migrated.typeId) {
      migrated.typeId = kebab(migrated.typeId);
    }
    if (migrated.targetState !== undefined) {
      migrated.target = migrated.targetState;
      delete migrated.targetState;
    }
    if (migrated.status && migrated.status.to !== undefined) {
      migrated.target = migrated.status.to;
      migrated.status = { ...migrated.status };
      delete migrated.status.to;
    }
    return migrated;
  });
  const sockets = mapRecords(data.sockets, socket => rewriteDescriptorRecord(socket));
  const screens = mapRecords(data.screens, screen => ({
    ...screen,
    ...(Array.isArray(screen?.sources)
      ? { sources: screen.sources.map(source => ({ ...source, ...(source.typeId ? { typeId: kebab(source.typeId) } : {}) })) }
      : {})
  }));

  // Declaration-tree records (`ctsTypes`) carry the registry id authored
  // on their class node. Registry ids are kebab by law, but drafts saved
  // by older sessions may spell the generated prefix with an underscore
  // (`t_…`) while every other record collection was kebab-normalized —
  // the same draft then references one type under two spellings and
  // validation reports "unknown type" on both. One normalization here,
  // idempotent, closes the seam for every load/validate path.
  const ctsTypes = mapRecords(data.ctsTypes, record => (
    record?.typeId ? { ...record, typeId: kebab(record.typeId) } : record
  ));

  const migrated = {
    ...data,
    processNodes,
    producerOutputs,
    actions,
    sockets,
    screens,
    ...(data.ctsTypes ? { ctsTypes } : {}),
    graphProtocol: 5
  };
  const result = wrapper?.data ? { ...wrapper, data: migrated } : migrated;
  return { definition: result, diagnostics };
}

function mapRecords(records = {}, mapper) {
  if (!records || typeof records !== 'object') return records;
  return Object.fromEntries(Object.entries(records).map(([id, record]) => [id, mapper(record, id)]));
}

function migrateNode(node, domain, diagnostics, at) {
  if (!node || typeof node !== 'object') return node;
  const mapping = V5_MAPPING[node.kind];
  if (!mapping) {
    // Legacy persisted v5 graphs carried the binding on `type` (a string
    // colliding with the v4 value descriptor). Normalize to `typeId`.
    if (String(node.kind || '').startsWith('cts.') && typeof node.type === 'string') {
      return { ...node, typeId: node.type, type: undefined };
    }
    return { ...node }; // pure value algebra: untouched
  }
  const migrated = { ...node, kind: mapping.kind };
  if (mapping.select) migrated.select = mapping.select;
  for (const flag of ['producer', 'archive', 'send', 'record', 'draft', 'one']) {
    if (mapping[flag]) migrated[flag] = true;
  }
  if (mapping.mode) migrated.mode = mapping.mode;
  if (migrated.typeId) {
    migrated.typeId = kebab(migrated.typeId);
  }
  if (migrated.blocks) {
    migrated.slots = [...migrated.blocks];
    delete migrated.blocks;
  }
  if (migrated.block) {
    migrated.slot = migrated.block;
    delete migrated.block;
  }
  if (mapping.kind === CTS_KIND.construct && migrated.construction?.mode) {
    migrated.via = migrated.construction.mode;
  }
  if (mapping.kind === CTS_KIND.transition) {
    if (migrated.targetState !== undefined) {
      migrated.target = migrated.targetState;
      delete migrated.targetState;
    }
    if (migrated.status && migrated.status.to !== undefined) {
      migrated.target = migrated.status.to;
      migrated.status = { ...migrated.status };
      delete migrated.status.to;
    }
  }
  if (migrated.path) migrated.path = toRowPath(migrated.path, node.typeId, domain) ?? migrated.path;
  if (migrated.fieldPath) migrated.fieldPath = toRowPath(migrated.fieldPath, node.typeId, domain) ?? migrated.fieldPath;
  if (Array.isArray(migrated.entries)) {
    migrated.entries = migrated.entries.map(entry => ({
      ...rewriteDescriptorRecord(entry),
      ...(entry?.typeId ? { target: kebab(entry.typeId) } : {})
    }));
  }
  if (Array.isArray(migrated.fields)) {
    migrated.fields = migrated.fields.map(path => toRowPath(path, node.typeId, domain) ?? path);
  }
  return migrated;
}

// Process-type descriptors on v5 records become CTS descriptors; entity ids
// kebab-case. Unmappable descriptors stay untouched.
function rewriteDescriptorRecord(record = {}) {
  if (!record?.type || record.type.base !== 'entityRef') return record;
  return {
    ...record,
    type: {
      ...record.type,
      ...(record.type.typeId ? { typeId: kebab(record.type.typeId) } : {}),
      ...(Array.isArray(record.type.accepts) ? { accepts: record.type.accepts.map(kebab) } : {})
    }
  };
}

// -- resolution: v5 -> executable working shapes (internal, never persisted) --

export function resolveCtsDefinition(definition = {}, domain = {}) {
  const wrapper = definition?.data ? { ...definition, data: { ...definition.data } } : { ...definition };
  const data = wrapper?.data || wrapper;
  if (!isCtsGraphDefinition(data)) {
    return { definition: wrapper?.data ? wrapper : data, diagnostics: [] };
  }
  const diagnostics = [];
  const typeIdFor = typeIdResolver(domain);

  const processNodes = Object.fromEntries(Object.entries(data.processNodes || {}).map(([id, node]) => {
    const resolved = resolveNode(node, domain, typeIdFor, diagnostics, `processNodes.${id}`);
    return [id, resolved];
  }));
  const producerOutputs = mapRecords(data.producerOutputs, output => {
    const resolved = { ...output };
    if (resolved.typeId) {
      resolved.typeId = typeIdFor(resolved.typeId) ?? snake(resolved.typeId);
    }
    if (resolved.fields) {
      resolved.fields = Object.fromEntries(Object.entries(resolved.fields).map(([level, paths]) => [
        level, (paths || []).map(path => slotOrDefault(path, resolved.typeId, domain))
      ]));
    }
    return resolved;
  });
  const actions = mapRecords(data.actions, action => {
    const resolved = { ...action };
    if (resolved.typeId) {
      resolved.typeId = typeIdFor(resolved.typeId) ?? snake(resolved.typeId);
    }
    if (resolved.target !== undefined) {
      resolved.status = { ...(resolved.status || {}), to: resolved.target };
      delete resolved.target;
    }
    return resolved;
  });
  const sockets = mapRecords(data.sockets, socket => resolveDescriptorRecord(socket));
  const screens = mapRecords(data.screens, screen => ({
    ...screen,
    ...(Array.isArray(screen?.sources)
      ? { sources: screen.sources.map(source => ({ ...source, typeId: source.typeId || '' })) }
      : {})
  }));

  const resolvedData = {
    ...data,
    processNodes,
    producerOutputs,
    actions,
    sockets,
    screens
  };
  delete resolvedData.graphProtocol;
  return {
    definition: wrapper?.data ? { ...wrapper, data: resolvedData } : resolvedData,
    diagnostics
  };
}

function slotOrDefault(path, typeId, domain) {
  const slot = toSlotPath(path, typeId, domain);
  return slot ?? path;
}

function resolveNode(node, domain, typeIdFor, diagnostics, at) {
  if (!node || typeof node !== 'object') return node;
  if (node.kind === CTS_SERVICE_KIND) {
    // A service node binds a registered operator (SPEC §8 s species); the
    // executable twin is the command with the operator's declared binding.
    // Unbound nodes (bare catalog records) resolve to an unset command and
    // surface empty ports — the author binds the operator explicitly.
    const service = node.operator ? domain.serviceContracts?.[node.operator] : null;
    if (node.operator && !service) {
      diagnostics.push(`${at}: unknown service operator ${node.operator}`);
      return { ...node };
    }
    return {
      ...node,
      kind: 'effect.runCommand',
      commandId: service ? service.command : ''
    };
  }
  if (!String(node.kind || '').startsWith('cts.')) return { ...node };
  const v4Kind = v4KindFor(node);
  if (!v4Kind) {
    diagnostics.push(`${at}: unknown cts node shape (kind ${node.kind})`);
    return { ...node };
  }
  const resolved = { ...node, kind: v4Kind };
  delete resolved.select;
  for (const flag of ['producer', 'archive', 'send', 'record', 'draft', 'one', 'mode', 'via']) {
    delete resolved[flag];
  }
  if (resolved.typeId) {
    resolved.typeId = typeIdFor(resolved.typeId) ?? snake(resolved.typeId);
  }
  if (resolved.slots) {
    resolved.blocks = [...resolved.slots];
    delete resolved.slots;
  }
  if (resolved.slot) {
    resolved.block = resolved.slot;
    delete resolved.slot;
  }
  if (resolved.target !== undefined) {
    resolved.status = { ...(resolved.status || {}), to: resolved.target };
    delete resolved.target;
  }
  if (resolved.path) resolved.path = slotOrDefault(resolved.path, resolved.typeId, domain);
  if (resolved.fieldPath) resolved.fieldPath = slotOrDefault(resolved.fieldPath, resolved.typeId, domain);
  if (Array.isArray(resolved.entries)) {
    resolved.entries = resolved.entries.map(entry => ({
      ...resolveDescriptorRecord(entry),
      ...(entry?.target && !entry.typeId ? { typeId: typeIdFor(entry.target) ?? snake(entry.target), target: undefined } : {})
    }));
  }
  if (Array.isArray(resolved.fields)) {
    resolved.fields = resolved.fields.map(path => slotOrDefault(path, resolved.typeId, domain));
  }
  if (resolved.construction?.mode === undefined && node.via) {
    resolved.construction = { ...(resolved.construction || {}), mode: node.via };
  }
  // Contract migration (SPEC §20): persisted construction modes the type
  // no longer declares re-bind silently to the type's current default —
  // e.g. genericCreate on a payload type whose protocols now own
  // construction (cassette/sketch create through their editors). Derived
  // types have no contract, so their create nodes keep failing
  // validation with the clear authoring message.
  if (resolved.construction?.mode) {
    const contract = domain.construction?.[resolved.typeId] || null;
    if (contract?.modes?.length && contract.defaultMode && !contract.modes.includes(resolved.construction.mode)) {
      resolved.construction = { ...resolved.construction, mode: contract.defaultMode };
    }
  }
  return resolved;
}

function v4KindFor(node) {
  // Bare catalog records (no discriminators) default: reads to `current`,
  // compose to block composition. Authored records always carry their
  // discriminators.
  if (node.kind === CTS_KIND.read) return V4_KIND_BY_V5.get(`cts.read|select=${node.select || 'current'}`) || null;
  if (node.kind === CTS_KIND.compose && !node.mode && !node.record) {
    return V4_KIND_BY_V5.get('cts.compose|mode=compose') || null;
  }
  const flags = ['producer', 'archive', 'send', 'record', 'draft', 'one', 'mode'];
  return V4_KIND_BY_V5.get(v5Key(node.kind, node, flags)) || null;
}

function resolveDescriptorRecord(record = {}) {
  if (!record?.type || record.type.base !== 'entityRef') return record;
  return {
    ...record,
    type: {
      ...record.type,
      ...(record.type.typeId ? { typeId: snake(record.type.typeId) } : {}),
      ...(Array.isArray(record.type.accepts) ? { accepts: record.type.accepts.map(snake) } : {})
    }
  };
}

// The persisted form of in-tree declaration authoring: `ctsTypes` records
// (class/field/state kinds, SPEC §20/§21 one tree) travel with the draft
// and land in the registry at APPLY. This projects them back into
// declaration objects — the same shape compileTreeDeclarations emits — so
// acceptance gates can validate a draft against its own declarations
// before they are posted. Transitions are canvas wires and are not part
// of the persisted record set; states still project so transition-target
// checks resolve. `type`-kind records are registry references, not
// declarations.
export function declarationsFromCtsRecords(records = {}) {
  const byKind = kind => Object.values(records || {}).filter(record => record?.kind === kind);
  const declarations = [];
  for (const cls of byKind('class')) {
    if (!cls.typeId) continue;
    const declaration = {
      id: cls.typeId,
      class: cls.class || 'file',
      fields: {},
      ...(cls.payload ? { payload: cls.payload } : {})
    };
    for (const field of byKind('field')) {
      if (field.typeId === cls.typeId && field.name) {
        declaration.fields[field.name] = { ...(field.descriptor || { base: 'string' }) };
      }
    }
    const states = byKind('state').filter(state => state.typeId === cls.typeId && state.value);
    if (states.length) {
      const initial = states.filter(state => state.initial === true).map(state => state.value);
      declaration.states = {
        main: {
          initial: initial[0] || states[0].value,
          values: states.map(state => state.value),
          terminal: states.filter(state => state.terminal === true).map(state => state.value)
        }
      };
      declaration.transitions = [];
    }
    const operators = Array.isArray(cls.operators) ? cls.operators : [];
    if (operators.length) {
      declaration.operators = {};
      for (const operator of operators) {
        const id = String(operator.id || '').trim();
        if (!id) continue;
        declaration.operators[id] = {
          species: operator.species,
          ...(operator.input ? { input: operator.input } : {}),
          ...(operator.output ? { output: operator.output } : {}),
          triggers: (operator.triggers || []).filter(trigger => String(trigger.event || trigger.schedule || '').trim())
        };
      }
    }
    declarations.push(declaration);
  }
  return declarations;
}

// -- binding checks (SPEC §20, beside R1-R6) --

export function checkCtsGraphBindings(definition = {}, domain = {}) {
  const data = definition?.data || definition;
  const errors = [];
  const typeIdFor = typeIdResolver(domain);

  for (const [id, node] of Object.entries(data.processNodes || {})) {
    if (!String(node?.kind || '').startsWith('cts.')) continue;
    const typeId = node?.typeId;
    const resolvedTypeId = typeId ? typeIdFor(typeId) : null;
    if (typeId && !resolvedTypeId) {
      errors.push(`processNodes.${id}: unknown type ${typeId}`);
      continue;
    }
    if (node.kind === CTS_KIND.transition && node.target) {
      const workflow = domain.workflows?.[typeId];
      const states = workflow?.regions?.[workflow?.primaryRegion || 'main']?.states || {};
      if (typeId && Object.keys(states).length && !(node.target in states)) {
        errors.push(`processNodes.${id}: target state ${node.target} is not declared for ${typeId}`);
      }
    }
    if ((node.kind === CTS_KIND.field || node.kind === CTS_KIND.compose) && node.path) {
      if (toSlotPath(node.path, typeId, domain) === null && !managedPath(node.path)) {
        errors.push(`processNodes.${id}: field ${node.path} is not in the ${typeId} row`);
      }
    }
  }
  return errors;
}

function managedPath(path = '') {
  const [block] = String(path).split('.');
  return ['identity', 'origin', 'status', 'lineage', 'relations', 'provenance', 'summary', 'attachments', 'data', 'specs', '_id'].includes(block);
}
