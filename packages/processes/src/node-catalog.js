import { mapDomainInputType, normalizeProcessSocket, processType } from './types.js';
import { authoredSocketDefault } from './data-tree.js';
import { typeIdOf, ctsFieldToProcessType } from '../../cts/src/index.js';

const DATA = 'data';
const CONTROL = 'control';

// Make List is the fixed-input-count collection constructor: exactly these
// optional item sockets, at most one wire each (sockets stay non-multiple, so
// connection validation rejects a second wire like any single-value socket).
export const MAKE_LIST_INPUTS = Object.freeze(['item1', 'item2', 'item3', 'item4']);

// Origin effects mint new entity paths and own producer outputs. Consumer
// effects transform entities that arrived over an input wire: they own no
// producer output and bind to the upstream producer of that wire, so the
// workflow/machine stays anchored where the entity path begins.
export const PRODUCER_ORIGIN_EFFECT_KINDS = Object.freeze([
  'effect.createEntity',
  'effect.runProducer',
  'effect.runCommand'
]);

export const CONSUMER_EFFECT_KINDS = Object.freeze([
  'effect.updateEntity',
  'effect.changeStatus',
  'effect.archiveEntity',
  'effect.deleteEntity',
  'effect.sendEntity',
  'effect.generateAttachment'
]);

const definitions = [
  source('source.literalItem', 'literalItem'),
  source('source.literalList', 'literalList'),
  source('source.literalTree', 'literalTree'),
  source('source.processInput', 'processInput'),
  source('source.triggerPayload', 'triggerPayload'),
  source('source.currentTime', 'currentTime'),
  source('source.secretRef', 'secretReference'),

  data('value.cast', 'cast'),
  data('value.parse', 'parse'),
  data('value.convertUnit', 'convertUnit'),
  data('value.toEntityRef', 'toEntityRef'),
  data('value.toJson', 'toJson'),
  data('value.required', 'required'),
  data('value.coalesce', 'coalesce'),
  data('value.validate', 'validate'),
  data('value.math', 'math'),
  data('value.string', 'string'),
  data('value.dateTime', 'dateTime'),
  data('value.enum', 'enum'),
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

  data('record.getField', 'getField'),
  data('record.fieldChange', 'fieldChange'),
  data('record.mergeChanges', 'mergeChanges'),
  data('record.applyChanges', 'applyChanges'),
  data('record.composeBlock', 'composeBlock'),
  data('record.modifyBlock', 'modifyBlock'),
  data('record.construct', 'constructRecord'),
  data('record.deconstruct', 'deconstructRecord'),
  data('record.getBlock', 'getBlock'),
  data('record.entityDraft', 'constructEntityDraft'),
  data('producer.join', 'joinProducers'),
  data('predicate.field', 'fieldPredicate'),
  data('predicate.logic', 'predicateLogic'),

  // Reads are native-species only (SPEC §20): persisted `read.*` kinds
  // migrate one-way to `cts.read` + select at the load boundary, so the
  // catalog carries no v4 read twins to fall back into.

  effect('effect.createEntity', 'createEntity'),
  effect('effect.runProducer', 'runProducer'),
  effect('effect.updateEntity', 'updateEntity'),
  effect('effect.changeStatus', 'changeStatus'),
  effect('effect.archiveEntity', 'archiveEntity'),
  effect('effect.deleteEntity', 'deleteEntity'),
  effect('effect.runCommand', 'runCommand'),
  effect('effect.sendEntity', 'sendEntity'),
  effect('effect.generateAttachment', 'generateAttachment'),

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
  cts('cts.compose', 'compose', 'records', 'data'),
  cts('cts.decompose', 'decompose', 'records', 'data'),
  cts('cts.join', 'join', 'records', 'data'),

  trigger('control.manualTrigger', 'manualTrigger'),
  trigger('control.webhookTrigger', 'webhookTrigger'),
  control('control.if', 'ifElse'),
  control('control.switch', 'switch'),
  control('control.fork', 'fork'),
  control('control.joinAll', 'joinAll'),
  control('control.joinAny', 'joinAny'),
  control('control.forEach', 'forEach'),
  control('control.forEachEnd', 'forEachEnd'),
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
  'predicates',
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
    : kind.startsWith('record.') || kind.startsWith('producer.')
      ? 'records'
      : kind.startsWith('predicate.') ? 'predicates'
        : kind.startsWith('read.') ? 'reads' : 'values';
  return definition(kind, label, family, kind.startsWith('read.') ? 'read' : 'data', true, catalogPorts);
}

function effect(kind, label) {
  return definition(kind, label, 'effects', 'effect', false, catalogPorts);
}

function trigger(kind, label) {
  return definition(kind, label, 'control', 'control', false, catalogPorts);
}

function control(kind, label) {
  return definition(kind, label, 'control', 'control', false, catalogPorts);
}

function definition(kind, label, family, level, pure, ports = { inputs: [], outputs: [] }) {
  return { kind, label, family, level, pure, ports };
}

// Type-bound species (SPEC §20) split by binding semantics.
// Origin species mint values out of a type declaration and carry the
// persistent Type binding pin: constructs, and the reads that start from
// nothing but a declared type (current, all). The
// entity-derived reads (parent, children, related), the effect consumers
// (mutate, transition, remove), and the field projection are consumers:
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

export const TYPE_BOUND_SPECIES = Object.freeze(['cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove', 'cts.read', 'cts.field']);


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

function nativeConstructionPorts(record = {}, context = {}) {
  const typeId = typeIdOf(record);
  if (!typeId) return { inputs: [declarationTypePin(record)], outputs: [] };
  const contract = context.domain?.construction?.[typeId] || {};
  const modes = contract.modes?.length ? contract.modes : ['genericCreate'];
  const mode = record.construction?.mode && modes.includes(record.construction.mode)
    ? record.construction.mode
    : (modes.includes(contract.defaultMode) ? contract.defaultMode : modes[0]);
  const declaredInputs = contract.modeInputs?.[mode] || contract.inputs || [];
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
      socket('result', processType('entity', { typeId }), DATA, false)
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
  const leaves = (context.fieldSchemas || [])
    .filter(field => field.writable !== false)
    .filter(field => (
      (['identity', 'data', 'specs'].includes(field.block)
        && !(field.block === 'data' && field.path === 'data.value'))
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
      socket('result', processType('entity', { typeId }), DATA, false)
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
      socket('state', processType('status', { typeId }), DATA, true, 'list')
    ],
    outputs: [
      completedSocket(),
      socket('result', processType('entity', { typeId }), DATA, false)
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
      socket('result', processType('entity', { typeId }), DATA, false)
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
      outputs: [socket('result', processType('entity', { typeId }), DATA, false)]
    };
  }
  if (select === 'all') {
    return {
      inputs: [declarationTypePin(record)],
      outputs: [socket('result', processType('entity', { typeId }), DATA, false, 'list')]
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
  return processType('entity', { typeId });
}

function acceptedEntityType(candidates = []) {
  const unique = [...new Set(candidates.filter(Boolean))];
  if (unique.length === 1) return processType('entity', { typeId: unique[0], nullable: true });
  if (unique.length > 1) return processType('entity', { accepts: unique, nullable: true });
  return processType('entity', { nullable: true });
}

// The field projection is socket algebra (SPEC §20): entity in, field in
// (the path arrives by wire or authored default — one channel, no static
// record config), value out. Ports never vanish with binding state; the
// output is typed from the authored default when one exists, dynamic
// otherwise.
function nativeFieldPorts(record = {}, context = {}) {
  const typeId = typeIdOf(record);
  const entityIn = typeId
    ? processType('entity', { typeId })
    : processType('entity');
  const fieldPath = String(authoredSocketDefault(record.inputDefaults?.field) || '');
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
    const blocks = dynamicBlocks(record, context);
    return {
      inputs: [socket('entity', processType('entity', { typeId: typeIdOf(record) }), DATA, true)],
      outputs: blocks.map(block => socket(block, processType('block', { block })))
    };
  }
  // cts.compose: the block substrate, composed of its open entries.
  const composition = blockComposition({ ...record, kind: 'record.composeBlock' }, context);
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
        return serviceSignaturePorts(context.domain?.serviceContracts?.[record.operator]?.signature)
          || { inputs: [], outputs: [] };
      }
      if (record.kind === 'cts.construct') return nativeConstructionPorts(record, context);
      if (record.kind === 'cts.mutate') return nativeMutatePorts(record, context);
      if (record.kind === 'cts.transition') return nativeTransitionPorts(record);
      if (record.kind === 'cts.remove') return nativeRemovePorts(record);
      if (record.kind === 'cts.command') return nativeCommandPorts(record, context);
      if (record.kind === 'cts.read') return nativeReadPorts(record, context);
      if (record.kind === 'cts.field') return nativeFieldPorts(record, context);
      if (record.kind === 'cts.compose' || record.kind === 'cts.decompose') {
        return nativeStructurePorts(record, context);
      }
      if (record.kind === 'cts.join') {
        const entity = processType('entity', { typeId: typeIdOf(record) || undefined });
        return {
          inputs: [
            socket('primary', entity, DATA, true, 'list'),
            socket('secondary', entity, DATA, true, 'list')
          ],
          outputs: [socket('result', entity, DATA, false, 'list')]
        };
      }
      return { inputs: [], outputs: [] };
    }
  };
}

// The s-species port projection: signature descriptors (V grammar)
// translate through the field-type seam into process sockets. A missing
// or non-record input falls back to the caller's twin resolution.
function serviceSignaturePorts(signature = {}) {
  const input = signature.input?.base === 'record' ? signature.input : null;
  const outputType = signature.output ? ctsFieldToProcessType(signature.output) : null;
  if (!input && !outputType) return null;
  return {
    inputs: Object.entries(input?.fields || {}).map(([id, descriptor]) => ({
      ...socket(id, ctsFieldToProcessType(descriptor) || processType('json'), DATA, descriptor.nullable !== true),
      label: id
    })),
    outputs: [socket('result', outputType || processType('json', { nullable: true }))]
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
  const sameShape = base => processType(base);
  const entity = processType('entity', { typeId: record.typeId });
  const entityList = processType('entity', { typeId: record.typeId });
  const entityRef = processType('entityRef', { typeId: record.typeId });
  const predicate = processType('predicate', { typeId: record.typeId });
  const patch = processType('patch', { typeId: record.typeId });
  const event = processType('event');
  const controlInput = [{ ...socket('in', event, CONTROL, true), multiple: true }];
  const completed = socket('completed', event, CONTROL);

  if (kind.startsWith('source.')) {
    const output = kind === 'source.currentTime' ? processType('dateTime')
      : kind === 'source.secretRef' ? processType('opaque', { opaqueType: 'secretRef' })
        : configured;
    const access = kind === 'source.literalTree' ? 'tree' : kind === 'source.literalList' ? 'list' : 'item';
    return { inputs: [], outputs: [socket('value', output, DATA, false, access)] };
  }
  if (kind === 'value.cast' || kind === 'value.parse' || kind === 'value.convertUnit'
    || kind === 'value.toJson' || kind === 'value.required' || kind === 'value.validate'
    || kind === 'value.enum' || kind === 'value.format') {
    return unary(
      processTypeFrom(record.sourceType, configured),
      processTypeFrom(record.outputType, configured)
    );
  }
  if (kind === 'value.toEntityRef') {
    return unary(
      processTypeFrom(record.sourceType, entity),
      processTypeFrom(record.outputType, entityRef)
    );
  }
  if (kind === 'value.coalesce') return {
    inputs: [socket('value', { ...configured, nullable: true }, DATA, true), socket('fallback', configured, DATA, true)],
    outputs: [socket('value', { ...configured, nullable: false })]
  };
  if (kind === 'value.math') {
    if (['absolute', 'negate', 'round', 'floor', 'ceil', 'sqrt'].includes(record.operation)) {
      return unary(sameShape('number'), sameShape('number'));
    }
    if (record.operation === 'clamp') return {
      inputs: [
        socket('value', sameShape('number'), DATA, true),
        socket('min', sameShape('number'), DATA, true),
        socket('max', sameShape('number'), DATA, true)
      ],
      outputs: [socket('value', sameShape('number'))]
    };
    return binary(sameShape('number'), sameShape('number'));
  }
  if (kind === 'value.string') {
    if (['lower', 'upper', 'trim'].includes(record.operation)) return unary(sameShape('string'), sameShape('string'));
    if (record.operation === 'substring') return {
      inputs: [
        socket('text', sameShape('string'), DATA, true),
        socket('start', sameShape('integer'), DATA, true),
        socket('end', sameShape('integer'))
      ],
      outputs: [socket('value', sameShape('string'))]
    };
    if (record.operation === 'split') return {
      inputs: [socket('text', sameShape('string'), DATA, true), socket('separator', sameShape('string'), DATA, true)],
      outputs: [socket('value', processType('string'), DATA, false, 'list')]
    };
    if (record.operation === 'join') return {
      inputs: [socket('items', processType('string'), DATA, true, 'list'), socket('separator', sameShape('string'), DATA, true)],
      outputs: [socket('value', sameShape('string'))]
    };
    if (record.operation === 'length') return {
      inputs: [socket('value', sameShape('string'), DATA, true)],
      outputs: [socket('value', sameShape('integer'))]
    };
    if (record.operation === 'replace') return {
      inputs: [
        socket('text', sameShape('string'), DATA, true),
        socket('search', sameShape('string'), DATA, true),
        socket('replacement', sameShape('string'), DATA, true)
      ],
      outputs: [socket('value', sameShape('string'))]
    };
    return binary(sameShape('string'), sameShape('string'));
  }
  if (kind === 'value.dateTime') {
    if (['startOfDay', 'endOfDay'].includes(record.operation)) {
      return unary(sameShape('dateTime'), sameShape('dateTime'));
    }
    if (['differenceDays', 'differenceHours', 'differenceMinutes'].includes(record.operation)) {
      return {
        inputs: [socket('left', sameShape('dateTime'), DATA, true), socket('right', sameShape('dateTime'), DATA, true)],
        outputs: [socket('value', sameShape('number'))]
      };
    }
    if (['addDuration', 'subtractDuration'].includes(record.operation)) {
      return {
        inputs: [socket('date', sameShape('dateTime'), DATA, true), socket('duration', sameShape('duration'), DATA, true)],
        outputs: [socket('value', sameShape('dateTime'))]
      };
    }
    return {
      inputs: [socket('date', sameShape('dateTime'), DATA, true), socket('amount', sameShape('number'), DATA, true)],
      outputs: [socket('value', sameShape('dateTime'))]
    };
  }
  if (kind === 'value.compare') return {
    inputs: [socket('left', configured, DATA, true), socket('right', configured, DATA, true)],
    outputs: [socket('result', sameShape('boolean'))]
  };
  if (kind === 'value.logic') {
    const comparison = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith', 'isNull', 'isNotNull'].includes(record.operation);
    const unaryOperation = ['not', 'isNull', 'isNotNull'].includes(record.operation);
    const inputType = comparison ? configured : sameShape('boolean');
    return {
      inputs: [
        socket('left', inputType, DATA, true),
        ...(!unaryOperation ? [socket('right', inputType, DATA, true)] : [])
      ],
      outputs: [socket('result', sameShape('boolean'))]
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
  // The explicit producer-path Join. Both inputs are entity streams of the
  // same declared type; the output routes under the producer output selected
  // by `selectedProducerOutputId`, so the join creates no producer output of
  // its own and never silently merges workflow identity.
  if (kind === 'producer.join') return {
    inputs: [
      socket('primary', entity, DATA, true, 'list'),
      socket('secondary', entity, DATA, true, 'list')
    ],
    outputs: [socket('result', entity, DATA, false, 'list')]
  };
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
    outputs: [socket('groups', configured, DATA, false, 'tree')]
  };
  if (kind === 'collection.filter') return {
    inputs: [socket('items', configured, DATA, true, 'list'), socket('mask', processType('boolean'), DATA, true, 'list')],
    outputs: [socket('items', configured, DATA, false, 'list')]
  };
  if (kind === 'tree.flatten' || kind === 'tree.graft' || kind === 'tree.simplify' || kind === 'tree.transpose' || kind === 'tree.clean') return { inputs: [socket('value', configured, DATA, true, 'tree')], outputs: [socket('value', configured, DATA, false, 'tree')] };
  if (kind === 'tree.stats') return { inputs: [socket('value', configured, DATA, true, 'tree')], outputs: [socket('stats', processType('record'))] };
  if (kind === 'tree.branch') return {
    inputs: [socket('tree', configured, DATA, true, 'tree'), socket('path', processType('integer'), DATA, true, 'list')],
    outputs: [socket('items', configured, DATA, false, 'list')]
  };
  if (['tree.zip', 'tree.cross'].includes(kind)) return binary(configured, configured, configured);
  if (kind === 'tree.unzip') return unary(configured, processType('json'));
  if (kind === 'record.getField') {
    const field = context.fieldSchema || record.fieldSchema;
    const composition = blockComposition(record, context);
    return {
      inputs: [socket('block', processType('block', {
        block: record.block
      }), DATA, true)],
      outputs: [socket('value', {
        ...processTypeFrom(composition ? record.type : field?.type, configured)
      })]
    };
  }
  if (kind === 'record.fieldChange') return {
    inputs: [socket('value', processTypeFrom(context.fieldSchema?.type || record.fieldSchema?.type, configured), DATA, true)],
    outputs: [socket('change', patch)]
  };
  if (kind === 'record.mergeChanges') return binary(patch, patch);
  if (kind === 'record.applyChanges') return {
    inputs: [socket('record', entity, DATA, true), socket('changes', patch, DATA, true)],
    outputs: [socket('record', entity)]
  };
  if (kind === 'record.composeBlock' || kind === 'record.modifyBlock') {
    const composition = blockComposition(record, context);
    const entries = openBlockEntries(record, composition);
    if (composition) {
      const block = processType('block', { block: record.block });
      return {
        inputs: [
          ...(kind === 'record.modifyBlock' ? [socket('block', block, DATA, true)] : []),
          ...entries.map(entry => ({
            ...socket(`entry:${entry.id}`, openBlockEntryType(entry, composition), DATA, true),
            label: entryLabel(entry, composition)
          }))
        ],
        outputs: [socket('block', block)]
      };
    }
    const fields = dynamicFields(record, context)
      .filter(field => field.block === record.block || field.path?.startsWith(`${record.block}.`));
    const block = processType('block', {
      block: record.block
    });
    return {
      inputs: [
        ...(kind === 'record.modifyBlock' ? [socket('block', block, DATA, true)] : []),
        ...fields.map(field => socket(field.path, field.type, DATA, Boolean(field.required)))
      ],
      outputs: [socket('block', block)]
    };
  }
  if (kind === 'record.construct' || kind === 'record.entityDraft') {
    const fields = dynamicFields(record, context);
    return {
      inputs: fields.map(field => socket(field.path, field.type, DATA, Boolean(field.required))),
      outputs: [socket('record', kind === 'record.entityDraft' ? entity : processType('record', { schema: record.schema }))]
    };
  }
  if (kind === 'record.deconstruct') {
    const blocks = dynamicBlocks(record, context);
    return {
      inputs: [socket('entity', entity, DATA, true)],
      outputs: blocks.map(block => socket(block, processType('block', {
        block
      })))
    };
  }
  if (kind === 'record.getBlock') return {
    inputs: [socket('entity', entity, DATA, true)],
    outputs: [socket('block', processType('block', {
      block: record.block
    }))]
  };
  if (kind === 'predicate.field') return {
    inputs: [socket('value', processTypeFrom(context.fieldSchema?.type || record.fieldSchema?.type, configured), DATA, true)],
    outputs: [socket('predicate', predicate)]
  };
  if (kind === 'predicate.logic') return {
    inputs: [socket('left', predicate, DATA, true), socket('right', predicate)],
    outputs: [socket('predicate', predicate)]
  };
  if (kind === 'read.currentEntity' || kind === 'read.resolveEntityRef' || ['read.parent', 'read.children', 'read.related'].includes(kind) || kind === 'read.allEntities') {
    throw new Error(`Read kind ${kind} is retired; loads migrate it to cts.read`);
  }
  if (kind.startsWith('effect.')) {
    if (kind === 'effect.runCommand') {
      const command = context.command || {};
      return {
        inputs: [...controlInput, ...commandInputSockets(command)],
        outputs: [completed, ...commandOutputSockets(command)]
      };
    }
    const specific = effectInputs(kind, {
      entity,
      entityRef,
      patch,
      configured,
      blocks: dynamicBlocks(record, context),
      constructionInputs: constructionInputs(record),
      constructionMode: record.construction?.mode || ''
    });
    return {
      inputs: [...controlInput, ...specific],
      outputs: [completed, socket('result', effectResultType(kind, record))]
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
    return { inputs: [socket('branches', event, CONTROL, true)], outputs: [socket('out', event, CONTROL)] };
  }
  if (kind === 'control.forEach') return {
    inputs: [...controlInput, socket('items', configured, DATA, true, 'tree')],
    outputs: [socket('each', event, CONTROL), socket('item', configured), socket('path', processType('array', { itemType: processType('integer') })), socket('index', processType('integer')), socket('done', event, CONTROL)]
  };
  if (kind === 'control.forEachEnd') return { inputs: controlInput, outputs: [] };
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

function dynamicBlocks(record, context) {
  const selected = Array.isArray(record.blocks) ? record.blocks : [];
  if (selected.length) return selected;
  return [...new Set([
    ...(Array.isArray(record.fieldSchemas) ? record.fieldSchemas : []),
    ...(Array.isArray(context.fieldSchemas) ? context.fieldSchemas : [])
  ]
    .filter(field => record.kind === 'effect.createEntity'
      ? field.constructible !== false
      : field.writable !== false)
    .map(field => field.block || String(field.path || '').split('.')[0])
    .filter(block => block && !['origin', 'status', 'provenance', 'summary'].includes(block)))];
}

// The construction row that composes identity on a composer-less construct.
function hasNameRow(constructionInputs = []) {
  return constructionInputs.some(input => (input.id || input.path) === 'name');
}

function effectInputs(kind, types) {
  if (kind === 'effect.runProducer') return types.constructionInputs.map(input => ({
    ...socket(input.id, input.type, DATA, input.required && input.default === undefined),
    label: input.label || input.id
  }));
  // Mapped mutation sockets declare List consumption:
  // the shared effect mapper aligns item, list, and tree sources per item, and
  // a single item source remains valid as one broadcast item.
  if (kind === 'effect.createEntity' && types.constructionMode !== 'genericCreate') {
    return [
      ...types.constructionInputs.map(input => ({
        ...socket(input.id, input.type, DATA, input.required && input.default === undefined, 'list'),
        label: input.label || input.id
      })),
      ...types.blocks.map(block => socket(block, processType('block', { block }), DATA, false, 'list')),
      socket('states.main', processType('status', { typeId: types.entity.typeId }), DATA, false, 'list')
    ];
  }
  if (kind === 'effect.createEntity') return [
    // The composer-less construct (SPEC §20): declared row fields surface
    // as typed construction sockets — every construct input is wireable or
    // promptable directly, and a compose node is optional.
    ...types.constructionInputs.map(input => ({
      ...socket(input.id, input.type, DATA, input.required && input.default === undefined, 'list'),
      label: input.label || input.id
    })),
    // The identity block socket is the legacy v4 composition path; the
    // composer-less construct authors identity through the Name row socket,
    // so the block stays required only when the construction contract
    // declares no name row to compose it.
    ...types.blocks.map(block => socket(block, processType('block', {
      block
    }), DATA, block === 'identity' && !hasNameRow(types.constructionInputs), 'list')),
    socket('states.main', processType('status', { typeId: types.entity.typeId }), DATA, false, 'list')
  ];
  if (kind === 'effect.updateEntity') return [
    socket('entity', types.entityRef, DATA, true, 'list'),
    ...types.blocks.map(block => socket(block, processType('block', {
      block
    }), DATA, false, 'list')),
    socket('states.main', processType('status', { typeId: types.entity.typeId }), DATA, false, 'list')
  ];
  if (kind === 'effect.changeStatus') return [
    socket('entity', types.entityRef, DATA, true, 'list'),
    socket('status', processType('status', { typeId: types.entity.typeId }), DATA, true, 'list'),
    socket('changes', types.patch, DATA, false, 'list'),
    socket('note', processType('string'), DATA, false, 'list')
  ];
  if (kind === 'effect.archiveEntity') return [
    socket('entity', types.entityRef, DATA, true, 'list'),
    socket('note', processType('string'), DATA, false, 'list')
  ];
  if (kind === 'effect.deleteEntity') return [socket('entity', types.entityRef, DATA, true, 'list')];
  if (kind === 'effect.sendEntity') return [socket('entity', types.entityRef, DATA, true)];
  if (kind === 'effect.generateAttachment') return [socket('entity', types.entityRef, DATA, true), socket('parameters', processType('record'))];
  return [];
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
      processType('entity', { typeId: entry?.type }),
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

function effectResultType(kind, record) {
  if (['effect.createEntity', 'effect.runProducer', 'effect.updateEntity', 'effect.changeStatus', 'effect.archiveEntity'].includes(kind)) {
    return processType('entity', { typeId: record.typeId, nullable: false });
  }
  if (kind === 'effect.generateAttachment') {
    return processType('attachmentRef', { attachmentKind: record.attachmentKind });
  }
  return processType('json', { nullable: true });
}
