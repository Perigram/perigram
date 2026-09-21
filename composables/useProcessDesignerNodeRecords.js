import { operationKindOf, typeIdOf } from '~/packages/cts/src/index.js';

// Node-record factories for the process designer. The page remains the
// composition root: domain-derived option lists, type-id resolution, and
// the post-creation sync hook are injected so this module owns only record
// shapes and defaults.
const processNodeOperations = {
  'value.math': ['add', 'subtract', 'multiply', 'divide', 'modulo', 'power', 'min', 'max', 'absolute', 'negate', 'round', 'floor', 'ceil', 'sqrt', 'clamp'],
  'value.string': ['concat', 'replace', 'substring', 'split', 'join', 'length', 'lower', 'upper', 'trim'],
  'value.logic': ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith', 'isNull', 'isNotNull', 'and', 'or', 'xor', 'nand', 'nor', 'xnor', 'not'],
  'value.dateTime': ['addDays', 'addHours', 'addMinutes', 'addMonths', 'addDuration', 'subtractDuration', 'differenceDays', 'differenceHours', 'differenceMinutes', 'startOfDay', 'endOfDay'],
  'predicate.field': ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith', 'isNull', 'isNotNull'],
  'predicate.logic': ['and', 'or', 'not'],
  'collection.sort': ['asc', 'desc'],
  'record.fieldChange': ['set', 'unset', 'append', 'remove']
};

export function humanizeNodeLabel(value = '') {
  return String(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._]/g, ' ')
    .replace(/^./, letter => letter.toUpperCase());
}

export function iconForProcessNode(kind = '') {
  if (kind.startsWith('cts.construct')) return 'pi pi-plus-circle';
  if (kind.startsWith('cts.mutate')) return 'pi pi-pencil';
  if (kind.startsWith('cts.transition')) return 'pi pi-forward';
  if (kind.startsWith('cts.remove')) return 'pi pi-trash';
  if (kind.startsWith('cts.command')) return 'pi pi-bolt';
  if (kind.startsWith('cts.conversion')) return 'pi pi-replay';
  if (kind.startsWith('cts.read')) return 'pi pi-database';
  if (kind.startsWith('cts.field')) return 'pi pi-angle-right';
  if (kind.startsWith('cts.compose')) return 'pi pi-box';
  if (kind.startsWith('cts.decompose')) return 'pi pi-objects-column';
  if (kind.startsWith('cts.join')) return 'pi pi-arrows-merge';
  if (kind.startsWith('source.')) return 'pi pi-circle-fill';
  if (kind.startsWith('value.')) return 'pi pi-sliders-h';
  if (kind.startsWith('collection.') || kind.startsWith('tree.')) return 'pi pi-list';
  if (kind.startsWith('record.')) return 'pi pi-box';
  if (kind.startsWith('predicate.')) return 'pi pi-filter';
  if (kind.startsWith('read.')) return 'pi pi-database';
  if (kind.startsWith('effect.')) return 'pi pi-bolt';
  return 'pi pi-directions';
}

export function defaultProcessNodeOperation(kind = '') {
  return (processNodeOperations[kind] || [''])[0] || '';
}

export function useProcessDesignerNodeRecords({
  designer,
  translate = key => key,
  syncProcessNode = () => {}
} = {}) {
  const processNodeOperationLabels = {
    add: translate('processDesigner.operationLabels.add'),
    subtract: translate('processDesigner.operationLabels.subtract'),
    multiply: translate('processDesigner.operationLabels.multiply'),
    divide: translate('processDesigner.operationLabels.divide'),
    modulo: translate('processDesigner.operationLabels.modulo'),
    power: translate('processDesigner.operationLabels.power'),
    min: translate('processDesigner.operationLabels.min'),
    max: translate('processDesigner.operationLabels.max'),
    absolute: translate('processDesigner.operationLabels.absolute'),
    negate: translate('processDesigner.operationLabels.negate'),
    round: translate('processDesigner.operationLabels.round'),
    floor: translate('processDesigner.operationLabels.floor'),
    ceil: translate('processDesigner.operationLabels.ceil'),
    sqrt: translate('processDesigner.operationLabels.sqrt'),
    clamp: translate('processDesigner.operationLabels.clamp'),
    concat: translate('processDesigner.useJoinText'),
    replace: translate('processDesigner.useReplaceText'),
    lower: translate('processDesigner.useLowerText'),
    upper: translate('processDesigner.useUpperText'),
    trim: translate('processDesigner.useTrimText'),
    substring: translate('processDesigner.operationLabels.substring'),
    split: translate('processDesigner.operationLabels.split'),
    join: translate('processDesigner.operationLabels.join'),
    length: translate('processDesigner.operationLabels.length'),
    eq: translate('processDesigner.useEquals'),
    neq: translate('processDesigner.useNotEquals'),
    gt: translate('processDesigner.useGreaterThan'),
    gte: translate('processDesigner.useGreaterOrEqual'),
    lt: translate('processDesigner.useLessThan'),
    lte: translate('processDesigner.useLessOrEqual'),
    contains: translate('processDesigner.useContains'),
    startsWith: translate('processDesigner.operationLabels.startsWith'),
    endsWith: translate('processDesigner.operationLabels.endsWith'),
    isNull: translate('processDesigner.operationLabels.isEmpty'),
    isNotNull: translate('processDesigner.operationLabels.isNotEmpty'),
    and: translate('processDesigner.useAllConditions'),
    or: translate('processDesigner.useAnyCondition'),
    xor: translate('processDesigner.useExclusiveCondition'),
    nand: translate('processDesigner.operationLabels.nand'),
    nor: translate('processDesigner.operationLabels.nor'),
    xnor: translate('processDesigner.operationLabels.xnor'),
    not: translate('processDesigner.useInvertCondition'),
    asc: translate('processDesigner.operationLabels.ascending'),
    desc: translate('processDesigner.operationLabels.descending'),
    set: translate('processDesigner.operationLabels.set'),
    unset: translate('processDesigner.operationLabels.clear'),
    append: translate('processDesigner.operationLabels.append'),
    remove: translate('processDesigner.operationLabels.remove'),
    addDays: translate('processDesigner.operationLabels.addDays'),
    addHours: translate('processDesigner.operationLabels.addHours'),
    addMinutes: translate('processDesigner.operationLabels.addMinutes'),
    addMonths: translate('processDesigner.operationLabels.addMonths'),
    addDuration: translate('processDesigner.operationLabels.addDuration'),
    subtractDuration: translate('processDesigner.operationLabels.subtractDuration'),
    differenceDays: translate('processDesigner.operationLabels.differenceDays'),
    differenceHours: translate('processDesigner.operationLabels.differenceHours'),
    differenceMinutes: translate('processDesigner.operationLabels.differenceMinutes'),
    startOfDay: translate('processDesigner.operationLabels.startOfDay'),
    endOfDay: translate('processDesigner.operationLabels.endOfDay')
  };

  function defaultTypeId() {
    return designer.entityOptions[0]?.value || '';
  }

  function createService(id) {
    return {
      id,
      label: id,
      serviceType: '',
      commandId: '',
      inputs: [],
      outputs: [],
      access: { runPrincipals: [], viewPrincipals: [] },
      billing: { mode: 'none', tokenCost: 0, meterKey: '' }
    };
  }

  function createSocket(id, direction = 'outbound') {
    return {
      id,
      label: id,
      direction,
      typeId: '',
      projection: { fields: [], excludeFields: [], lifecycle: { exposedRegions: ['main'], stateMap: {} } },
      receiverLifecycle: { mode: 'defaultCreated', workflow: null },
      access: { sendRoles: [], receiveRoles: [] }
    };
  }

  // Graph protocol v5: palette items create cts.* records. Defaults derive  // from the operation-kind twin (one seam); the record stores the authored
  // vocabulary — `type`/`via` for species kinds.
  function createProcessNode(id, kind = 'source.literalItem') {
    const v5 = kind.startsWith('cts.');
    const op = operationKindOf({ kind });
    const node = {
      id,
      kind,
      label: '',
      ...(v5 ? { typeId: '' } : { typeId: '' }),
      construction: { mode: 'genericCreate', inputs: [] },
      status: null,
      matching: 'item',
      operation: defaultProcessNodeOperation(op),
      value: op === 'source.literalList' ? [] : op === 'source.literalTree' ? { branches: [] } : null,
      fields: [],
      cases: [],
      icon: iconForProcessNode(kind),
      inputs: [],
      outputs: []
    };
    if (v5 && op === 'effect.createEntity') node.via = 'genericCreate';
    // No default bindings: nodes are unbound until the author binds them
    // (wire a type node, or pick explicitly). A seeded domain type here is
    // an invisible authoring decision the user never made.
    if (op === 'producer.join') {
      node.selectedProducerOutputId = '';
    }
    // initial status derives post-preset in syncProcessNode (the palette
    // preset may bind a different type than the default).
    if (['effect.createEntity', 'effect.runProducer'].includes(op)) node.status = {};
    syncProcessNode(node);
    return node;
  }

  return {
    processNodeOperations,
    processNodeOperationLabels,
    createService,
    createSocket,
    createProcessNode,
    defaultTypeId
  };
}
