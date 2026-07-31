import { legacyProcessType, normalizeProcessSocket, processType } from './types.js';

const DATA = 'data';
const CONTROL = 'control';
const SUCCESS = 'success';
const FAILURE = 'failure';

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
  data('collection.concat', 'concatLists'),
  data('collection.itemAt', 'itemAt'),
  data('collection.slice', 'slice'),
  data('collection.count', 'count'),
  data('collection.distinct', 'distinct'),
  data('collection.sort', 'sort'),
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

  data('record.getField', 'getField'),
  data('record.fieldChange', 'fieldChange'),
  data('record.mergeChanges', 'mergeChanges'),
  data('record.applyChanges', 'applyChanges'),
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
  effect('effect.updateEntity', 'updateEntity'),
  effect('effect.changeStatus', 'changeStatus'),
  effect('effect.runCommand', 'runCommand'),
  effect('effect.sendEntity', 'sendEntity'),
  effect('effect.generateAttachment', 'generateAttachment'),

  trigger('control.manualTrigger', 'manualTrigger'),
  trigger('control.domainEventTrigger', 'domainEventTrigger'),
  trigger('control.entityChangedTrigger', 'entityChangedTrigger'),
  trigger('control.scheduleTrigger', 'scheduleTrigger'),
  trigger('control.webhookTrigger', 'webhookTrigger'),
  control('control.if', 'ifElse'),
  control('control.switch', 'switch'),
  control('control.fork', 'fork'),
  control('control.joinAll', 'joinAll'),
  control('control.joinAny', 'joinAny'),
  control('control.forEach', 'forEach'),
  control('control.waitDuration', 'waitDuration'),
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

function socket(id, type, role = DATA, required = false) {
  return { id, label: id, type, role, required };
}

function catalogPorts(record = {}, context = {}) {
  const kind = record.kind;
  const configured = processTypeFrom(record.type, processType(record.base || 'json', {
    shape: record.shape || 'item',
    nullable: record.nullable,
    entityType: record.entityType,
    block: record.block,
    unit: record.unit,
    enumId: record.enumId
  }));
  const sameShape = base => processType(base, { shape: configured.shape });
  const entity = processType('entity', { shape: record.shape || 'item', entityType: record.entityType });
  const entityList = processType('entity', { shape: 'list', entityType: record.entityType });
  const entityRef = processType('entityRef', { entityType: record.entityType });
  const predicate = processType('predicate', { entityType: record.entityType });
  const patch = processType('patch', { entityType: record.entityType });
  const event = processType('event');
  const controlInput = [{ ...socket('in', event, CONTROL, true), multiple: true }];
  const successFailure = [
    socket('success', event, SUCCESS),
    socket('failure', processType('error'), FAILURE)
  ];

  if (kind.startsWith('source.')) {
    const output = kind === 'source.currentTime' ? processType('dateTime')
      : kind === 'source.secretRef' ? processType('opaque', { opaqueType: 'secretRef' })
        : configured;
    return { inputs: [], outputs: [socket('value', output)] };
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
      outputs: [socket('value', processType('string', { shape: 'list' }))]
    };
    if (record.operation === 'join') return {
      inputs: [socket('items', processType('string', { shape: 'list' }), DATA, true), socket('separator', sameShape('string'), DATA, true)],
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
  if (kind === 'collection.makeList') return unary({ ...configured, shape: 'item' }, { ...configured, shape: 'list' });
  if (kind === 'collection.concat') return binary({ ...configured, shape: 'list' }, { ...configured, shape: 'list' });
  if (kind === 'collection.itemAt') return {
    inputs: [socket('items', { ...configured, shape: 'list' }, DATA, true), socket('index', processType('integer'), DATA, true)],
    outputs: [socket('item', { ...configured, shape: 'item', nullable: true })]
  };
  if (kind === 'collection.slice') return {
    inputs: [socket('items', { ...configured, shape: 'list' }, DATA, true), socket('start', processType('integer')), socket('end', processType('integer'))],
    outputs: [socket('items', { ...configured, shape: 'list' })]
  };
  if (kind === 'collection.count') return unary({ ...configured, shape: 'list' }, processType('integer'));
  if (['collection.distinct', 'collection.sort'].includes(kind)) return unary({ ...configured, shape: 'list' }, { ...configured, shape: 'list' });
  if (kind === 'collection.groupBy') return {
    inputs: [socket('items', { ...configured, shape: 'list' }, DATA, true), socket('keys', processType('json', { shape: 'list' }), DATA, true)],
    outputs: [socket('groups', { ...configured, shape: 'tree' })]
  };
  if (kind === 'collection.filter') return {
    inputs: [socket('items', { ...configured, shape: 'list' }, DATA, true), socket('mask', processType('boolean', { shape: 'list' }), DATA, true)],
    outputs: [socket('items', { ...configured, shape: 'list' })]
  };
  if (kind === 'tree.flatten') return unary({ ...configured, shape: 'tree' }, { ...configured, shape: 'list' });
  if (kind === 'tree.graft') return unary(configured, { ...configured, shape: 'tree' });
  if (kind === 'tree.simplify') return unary({ ...configured, shape: 'tree' }, { ...configured, shape: 'tree' });
  if (kind === 'tree.branch') return {
    inputs: [socket('tree', { ...configured, shape: 'tree' }, DATA, true), socket('path', processType('integer', { shape: 'list' }), DATA, true)],
    outputs: [socket('items', { ...configured, shape: 'list' })]
  };
  if (['tree.zip', 'tree.cross'].includes(kind)) return binary(configured, configured, { ...configured, shape: kind === 'tree.cross' ? 'list' : configured.shape });
  if (kind === 'tree.unzip') return unary(configured, processType('json', { shape: 'tree' }));
  if (kind === 'tree.transpose') return unary({ ...configured, shape: 'tree' }, { ...configured, shape: 'tree' });
  if (kind === 'record.getField') {
    const field = context.fieldSchema || record.fieldSchema;
    return unary(entity, { ...processTypeFrom(field?.type, configured), shape: entity.shape });
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
  if (kind === 'record.construct' || kind === 'record.entityDraft') {
    const fields = dynamicFields(record, context);
    return {
      inputs: fields.map(field => socket(field.path, field.type, DATA, Boolean(field.required))),
      outputs: [socket('record', kind === 'record.entityDraft' ? entity : processType('record', { schema: record.schema }))]
    };
  }
  if (kind === 'record.deconstruct') {
    const fields = dynamicFields(record, context);
    return {
      inputs: [socket('record', entity, DATA, true)],
      outputs: fields.map(field => socket(field.path, { ...field.type, shape: entity.shape }))
    };
  }
  if (kind === 'record.getBlock') return unary(entity, processType('block', { block: record.block, shape: entity.shape }));
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
    outputs: [socket('entities', entityList)]
  };
  if (kind === 'read.filterRecords') return {
    inputs: [socket('entities', entityList, DATA, true), socket('predicate', predicate, DATA, true)],
    outputs: [socket('entities', entityList)]
  };
  if (kind.startsWith('effect.')) {
    const specific = effectInputs(kind, {
      entity,
      entityRef,
      patch,
      configured,
      parentEntityType: record.parentEntityType,
      dynamicFields: dynamicFields(record, context),
      constructionInputs: constructionInputs(record)
    });
    const eventInput = ['event', 'date'].includes(record.trigger?.mode) ? controlInput : [];
    const dateInput = record.trigger?.mode === 'date'
      ? [socket('at', processType('dateTime'), DATA, true)]
      : [];
    return {
      inputs: [...eventInput, ...dateInput, ...specific],
      outputs: [...successFailure, socket('result', effectResultType(kind, record))]
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
    inputs: [...controlInput, socket('items', { ...configured, shape: 'list' }, DATA, true)],
    outputs: [socket('each', event, CONTROL), socket('item', { ...configured, shape: 'item' }), socket('done', event, CONTROL)]
  };
  if (kind === 'control.waitDuration') return {
    inputs: [...controlInput, socket('duration', processType('duration'), DATA, true)],
    outputs: [socket('out', event, CONTROL)]
  };
  if (kind === 'control.waitUntil') return {
    inputs: [...controlInput, socket('at', processType('dateTime'), DATA, true)],
    outputs: [socket('out', event, CONTROL)]
  };
  if (kind === 'control.stopSuccess' || kind === 'control.stopFailure') return { inputs: controlInput, outputs: [] };
  throw new Error(`Node ${kind} has no port contract`);
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
  return value && typeof value === 'object' && value.base ? processType(value.base, value) : fallback;
}

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

function effectInputs(kind, types) {
  if (kind === 'effect.createEntity') return [
    ...types.constructionInputs.map(input => ({
      ...socket(input.id, input.type, DATA, input.required),
      label: input.label || input.id
    })),
    ...types.dynamicFields.map(field => socket(field.path, field.type, DATA, true)),
    socket('parent', processType('entityRef', { entityType: types.parentEntityType }))
  ];
  if (kind === 'effect.updateEntity') return [
    socket('entity', types.entityRef, DATA, true),
    ...types.dynamicFields
      .filter(field => field.path !== 'status.state.primary')
      .map(field => socket(field.path, field.type, DATA, true)),
    socket('status.state.primary', processType('status', { entityType: types.entity.entityType }))
  ];
  if (kind === 'effect.changeStatus') return [
    socket('entity', types.entityRef, DATA, true),
    socket('status', processType('status', { entityType: types.entity.entityType }), DATA, true),
    socket('changes', types.patch)
  ];
  if (kind === 'effect.runCommand') return [socket('parameters', processType('record'))];
  if (kind === 'effect.sendEntity') return [socket('entity', types.entityRef, DATA, true)];
  if (kind === 'effect.generateAttachment') return [socket('entity', types.entityRef, DATA, true), socket('parameters', processType('record'))];
  return [];
}

function constructionInputs(record = {}) {
  return (record.construction?.inputs || []).map(input => {
    const multiple = input.type === 'entityList';
    const type = input.type === 'entity' || multiple
      ? processType('entityRef', {
          entityType: input.entityType,
          accepts: input.accepts,
          shape: multiple ? 'list' : 'item'
        })
      : legacyProcessType(input.type || 'json');
    return { ...input, id: input.id || input.path, type };
  }).filter(input => input.id);
}

function effectResultType(kind, record) {
  if (['effect.createEntity', 'effect.updateEntity', 'effect.changeStatus'].includes(kind)) {
    return processType('entity', { entityType: record.entityType, nullable: false });
  }
  if (kind === 'effect.generateAttachment') {
    return processType('attachmentRef', { attachmentKind: record.attachmentKind });
  }
  return processType('json', { nullable: true });
}
