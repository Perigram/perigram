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
// through `typeId`; v4 records through `entityType`. One accessor pair so
// the designer surfaces and the catalog never re-derive the branch.
export function typeIdOf(record = {}) {
  return record?.typeId || record?.entityType || '';
}

export function setTypeBinding(record = {}, typeId = '') {
  if (!record) return;
  if (String(record.kind || '').startsWith('cts.')) record.typeId = typeId;
  else record.entityType = typeId;
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
  return resolveNode(node, domain, entityTypeResolver(domain), [], '');
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
function entityTypeResolver(domain = {}) {
  const entityTypes = new Set((domain.entities || []).map(entity => entity.type));
  return typeId => {
    if (!typeId) return null;
    if (entityTypes.has(typeId)) return typeId;
    const snaked = snake(typeId);
    return entityTypes.has(snaked) ? snaked : null;
  };
}

const ROW_BLOCKS = Object.freeze(['data', 'specs']);
const RESERVED_GENERIC = 'data.value';

// v4 slot path -> v5 row path (null = managed slot, keep as-is). Stripping
// is verified against the projected field schemas: a data/specs path the
// type does not declare (e.g. specs on a type without specs rows) stays
// slot-qualified so the round trip loses nothing.
function toRowPath(slotPath = '', entityType = '', domain = {}) {
  const path = String(slotPath);
  if (path === RESERVED_GENERIC || path.endsWith('*')) return null;
  const [block, ...rest] = path.split('.');
  if (!ROW_BLOCKS.includes(block) || !rest.length) return null;
  const rowPath = rest.join('.');
  return toSlotPath(rowPath, entityType, domain) === `${block}.${rowPath}` ? rowPath : null;
}

// v5 row path -> v4 slot path via the projected field schemas of one type.
// Returns null when the path is not a declared row field (managed slot).
function toSlotPath(rowPath = '', entityType = '', domain = {}) {
  const path = String(rowPath);
  const [block] = path.split('.');
  if (ROW_BLOCKS.includes(block)) return null; // already slot-qualified
  const schemas = schemasFor(domain, entityType);
  for (const slot of ROW_BLOCKS) {
    if (schemas.some(schema => schema.path === `${slot}.${path}`)) return `${slot}.${path}`;
  }
  return null;
}

function schemasFor(domain = {}, entityType = '') {
  const key = String(entityType || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  return domain.fieldSchemas?.[key] || domain.fieldSchemas?.[camel] || [];
}

// -- migration: v4 -> v5 (syntactic, one-way, persisted) --

export function migrateV4Definition(definition = {}, domain = {}) {
  const wrapper = definition?.data ? { ...definition, data: { ...definition.data } } : { ...definition };
  const data = wrapper?.data || wrapper;
  const diagnostics = [];

  const processNodes = Object.fromEntries(Object.entries(data.processNodes || {}).map(([id, node]) => {
    const migrated = migrateNode(node, domain, diagnostics, `processNodes.${id}`);
    return [id, migrated];
  }));
  const producerOutputs = mapRecords(data.producerOutputs, (output, id) => {
    const migrated = { ...output };
    if (migrated.entityType) {
      migrated.typeId = kebab(migrated.entityType);
      delete migrated.entityType;
    }
    if (migrated.fields) {
      migrated.fields = Object.fromEntries(Object.entries(migrated.fields).map(([level, paths]) => [
        level, (paths || []).map(path => toRowPath(path, output.entityType, domain) ?? path)
      ]));
    }
    return migrated;
  });
  const actions = mapRecords(data.actions, action => {
    const migrated = { ...action };
    if (migrated.entityType) {
      migrated.typeId = kebab(migrated.entityType);
      delete migrated.entityType;
    }
    if (migrated.targetStatus !== undefined) {
      migrated.target = migrated.targetStatus;
      delete migrated.targetStatus;
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
      ? { sources: screen.sources.map(source => ({ ...source, ...(source.entityType ? { typeId: kebab(source.entityType), entityType: undefined } : {}) })) }
      : {})
  }));

  const migrated = {
    ...data,
    processNodes,
    producerOutputs,
    actions,
    sockets,
    screens,
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
  if (migrated.entityType) {
    migrated.typeId = kebab(migrated.entityType);
    delete migrated.entityType;
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
    if (migrated.targetStatus !== undefined) {
      migrated.target = migrated.targetStatus;
      delete migrated.targetStatus;
    }
    if (migrated.status && migrated.status.to !== undefined) {
      migrated.target = migrated.status.to;
      migrated.status = { ...migrated.status };
      delete migrated.status.to;
    }
  }
  if (migrated.path) migrated.path = toRowPath(migrated.path, node.entityType, domain) ?? migrated.path;
  if (migrated.fieldPath) migrated.fieldPath = toRowPath(migrated.fieldPath, node.entityType, domain) ?? migrated.fieldPath;
  if (Array.isArray(migrated.entries)) {
    migrated.entries = migrated.entries.map(entry => ({
      ...rewriteDescriptorRecord(entry),
      ...(entry?.entityType ? { target: kebab(entry.entityType), entityType: undefined } : {})
    }));
  }
  if (Array.isArray(migrated.fields)) {
    migrated.fields = migrated.fields.map(path => toRowPath(path, node.entityType, domain) ?? path);
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
      ...(record.type.entityType ? { entityType: kebab(record.type.entityType) } : {}),
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
  const entityTypeFor = entityTypeResolver(domain);

  const processNodes = Object.fromEntries(Object.entries(data.processNodes || {}).map(([id, node]) => {
    const resolved = resolveNode(node, domain, entityTypeFor, diagnostics, `processNodes.${id}`);
    return [id, resolved];
  }));
  const producerOutputs = mapRecords(data.producerOutputs, output => {
    const resolved = { ...output };
    if (resolved.typeId) {
      resolved.entityType = entityTypeFor(resolved.typeId) ?? snake(resolved.typeId);
      delete resolved.typeId;
    }
    if (resolved.fields) {
      resolved.fields = Object.fromEntries(Object.entries(resolved.fields).map(([level, paths]) => [
        level, (paths || []).map(path => slotOrDefault(path, resolved.entityType, domain))
      ]));
    }
    return resolved;
  });
  const actions = mapRecords(data.actions, action => {
    const resolved = { ...action };
    if (resolved.typeId) {
      resolved.entityType = resolved.typeId;
      delete resolved.typeId;
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
      ? { sources: screen.sources.map(source => (source.typeId && !source.entityType ? { ...source, entityType: source.typeId, typeId: undefined } : { ...source })) }
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

function slotOrDefault(path, entityType, domain) {
  const slot = toSlotPath(path, entityType, domain);
  return slot ?? path;
}

function resolveNode(node, domain, entityTypeFor, diagnostics, at) {
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
    resolved.entityType = entityTypeFor(resolved.typeId) ?? snake(resolved.typeId);
    delete resolved.typeId;
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
  if (resolved.path) resolved.path = slotOrDefault(resolved.path, resolved.entityType, domain);
  if (resolved.fieldPath) resolved.fieldPath = slotOrDefault(resolved.fieldPath, resolved.entityType, domain);
  if (Array.isArray(resolved.entries)) {
    resolved.entries = resolved.entries.map(entry => ({
      ...resolveDescriptorRecord(entry),
      ...(entry?.target && !entry.entityType ? { entityType: entityTypeFor(entry.target) ?? snake(entry.target), target: undefined } : {})
    }));
  }
  if (Array.isArray(resolved.fields)) {
    resolved.fields = resolved.fields.map(path => slotOrDefault(path, resolved.entityType, domain));
  }
  if (resolved.construction?.mode === undefined && node.via) {
    resolved.construction = { ...(resolved.construction || {}), mode: node.via };
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
      ...(record.type.entityType ? { entityType: snake(record.type.entityType) } : {}),
      ...(Array.isArray(record.type.accepts) ? { accepts: record.type.accepts.map(snake) } : {})
    }
  };
}

// -- binding checks (SPEC §20, beside R1-R6) --

export function checkCtsGraphBindings(definition = {}, domain = {}) {
  const data = definition?.data || definition;
  const errors = [];
  const entityTypeFor = entityTypeResolver(domain);

  for (const [id, node] of Object.entries(data.processNodes || {})) {
    if (!String(node?.kind || '').startsWith('cts.')) continue;
    const typeId = node?.typeId;
    const entityType = typeId ? entityTypeFor(typeId) : node?.entityType || null;
    if (typeId && !entityType) {
      errors.push(`processNodes.${id}: unknown type ${typeId}`);
      continue;
    }
    if (node.kind === CTS_KIND.transition && node.target) {
      const workflow = domain.workflows?.[entityType];
      const states = workflow?.regions?.[workflow?.primaryRegion || 'main']?.states || {};
      if (entityType && Object.keys(states).length && !(node.target in states)) {
        errors.push(`processNodes.${id}: target state ${node.target} is not declared for ${entityType}`);
      }
    }
    if ((node.kind === CTS_KIND.field || node.kind === CTS_KIND.compose) && node.path) {
      if (toSlotPath(node.path, entityType, domain) === null && !managedPath(node.path)) {
        errors.push(`processNodes.${id}: field ${node.path} is not in the ${entityType} row`);
      }
    }
  }
  return errors;
}

function managedPath(path = '') {
  const [block] = String(path).split('.');
  return ['identity', 'origin', 'status', 'lineage', 'relations', 'provenance', 'summary', 'attachments', 'data', 'specs', '_id'].includes(block);
}
