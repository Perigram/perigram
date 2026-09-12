import { normalizeWorkflow } from '~/packages/workflows/src/index.js';

// Node-record factories for the process designer. The page remains the
// composition root: domain-derived option lists, entity-type resolution, and
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
  if (kind.startsWith('source.')) return 'pi pi-circle-fill';
  if (kind.startsWith('value.')) return 'pi pi-sliders-h';
  if (kind.startsWith('collection.') || kind.startsWith('tree.')) return 'pi pi-list';
  if (kind.startsWith('record.')) return 'pi pi-box';
  if (kind.startsWith('predicate.')) return 'pi pi-filter';
  if (kind.startsWith('read.')) return 'pi pi-database';
  if (kind.startsWith('effect.')) return 'pi pi-bolt';
  return 'pi pi-directions';
}

export function defaultProcessNodeValueType(kind = '', operation = '') {
  if (kind === 'compare') return ['gt', 'gte', 'lt', 'lte'].includes(operation) ? 'number' : 'string';
  return 'string';
}

export function defaultProcessNodeOperation(kind = '') {
  return (processNodeOperations[kind] || [''])[0] || '';
}

export function createCreatedWorkflow() {
  return normalizeWorkflow({
    schemaVersion: 2,
    primaryRegion: 'main',
    regions: { main: { label: 'Lifecycle', initial: 'CREATED', states: { CREATED: { canUpdateMeta: true } }, transitions: [] } }
  });
}


export function useProcessDesignerNodeRecords({
  designer,
  translate = key => key,
  featureForEntityType,
  relationOptionsForEntity,
  syncEntityProfileIo = () => {},
  initialStatusForEntity = () => '',
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
  current: translate('processDesigner.useCurrentEntity'),
  parent: translate('processDesigner.useParentEntity'),
  children: translate('processDesigner.useChildEntities'),
  related: translate('processDesigner.useRelatedEntities'),
  concat: translate('processDesigner.useJoinText'),
  template: translate('processDesigner.useBuildText'),
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
  exists: translate('processDesigner.useExists'),
  and: translate('processDesigner.useAllConditions'),
  or: translate('processDesigner.useAnyCondition'),
  xor: translate('processDesigner.useExclusiveCondition'),
  nand: translate('processDesigner.operationLabels.nand'),
  nor: translate('processDesigner.operationLabels.nor'),
  xnor: translate('processDesigner.operationLabels.xnor'),
  not: translate('processDesigner.useInvertCondition'),
  first: translate('processDesigner.useFirstItem'),
  last: translate('processDesigner.useLastItem'),
  index: translate('processDesigner.useIndexedItem'),
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

  function defaultEntityType() {
    return designer.entityOptions[0]?.value || '';
  }

  function defaultFeature() {
    return featureForEntityType(defaultEntityType());
  }

  function createServicePrincipal(id) {
    return { id, label: id };
  }

  function createEntityProfile(id) {
    const profile = {
      id,
      entityType: defaultEntityType(),
      label: id,
      lifecycle: { mode: 'defaultCreated', workflow: createCreatedWorkflow() },
      fields: { read: ['identity.*', 'status.*', 'lineage.*'], write: [], private: [] },
      relations: relationOptionsForEntity(defaultEntityType()).map(option => option.value),
      stateVisibility: { publicRegions: ['main'], privateRegions: [], publicStates: [] },
      allowedRoles: { read: [], write: [], admin: [] }
    };
    syncEntityProfileIo(profile);
    return profile;
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
      entityType: defaultEntityType(),
      projection: { fields: [], excludeFields: [], lifecycle: { exposedRegions: ['main'], stateMap: {} } },
      receiverLifecycle: { mode: 'defaultCreated', workflow: null },
      access: { sendRoles: [], receiveRoles: [] }
    };
  }

  function createStatusDefinition(id) {
    return { id, label: '', statusId: 'STATUS', severity: 'info', color: 'info', icon: 'pi pi-circle-fill' };
  }

  function createValueInput(id, structure = 'item') {
    return {
      id,
      label: id,
      valueType: 'string',
      structure,
      access: structure,
      value: structure === 'list' ? [] : structure === 'tree' ? { branches: [] } : null
    };
  }

  function createProcessNode(id, kind = 'source.literalItem') {
    const fieldKind = ['record.getField', 'record.fieldChange'].includes(kind);
    const node = {
      id,
      kind,
      label: '',
      entityType: kind.startsWith('effect.') || kind.startsWith('read.') || fieldKind ? defaultEntityType() : '',
      construction: { mode: 'genericCreate', inputs: [] },
      status: null,
      matching: 'item',
      operation: defaultProcessNodeOperation(kind),
      value: kind === 'source.literalList' ? [] : kind === 'source.literalTree' ? { branches: [] } : null,
      fields: [],
      cases: [],
      icon: iconForProcessNode(kind),
      inputs: [],
      outputs: []
    };
    if (kind === 'effect.createEntity') {
      node.entityType = designer.createEntityOptions[0]?.value || '';
    }
    if (kind === 'effect.changeStatus') node.entityType = designer.changeStatusOptions[0]?.value || '';
    if (kind === 'effect.archiveEntity') node.entityType = designer.archivableEntityOptions[0]?.value || '';
    if (kind === 'effect.deleteEntity') node.entityType = designer.deleteEntityOptions[0]?.value || '';
    if (kind === 'producer.join') {
      node.entityType = designer.entityOptions[0]?.value || '';
      node.selectedProducerOutputId = '';
    }
    if (fieldKind) {
      const fields = kind === 'record.getField' ? designer.fieldsForBlock() : designer.fieldsForEntity(node.entityType);
      node.path = fields
        .find(field => field[kind === 'record.fieldChange' ? 'writable' : 'readable'] !== false)?.value || '';
    }
    if (['effect.createEntity', 'effect.runProducer'].includes(kind)) node.status = { to: initialStatusForEntity(node.entityType) };
    if (kind === 'record.deconstruct') {
      node.blocks = designer.blocksForEntity(node.entityType).map(block => block.id);
    }
    if (['record.getBlock', 'record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(kind)) {
      const access = kind === 'record.composeBlock' ? 'constructible'
        : kind === 'record.modifyBlock' ? 'writable'
          : 'readable';
      const structural = ['record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(kind);
      const availableFields = (structural ? designer.fieldsForBlock() : designer.fieldsForEntity(node.entityType))
        .filter(field => field[access] !== false);
      node.block = availableFields[0]?.block || designer.blocksForEntity(node.entityType)[0]?.id || designer.blocks[0]?.id || '';
      if (kind === 'record.getField') {
        node.path = availableFields.find(field => field.block === node.block)?.value || '';
      }
    }
    if (kind === 'read.related') {
      node.relationKey = relationOptionsForEntity(node.entityType)[0]?.value || '';
    }
    if (kind === 'effect.runCommand') node.commandId = designer.commandOptions[0]?.value || '';
    if (kind === 'effect.generateAttachment') node.attachmentKind = designer.attachmentKindOptions[0]?.value || '';
    if (kind === 'control.domainEventTrigger') node.eventId = designer.eventOptions[0]?.value || '';
    syncProcessNode(node);
    return node;
  }

  return {
    processNodeOperations,
    processNodeOperationLabels,
    createServicePrincipal,
    createEntityProfile,
    createService,
    createSocket,
    createStatusDefinition,
    createValueInput,
    createProcessNode,
    defaultEntityType,
    defaultFeature
  };
}
