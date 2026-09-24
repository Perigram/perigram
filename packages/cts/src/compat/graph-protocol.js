// Graph protocol v5 (SPEC §20): process definitions whose entity-bound
// records speak the type system. Species kinds, CTS type ids, row-relative
// field paths, declaration-owned state values. The pure value algebra
// (sources, values, collections/trees, control) is untouched — it is
// already V-honest.
//
// Direction:
// - migrateV4Definition: the one-way persisted rewrite (retired vocabulary ->
//   native CTS species). It strips legacy slot prefixes, normalizes ids,
//   and maps old operation kinds to the species table. The result is the
//   current authored protocol; it is never lowered back to a twin.
// - resolveCtsDefinition: the v5 binding seam. It resolves declaration ids
//   and normalizes current records while preserving species kinds, read
//   discriminators, socket ids, ports, and graph edges.
// - checkCtsGraphBindings: declaration-level binding validation (type
//   exists, state declared, field in row) beside R1-R6.
import { SPECIES_BY_EFFECT_KIND } from './process-grammar.js';
import { classMayDeclareChildren } from '../classes.js';
import { findState, mergeTransitionNodeStates } from '../states.js';

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

// One-way persisted migration only: legacy read kinds (including the
// retired hidden-predicate query) rewrite to the native species + select.
// Reads never classify back — `operationKindOf` keeps `cts.read` — so no
// shared behavior grows a second read vocabulary.
const READ_SELECT_BY_KIND = Object.freeze({
  'read.currentEntity': 'current',
  'read.resolveEntityRef': 'byRef',
  'read.parent': 'parent',
  'read.children': 'children',
  'read.related': 'related',
  'read.allEntities': 'all',
  'read.queryEntities': 'all'
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
  ...Object.fromEntries(Object.entries(READ_SELECT_BY_KIND)
    .map(([kind, select]) => [kind, { kind: CTS_KIND.read, select }]))
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

function kebab(value = '') {
  return String(value).replace(/_/g, '-');
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
  // The persisted graph migrates with its records (one-way, at the load
  // boundary): retired sockets die here, composer-fed construct/mutate
  // blocks expand to their field wires, and a v4 update that smuggled a
  // status beside its field patch splits into mutate -> transition so no
  // native record carries a retired port.
  const graph = data.graph && typeof data.graph === 'object' ? { ...data.graph } : data.graph;
  if (graph && Array.isArray(graph.edges)) {
    migrateGraphEdges(graph, data, processNodes);
  }
  const producerOutputs = mapRecords(data.producerOutputs, (output) => {
    const migrated = { ...output };
    if (migrated.typeId) {
      migrated.typeId = kebab(migrated.typeId);
    }
    // Field-policy paths are the declared schema paths (data./specs./
    // relations./identity.) — the bare-row-path convention is retired, so
    // paths migrate verbatim.
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
    graph,
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

// Handle migration tables for reads (SPEC §20): one kind, closed select,
// entity-typed streams. `entity`/`entities` outputs become the single
// `result`; the entity-derived selects read their stream from `entity`.
const READ_OUTPUT_HANDLE_MIGRATION = Object.freeze({
  current: { entity: 'result' },
  byRef: { entity: 'result' },
  parent: { entity: 'result' },
  children: { entities: 'result' },
  related: { entities: 'result' },
  all: { entities: 'result' }
});
const READ_INPUT_HANDLE_MIGRATION = Object.freeze({
  parent: { value: 'entity' },
  children: { value: 'entity' },
  related: { value: 'entity' }
});

function migrateGraphEdges(graph = {}, data = {}, processNodes = {}) {
  const originalEdges = [...(graph.edges || [])];
  const handleOf = value => String(value || '').replace(/^(input|data|control):/, '');
  const dataHandle = handle => `data:${handle}`;
  const recordIdByGraphNode = new Map((graph.nodes || [])
    .map(node => [String(node.id), String(node?.data?.refId || node?.id)]));
  const recordByGraphNode = new Map((graph.nodes || [])
    .map(node => [String(node.id), processNodes[recordIdByGraphNode.get(String(node.id))]]));
  const retiredQueryRecordIds = new Set(Object.entries(data.processNodes || {})
    .filter(([, node]) => node?.kind === 'read.queryEntities')
    .map(([id]) => String(id)));

  const appended = [];
  const expandedComposerNodeIds = new Set();
  const defaultsByRecordId = new Map();
  const statusSplitTargets = [];

  const kept = [];
  for (const edge of graph.edges || []) {
    const sourceId = String(edge.source);
    const targetId = String(edge.target);
    const sourceRecordId = recordIdByGraphNode.get(sourceId);
    const targetRecordId = recordIdByGraphNode.get(targetId);
    const sourceRecord = recordByGraphNode.get(sourceId);
    const targetRecord = recordByGraphNode.get(targetId);

    // The retired hidden-predicate query dies with its predicate wires.
    if (retiredQueryRecordIds.has(targetRecordId) && handleOf(edge.targetHandle) === 'predicate') continue;

    // Retired lifecycle sockets: a construct's declaration owns its initial
    // state; a mutate's smuggled status splits off below. Neither socket
    // survives onto the native record.
    if (targetRecord?.kind === 'cts.construct' && handleOf(edge.targetHandle) === 'states.main') continue;
    if (targetRecord?.kind === 'cts.mutate' && handleOf(edge.targetHandle) === 'states.main') {
      statusSplitTargets.push({ graphNodeId: targetId, recordId: targetRecordId });
      continue;
    }

    // A transition's declared reference adopts a static state-definition
    // wire; computed status wires and patch smuggling die with the socket.
    if (targetRecord?.kind === 'cts.transition' && ['status', 'changes'].includes(handleOf(edge.targetHandle))) {
      const definition = data.stateDefinitions?.[sourceRecordId];
      if (handleOf(edge.targetHandle) === 'status' && definition?.stateId && targetRecordId) {
        const record = processNodes[targetRecordId];
        processNodes[targetRecordId] = {
          ...record,
          state: { ...(record.state || {}), axis: record.state?.axis || 'main', to: definition.stateId }
        };
      }
      continue;
    }

    // A composer feeding a construct/mutate block expands to the field
    // wires it carried: the block substrate never reaches a native
    // consumer, and the composer's authored defaults move with the fields.
    if (sourceRecord?.kind === 'cts.compose'
      && ['cts.construct', 'cts.mutate'].includes(targetRecord?.kind)
      && handleOf(edge.targetHandle) === String(sourceRecord.block || sourceRecord.slot || '')) {
      for (const incoming of graph.edges || []) {
        if (String(incoming.target) !== sourceId) continue;
        const handle = handleOf(incoming.targetHandle);
        const entry = handle.startsWith('entry:')
          ? (sourceRecord.entries || []).find(candidate => `entry:${candidate.id}` === handle)
          : null;
        const path = entry ? `${sourceRecord.block}.${entry.key}` : handle;
        if (!entry && !(sourceRecord.fields || []).includes(path)) continue;
        appended.push({
          ...incoming,
          id: `${incoming.id}:${path}`,
          target: targetId,
          targetHandle: dataHandle(path)
        });
      }
      if (targetRecordId) {
        const defaults = {
          ...(defaultsByRecordId.get(targetRecordId) || processNodes[targetRecordId]?.inputDefaults || {})
        };
        for (const [key, value] of Object.entries(sourceRecord.inputDefaults || {})) {
          const entry = key.startsWith('entry:')
            ? (sourceRecord.entries || []).find(candidate => `entry:${candidate.id}` === key)
            : null;
          defaults[entry ? `${sourceRecord.block}.${entry.key}` : key] = value;
        }
        defaultsByRecordId.set(targetRecordId, defaults);
      }
      expandedComposerNodeIds.add(sourceId);
      // The consumer's block slots die with the substrate: its ports are
      // the field sockets the expanded wires land on.
      if (targetRecordId && processNodes[targetRecordId]?.slots) {
        const { slots: _retiredSlots, ...consumer } = processNodes[targetRecordId];
        processNodes[targetRecordId] = consumer;
      }
      continue;
    }

    const migrated = { ...edge };
    if (sourceRecord?.kind === 'cts.read') {
      const outputs = READ_OUTPUT_HANDLE_MIGRATION[sourceRecord.select || 'current'] || {};
      const handle = handleOf(edge.sourceHandle);
      if (handle && outputs[handle]) migrated.sourceHandle = dataHandle(outputs[handle]);
    }
    if (targetRecord?.kind === 'cts.read') {
      const inputs = READ_INPUT_HANDLE_MIGRATION[targetRecord.select || 'current'] || {};
      const handle = handleOf(edge.targetHandle);
      if (handle && inputs[handle]) migrated.targetHandle = dataHandle(inputs[handle]);
    }
    if (targetRecord?.kind === 'cts.field' && handleOf(edge.targetHandle) === 'block') {
      migrated.targetHandle = dataHandle('entity');
    }
    kept.push(migrated);
  }

  graph.edges = [...kept, ...appended];
  for (const [recordId, defaults] of defaultsByRecordId) {
    if (processNodes[recordId]) {
      processNodes[recordId] = { ...processNodes[recordId], inputDefaults: defaults };
    }
  }

  // Unwired authored defaults follow the same laws: a construct's initial
  // state dies with the socket (the declaration owns it); a mutate's
  // smuggled status joins the split queue.
  for (const [recordId, record] of Object.entries(processNodes)) {
    if (record?.kind === 'cts.construct' && record.inputDefaults?.['states.main'] !== undefined) {
      const { ['states.main']: _initial, ...inputDefaults } = record.inputDefaults;
      processNodes[recordId] = { ...record, inputDefaults };
    }
    if (record?.kind === 'cts.mutate' && record.inputDefaults?.['states.main'] !== undefined) {
      const graphNodeId = (graph.nodes || []).find(node => recordIdByGraphNode.get(String(node.id)) === recordId)?.id;
      if (graphNodeId && !statusSplitTargets.some(target => target.recordId === recordId)) {
        statusSplitTargets.push({ graphNodeId: String(graphNodeId), recordId });
      }
    }
  }

  // The smuggled status becomes a chained cts.transition: the mutate keeps
  // the field patch, the transition owns the declared target, and every
  // downstream edge waits for the transitioned entity.
  for (const { graphNodeId, recordId } of statusSplitTargets) {
    const mutate = processNodes[recordId];
    const targetState = mutate?.inputDefaults?.['states.main'];
    if (!mutate || targetState == null) continue;
    const transitionRecordId = `${recordId}:status`;
    const { ['states.main']: _retired, ...inputDefaults } = mutate.inputDefaults || {};
    processNodes[recordId] = { ...mutate, inputDefaults };
    processNodes[transitionRecordId] = {
      id: transitionRecordId,
      kind: 'cts.transition',
      typeId: mutate.typeId,
      state: { axis: 'main', to: String(targetState) },
      trigger: { mode: 'event' }
    };
    const transitionGraphNodeId = `${graphNodeId}:status`;
    graph.nodes = [...(graph.nodes || []), {
      id: transitionGraphNodeId,
      type: 'processNode',
      position: { x: 0, y: 0 },
      data: { refId: transitionRecordId }
    }];
    graph.edges = [
      ...graph.edges.map(edge => (String(edge.source) === graphNodeId
        ? { ...edge, source: transitionGraphNodeId }
        : edge)),
      {
        id: `${transitionRecordId}:flow`,
        source: graphNodeId,
        sourceHandle: 'control:completed',
        target: transitionGraphNodeId,
        targetHandle: 'control:in',
        role: 'control'
      },
      {
        id: `${transitionRecordId}:entity`,
        source: graphNodeId,
        sourceHandle: 'data:result',
        target: transitionGraphNodeId,
        targetHandle: 'data:entity',
        role: 'data'
      }
    ];
  }

  // Expanded composers and the decomposes that fed nothing else leave with
  // their retired block sockets — the persisted graph keeps only live
  // native records.
  const dead = new Set(expandedComposerNodeIds);
  let changing = true;
  while (changing) {
    changing = false;
    const liveEdges = (graph.edges || []).filter(edge => (
      !dead.has(String(edge.source)) && !dead.has(String(edge.target))
    ));
    for (const node of graph.nodes || []) {
      const id = String(node.id);
      if (dead.has(id)) continue;
      const record = recordByGraphNode.get(id);
      if (record?.kind !== 'cts.decompose') continue;
      const fedRetiredSubstrate = originalEdges.some(edge => (
        String(edge.source) === id && dead.has(String(edge.target))
      ));
      if (fedRetiredSubstrate && !liveEdges.some(edge => String(edge.source) === id)) {
        dead.add(id);
        changing = true;
      }
    }
  }
  if (dead.size) {
    graph.edges = (graph.edges || []).filter(edge => (
      !dead.has(String(edge.source)) && !dead.has(String(edge.target))
    ));
    graph.nodes = (graph.nodes || []).filter(node => !dead.has(String(node.id)));
    for (const [graphNodeId, recordId] of recordIdByGraphNode) {
      if (dead.has(graphNodeId) && recordId) delete processNodes[recordId];
    }
  }
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
    migrated.construction = { ...migrated.construction };
    delete migrated.via;
  }
  if (mapping.kind === CTS_KIND.transition) {
    const state = { ...(migrated.state || {}) };
    if (migrated.targetState !== undefined) {
      state.to = migrated.targetState;
      delete migrated.targetState;
    }
    if (migrated.status && migrated.status.to !== undefined) {
      state.to = migrated.status.to;
      state.intent = state.intent || migrated.status.intent;
      delete migrated.status.to;
    }
    if (state.to !== undefined) migrated.state = state;
    delete migrated.target;
  }
  if (Array.isArray(migrated.entries)) {
    migrated.entries = migrated.entries.map(entry => ({
      ...rewriteDescriptorRecord(entry),
      ...(entry?.typeId ? { typeId: kebab(entry.typeId) } : {})
    }));
  }
  // Authored paths (record.field projections, effect field lists) are the
  // declared schema paths — they migrate verbatim; no slot stripping.
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
// before they are posted. State-to-state transitions are canvas wires and
// are not part of the persisted record set, but transition NODES are
// persisted process records: their inline target statuses (SPEC §20 —
// `state` payload: to/label/severity/icon/terminal/intent) merge into the
// projected axis through the same shared core the canvas compile uses.
// `type`-kind records are registry references, not declarations.
export function declarationsFromCtsRecords(records = {}, processNodes = {}, graph = {}) {
  const byKind = kind => Object.values(records || {}).filter(record => record?.kind === kind);
  const transitionsByType = transitionNodeStateTargets(processNodes);
  const recordIdByGraphNode = new Map((graph?.nodes || [])
    .filter(node => node?.type === 'ctsState' && node.data?.refId)
    .map(node => [String(node.id), String(node.data.refId)]));
  const classRecordIdByGraphNode = new Map((graph?.nodes || [])
    .filter(node => node?.type === 'ctsClass' && node.data?.refId)
    .map(node => [String(node.id), String(node.data.refId)]));
  const parentOf = new Map();
  const childrenEdges = [];
  const entryStateByType = new Map();
  const processRecordIdByGraphNode = new Map((graph?.nodes || [])
    .filter(node => node?.type === 'processNode' && node.data?.refId)
    .map(node => [String(node.id), String(node.data.refId)]));
  for (const edge of graph?.edges || []) {
    if (edge.role !== 'type') continue;
    if (edge.label === 'entry') {
      const stateId = recordIdByGraphNode.get(String(edge.source));
      const processRecordId = processRecordIdByGraphNode.get(String(edge.target));
      const processRecord = processRecordId ? processNodes[processRecordId] : null;
      const typeId = String(processRecord?.typeId || '');
      if (stateId && typeId) entryStateByType.set(typeId, stateId);
      continue;
    }
    if (edge.label === 'nested') {
      const child = recordIdByGraphNode.get(String(edge.source));
      const parent = recordIdByGraphNode.get(String(edge.target));
      if (child && parent) parentOf.set(child, parent);
      continue;
    }
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

    const stateRecords = byKind('state')
      .filter(state => state.typeId === cls.typeId && state.value)
      .map(state => ({ ...state, id: String(state.id || state.refId || state.value) }));
    const recordById = new Map(stateRecords.map(state => [state.id, state]));
    for (const state of stateRecords) {
      if (state.parentStateId && recordById.has(String(state.parentStateId))) {
        parentOf.set(state.id, String(state.parentStateId));
      }
    }

    const byAxis = new Map();
    for (const state of stateRecords) {
      const axis = String(state.axis || 'main');
      byAxis.set(axis, [...(byAxis.get(axis) || []), state]);
    }
    declaration.states = {};
    declaration.transitions = [];
    for (const [axis, states] of byAxis) {
      const childrenOf = new Map(states.map(state => [state.id, []]));
      const roots = [];
      for (const state of states) {
        const parentId = parentOf.get(state.id);
        if (parentId && childrenOf.has(parentId)) childrenOf.get(parentId).push(state);
        else roots.push(state);
      }
      const build = statesFor => Object.fromEntries(statesFor.map(state => {
        const children = childrenOf.get(state.id) || [];
        const selectedChild = children.find(child => child.initial === true) || children[0];
        const policy = {
          ...(state.label ? { label: state.label } : {}),
          ...(state.severity ? { severity: state.severity } : {}),
          ...(state.icon ? { icon: state.icon } : {})
        };
        const node = {
          ...(state.terminal === true ? { terminal: true } : {}),
          ...(children.length ? { initial: selectedChild.value } : {}),
          ...(Object.keys(policy).length ? { policy } : {})
        };
        if (children.length) node.states = build(children);
        return [state.value, node];
      }));
      const entryRootId = entryStateByType.get(cls.typeId);
      const initialRoot = roots.find(state => state.id === entryRootId)
        || roots.find(state => state.initial === true)
        || roots[0];
      if (!initialRoot) continue;
      declaration.states[axis] = {
        initial: initialRoot.value,
        states: build(roots)
      };
      const transitions = (transitionsByType.get(cls.typeId) || [])
        .filter(transition => transition.axis === axis
          && findState(declaration.states[axis], transition.from)
          && findState(declaration.states[axis], transition.to));
      const merged = mergeTransitionNodeStates({
        machine: declaration.states[axis],
        transitions
      });
      declaration.states[axis] = merged;
      declaration.transitions.push(...merged.transitions);
    }
    if (!Object.keys(declaration.states).length) delete declaration.states;
    if (!declaration.transitions.length) delete declaration.transitions;

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
// transition record authors its target status inline on its `state`
// payload (the persisted v5 `target` key reads identically). Extracted
// per bound type — the vocabulary seam both declaration compiles share.
// A record without a binding or target contributes nothing (unfinished
// authoring, like an unnamed field).
export function transitionNodeStateTargets(processNodes = {}) {
  const byType = new Map();
  for (const record of Object.values(processNodes || {})) {
    if (operationKindOf(record || {}) !== 'effect.changeStatus') continue;
    const typeId = String(record.typeId || '');
    const axis = String(record.state?.axis || 'main');
    const from = String(record.state?.from || '').trim();
    const to = String(record.state?.to || record.target || '').trim();
    if (!typeId || !from || !to) continue;
    const transition = { axis, from, to };
    if (record.state?.intent) transition.intent = record.state.intent;
    const list = byType.get(typeId) || [];
    if (!list.some(existing => existing.axis === axis && existing.from === from && existing.to === to)) {
      list.push(transition);
    }
    byType.set(typeId, list);
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
