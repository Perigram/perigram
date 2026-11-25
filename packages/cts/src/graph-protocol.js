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
import { classMayDeclareChildren } from './classes.js';
import { isRowKeyId } from './rows.js';
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
});

const CTS_SERVICE_KIND = 'cts.service';

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

// The operation kind of any record is its own kind (SPEC §20): the
// species vocabulary is the only executable one, so classification never
// translates. The single seam every kind-matching consumer routes
// through.
export function operationKindOf(node = {}) {
  return String(node?.kind || '');
}

// Single-record resolution is deliberately one-way and native. The
// operation-kind table is classification metadata for shared behavior; it
// is not a replacement record and is never used to manufacture ports.
export function resolveCtsRecord(node = {}, domain = {}) {
  return resolveNativeNode(node, domain, typeIdResolver(domain), [], '');
}

// Row-key minting (SPEC §4): an authored name's latin letter/digit
// segments become the lowerCamelCase row key; any other name digests to
// a stable opaque key. '' only for empty input.
export function rowFieldId(value = '') {
  const text = String(value);
  const segments = text.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const derived = segments.length
    ? segments[0].charAt(0).toLowerCase() + segments[0].slice(1)
      + segments.slice(1).map(segment => segment.charAt(0).toUpperCase() + segment.slice(1)).join('')
    : '';
  if (derived && isRowKeyId(derived)) return derived;
  if (!text.trim()) return '';
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return 'f' + hash.toString(36);
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

// -- row-relative field references (SPEC §7/§20) --

// Guard field paths and state field-policy ids address the bare row id;
// a block-prefixed spelling (`fields.x`, legacy `data.x`/`specs.x`)
// resolves to it — the dual shape `nativeFieldPathDeclared` accepts for
// read paths.
const ROW_BLOCK_NAMES = new Set(['fields', 'data', 'specs']);

export function rowRelativeFieldId(id = '') {
  return String(id).replace(/^(fields|data|specs)\./, '');
}

export function normalizeRowRelativeGuard(guard) {
  if (!guard || typeof guard !== 'object') return guard;
  let changed = false;
  const rewrite = node => {
    if (!node || typeof node !== 'object') return node;
    if (node.op === 'field' && Array.isArray(node.path)
      && node.path[0] === 'value' && ROW_BLOCK_NAMES.has(node.path[1]) && node.path.length > 2) {
      changed = true;
      return { ...node, path: ['value', ...node.path.slice(2)] };
    }
    if (Array.isArray(node.args)) return { ...node, args: node.args.map(rewrite) };
    if (node.arg) return { ...node, arg: rewrite(node.arg) };
    return node;
  };
  const healed = rewrite(guard);
  return changed ? healed : guard;
}

export function normalizeRowRelativeFieldRefs(data = {}) {
  if (!data || typeof data !== 'object') return data;
  const facetLists = facet => {
    if (!facet || typeof facet !== 'object') return facet;
    const adopted = {};
    let changed = false;
    for (const key of ['visible', 'editable']) {
      if (!Array.isArray(facet[key])) continue;
      adopted[key] = facet[key].map(rowRelativeFieldId);
      if (adopted[key].some((id, index) => id !== facet[key][index])) changed = true;
    }
    return changed ? adopted : facet;
  };
  const processNodes = mapRecords(data.processNodes || {}, node => {
    if (node?.kind === 'cts.transition' && node.guard) {
      const facet = facetLists(node.fieldPolicy);
      return facet === node.fieldPolicy
        ? { ...node, guard: normalizeRowRelativeGuard(node.guard) }
        : { ...node, guard: normalizeRowRelativeGuard(node.guard), fieldPolicy: facet };
    }
    if (node && (node.kind === 'cts.transition' || node.kind === 'cts.construct') && node.fieldPolicy) {
      const facet = facetLists(node.fieldPolicy);
      if (facet !== node.fieldPolicy) return { ...node, fieldPolicy: facet };
    }
    return node;
  });
  return { ...data, processNodes };
}

// -- resolution: v5 binding seam (native records stay native) --

// One-way rewrite for the retired wire vocabulary (owner decision
// 2026-10-11: the instance wire speaks the stored §3 shape). Persisted
// authored paths adopt the current wire: `data.*`/`specs.*` rows re-home
// to flat `fields.*`, `identity.name` → `name`, `identity.uid` → `_id`,
// `attachments.primary` → `payload`, `lineage.organizationId` →
// `organizationId`; compose records' `data`/`specs` block becomes
// `fields`; the retired hardcoded Name construction input, its socket
// default, and edges into its `data:name` handle drop. Runs at
// definition resolution (validate/compile/execute consume the healed
// form) and in the save-boundary persisted rewrites (storage heals on
// the next save).
function adoptWirePath(path) {
  const clean = String(path);
  if (clean === 'identity.uid') return '_id';
  if (clean === 'identity.name') return 'name';
  if (clean === 'attachments.primary') return 'payload';
  if (clean === 'lineage.organizationId') return 'organizationId';
  if (/^(data|specs)\.[a-z_]/.test(clean)) return `fields.${clean.slice(clean.indexOf('.') + 1)}`;
  return clean;
}

const adoptHandle = (handle) => {
  const clean = String(handle || '');
  const separator = clean.indexOf(':');
  if (separator < 0) return adoptWirePath(clean);
  return `${clean.slice(0, separator + 1)}${adoptWirePath(clean.slice(separator + 1))}`;
};

function adoptRecordPaths(record) {
  const rewritten = { ...record };
  let changed = false;
  if (rewritten.inputDefaults && typeof rewritten.inputDefaults === 'object') {
    const adopted = {};
    for (const [key, value] of Object.entries(rewritten.inputDefaults)) {
      const nextKey = key === 'field' || key === 'fieldPath' ? key : adoptWirePath(key);
      const nextValue = key === 'field' || key === 'fieldPath' ? adoptWirePath(value) : value;
      if (nextKey !== key || nextValue !== value) changed = true;
      adopted[nextKey] = nextValue;
    }
    rewritten.inputDefaults = adopted;
  }
  if (Array.isArray(rewritten.fields)) {
    const adopted = rewritten.fields.map(adoptWirePath);
    if (adopted.some((path, index) => path !== rewritten.fields[index])) {
      rewritten.fields = adopted;
      changed = true;
    }
  }
  if (Array.isArray(rewritten.construction?.inputs)) {
    const adopted = rewritten.construction.inputs.map(input => {
      if (!input || typeof input !== 'object') return input;
      const id = adoptWirePath(input.id || '');
      const path = input.path !== undefined ? adoptWirePath(input.path) : undefined;
      if (id === input.id && path === input.path) return input;
      return { ...input, ...(id ? { id } : {}), ...(path !== undefined ? { path } : {}) };
    });
    if (adopted.some((input, index) => input !== rewritten.construction.inputs[index])) {
      rewritten.construction = { ...rewritten.construction, inputs: adopted };
      changed = true;
    }
  }
  for (const key of ['field', 'fieldPath']) {
    if (typeof rewritten[key] === 'string' && adoptWirePath(rewritten[key]) !== rewritten[key]) {
      rewritten[key] = adoptWirePath(rewritten[key]);
      changed = true;
    }
  }
  if ((rewritten.block === 'data' || rewritten.block === 'specs')) {
    rewritten.block = 'fields';
    changed = true;
  }
  // A legacy identity-block composer whose entries are the rename channel
  // becomes a `name` block composer (block[key] = value lands on the
  // draft's top-level name); other identity keys are retired phantoms and
  // fail validation loudly instead.
  if (rewritten.block === 'identity'
    && Array.isArray(rewritten.entries)
    && rewritten.entries.length
    && rewritten.entries.every(entry => entry?.key === 'name')) {
    rewritten.block = 'name';
    changed = true;
  }
  if (!changed) return record;
  return rewritten;
}

function adoptProducerOutputPaths(output) {
  const fields = output?.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return output;
  const adopted = {};
  let changed = false;
  for (const [level, paths] of Object.entries(fields)) {
    if (!Array.isArray(paths)) {
      adopted[level] = paths;
      continue;
    }
    adopted[level] = paths.map(adoptWirePath);
    if (adopted[level].some((path, index) => path !== paths[index])) changed = true;
  }
  return changed ? { ...output, fields: adopted } : output;
}

// Children-wire direction heal: children edges land child-first — the
// child's `output:type` into the parent's `input:declare`. Graphs
// persisted before that contract carry parent-first edges; the edge's
// `data.key` (`${childTypeId}s`, written by every authoring seam) names
// the child end, so the flip is deterministic and idempotent. Ambiguous
// shapes (no key, or a key no end matches) are left for validation.
export function orientChildrenEdgesChildFirst(data = {}) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.graph?.edges)) return data;
  const nodeTypeIds = new Map((data.graph.nodes || [])
    .filter(node => node?.type === 'ctsClass' || node?.type === 'ctsType')
    .map(node => [String(node.id), String(node.data?.typeId || '')]));
  const nodeTypes = new Map((data.graph.nodes || []).map(node => [String(node.id), String(node?.type || '')]));
  let changed = false;
  const edges = data.graph.edges.map(edge => {
    if (edge?.role !== 'type' || edge.label !== 'children') return edge;
    if (String(edge.source) === String(edge.target)) return edge;
    const childTypeId = String(edge.data?.key || '').replace(/s$/, '');
    if (!childTypeId) return edge;
    const sourceChild = nodeTypeIds.get(String(edge.source)) === childTypeId;
    const targetChild = nodeTypeIds.get(String(edge.target)) === childTypeId;
    const classToCard = nodeTypes.get(String(edge.source)) === 'ctsClass' && nodeTypes.get(String(edge.target)) === 'ctsType';
    if (!targetChild || (sourceChild && !classToCard)) return edge;
    const marker = 'children:';
    const at = String(edge.id || '').indexOf(marker);
    changed = true;
    return {
      ...edge,
      id: `${at >= 0 ? edge.id.slice(0, at + marker.length) : 'children:'}${edge.target}-${edge.source}`,
      source: edge.target,
      target: edge.source,
      sourceHandle: 'output:type',
      targetHandle: 'input:declare'
    };
  });
  return changed ? { ...data, graph: { ...data.graph, edges } } : data;
}

/**
 * One-way seam rewrite retiring class-scoped state authoring (SPEC §7:
 * states wire into create/transition operations and parent states only).
 * Strips state→class `declares` wires, the `typeId`/`initial`/`terminal`
 * scope fields off state graph nodes and their cts records, and the
 * class node's `states` count.
 */
export function retireStateScopeAuthoring(data = {}) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.graph?.edges)) return data;
  const nodeTypes = new Map((data.graph.nodes || []).map(node => [String(node.id), String(node?.type || '')]));
  const edges = data.graph.edges.filter(edge => !(
    edge?.role === 'type'
    && edge.label === 'declares'
    && nodeTypes.get(String(edge.source)) === 'ctsState'
  ));
  const nodes = (data.graph.nodes || []).map(node => {
    if (node?.type === 'ctsState') {
      const { typeId, initial, terminal, ...rest } = node.data || {};
      return (typeId === undefined && initial === undefined && terminal === undefined)
        ? node
        : { ...node, data: rest };
    }
    if (node?.type === 'ctsClass' && node.data && Object.hasOwn(node.data, 'states')) {
      const { states, ...rest } = node.data;
      return { ...node, data: rest };
    }
    return node;
  });
  const ctsTypes = Object.fromEntries(Object.entries(data.ctsTypes || {}).map(([id, record]) => {
    if (record?.kind !== 'state') return [id, record];
    const { typeId, initial, terminal, ...rest } = record;
    return [id, rest];
  }));
  return { ...data, graph: { ...data.graph, nodes, edges }, ctsTypes };
}

export function rewriteRetiredWirePaths(data = {}) {
  if (!data || typeof data !== 'object') return data;
  const constructs = new Set(Object.entries(data.processNodes || {})
    .filter(([, node]) => node?.kind === 'cts.construct')
    .map(([id]) => String(id)));
  const graphNodeConstruct = new Map((data.graph?.nodes || [])
    .map(node => [String(node.id), constructs.has(String(node.data?.refId || node.id || ''))]));
  const isRetiredHandle = handle => String(handle || '').replace(/^(input|data):/, '') === 'name';
  const edges = (data.graph?.edges || []).map(edge => {
    const nextTarget = adoptHandle(edge.targetHandle);
    const nextSource = adoptHandle(edge.sourceHandle);
    if (nextTarget === edge.targetHandle && nextSource === edge.sourceHandle) return edge;
    return { ...edge, targetHandle: nextTarget, sourceHandle: nextSource };
  }).filter(edge => {
    const targetIsConstruct = graphNodeConstruct.has(String(edge.target))
      ? graphNodeConstruct.get(String(edge.target))
      : constructs.has(String(edge.target));
    return !(targetIsConstruct && isRetiredHandle(edge.targetHandle));
  });
  const processNodes = Object.fromEntries(Object.entries(data.processNodes || {}).map(([id, node]) => {
    if (!node || typeof node !== 'object') return [id, node];
    const adopted = adoptRecordPaths(node);
    if (!constructs.has(String(id))) return [id, adopted];
    const inputs = Array.isArray(adopted.construction?.inputs)
      && adopted.construction.inputs.some(input => String(input?.id || input?.path || '') === 'name')
      ? adopted.construction.inputs.filter(input => String(input?.id || input?.path || '') !== 'name')
      : null;
    const hasDefault = adopted.inputDefaults != null && Object.hasOwn(adopted.inputDefaults, 'name');
    if (!inputs && !hasDefault) return [id, adopted];
    const rewritten = { ...adopted };
    if (inputs) rewritten.construction = { ...rewritten.construction, inputs };
    if (hasDefault) {
      rewritten.inputDefaults = { ...rewritten.inputDefaults };
      delete rewritten.inputDefaults.name;
    }
    return [id, rewritten];
  }));
  const producerOutputs = data.producerOutputs && typeof data.producerOutputs === 'object' && !Array.isArray(data.producerOutputs)
    ? Object.fromEntries(Object.entries(data.producerOutputs).map(([id, output]) => [id, adoptProducerOutputPaths(output)]))
    : data.producerOutputs;
  return normalizeRowRelativeFieldRefs({
    ...data,
    processNodes,
    producerOutputs,
    ...(data.graph ? { graph: { ...data.graph, edges } } : {})
  });
}

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

  const resolvedData = rewriteRetiredWirePaths(orientChildrenEdgesChildFirst({
    ...data,
    graphProtocol: 5,
    processNodes,
    producerOutputs,
    actions,
    sockets,
    screens
  }));
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
  // The legacy socket-default spelling persisted the transition target as
  // `inputDefaults.state`; adopt it into the state reference (the one
  // current authored shape) and drop the default so the two sources can
  // never disagree.
  if (resolved.kind === CTS_KIND.transition
    && resolved.state === undefined
    && typeof resolved.inputDefaults?.state === 'string') {
    resolved.state = { to: resolved.inputDefaults.state };
    const { state: _adopted, ...rest } = resolved.inputDefaults;
    resolved.inputDefaults = rest;
  }
  if (resolved.kind === CTS_KIND.read && !resolved.select) resolved.select = 'current';
  if (resolved.kind === CTS_KIND.read && resolved.select === 'extract') {
    const key = `${typeIdOf(resolved) || ''}/${resolved.projection || ''}`;
    if (!domain.projectionContracts?.[key]) {
      diagnostics.push(`${at}: extract read declares no projection of ${key.replace(/^\//, '(unbound type)/')} (declared projections live on the bound type)`);
    }
  }
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
  // A children edge's source may be an in-tree class OR a type-reference
  // node naming a registry type: the child type id comes from whichever
  // the wire leaves. The target is always the parent class record.
  const childTypeIdByGraphNode = new Map((graph?.nodes || [])
    .filter(node => (node?.type === 'ctsClass' || node?.type === 'ctsType') && (node.data?.refId || node.data?.typeId))
    .map(node => [String(node.id), node.type === 'ctsClass' ? String(node.data.refId) : String(node.data.typeId || '')]));
  const childrenEdges = [];
  for (const edge of graph?.edges || []) {
    if (edge.role !== 'type') continue;
    if (edge.label === 'children') {
      const parent = classRecordIdByGraphNode.get(String(edge.target));
      const child = childTypeIdByGraphNode.get(String(edge.source));
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
      ...(Array.isArray(cls.projections) && cls.projections.length ? { projections: cls.projections } : {}),
      ...(Array.isArray(cls.migrate) && cls.migrate.length ? { migrate: cls.migrate } : {})
    };
    for (const field of byKind('field')) {
      if (field.typeId !== cls.typeId || !field.name) continue;
      const fieldId = rowFieldId(field.name);
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
    if (node.kind === CTS_KIND.transition && node.archive !== true) {
      // Archive transitions resolve their intent at the effect boundary
      // (ARCHIVED or the named archive intent) and carry no authored
      // target; every other transition declares one.
      const target = node.state?.to || node.inputDefaults?.state || node.target || '';
      const hasStatusWire = (data.graph?.edges || []).some(edge => (
        String(edge.target) === id
        && ['data:status', 'data:states.main', 'data:state'].includes(String(edge.targetHandle || ''))
      ));
      if (!target && !hasStatusWire) {
        // An executable transition must carry an authored target (SPEC §14,
        // README graph-protocol entry).
        errors.push(`processNodes.${id}: transition declares no target state`);
      }
      if (target) {
        // The vocabulary is the draft's own state records (SPEC §7): a
        // state node is a value token, so any record carrying the target
        // value satisfies the bound type.
        const records = Object.values(data.ctsTypes || {}).filter(record => record?.kind === 'state');
        const declared = records.some(record => record.value === target);
        if (!declared) {
          errors.push(`processNodes.${id}: state ${target} is not declared in this draft`);
        }
      }
    }
    if ([CTS_KIND.field, CTS_KIND.mutate, CTS_KIND.compose].includes(node.kind)) {
      // Authored definitions may carry plain socket defaults or the
      // data-tree packet wrap the designer persists (the unwrap the
      // processes port resolution applies) — one reader accepts both.
      const fieldDefault = node.inputDefaults?.field;
      const authoredFieldValue = fieldDefault?.branches?.[0]?.items?.[0] ?? fieldDefault;
      const paths = node.kind === CTS_KIND.mutate
        ? [...(node.fields || []), ...Object.keys(node.inputDefaults || {})]
        : [authoredFieldValue, node.field, node.path].filter(Boolean);
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
