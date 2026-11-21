import { mapDomainInputType, normalizeProcessSocket, processType } from './types.js';

import { PROCESS_OPERATION_REGISTRY, CONVERT_UNIT_FACTORS, processOperation } from './operations.js';
import { typeIdOf, ctsFieldToProcessType } from '@perigram/cts';

const DATA = 'data';
const CONTROL = 'control';

// Make List is the fixed-input-count collection constructor: exactly these
// optional item sockets, at most one wire each (sockets stay non-multiple, so
// connection validation rejects a second wire like any single-value socket).
export const MAKE_LIST_INPUTS = Object.freeze(['item1', 'item2', 'item3', 'item4']);

// Origin species mint new entity paths and own producer outputs. Consumer
// species transform entities that arrived over an input wire: they own no
// producer output and bind to the upstream producer of that wire, so the
// workflow/machine stays anchored where the entity path begins.
// Kind-membership sets (the `new Set` pattern every kind classifier in
// this package uses): test with `.has(kind)`.
export const PRODUCER_ORIGIN_SPECIES_KINDS = new Set([
  'cts.construct',
  'cts.command',
  'cts.service',
  'cts.conversion'
]);

export const CONSUMER_SPECIES_KINDS = new Set([
  'cts.mutate',
  'cts.transition',
  'cts.remove'
]);

// The operational species union: origin + consumer species, plus the
// event-emitting effect (an effect with no entity contract).
export const EFFECT_SPECIES_KINDS = new Set([
  ...PRODUCER_ORIGIN_SPECIES_KINDS,
  ...CONSUMER_SPECIES_KINDS,
  'cts.emit'
]);

// The species the shared effect mapper aligns per item (mapped mutations).
export const MAPPED_MUTATION_SPECIES_KINDS = new Set([
  'cts.construct',
  'cts.mutate',
  'cts.transition',
  'cts.remove'
]);

const FAMILY_GLYPHS = Object.freeze({
  sources: 'source', values: 'value', collections: 'collection',
  records: 'record', reads: 'read', effects: 'effect', control: 'control'
});

const NODE_GLYPHS = Object.freeze({
  'source.literalItem': 'literal-item', 'source.literalList': 'literal-list', 'source.literalTree': 'literal-tree',
  'source.processInput': 'process-input', 'source.triggerPayload': 'trigger-payload', 'source.currentTime': 'clock',
  'source.secretRef': 'secret', 'source.currentUser': 'user', 'source.currentOrganization': 'organization',
  'value.cast': 'cast', 'value.select': 'select', 'value.recordField': 'record-field', 'value.convertUnit': 'convert-unit',
  'value.required': 'required', 'value.coalesce': 'coalesce', 'value.validate': 'validate', 'value.math': 'math',
  'value.string': 'string', 'value.dateTime': 'date-time', 'value.compare': 'compare', 'value.logic': 'logic', 'value.format': 'format',
  'collection.makeList': 'make-list', 'collection.packArray': 'pack-array', 'collection.unpackArray': 'unpack-array',
  'collection.concat': 'concat', 'collection.itemAt': 'item-at', 'collection.slice': 'slice', 'collection.count': 'count',
  'collection.distinct': 'distinct', 'collection.sort': 'sort', 'collection.reverse': 'reverse', 'collection.shift': 'shift',
  'collection.partition': 'partition', 'collection.dispatch': 'dispatch', 'collection.groupBy': 'group-by',
  'collection.filter': 'filter', 'collection.join': 'join', 'collection.reduce': 'reduce',
  'tree.flatten': 'flatten', 'tree.graft': 'graft', 'tree.simplify': 'simplify', 'tree.branch': 'branch',
  'tree.zip': 'zip', 'tree.unzip': 'unzip', 'tree.cross': 'cross', 'tree.transpose': 'transpose', 'tree.clean': 'clean', 'tree.stats': 'stats',
  'record.construct': 'record-construct', 'record.merge': 'record-merge',
  'cts.construct': 'construct', 'cts.mutate': 'mutate', 'cts.transition': 'transition', 'cts.remove': 'remove',
  'cts.command': 'command', 'cts.service': 'service', 'cts.conversion': 'conversion', 'cts.read': 'read',
  'cts.field': 'field', 'cts.emit': 'emit', 'cts.compose': 'compose', 'cts.decompose': 'decompose',
  'control.if': 'condition', 'control.switch': 'switch', 'control.fork': 'fork', 'control.joinAll': 'join-all',
  'control.joinAny': 'join-any', 'control.forEach': 'for-each', 'control.forEachEnd': 'for-each-end',
  'control.waitUntil': 'wait', 'control.stopSuccess': 'success', 'control.stopFailure': 'failure'
});
const definitions = [
  source('source.literalItem', 'literalItem'),
  source('source.literalList', 'literalList'),
  source('source.literalTree', 'literalTree'),
  source('source.processInput', 'processInput'),
  source('source.triggerPayload', 'triggerPayload'),
  source('source.currentTime', 'currentTime'),
  source('source.secretRef', 'secretReference'),
  // Run-context principals (SPEC §13 readable principals): resolve the
  // acting user and the active organization at execution — fixed types,
  // no binding, the party twin of the currentTime source.
  source('source.currentUser', 'currentUser'),
  source('source.currentOrganization', 'currentOrganization'),

  data('value.cast', 'cast'),
  data('value.select', 'select'),
  data('value.recordField', 'recordField'),
  data('value.convertUnit', 'convertUnit'),
  data('value.required', 'required'),
  data('value.coalesce', 'coalesce'),
  data('value.validate', 'validate'),
  data('value.math', 'math'),
  data('value.string', 'string'),
  data('value.dateTime', 'dateTime'),
  data('value.compare', 'compare'),
  data('value.logic', 'logic'),
  data('value.format', 'format'),

  data('collection.makeList', 'makeList'),
  data('collection.packArray', 'packArray'),
  data('collection.unpackArray', 'unpackArray'),
  data('collection.concat', 'concatLists'),
  data('collection.itemAt', 'itemAt'),
  data('collection.slice', 'slice'),
  data('collection.count', 'count'),
  data('collection.distinct', 'distinct'),
  data('collection.sort', 'sort'),
  data('collection.reverse', 'reverse'),
  data('collection.shift', 'shift'),
  data('collection.partition', 'partition'),
  data('collection.dispatch', 'dispatch'),
  data('collection.groupBy', 'groupBy'),
  data('collection.filter', 'filterValues'),
  data('collection.join', 'joinByKey'),
  data('collection.reduce', 'aggregate'),
  data('tree.flatten', 'flatten'),
  data('tree.graft', 'graft'),
  data('tree.simplify', 'simplify'),
  data('tree.branch', 'selectBranch'),
  data('tree.zip', 'zip'),
  data('tree.unzip', 'unzip'),
  data('tree.cross', 'crossProduct'),
  data('tree.transpose', 'transpose'),
  data('tree.clean', 'cleanTree'),
  data('tree.stats', 'treeStatistics'),

  data('record.construct', 'constructRecord'),
  data('record.merge', 'mergeRecords'),

  // Reads are native-species only (SPEC §20): persisted `read.*` kinds
  // migrate one-way to `cts.read` + select at the load boundary, so the
  // catalog carries no v4 read twins to fall back into.

  // Retired v4 executable kinds (SPEC §20) carry no definitions: the
  // catalog throws for them exactly as it does for the retired read kinds.
  // Persisted drafts rewrite through the one-shot native migration script.

  // Graph protocol v5 (SPEC §20): species kinds. Ports resolve through the
  // record's operation-kind twin — callers either pre-resolve records or
  // supply the projected domain in the context.
  cts('cts.construct', 'construct', 'effects', 'effect'),
  cts('cts.mutate', 'mutate', 'effects', 'effect'),
  cts('cts.transition', 'transition', 'effects', 'effect'),
  cts('cts.remove', 'remove', 'effects', 'effect'),
  cts('cts.command', 'command', 'effects', 'effect'),
  cts('cts.service', 'service', 'effects', 'effect'),
  cts('cts.conversion', 'conversion', 'effects', 'effect'),
  cts('cts.read', 'read', 'reads', 'read'),
  cts('cts.field', 'field', 'records', 'data'),
  cts('cts.emit', 'emitEvent', 'effects', 'effect'),
  cts('cts.compose', 'compose', 'records', 'data'),
  cts('cts.decompose', 'decompose', 'records', 'data'),

  control('control.if', 'ifElse'),
  control('control.switch', 'switch'),
  control('control.fork', 'fork'),
  control('control.joinAll', 'joinAll'),
  control('control.joinAny', 'joinAny'),
  control('control.forEach', 'forEach'),
  control('control.forEachEnd', 'forEachEnd'),
  control('control.waitUntil', 'waitUntil'),
  control('control.stopSuccess', 'stopSuccess'),
  control('control.stopFailure', 'stopFailure')
];

export const PROCESS_NODE_CATALOG = Object.freeze(definitions.map(Object.freeze));
const byKind = new Map(PROCESS_NODE_CATALOG.map(definition => [definition.kind, definition]));

export const PROCESS_NODE_FAMILIES = Object.freeze([
  'sources',
  'values',
  'collections',
  'records',
  'reads',
  'effects',
  'control'
]);

export function getProcessNodeDefinition(kind = '') {
  return byKind.get(kind) || null;
}

export function requireProcessNodeDefinition(kind = '') {
  const definition = getProcessNodeDefinition(kind);
  if (!definition) throw new Error(`Unknown process node kind ${kind || '(empty)'}`);
  return definition;
}

export function processNodeDefinitionsForFamily(family = '') {
  return PROCESS_NODE_CATALOG.filter(definition => definition.family === family);
}

export function resolveCatalogNodePorts(record = {}, context = {}) {
  const definition = requireProcessNodeDefinition(record.kind);
  const ports = typeof definition.ports === 'function'
    ? definition.ports(record, context)
    : definition.ports;
  return {
    inputs: (ports?.inputs || []).map(socket => normalizeProcessSocket(socket)),
    outputs: (ports?.outputs || []).map(socket => normalizeProcessSocket(socket))
  };
}

function source(kind, label) {
  return definition(kind, label, 'sources', 'data', true, catalogPorts);
}

function data(kind, label) {
  const family = kind.startsWith('collection.') || kind.startsWith('tree.')
    ? 'collections'
    : kind.startsWith('record.') ? 'records' : 'values';
  return definition(kind, label, family, kind.startsWith('read.') ? 'read' : 'data', true, catalogPorts);
}

function control(kind, label) {
  return definition(kind, label, 'control', 'control', false, catalogPorts);
}

function definition(kind, label, family, level, pure, ports = { inputs: [], outputs: [] }) {
  return { kind, label, family, level, pure, glyph: NODE_GLYPHS[kind] || FAMILY_GLYPHS[family], ports };
}

// Type-bound species (SPEC §20) split by binding semantics.
// Origin species mint values out of a type declaration and carry the
// persistent Type binding pin: constructs, and the reads that start from
// nothing but a declared type (current, all). The
// entity-derived reads (parent, children, related), the effect consumers
// (mutate, transition, remove), the field projection, and the instance
// elimination (decompose) are consumers:
// no pin, entity input only, binding adapts to the entity stream's type.
// `carriesTypePin(record)` is the per-record seam — kind plus read
// select — every binding consumer routes through.
const ENTITY_DERIVED_READS = Object.freeze(['parent', 'children', 'related']);
const ORIGIN_READ_SELECTS = Object.freeze(['current', 'all']);

export function carriesTypePin(record = {}) {
  const kind = String(record.kind || '');
  if (kind === 'cts.construct') return true;
  if (kind === 'cts.read') return ORIGIN_READ_SELECTS.includes(String(record.select || 'current'));
  return false;
}

export const TYPE_BOUND_SPECIES = Object.freeze(['cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove', 'cts.read', 'cts.field', 'cts.decompose']);

// The re-base vocabulary `value.cast` accepts; the evaluator enforces
// the same set with named errors.
export const CAST_BASES = Object.freeze(['json', 'record', 'list', 'string', 'number', 'boolean']);

// `value.convertUnit` authoring picks: the unit set the shared factor
// table defines (`CONVERT_UNIT_FACTORS` in the operation registry).
export const CONVERT_UNITS = Object.freeze(Object.keys(CONVERT_UNIT_FACTORS));

// The bases a literal or typed-value utility authors over; the inspector's
// base selector and the typed-value control share this vocabulary.
export const PROCESS_AUTHORED_BASES = Object.freeze([
  'string', 'number', 'integer', 'boolean', 'json',
  'date', 'dateTime', 'duration', 'enum', 'entityRef'
]);


function declarationTypePin(record = {}) {
  const typeId = typeIdOf(record);
  return {
    ...socket('type', processType('entityRef', typeId ? { typeId } : undefined), DATA, false),
    plane: 'declaration',
    multiple: true
  };
}

function completedSocket() {
  return socket('completed', processType('event'), CONTROL);
}

// Effect species carry the event contract symmetrically: a `control:in`
// socket (multiple) receives completion events from upstream operations,
// `completed` emits this operation's own. Pure reads and projections are
// lazy data sources and carry neither.
const nativeControlInput = () => [{ ...socket('in', processType('event'), CONTROL, true), multiple: true }];

// The construct-addressable inputs of one construction mode (SPEC §6):
// the mode's declared inputs plus the lineage/relation edge inputs, which
// are addressable where the entity begins regardless of mode — a typed
// construct (bake, upload) wires its parent under a declared children
// edge exactly like a generic create does. A mode the contract declares
// but leaves input-less (the editor protocol's blank construct) addresses
// the edges alone; only an undeclared mode falls back to the contract's
// whole input list. The single derivation shared
// by the catalog's port projection, the compiler's construction
// normalization, and the designer's node sync.
export function constructionInputsForContract(contract = {}, mode = '') {
  const modeDeclared = Object.hasOwn(contract.modeInputs || {}, mode);
  const modeInputs = modeDeclared ? contract.modeInputs[mode] : null;
  const edgeInputs = (contract.inputs || []).filter(input => {
    const path = String(input?.path || input?.id || '');
    return (path.startsWith('lineage.') || path.startsWith('relations.')) && input?.constructible !== false;
  });
  if (modeInputs == null) return [...(contract.inputs || [])];
  const seen = new Set(modeInputs.map(input => input?.id || input?.path));
  return [...modeInputs, ...edgeInputs.filter(input => !seen.has(input?.id || input?.path))];
}

// Mode resolution home: README Construction contracts (authored-if-declared
// → contract default → first declared mode).
export function resolveConstructionMode(record = {}, contract = {}) {
  const modes = contract.modes?.length ? contract.modes : ['genericCreate'];
  return record.construction?.mode && modes.includes(record.construction.mode)
    ? record.construction.mode
    : (modes.includes(contract.defaultMode) ? contract.defaultMode : modes[0]);
}

function nativeConstructionPorts(record = {}, context = {}) {
  const typeId = typeIdOf(record);
  if (!typeId) return { inputs: [declarationTypePin(record)], outputs: [] };
  const contract = context.domain?.construction?.[typeId] || {};
  const mode = resolveConstructionMode(record, contract);
  const declaredInputs = constructionInputsForContract(contract, mode);
  const hasDomainContract = Boolean(context.domain?.construction?.[typeId]);
  const constructionInputs = declaredInputs.length
    ? declaredInputs
    : (!hasDomainContract && Array.isArray(record.construction?.inputs) ? record.construction.inputs : []);
  return {
    inputs: [
      ...nativeControlInput(),
      declarationTypePin(record),
      ...constructionInputs.map(input => ({
        ...socket(input.path || input.id || 'value', mapDomainInputType(input.type, input), DATA, input.required === true && input.default === undefined, 'list'),
        label: input.label || input.path || input.id || 'value'
      })),
      // The initial state arrives by wire (SPEC §7): a state node wired
      // into this socket authors the created instance's state.
      socket('state', processType('status', { typeId }), DATA, false, 'list')
    ],
    outputs: [
      completedSocket(),
      socket('result', processType('entityRef', { typeId }), DATA, false)
    ]
  };
}

function nativeMutatePorts(record = {}, context = {}) {
  const typeId = typeIdOf(record);
  if (!typeId) {
    return { inputs: [socket('entity', processType('entityRef'), DATA, true, 'list')], outputs: [] };
  }
  const declaredRelationKeys = new Set((context.domain?.relations || [])
    .filter(relation => relation.ownerType === typeId)
    .map(relation => relation.key));
  // Writable leaves: the rename channel (`name`), the flat row home
  // (`fields.*`), and declared relation edges.
  const leaves = (context.fieldSchemas || [])
    .filter(field => field.writable !== false)
    .filter(field => (
      field.path === 'name'
      || field.block === 'fields'
      || (field.block === 'relations' && declaredRelationKeys.has(field.path.split('.').at(1)))
    ))
    .map(field => socket(field.path, field.type, DATA, false, 'list'));
  return {
    inputs: [
      ...nativeControlInput(),
      socket('entity', processType('entityRef', { typeId }), DATA, true, 'list'),
      ...leaves
    ],
    outputs: [
      completedSocket(),
      socket('result', processType('entityRef', { typeId }), DATA, false)
    ]
  };
}

function nativeTransitionPorts(record = {}) {
  const typeId = typeIdOf(record);
  if (!typeId) {
    return { inputs: [socket('entity', processType('entityRef'), DATA, true, 'list')], outputs: [] };
  }
  return {
    inputs: [
      ...nativeControlInput(),
      socket('entity', processType('entityRef', { typeId }), DATA, true, 'list'),
      socket('note', processType('string'), DATA, false, 'list'),
      // The target state arrives by wire (SPEC §7): a state node wired
      // into this socket is the transition's target — the wire is the
      // value, and an authored socket default is equivalent.
      socket('state', processType('status', { typeId }), DATA, true, 'list'),
      // Actor assignment (SPEC §7): users wired here (or prompted on a
      // manual run) become the instance's lifecycle actors.
      socket('actors', processType('entityRef', { typeId: 'user' }), DATA, false, 'list')
    ],
    outputs: [
      completedSocket(),
      socket('result', processType('entityRef', { typeId }), DATA, false)
    ]
  };
}

function nativeRemovePorts(record = {}) {
  const typeId = typeIdOf(record);
  if (!typeId) {
    return { inputs: [socket('entity', processType('entityRef'), DATA, true, 'list')], outputs: [] };
  }
  return {
    inputs: [socket('entity', processType('entityRef', { typeId }), DATA, true, 'list')],
    outputs: [
      completedSocket(),
      socket('result', processType('entityRef', { typeId }), DATA, false)
    ]
  };
}

function nativeReadPorts(record = {}, context = {}) {
  const typeId = typeIdOf(record);
  const select = record.select || 'current';
  if (!typeId) {
    return ORIGIN_READ_SELECTS.includes(select)
      ? { inputs: [declarationTypePin(record)], outputs: [] }
      : { inputs: [socket('entity', processType('entityRef'), DATA, true)], outputs: [] };
  }

  if (select === 'current') {
    return {
      inputs: [declarationTypePin(record)],
      outputs: [socket('result', processType('entityRef', { typeId }), DATA, false)]
    };
  }
  if (select === 'all') {
    return {
      inputs: [declarationTypePin(record)],
      outputs: [socket('result', processType('entityRef', { typeId }), DATA, false, 'list')]
    };
  }
  if (select === 'extract') {
    // The declared entity→value gate (SPEC §8 p): the bound type's
    // declared projection owns the output type and the resolve. Entity
    // or ref input (same-type entity and entityRef sockets are
    // compatible), lazy data source — no event contract. A list output
    // projects as its element type with List access (a runtime
    // collection), exactly like a service signature's list field.
    const projection = context.domain?.projectionContracts?.[`${typeId}/${record.projection}`];
    const output = projection?.output || {};
    const element = output.base === 'list' ? (output.itemType || {}) : output;
    const outputType = ctsFieldToProcessType(element) || processType('json', { nullable: true });
    return {
      inputs: [socket('entity', processType('entityRef', { typeId }), DATA, true, output.base === 'list' ? 'list' : 'item')],
      outputs: [socket('result', outputType, DATA, false, output.base === 'list' ? 'list' : 'item')]
    };
  }

  const outputType = derivedReadOutputType(record, context);
  return {
    inputs: [socket('entity', processType('entityRef', { typeId }), DATA, true)],
    outputs: [socket('result', outputType, DATA, false, 'list')]
  };
}

function derivedReadOutputType(record = {}, context = {}) {
  const typeId = typeIdOf(record);
  const select = record.select || 'current';
  if (select === 'parent') {
    const candidates = (context.domain?.containment || [])
      .filter(edge => edge.childType === typeId)
      .map(edge => edge.parentType);
    return acceptedEntityType(candidates);
  }
  if (select === 'children') {
    const candidates = (context.domain?.containment || [])
      .filter(edge => edge.parentType === typeId)
      .map(edge => edge.childType);
    return acceptedEntityType(candidates);
  }
  if (select === 'related') {
    const candidates = (context.domain?.relations || [])
      .filter(relation => relation.ownerType === typeId && (!record.relationKey || relation.key === record.relationKey))
      .map(relation => relation.targetType);
    return acceptedEntityType(candidates);
  }
  return processType('entityRef', { typeId });
}

function acceptedEntityType(candidates = []) {
  const unique = [...new Set(candidates.filter(Boolean))];
  if (unique.length === 1) return processType('entityRef', { typeId: unique[0], nullable: true });
  if (unique.length > 1) return processType('entityRef', { accepts: unique, nullable: true });
  return processType('entityRef', { nullable: true });
}

// The field projection is socket algebra (SPEC §20): entity in, field in
// (the path arrives by wire or from the record's authored `path` — the
// single persisted home), value out. Ports never vanish with binding
// state; the output is typed from the authored default when one exists,
// dynamic otherwise.
function nativeFieldPorts(record = {}, context = {}) {
  const typeId = typeIdOf(record);
  const entityIn = typeId
    ? processType('entityRef', { typeId })
    : processType('entity');
  const fieldPath = String(record.path || '');
  const field = fieldPath
    ? ((context.fieldSchemas || []).find(candidate => candidate.path === fieldPath) || null)
    : null;
  return {
    inputs: [
      socket('entity', entityIn, DATA, true),
      socket('field', processType('string'), DATA, false)
    ],
    outputs: [socket('value', field?.type || processType('json', { nullable: true }))]
  };
}

// Native species own their ports directly (SPEC §20): no species resolves
// by impersonating a retired kind. The legacy record.*/effect.* branches
// below serve persisted v4 drafts only.
function nativeCommandPorts(record = {}, context = {}) {
  const command = context.command || {};
  return {
    inputs: [...nativeControlInput(), ...commandInputSockets(command)],
    outputs: [completedSocket(), ...commandOutputSockets(command)]
  };
}

function nativeStructurePorts(record = {}, context = {}) {
  if (record.kind === 'cts.decompose') {
    // The instance elimination form (SPEC §20): every facet the bound
    // type's projected field schemas declare — identity, row fields,
    // lineage edges, relations, the state axis, provenance — is its own
    // typed output socket. The projection owns the list; no hardcoded
    // block vocabulary filters it.
    return {
      inputs: [socket('entity', processType('entityRef', { typeId: typeIdOf(record) }), DATA, true)],
      outputs: (context.fieldSchemas || [])
        .filter(field => field?.path)
        .map(field => socket(field.path, field.type || processType('json', { nullable: true })))
    };
  }
  // cts.compose: the block substrate, composed of its open entries.
  const composition = blockComposition(record, context);
  const entries = openBlockEntries(record, composition);
  if (composition) {
    const block = processType('block', { block: record.block || record.slot });
    return {
      inputs: entries.map(entry => ({
        ...socket(`entry:${entry.id}`, openBlockEntryType(entry, composition), DATA, true),
        label: entryLabel(entry, composition)
      })),
      outputs: [socket('block', block)]
    };
  }
  return {
    inputs: [],
    outputs: [socket('block', processType('block', { block: record.block || record.slot }))]
  };
}

function cts(kind, label, family, level) {
  return {
    kind,
    label,
    family,
    level,
    pure: false,
    ports: (record = {}, context = {}) => {
      if (record.kind === 'cts.service') {
        // A service is an effect species: it carries the event contract
        // (control in / completed) around its signature-derived data
        // sockets, exactly like cts.command.
        const signature = serviceSignaturePorts(context.domain?.serviceContracts?.[record.operator]?.signature)
          || { inputs: [], outputs: [] };
        return {
          inputs: [...nativeControlInput(), ...signature.inputs],
          outputs: [completedSocket(), ...signature.outputs]
        };
      }
      if (record.kind === 'cts.construct') return nativeConstructionPorts(record, context);
      if (record.kind === 'cts.mutate') return nativeMutatePorts(record, context);
      if (record.kind === 'cts.transition') return nativeTransitionPorts(record);
      if (record.kind === 'cts.remove') return nativeRemovePorts(record);
      if (record.kind === 'cts.command') return nativeCommandPorts(record, context);
      if (record.kind === 'cts.read') return nativeReadPorts(record, context);
      if (record.kind === 'cts.field') return nativeFieldPorts(record, context);
      if (record.kind === 'cts.emit') {
        return {
          inputs: [
            ...nativeControlInput(),
            socket('type', processType('string'), DATA, true),
            socket('payload', processType('json', { nullable: true }), DATA, false)
          ],
          outputs: [completedSocket()]
        };
      }
      if (record.kind === 'cts.compose' || record.kind === 'cts.decompose') {
        return nativeStructurePorts(record, context);
      }
      return { inputs: [], outputs: [] };
    }
  };
}

// The s-species port projection: signature descriptors (V grammar)
// translate through the field-type seam into process sockets. A `ref`
// input maps to a typed entityRef socket (Ref is a value, SPEC §2); a
// `list` field is a runtime collection, not a persisted array — the
// socket carries the element type with List access, so aligned item
// sources (and single broadcast items) wire in without the packArray
// boundary. A missing or non-record input falls back to the caller's
// twin resolution.
function serviceSignaturePorts(signature = {}) {
  const input = signature.input?.base === 'record' ? signature.input : null;
  const outputType = signature.output ? signature.output : null;
  if (!input && !outputType) return null;
  const socketType = descriptor => {
    const type = ctsFieldToProcessType(descriptor) || processType('json');
    return descriptor.base === 'list'
      ? (ctsFieldToProcessType(descriptor.itemType || {}) || processType('json'))
      : type;
  };
  const isList = descriptor => descriptor.base === 'list';
  return {
    inputs: Object.entries(input?.fields || {}).map(([id, descriptor]) => ({
      ...socket(id, socketType(descriptor), DATA, descriptor.nullable !== true && descriptor.default === undefined, isList(descriptor) ? 'list' : 'item'),
      ...(descriptor.default !== undefined ? { default: descriptor.default } : {}),
      label: id
    })),
    outputs: [{
      ...socket('result', socketType(outputType || {}), DATA, false, isList(outputType || {}) ? 'list' : 'item')
    }]
  };
}

function socket(id, type, role = DATA, required = false, access = 'item') {
  return { id, label: id, type, role, required: Boolean(required), access };
}

function catalogPorts(record = {}, context = {}) {
  const kind = record.kind;
  const configuredBase = record.base || 'json';
  const configured = processTypeFrom(record.type, processType(configuredBase, {
    nullable: record.nullable,
    ...(['entity', 'entityRef', 'revisionRef', 'predicate', 'patch', 'status'].includes(configuredBase)
      && record.typeId ? { typeId: record.typeId } : {}),
    ...(configuredBase === 'block' && record.block ? { block: record.block } : {}),
    unit: record.unit,
    enumId: record.enumId
  }));
  const entity = processType('entityRef', { typeId: record.typeId });
  const entityList = processType('entityRef', { typeId: record.typeId });
  const entityRef = processType('entityRef', { typeId: record.typeId });
  const predicate = processType('predicate', { typeId: record.typeId });
  const patch = processType('patch', { typeId: record.typeId });
  const event = processType('event');
  const controlInput = [{ ...socket('in', event, CONTROL, true), multiple: true }];
  const completed = socket('completed', event, CONTROL);

  if (kind.startsWith('source.')) {
    const output = kind === 'source.currentTime' ? processType('dateTime')
      : kind === 'source.secretRef' ? processType('opaque', { opaqueType: 'secretRef' })
        : kind === 'source.currentUser' ? processType('entityRef', { typeId: 'user' })
          : kind === 'source.currentOrganization' ? processType('entityRef', { typeId: 'organization' })
            : configured;
    const access = kind === 'source.literalTree' ? 'tree' : kind === 'source.literalList' ? 'list' : 'item';
    return { inputs: [], outputs: [socket('value', output, DATA, false, access)] };
  }
  if (kind === 'value.recordField') {
    // The record elimination form: one authored key read off each record
    // value (a service row, a composed parameter record). The input is
    // the element-typed List socket — mapped per item, preserving the
    // source topology; the key arrives by wire or from the record's
    // authored `path`, the same gesture cts.field's field socket allows.
    return {
      inputs: [
        socket('value', processType('record', { nullable: true }), DATA, true, 'list'),
        socket('key', processType('string'), DATA, false)
      ],
      outputs: [socket('value', processTypeFrom(record.type, processType('json', { nullable: true })), DATA, false, 'list')]
    };
  }
  if (kind === 'value.select') {
    // The typed ternary: a boolean picks one of two same-typed operands;
    // a scalar condition broadcasts across item operands.
    const selected = processTypeFrom(record.type, processType('json', { nullable: true }));
    return {
      inputs: [
        socket('condition', processType('boolean'), DATA, true),
        socket('left', selected, DATA, true),
        socket('right', selected, DATA, true)
      ],
      outputs: [socket('value', selected)]
    };
  }
  if (kind === 'record.merge') {
    return {
      inputs: [
        socket('left', processType('record', { nullable: true }), DATA, true),
        socket('right', processType('record', { nullable: true }), DATA, true)
      ],
      outputs: [socket('record', processType('record'))]
    };
  }
  // The cast input is the universal json acceptor (the wire's toJson
  // coercion admits every source); the authored fact is the target base.
  if (kind === 'value.cast') {
    return unary(
      processType('json'),
      processTypeFrom(record.outputType, processType('record'))
    );
  }
  if (kind === 'value.convertUnit' || kind === 'value.required' || kind === 'value.validate') {
    return unary(
      processTypeFrom(record.sourceType, configured),
      processTypeFrom(record.outputType, configured)
    );
  }
  if (kind === 'value.format') {
    // Template mode carries a record beside the value input: named
    // `{key}` slots substitute from it (missing keys keep their
    // placeholder), `{value}` from the value input as before.
    return {
      inputs: [
        socket('value', processTypeFrom(record.sourceType, configured), DATA, false),
        socket('record', processType('record', { nullable: true }), DATA, false, 'list')
      ],
      outputs: [socket('value', processTypeFrom(record.outputType, configured))]
    };
  }
  if (kind === 'value.coalesce') return {
    inputs: [socket('value', { ...configured, nullable: true }, DATA, true), socket('fallback', configured, DATA, true)],
    outputs: [socket('value', { ...configured, nullable: false })]
  };
  // Polymorphic kinds derive their ports from the operation registry
  // (SPEC §8 atomicity law): the table owns each operation's sockets.
  if (PROCESS_OPERATION_REGISTRY[kind]) {
    const operation = processOperation(kind, record.operation)
      || Object.values(PROCESS_OPERATION_REGISTRY[kind])[0];
    const typeFor = base => (base === 'configured' ? processTypeFrom(record.type, configured) : processType(base));
    return {
      inputs: operation.inputs.map(input => socket(
        input.id,
        typeFor(input.base),
        DATA,
        input.optional !== true,
        input.access || 'item'
      )),
      outputs: [socket(operation.output.id, typeFor(operation.output.base), DATA, false, operation.output.access || 'item')]
    };
  }
  if (kind === 'collection.makeList') return {
    inputs: MAKE_LIST_INPUTS.map(id => socket(id, configured, DATA, false)),
    outputs: [socket('value', configured, DATA, false, 'list')]
  };
  if (kind === 'collection.packArray') {
    const itemType = configured;
    return { inputs: [socket('value', itemType, DATA, true, 'list')], outputs: [socket('value', processType('array', { itemType }))] };
  }
  if (kind === 'collection.unpackArray') {
    const itemType = configured.base === 'array'
      ? configured.itemType
      : processType('json');
    return { inputs: [socket('value', configured.base === 'array' ? configured : processType('array', { itemType }), DATA, true)], outputs: [socket('value', itemType, DATA, false, 'list')] };
  }
  if (kind === 'collection.concat') return { inputs: [socket('left', configured, DATA, true, 'list'), socket('right', configured, DATA, true, 'list')], outputs: [socket('value', configured, DATA, false, 'list')] };
  if (kind === 'collection.itemAt') return {
    inputs: [socket('items', configured, DATA, true, 'list'), socket('index', processType('integer'), DATA, false)],
    outputs: [socket('item', { ...configured, nullable: true })]
  };
  if (kind === 'collection.slice') return {
    inputs: [socket('items', configured, DATA, true, 'list'), socket('start', processType('integer')), socket('end', processType('integer'))],
    outputs: [socket('items', configured, DATA, false, 'list')]
  };
  if (kind === 'collection.count') return { inputs: [socket('value', configured, DATA, true, 'list')], outputs: [socket('value', processType('integer'))] };
  if (kind === 'collection.sort') return {
    inputs: [socket('items', configured, DATA, true, 'list'), socket('keys', processType('json'), DATA, true, 'list')],
    outputs: [socket('items', configured, DATA, false, 'list')]
  };
  if (kind === 'collection.distinct') return {
    inputs: [socket('items', configured, DATA, true, 'list'), socket('keys', processType('json'), DATA, false, 'list')],
    outputs: [socket('items', configured, DATA, false, 'list')]
  };
  if (kind === 'collection.reverse') return { inputs: [socket('value', configured, DATA, true, 'list')], outputs: [socket('value', configured, DATA, false, 'list')] };
  if (kind === 'collection.shift' || kind === 'collection.partition') return {
    inputs: [socket('items', configured, DATA, true, 'list'), socket(kind === 'collection.shift' ? 'offset' : 'size', processType('integer'), DATA, true)],
    outputs: [socket('items', configured, DATA, false, kind === 'collection.partition' ? 'tree' : 'list')]
  };
  if (kind === 'collection.dispatch') return {
    inputs: [socket('items', configured, DATA, true, 'list'), socket('mask', processType('boolean'), DATA, true, 'list')],
    outputs: [socket('true', configured, DATA, false, 'list'), socket('false', configured, DATA, false, 'list')]
  };
  if (kind === 'collection.groupBy') return {
    inputs: [socket('items', configured, DATA, true, 'list'), socket('keys', processType('json'), DATA, true, 'list')],
    outputs: [
      socket('groups', configured, DATA, false, 'tree'),
      // The grouping key per branch: the value that formed each group,
      // tree-aligned with `groups`.
      socket('keys', processType('json', { nullable: true }), DATA, false, 'tree')
    ]
  };
  if (kind === 'collection.filter') return {
    inputs: [socket('items', configured, DATA, true, 'list'), socket('mask', processType('boolean'), DATA, true, 'list')],
    outputs: [socket('items', configured, DATA, false, 'list')]
  };
  // The relational brick (SPEC §18 bounded iteration): two value lists
  // joined by authored key paths — strict inner join, left order
  // preserved, every left key must match exactly one right entry or the
  // node fails listing the unmatched keys. The list ports are json-typed:
  // the paired streams are heterogeneous (rows against entities, records
  // against records), and the authored key paths carry the pairing —
  // narrowing the sockets to one element type would refuse the right
  // side the moment the left side's type propagates.
  if (kind === 'collection.join') return {
    inputs: [
      socket('left', processType('json'), DATA, true, 'list'),
      socket('right', processType('json'), DATA, true, 'list')
    ],
    outputs: [socket('pairs', processType('record'), DATA, false, 'list')]
  };
  if (kind === 'tree.flatten' || kind === 'tree.graft' || kind === 'tree.simplify' || kind === 'tree.transpose' || kind === 'tree.clean') return { inputs: [socket('value', configured, DATA, true, 'tree')], outputs: [socket('value', configured, DATA, false, 'tree')] };
  if (kind === 'tree.stats') return { inputs: [socket('value', configured, DATA, true, 'tree')], outputs: [socket('stats', processType('record'))] };
  if (kind === 'tree.branch') return {
    inputs: [socket('tree', configured, DATA, true, 'tree'), socket('path', processType('integer'), DATA, true, 'list')],
    outputs: [socket('items', configured, DATA, false, 'list')]
  };
  if (['tree.zip', 'tree.cross'].includes(kind)) return binary(configured, configured, configured);
  if (kind === 'tree.unzip') return unary(configured, processType('json'));
  if (kind === 'record.construct') {
    const fields = dynamicFields(record, context);
    return {
      inputs: fields.map(field => socket(field.path, field.type, DATA, Boolean(field.required))),
      outputs: [socket('record', processType('record', { schema: record.schema }))]
    };
  }
  if (kind.endsWith('Trigger')) {
    const payload = record.typeId ? entity : processType('json');
    return { inputs: [], outputs: [socket('start', event, CONTROL), socket('payload', payload)] };
  }
  if (kind === 'control.if') return {
    inputs: [...controlInput, socket('condition', processType('boolean'), DATA, true)],
    outputs: [socket('true', event, CONTROL), socket('false', event, CONTROL)]
  };
  if (kind === 'control.switch') {
    const cases = Array.isArray(record.cases) ? record.cases : [];
    return {
      inputs: [...controlInput, socket('value', configured, DATA, true)],
      outputs: [...cases.map(item => socket(String(item.id || item.value), event, CONTROL)), socket('default', event, CONTROL)]
    };
  }
  if (kind === 'control.fork') {
    const branches = Math.max(2, Number(record.branches) || 2);
    return { inputs: controlInput, outputs: Array.from({ length: branches }, (_, index) => socket(`branch${index + 1}`, event, CONTROL)) };
  }
  if (kind === 'control.joinAll' || kind === 'control.joinAny') {
    return {
      inputs: [{ ...socket('branches', event, CONTROL, true), multiple: true }],
      outputs: [socket('out', event, CONTROL)]
    };
  }
  if (kind === 'control.forEach') return {
    inputs: [...controlInput, socket('items', configured, DATA, true, 'tree')],
    outputs: [socket('each', event, CONTROL), socket('item', configured), socket('path', processType('array', { itemType: processType('integer') })), socket('index', processType('integer')), socket('done', event, CONTROL)]
  };
  if (kind === 'control.forEachEnd') return { inputs: controlInput, outputs: [] };
  if (kind === 'control.waitUntil') {
    return {
      inputs: [...controlInput, socket('until', processType('dateTime'), DATA, true)],
      outputs: [socket('completed', event, CONTROL)]
    };
  }
  if (kind === 'control.stopSuccess' || kind === 'control.stopFailure') return { inputs: controlInput, outputs: [] };
  throw new Error(`Node ${kind} has no port contract`);
}

function blockComposition(record = {}, context = {}) {
  return context.blockComposition || (record.compositionMode
    ? { mode: record.compositionMode, valueBase: record.compositionValueBase || 'json' }
    : null);
}

function openBlockEntries(record = {}, composition = null) {
  if (!composition) return [];
  return Array.isArray(record.entries) ? record.entries.filter(entry => entry?.id) : [];
}

function openBlockEntryType(entry = {}, composition = {}) {
  if (composition?.mode === 'ancestors' || composition?.mode === 'relations') {
    if (entry.type?.base) return processType(entry.type.base, entry.type);
    return processType('entityRef', { typeId: entry.typeId || undefined });
  }
  if (composition?.mode === 'attachments') {
    return processType('attachmentRef', { attachmentKind: entry.attachmentKind || undefined });
  }
  const base = entry.type?.base || composition?.valueBase || 'json';
  return processType(base, entry.type || {});
}

function entryLabel(entry = {}, composition = {}) {
  if (composition?.mode === 'ancestors') return entry.key || entry.typeId || 'ancestor';
  return entry.key || entry.id;
}

function unary(input, output) {
  return { inputs: [socket('value', input, DATA, true)], outputs: [socket('value', output)] };
}

function binary(left, right, output = left) {
  return {
    inputs: [socket('left', left, DATA, true), socket('right', right, DATA, true)],
    outputs: [socket('value', output)]
  };
}

function processTypeFrom(value, fallback) {
  if (!value || typeof value !== 'object' || !value.base) return fallback;
  const qualifiers = {};
  if (ENTITY_TYPE_BASES.has(value.base)) {
    if (value.typeId) qualifiers.typeId = value.typeId;
    if (value.accepts) qualifiers.accepts = value.accepts;
  } else if (value.base === 'block' && value.block) {
    qualifiers.block = value.block;
  }
  if (value.base === 'array') qualifiers.itemType = value.itemType;
  if (value.base === 'map') {
    qualifiers.keyType = value.keyType;
    qualifiers.valueType = value.valueType;
  }
  if (value.base === 'json' && value.kind) qualifiers.kind = value.kind;
  for (const key of ['unit', 'enumId', 'schema', 'opaqueType', 'attachmentKind', 'eventType', 'taskType', 'capability']) {
    if (value[key]) qualifiers[key] = value[key];
  }
  return processType(value.base, {
    nullable: value.nullable,
    ...qualifiers
  });
}

const ENTITY_TYPE_BASES = new Set(['entity', 'entityRef', 'revisionRef', 'predicate', 'patch', 'status']);

function dynamicFields(record, context) {
  const selected = Array.isArray(record.fields) ? record.fields : [];
  const schemas = [
    ...(Array.isArray(record.fieldSchemas) ? record.fieldSchemas : []),
    ...(Array.isArray(context.fieldSchemas) ? context.fieldSchemas : [])
  ];
  return selected.map(path => schemas.find(field => field.path === path) || {
    path,
    type: processType('json', { nullable: true })
  });
}

export function getFieldPolicy(fieldAccess, typeId) {
  const key = String(typeId || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return fieldAccess[key] || fieldAccess[camel] || fieldAccess[snake] || null;
}

// Declared blocks of one entity contract: the entity's own blocks list plus
// the block prefixes its field-access policy grants. Used by compile-time
// validation and by the evaluator so both reject the same undeclared blocks.
export function entityBlocks(domain = {}, typeId = '') {
  const entity = (domain.entities || []).find(item => item.type === typeId);
  const policy = getFieldPolicy(domain.fieldAccess || {}, typeId) || {};
  const policyBlocks = ['read', 'write', 'admin']
    .flatMap(access => policy[access] || [])
    .map(path => String(path).split('.')[0])
    .filter(Boolean);
  return [...new Set([...(entity?.blocks || []), ...policyBlocks])];
}

function commandInputSockets(command = {}) {
  const abstractInputs = command.input?.abstractEntities || [];
  const acceptedTypes = new Set(abstractInputs.flatMap(input => input.accepts || []));
  return [
    ...abstractInputs.map(input => socket(
      input.name || input.type || input.capability,
      input.multiple
        ? processType('array', { itemType: processType('entityRef', { typeId: input.type || undefined, accepts: input.accepts || [] }) })
        : processType('entityRef', { typeId: input.type || undefined, accepts: input.accepts || [] }),
      DATA,
      Boolean(input.required)
    )),
    ...(command.input?.entities || [])
      .filter(input => !acceptedTypes.has(input.type))
      .map(input => socket(
        input.name || input.type,
        input.multiple
          ? processType('array', { itemType: processType('entityRef', { typeId: input.type }) })
          : processType('entityRef', { typeId: input.type }),
        DATA,
        Boolean(input.required)
      )),
    ...(command.input?.parameters || []).map(input => socket(
      input.name,
      commandParameterType(input),
      DATA,
      Boolean(input.required && input.default === undefined)
    ))
  ].map(port => ({
    ...port,
    label: commandInputLabel(command, port.id)
  }));
}

function commandOutputSockets(command = {}) {
  const outputs = [
    ...(command.output?.entities || []).map(entry => socket(
      entry?.type,
      processType('entityRef', { typeId: entry?.type }),
      DATA,
      false,
      'list'
    )),
    ...(command.output?.attachments || []).map(kind => socket(
      `attachment:${kind}`,
      processType('attachmentRef', { attachmentKind: kind }),
      DATA,
      false,
      'list'
    ))
  ];
  return outputs.length ? outputs : [socket('result', processType('json', { nullable: true }))];
}

function commandInputLabel(command = {}, id = '') {
  const inputs = [
    ...(command.input?.abstractEntities || []),
    ...(command.input?.entities || []),
    ...(command.input?.parameters || [])
  ];
  const input = inputs.find(item => (item.name || item.type || item.capability) === id);
  return input?.label || input?.name || input?.type || input?.capability || id;
}

function commandParameterType(input = {}) {
  if (input.typeId) return processType('entityRef', { typeId: input.typeId });
  const base = input.type === 'object' ? 'json'
    : input.type === 'array' ? 'array'
      : input.type || 'string';
  if (base === 'array') return processType('array', {
    itemType: processType(input.itemType || 'json')
  });
  return processType(base, {
    ...(input.options?.length ? { enumId: input.name } : {})
  });
}

function constructionInputs(record = {}) {
  return (record.construction?.inputs || []).map(input => {
    const multiple = input.type === 'typeList';
    const type = input.type === 'entity' || multiple
      ? multiple
        ? processType('array', { itemType: processType('entityRef', { typeId: input.typeId, accepts: input.accepts }) })
        : processType('entityRef', { typeId: input.typeId, accepts: input.accepts })
      : mapDomainInputType(input.type || 'json', { ...input, optional: undefined });
    // The projected construction input may carry a unit qualifier for
    // quantity fields; the socket must keep it (unit -> different-unit
    // conversion stays explicit, unit-less sources adopt it).
    const withUnit = type.base === 'number' && input.unit && !type.unit
      ? { ...type, unit: input.unit }
      : type;
    return { ...input, id: input.id || input.path, type: withUnit };
  }).filter(input => input.id);
}

