import { CANONICAL_ENTITY_BLOCKS } from '../../core/src/index.js';

const BLOCK_PRESENTATION = {
  identity: { defaultPath: 'identity.name', icon: 'pi pi-id-card', fields: ['identity.uid', 'identity.name', 'identity.slug', 'identity.serial', 'identity.reference'] },
  origin: { defaultPath: 'origin.state.primary', icon: 'pi pi-history', fields: ['origin.state.primary', 'origin.userId', 'origin.timestamp', 'origin.metadata', 'origin.eventId', 'origin.lifecycle'] },
  status: { defaultPath: 'status.state.primary', icon: 'pi pi-circle-fill', fields: ['status.state.primary', 'status.userId', 'status.timestamp', 'status.metadata', 'status.eventId', 'status.lifecycle'] },
  lineage: { defaultPath: 'lineage.organizationId', icon: 'pi pi-sitemap' },
  relations: { defaultPath: 'relations.value', icon: 'pi pi-link' },
  provenance: { defaultPath: 'provenance.source', icon: 'pi pi-directions-alt' },
  specs: { defaultPath: 'specs.width', icon: 'pi pi-list-check', fields: ['specs.width', 'specs.length', 'specs.area', 'specs.sheetThickness', 'specs.foilThickness'] },
  attachments: { defaultPath: 'attachments.primary', icon: 'pi pi-paperclip' },
  data: { defaultPath: 'data.value', icon: 'pi pi-database' },
  summary: { defaultPath: 'summary.value', icon: 'pi pi-chart-bar' }
};

const paletteItem = (id, kind, options = {}) => Object.freeze({
  id,
  type: 'processNode',
  kind,
  label: id,
  description: id,
  icon: iconForNode(kind),
  advanced: false,
  preset: {},
  ...options
});

// This is an authoring catalog, not the runtime operation catalog. Runtime-only
// coercions and plumbing are deliberately absent: the connection planner owns
// those operations and may insert them when two compatible sockets are joined.
export const PROCESS_DESIGNER_PALETTE_GROUPS = Object.freeze([
  {
    id: 'startAndInput',
    items: [
      paletteItem('whenStarted', 'control.manualTrigger'),
      paletteItem('currentTime', 'source.currentTime')
    ]
  },
  {
    id: 'values',
    items: [
      paletteItem('textValue', 'source.literalItem', { preset: { type: { base: 'string', shape: 'item', nullable: false }, value: '' } }),
      paletteItem('numberValue', 'source.literalItem', { preset: { type: { base: 'number', shape: 'item', nullable: false }, value: 0 } }),
      paletteItem('yesNoValue', 'source.literalItem', { preset: { type: { base: 'boolean', shape: 'item', nullable: false }, value: false } }),
      paletteItem('listValue', 'source.literalList', { preset: { type: { base: 'json', shape: 'list', nullable: false }, value: [] }, advanced: true }),
      paletteItem('fallbackValue', 'value.coalesce'),
      paletteItem('calculate', 'value.math', { preset: { type: { base: 'number', shape: 'item', nullable: false } } }),
      paletteItem('editText', 'value.string', { preset: { type: { base: 'string', shape: 'item', nullable: false } } }),
      paletteItem('compareValues', 'value.compare', { preset: { type: { base: 'string', shape: 'item', nullable: true } } }),
      paletteItem('combineConditions', 'value.logic'),
      paletteItem('formatValue', 'value.format', { advanced: true })
    ]
  },
  {
    id: 'entitiesAndFields',
    items: [
      paletteItem('currentEntity', 'read.currentEntity'),
      paletteItem('findEntityById', 'read.entityById'),
      paletteItem('findEntities', 'read.queryEntities'),
      paletteItem('relatedEntities', 'read.related'),
      paletteItem('readField', 'record.getField'),
      paletteItem('readBlock', 'record.getBlock'),
      paletteItem('setField', 'record.fieldChange'),
      paletteItem('combineFieldChanges', 'record.mergeChanges'),
      paletteItem('applyFieldChanges', 'record.applyChanges'),
      paletteItem('composeEntityData', 'record.entityDraft'),
      paletteItem('decomposeEntity', 'record.deconstruct', { advanced: true }),
      paletteItem('parentEntity', 'read.parent', { advanced: true }),
      paletteItem('childEntities', 'read.children', { advanced: true })
    ]
  },
  {
    id: 'selection',
    items: [
      paletteItem('fieldCondition', 'predicate.field'),
      paletteItem('combineFilters', 'predicate.logic'),
      paletteItem('filterEntities', 'read.filterRecords')
    ]
  },
  {
    id: 'actions',
    items: [
      paletteItem('createEntity', 'effect.createEntity'),
      paletteItem('updateEntity', 'effect.updateEntity'),
      paletteItem('changeStatus', 'effect.changeStatus'),
      paletteItem('runService', 'effect.runCommand'),
      paletteItem('sendEntity', 'effect.sendEntity'),
      paletteItem('generateAttachment', 'effect.generateAttachment', { advanced: true })
    ]
  },
  {
    id: 'flow',
    items: [
      paletteItem('choosePath', 'control.if'),
      paletteItem('forEachEntity', 'control.forEach'),
      paletteItem('waitForTime', 'control.waitDuration'),
      paletteItem('waitUntilTime', 'control.waitUntil', { advanced: true }),
      paletteItem('stopProcess', 'control.stopSuccess'),
      paletteItem('stopWithError', 'control.stopFailure', { advanced: true }),
      paletteItem('parallelPaths', 'control.fork', { advanced: true }),
      paletteItem('joinAllPaths', 'control.joinAll', { advanced: true }),
      paletteItem('joinAnyPath', 'control.joinAny', { advanced: true })
    ]
  },
  {
    id: 'dataStructures',
    items: [
      paletteItem('makeList', 'collection.makeList', { advanced: true }),
      paletteItem('joinLists', 'collection.concat', { advanced: true }),
      paletteItem('itemAtPosition', 'collection.itemAt', { advanced: true }),
      paletteItem('listCount', 'collection.count', { advanced: true }),
      paletteItem('sortItems', 'collection.sort', { advanced: true }),
      paletteItem('removeDuplicates', 'collection.distinct', { advanced: true }),
      paletteItem('groupItems', 'collection.groupBy', { advanced: true }),
      paletteItem('flattenTree', 'tree.flatten', { advanced: true }),
      paletteItem('graftTree', 'tree.graft', { advanced: true }),
      paletteItem('treeBranch', 'tree.branch', { advanced: true }),
      paletteItem('zipLists', 'tree.zip', { advanced: true })
    ]
  }
].map(group => Object.freeze({
  ...group,
  items: Object.freeze(group.items)
})));

export function createProcessDesignerContract(domain = {}) {
  const entities = Array.isArray(domain.entities) ? domain.entities : [];
  const entityByType = new Map(entities.map(entity => [entity.type, entity]));

  function fieldPolicy(entityType = '') {
    return lookupEntityContract(domain.fieldAccess, entityType) || {};
  }

  function construction(entityType = '') {
    return lookupEntityContract(domain.construction, entityType) || {
      modes: ['genericCreate'],
      defaultMode: 'genericCreate',
      inputs: []
    };
  }

  function blocks(entityType = '') {
    const declared = entityByType.get(entityType)?.blocks || [];
    const policyRoots = allFieldPaths(fieldPolicy(entityType))
      .map(path => String(path).split('.')[0]);
    const available = new Set([...declared, ...policyRoots]);
    return CANONICAL_ENTITY_BLOCKS
      .filter(id => available.has(id))
      .map(id => ({ id, label: id, ...BLOCK_PRESENTATION[id] }));
  }

  function fields(entityType = '', block = '') {
    const schemas = lookupEntityContract(domain.fieldSchemas, entityType) || [];
    return schemas
      .filter(schema => !block || schema.block === block)
      .map(schema => ({
        ...schema,
        label: schema.label || schema.path,
        value: schema.path
      }));
  }

  return {
    domain,
    paletteGroups: PROCESS_DESIGNER_PALETTE_GROUPS,
    blocks: CANONICAL_ENTITY_BLOCKS.map(id => ({ id, label: id, ...BLOCK_PRESENTATION[id] })),
    entityOptions: entities.map(entity => ({ label: entity.label || entity.type, value: entity.type })),
    workflowOptions: Object.entries(domain.workflows || {}).map(([entityType, workflow]) => ({ label: workflow.label || entityType, value: entityType })),
    commandOptions: definitionOptions(domain.commands),
    taskOptions: definitionOptions(domain.tasks),
    eventOptions: definitionOptions(domain.events),
    hookOptions: definitionOptions(domain.hooks),
    effectOptions: definitionOptions(domain.effects),
    attachmentKindOptions: definitionOptions(domain.attachmentKinds, 'kind'),
    entity: entityType => entityByType.get(entityType) || null,
    fieldPolicy,
    construction,
    blocksForEntity: blocks,
    fieldsForEntity: fields,
    fieldType: (entityType, path) => fields(entityType).find(field => field.value === path)?.type || {
      base: 'json',
      shape: 'item',
      nullable: true
    }
  };
}

function lookupEntityContract(contracts = {}, entityType = '') {
  const key = String(entityType || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return contracts?.[key] || contracts?.[camel] || contracts?.[snake] || null;
}

function allFieldPaths(policy = {}) {
  return ['read', 'write', 'admin'].flatMap(level => Array.isArray(policy[level]) ? policy[level] : []);
}

function definitionOptions(definitions = {}, idKey = 'id') {
  const items = Array.isArray(definitions) ? definitions : Object.values(definitions || {});
  return items
    .map(definition => ({
      label: definition.label || definition.name || definition[idKey] || definition.id,
      value: definition[idKey] || definition.id
    }))
    .filter(option => option.value);
}

function iconForNode(kind = '') {
  if (kind.startsWith('source.')) return 'pi pi-circle-fill';
  if (kind.startsWith('value.')) return kind.includes('logic') || kind.includes('compare') ? 'pi pi-sitemap' : 'pi pi-sliders-h';
  if (kind.startsWith('collection.') || kind.startsWith('tree.')) return 'pi pi-list';
  if (kind.startsWith('record.')) return 'pi pi-box';
  if (kind.startsWith('predicate.')) return 'pi pi-filter';
  if (kind.startsWith('read.')) return 'pi pi-database';
  if (kind.startsWith('effect.')) return 'pi pi-bolt';
  return 'pi pi-directions';
}
