import { createProcessNodeRecord, PROCESS_NODE_OPERATIONS_BY_KIND as processNodeOperations } from '~/packages/processes/src/index.js';

// Node-record factory adapter over the package authoring seam: the record
// shapes, defaults, and the sync call are the headless authoring contract
// (packages/processes `authoring.js`); this composable adds only the i18n
// operation labels and the page's late-bound sync hook.
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

  function createProcessNode(id, kind = 'source.literalItem') {
    const node = createProcessNodeRecord(id, kind, { defaultEntityTypeId: defaultTypeId() });
    syncProcessNode(node);
    return node;
  }

  return {
    processNodeOperations,
    processNodeOperationLabels,
    createProcessNode,
    defaultTypeId
  };
}
