import { mapDomainInputType, normalizeProcessSocket, processType } from './types.js';

const DATA = 'data';
const CONTROL = 'control';

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
  data('predicate.field', 'fieldPredicate'),
  data('predicate.logic', 'predicateLogic'),

  read('read.currentEntity', 'currentEntity'),
  read('read.entityById', 'entityById'),
  read('read.resolveEntityRef', 'resolveEntityReference'),
  read('read.parent', 'parentEntity'),
  read('read.children', 'childEntities'),
  read('read.related', 'relatedEntities'),
  read('read.queryEntities', 'queryEntities'),
  data('read.filterRecords', 'filterRecords'),

  effect('effect.createEntity', 'createEntity'),
  effect('effect.runProducer', 'runProducer'),
  effect('effect.updateEntity', 'updateEntity'),
  effect('effect.changeStatus', 'changeStatus'),
  effect('effect.runCommand', 'runCommand'),
  effect('effect.sendEntity', 'sendEntity'),
  effect('effect.generateAttachment', 'generateAttachment'),

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
    : kind.startsWith('record.') ? 'records'
      : kind.startsWith('predicate.') ? 'predicates'
        : kind.startsWith('read.') ? 'reads' : 'values';
  return definition(kind, label, family, kind.startsWith('read.') ? 'read' : 'data', true, catalogPorts);
}

function read(kind, label) {
  return definition(kind, label, 'reads', 'read', false, catalogPorts);
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

function socket(id, type, role = DATA, _required = false, access = 'item') {
  return { id, label: id, type, role, required: false, access };
}

function catalogPorts(record = {}, context = {}) {
  const kind = record.kind;
  const configuredBase = record.base || 'json';
  const configured = processTypeFrom(record.type, processType(configuredBase, {
    nullable: record.nullable,
    ...(['entity', 'entityRef', 'revisionRef', 'predicate', 'patch', 'status'].includes(configuredBase)
      && record.entityType ? { entityType: record.entityType } : {}),
    ...(configuredBase === 'block' && record.block ? { block: record.block } : {}),
    unit: record.unit,
    enumId: record.enumId
  }));
  const sameShape = base => processType(base);
  const entity = processType('entity', { entityType: record.entityType });
  const entityList = processType('entity', { entityType: record.entityType });
  const entityRef = processType('entityRef', { entityType: record.entityType });
  const predicate = processType('predicate', { entityType: record.entityType });
  const patch = processType('patch', { entityType: record.entityType });
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
  if (kind === 'collection.makeList') return unary(configured, configured);
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
    inputs: [socket('items', configured, DATA, true, 'list'), socket('index', processType('integer'), DATA, true)],
    outputs: [socket('item', { ...configured, nullable: true })]
  };
  if (kind === 'collection.slice') return {
    inputs: [socket('items', configured, DATA, true, 'list'), socket('start', processType('integer')), socket('end', processType('integer'))],
    outputs: [socket('items', configured, DATA, false, 'list')]
  };
  if (kind === 'collection.count') return { inputs: [socket('value', configured, DATA, true, 'list')], outputs: [socket('value', processType('integer'))] };
  if (['collection.distinct', 'collection.sort', 'collection.reverse'].includes(kind)) return { inputs: [socket('value', configured, DATA, true, 'list')], outputs: [socket('value', configured, DATA, false, 'list')] };
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
  if (kind === 'read.currentEntity') return { inputs: [], outputs: [socket('entity', entity)] };
  if (kind === 'read.entityById') return { inputs: [socket('id', processType('id'), DATA, true)], outputs: [socket('entity', { ...entity, nullable: true })] };
  if (kind === 'read.resolveEntityRef') return unary(entityRef, { ...entity, nullable: true });
  if (['read.parent', 'read.children', 'read.related'].includes(kind)) {
    return unary(entity, kind === 'read.parent' ? { ...entity, nullable: true } : entityList);
  }
  if (kind === 'read.queryEntities') return {
    inputs: [socket('predicate', predicate)],
    outputs: [socket('entities', entityList, DATA, false, 'list')]
  };
  if (kind === 'read.filterRecords') return {
    inputs: [socket('entities', entityList, DATA, true, 'list'), socket('predicate', predicate, DATA, true)],
    outputs: [socket('entities', entityList, DATA, false, 'list')]
  };
  if (kind.startsWith('effect.')) {
    if (kind === 'effect.runCommand') {
      const command = context.command || {};
      return {
        inputs: [
          ...(record.trigger?.mode === 'event' ? controlInput : []),
          ...commandInputSockets(command)
        ],
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
    const eventInput = record.trigger?.mode === 'event' ? controlInput : [];
    return {
      inputs: [...eventInput, ...specific],
      outputs: [completed, socket('result', effectResultType(kind, record))]
    };
  }
  if (kind.endsWith('Trigger')) {
    const payload = record.entityType ? entity : processType('json');
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
    return processType('entityRef', { entityType: entry.entityType || undefined });
  }
  if (composition?.mode === 'attachments') {
    return processType('attachmentRef', { attachmentKind: entry.attachmentKind || undefined });
  }
  const base = entry.type?.base || composition?.valueBase || 'json';
  return processType(base, entry.type || {});
}

function entryLabel(entry = {}, composition = {}) {
  if (composition?.mode === 'ancestors') return entry.key || entry.entityType || 'ancestor';
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
    if (value.entityType) qualifiers.entityType = value.entityType;
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

function effectInputs(kind, types) {
  if (kind === 'effect.runProducer') return types.constructionInputs.map(input => ({
    ...socket(input.id, input.type, DATA, input.required && input.default === undefined),
    label: input.label || input.id
  }));
  if (kind === 'effect.createEntity' && types.constructionMode !== 'genericCreate') {
    return [
      ...types.constructionInputs.map(input => ({
        ...socket(input.id, input.type, DATA, input.required && input.default === undefined),
        label: input.label || input.id
      })),
      ...types.blocks.map(block => socket(block, processType('block', { block }), DATA)),
      socket('status.state.primary', processType('status', { entityType: types.entity.entityType }))
    ];
  }
  if (kind === 'effect.createEntity') return [
    ...types.blocks.map(block => socket(block, processType('block', {
      block
    }), DATA, block === 'identity')),
    socket('status.state.primary', processType('status', { entityType: types.entity.entityType }))
  ];
  if (kind === 'effect.updateEntity') return [
    socket('entity', types.entityRef, DATA, true),
    ...types.blocks.map(block => socket(block, processType('block', {
      block
    }))),
    socket('status.state.primary', processType('status', { entityType: types.entity.entityType }))
  ];
  if (kind === 'effect.changeStatus') return [
    socket('entity', types.entityRef, DATA, true),
    socket('status', processType('status', { entityType: types.entity.entityType }), DATA, true),
    socket('changes', types.patch)
  ];
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
        ? processType('array', { itemType: processType('entityRef', { entityType: input.type || undefined, accepts: input.accepts || [] }) })
        : processType('entityRef', { entityType: input.type || undefined, accepts: input.accepts || [] }),
      DATA,
      Boolean(input.required)
    )),
    ...(command.input?.entities || [])
      .filter(input => !acceptedTypes.has(input.type))
      .map(input => socket(
        input.name || input.type,
        input.multiple
          ? processType('array', { itemType: processType('entityRef', { entityType: input.type }) })
          : processType('entityRef', { entityType: input.type }),
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
    ...(command.output?.entities || []).map(entityType => socket(
      entityType,
      processType('entity', { entityType }),
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
  if (input.entityType) return processType('entityRef', { entityType: input.entityType });
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
    const multiple = input.type === 'entityList';
    const type = input.type === 'entity' || multiple
      ? multiple
        ? processType('array', { itemType: processType('entityRef', { entityType: input.entityType, accepts: input.accepts }) })
        : processType('entityRef', { entityType: input.entityType, accepts: input.accepts })
      : mapDomainInputType(input.type || 'json');
    return { ...input, id: input.id || input.path, type };
  }).filter(input => input.id);
}

function effectResultType(kind, record) {
  if (['effect.createEntity', 'effect.runProducer', 'effect.updateEntity', 'effect.changeStatus'].includes(kind)) {
    return processType('entity', { entityType: record.entityType, nullable: false });
  }
  if (kind === 'effect.generateAttachment') {
    return processType('attachmentRef', { attachmentKind: record.attachmentKind });
  }
  return processType('json', { nullable: true });
}
