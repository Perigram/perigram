// Graph protocol v5 (SPEC §20): process definitions whose entity-bound
// records speak the type system. Species kinds, CTS type ids, row-relative
// field paths, declaration-owned state values. The pure value algebra
// (sources, values, collections/trees, control) is untouched — it is
// already V-honest.
//
// Direction:
// - resolveCtsDefinition: the v5 binding seam. It resolves declaration ids
//   and normalizes current records while preserving species kinds, read
//   discriminators, socket ids, ports, and graph edges.
// - checkCtsGraphBindings: declaration-level binding validation (type
//   exists, state declared, field in row) beside R1-R6.
import { SPECIES_BY_EFFECT_KIND } from './process-grammar.js';
import { classMayDeclareChildren } from '../classes.js';

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

// v4 kind -> v5 classification table; flags disambiguate kinds that share
// a species. The reverse table is derived, so the pair cannot drift. The
// forward direction is metadata for classification only — no seam rewrites
// authored records through it.
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
  'producer.join': { kind: CTS_KIND.join }
});

const V4_KIND_BY_V5 = buildReverseMapping();

function buildReverseMapping() {
  const reverse = new Map();
  for (const [v4Kind, mapping] of Object.entries(V5_MAPPING)) {
    // Reads never reverse: `cts.read` + select IS the classification.
    // Reversing would resurrect a retired v4 read kind (the legacy query
    // leaked `read.queryEntities` back through operationKindOf).
    if (mapping.kind === CTS_KIND.read) continue;
    const flags = ['producer', 'archive', 'send', 'record', 'draft', 'one', 'mode'];
    const key = v5Key(mapping.kind, mapping, flags);
    if (!reverse.has(key)) reverse.set(key, v4Kind);
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
  record.typeId = typeId;
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

// Single-record resolution is deliberately one-way and native. The
// operation-kind table is classification metadata for shared behavior; it
// is not a replacement record and is never used to manufacture ports.
export function resolveCtsRecord(node = {}, domain = {}) {
  return resolveNativeNode(node, domain, typeIdResolver(domain), [], '');
}

function camelId(value = '') {
  const segments = String(value).split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (!segments.length) return '';
  const [first, ...rest] = segments;
  return first.charAt(0).toLowerCase() + first.slice(1)
    + rest.map(segment => segment.charAt(0).toUpperCase() + segment.slice(1)).join('');
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

function schemasFor(domain = {}, typeId = '') {
  const key = String(typeId || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  return domain.fieldSchemas?.[key] || domain.fieldSchemas?.[camel] || [];
}

// -- legacy key rewrites (pure helpers for one-shot data migration scripts;
//    never invoked at any load seam) --

// One-way vocabulary rewrite for definitions persisted before the typeId
// unification: records, port descriptors, prompt fields, lineage
// bindings, and screen templates authored under the legacy keys become
// their typeId-vocabulary equivalents. Pure and total — consumed by the
// persisted-data migration script only; no load path heals documents
// through it.
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

// One-way rewrite of the pre-state vocabulary: the action and
// process-node `status` payload becomes `state`, the status-socket path
// becomes `states.main` (input ids, defaults, handles, construction
// inputs), and statusDefinition canvas nodes become stateDefinition. Old
// drafts and stored compiled contracts become the state vocabulary; the
// rewrite is idempotent and never re-introduces legacy keys.
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

function mapRecords(records = {}, mapper) {
  if (!records || typeof records !== 'object') return records;
  return Object.fromEntries(Object.entries(records).map(([id, record]) => [id, mapper(record, id)]));
}

// -- resolution: v5 binding seam (native records stay native) --

export function resolveCtsDefinition(definition = {}, domain = {}) {
  const wrapper = definition?.data ? { ...definition, data: { ...definition.data } } : { ...definition };
  const data = wrapper?.data || wrapper;
  if (!isCtsGraphDefinition(data)) {
    return { definition: wrapper?.data ? wrapper : data, diagnostics: [] };
  }
  const diagnostics = [];
  const typeIdFor = typeIdResolver(domain);

  const processNodes = Object.fromEntries(Object.entries(data.processNodes || {}).map(([id, node]) => [
    id,
    resolveNativeNode(node, domain, typeIdFor, diagnostics, `processNodes.${id}`)
  ]));
  const producerOutputs = mapRecords(data.producerOutputs, output => {
    const resolved = { ...output };
    if (resolved.typeId) resolved.typeId = typeIdFor(resolved.typeId) || resolved.typeId;
    // Producer field lists are current-v5 row-relative paths. Do not add a
    // wire block prefix here: that would change the authored socket/field
    // contract a second time after migration.
    return resolved;
  });
  const actions = mapRecords(data.actions, action => {
    const resolved = { ...action };
    if (resolved.typeId) resolved.typeId = typeIdFor(resolved.typeId) || resolved.typeId;
    if (resolved.target !== undefined && resolved.state === undefined) {
      resolved.state = { to: resolved.target };
      delete resolved.target;
    }
    return resolved;
  });
  const sockets = mapRecords(data.sockets, socket => resolveNativeDescriptor(socket, typeIdFor));
  const screens = mapRecords(data.screens, screen => ({
    ...screen,
    ...(Array.isArray(screen?.sources)
      ? {
          sources: screen.sources.map(source => ({
            ...source,
            ...(source.typeId ? { typeId: typeIdFor(source.typeId) || source.typeId } : {})
          }))
        }
      : {})
  }));

  const resolvedData = {
    ...data,
    graphProtocol: 5,
    processNodes,
    producerOutputs,
    actions,
    sockets,
    screens
  };
  return {
    definition: wrapper?.data ? { ...wrapper, data: resolvedData } : resolvedData,
    diagnostics
  };
}

function resolveNativeNode(node, domain, typeIdFor, diagnostics, at) {
  if (!node || typeof node !== 'object') return node;
  if (!String(node.kind || '').startsWith('cts.')) return { ...node };

  const resolved = { ...node };
  if (resolved.typeId) resolved.typeId = typeIdFor(resolved.typeId) || resolved.typeId;

  // `via` is the retired spelling. Adopt it into the one current
  // construction envelope and delete it without touching the species kind.
  if (resolved.via !== undefined) {
    if (!resolved.construction) resolved.construction = {};
    if (resolved.construction.mode === undefined) resolved.construction.mode = resolved.via;
    delete resolved.via;
  }
  // Contract migration (SPEC §20): persisted construction modes the type
  // no longer declares re-bind to the declared default (e.g. genericCreate
  // on a payload type whose protocols now own construction — cassette and
  // sketch create through their editors). Derived types keep their stale
  // mode: they have no contract to re-bind, and validation owns the error.
  if (resolved.kind === CTS_KIND.construct && resolved.construction?.mode) {
    const contract = domain.construction?.[resolved.typeId] || null;
    if (contract?.modes?.length && contract.defaultMode && !contract.modes.includes(resolved.construction.mode)) {
      resolved.construction = { ...resolved.construction, mode: contract.defaultMode };
    }
  }
  if (resolved.kind === CTS_KIND.transition && resolved.target !== undefined && resolved.state === undefined) {
    resolved.state = { to: resolved.target };
    delete resolved.target;
  }
  if (resolved.kind === CTS_KIND.read && !resolved.select) resolved.select = 'current';
  if (resolved.kind === CTS_SERVICE_KIND) {
    const service = resolved.operator ? domain.serviceContracts?.[resolved.operator] : null;
    if (resolved.operator && !service) {
      diagnostics.push(`${at}: unknown service operator ${resolved.operator}`);
    } else if (service?.command) {
      // The operator binding is an execution fact, not a kind replacement.
      resolved.commandId = resolved.commandId || service.command;
    }
  }

  // Descriptor entries are typed values, not operation records. Normalize
  // only their type binding; retain entry ids, discriminators, and roles.
  if (Array.isArray(resolved.entries)) {
    resolved.entries = resolved.entries.map(entry => resolveNativeEntry(entry, typeIdFor));
  }
  if (resolved.inputs) resolved.inputs = resolved.inputs.map(input => resolveNativeDescriptor(input, typeIdFor));
  if (resolved.outputs) resolved.outputs = resolved.outputs.map(output => resolveNativeDescriptor(output, typeIdFor));
  return resolved;
}

function resolveNativeEntry(entry = {}, typeIdFor) {
  const resolved = resolveNativeDescriptor(entry, typeIdFor);
  if (resolved.target && !resolved.typeId) {
    resolved.typeId = typeIdFor(resolved.target) || resolved.target;
    delete resolved.target;
  }
  return resolved;
}

function resolveNativeDescriptor(record = {}, typeIdFor = () => null) {
  if (!record?.type || record.type.base !== 'entityRef') return record;
  return {
    ...record,
    type: {
      ...record.type,
      ...(record.type.typeId ? { typeId: typeIdFor(record.type.typeId) || record.type.typeId } : {}),
      ...(Array.isArray(record.type.accepts)
        ? { accepts: record.type.accepts.map(typeId => typeIdFor(typeId) || typeId) }
        : {})
    }
  };
}

function v4KindFor(node) {
  // This table is classification metadata only. It is intentionally kept
  // separate from resolveNativeNode: no execution path may use it to replace
  // a species record.
  if (node.kind === CTS_KIND.read) return V4_KIND_BY_V5.get(`cts.read|select=${node.select || 'current'}`) || null;
  if (node.kind === CTS_KIND.compose && !node.mode && !node.record) {
    return V4_KIND_BY_V5.get('cts.compose|mode=compose') || null;
  }
  const flags = ['producer', 'archive', 'send', 'record', 'draft', 'one', 'mode'];
  return V4_KIND_BY_V5.get(v5Key(node.kind, node, flags)) || null;
}

// The persisted form of in-tree declaration authoring: `ctsTypes` records
// (class/field/state kinds, SPEC §20/§21 one tree) travel with the draft
// and land in the registry at APPLY. This projects them back into
// declaration objects — the same shape compileTreeDeclarations emits — so
// acceptance gates can validate a draft against its own declarations
// before they are posted. State records declare no type facet (SPEC §7):
// their values are draft vocabulary consumed by validation and the
// compiled process contract. `type`-kind records are registry references,
// not declarations.
export function declarationsFromCtsRecords(records = {}, processNodes = {}, graph = {}) {
  const byKind = kind => Object.values(records || {}).filter(record => record?.kind === kind);
  const classRecordIdByGraphNode = new Map((graph?.nodes || [])
    .filter(node => node?.type === 'ctsClass' && node.data?.refId)
    .map(node => [String(node.id), String(node.data.refId)]));
  const childrenEdges = [];
  for (const edge of graph?.edges || []) {
    if (edge.role !== 'type') continue;
    if (edge.label === 'children') {
      const parent = classRecordIdByGraphNode.get(String(edge.source));
      const child = classRecordIdByGraphNode.get(String(edge.target));
      const parentDeclaration = byKind('class').find(candidate => candidate.id === parent);
      if (parent && child && classMayDeclareChildren(parentDeclaration?.class || 'file')) {
        childrenEdges.push({ edge, parent, child });
      }
    }
  }

  const declarations = [];
  for (const cls of byKind('class')) {
    if (!cls.typeId) continue;
    const declaration = {
      id: cls.typeId,
      class: cls.class || 'file',
      fields: {},
      ...(cls.name ? { name: cls.name } : {}),
      ...(cls.glyph ? { glyph: cls.glyph } : {}),
      ...(cls.payload ? { payload: cls.payload } : {}),
      ...(Array.isArray(cls.migrate) && cls.migrate.length ? { migrate: cls.migrate } : {})
    };
    for (const field of byKind('field')) {
      if (field.typeId !== cls.typeId || !field.name) continue;
      const fieldId = camelId(field.name);
      if (!fieldId) continue;
      declaration.fields[fieldId] = {
        ...(field.descriptor || { base: 'string' }),
        ...(field.descriptor?.label || fieldId === field.name ? {} : { label: field.name })
      };
    }
    // State records declare no type facet (SPEC §7): the vocabulary is
    // draft authoring consumed by validation and the compiled process
    // contract; the posted declaration carries fields and edges only.

    const children = new Map();
    for (const { edge, parent, child } of childrenEdges) {
      if (parent !== cls.id) continue;
      const childDeclaration = byKind('class').find(candidate => candidate.id === child);
      const childTypeId = childDeclaration?.typeId || child;
      const key = String(edge.data?.key || `${childTypeId}s`).trim();
      const entry = children.get(key) || { types: [], onRemove: edge.data?.onRemove || 'restrict' };
      if (!entry.types.includes(childTypeId)) entry.types.push(childTypeId);
      children.set(key, entry);
    }
    if (children.size) declaration.edges = { children: Object.fromEntries(children.entries()) };

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

// Transition-node target statuses (SPEC §20): a bound, non-archive
// A transition node's authored target (SPEC §7): the `state.to` payload or
// the state socket's authored default. Extracted per bound type as the set
// of target values — the vocabulary seam the compiled contract consumes.
// A record without a binding or target contributes nothing (unfinished
// authoring, like an unnamed field).
export function transitionNodeStateTargets(processNodes = {}) {
  const byType = new Map();
  for (const record of Object.values(processNodes || {})) {
    if (operationKindOf(record || {}) !== 'effect.changeStatus') continue;
    const typeId = String(record.typeId || '');
    const to = String(record.state?.to || record.inputDefaults?.state || record.target || '').trim();
    if (!typeId || !to) continue;
    const values = byType.get(typeId) || new Set();
    values.add(to);
    byType.set(typeId, values);
  }
  return byType;
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
    if (node.kind === CTS_KIND.transition) {
      const transition = node.transition || {};
      const target = transition.to || node.state?.to || node.target || '';
      const from = transition.from || node.state?.from || '';
      if (target) {
        const workflow = domain.workflows?.[resolvedTypeId || typeId];
        const states = workflow?.regions?.[workflow?.primaryRegion || 'main']?.states || {};
        if (Object.keys(states).length && !Object.hasOwn(states, target)) {
          errors.push(`processNodes.${id}: target state ${target} is not declared for ${resolvedTypeId || typeId}`);
        }
        const transitions = workflow?.regions?.[workflow?.primaryRegion || 'main']?.transitions || [];
        if (from && transitions.length && !transitions.some(item => item.from === from && item.to === target)) {
          errors.push(`processNodes.${id}: transition ${from}->${target} is not declared for ${resolvedTypeId || typeId}`);
        }
      }
    }
    if ([CTS_KIND.field, CTS_KIND.mutate, CTS_KIND.compose].includes(node.kind)) {
      const paths = node.kind === CTS_KIND.mutate
        ? [...(node.fields || []), ...Object.keys(node.inputDefaults || {})]
        : [node.path].filter(Boolean);
      for (const path of paths) {
        if (!nativeFieldPathDeclared(path, resolvedTypeId || typeId, domain)) {
          errors.push(`processNodes.${id}: field ${path} is not in the ${resolvedTypeId || typeId} row`);
        }
      }
    }
  }
  return errors;
}

function nativeFieldPathDeclared(path = '', typeId = '', domain = {}) {
  const clean = String(path || '');
  const [block] = clean.split('.');
  if (!ROW_BLOCKS.includes(block) && managedPath(clean)) return true;
  const schemas = schemasFor(domain, typeId);
  if (schemas.some(schema => schema.path === clean)) return true;
  if (!ROW_BLOCKS.includes(block) && schemas.some(schema => schema.path === `data.${clean}` || schema.path === `specs.${clean}`)) return true;
  const [slot, ...rest] = clean.split('.');
  if (!ROW_BLOCKS.includes(slot) || !rest.length) return false;
  const rowPath = rest.join('.');
  return schemas.some(schema => schema.path === `${slot}.${rowPath}`);
}

function managedPath(path = '') {
  const [block] = String(path).split('.');
  return ['identity', 'origin', 'status', 'lineage', 'relations', 'provenance', 'summary', 'attachments', 'data', 'specs', '_id'].includes(block);
}
