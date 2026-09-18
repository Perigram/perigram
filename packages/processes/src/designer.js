import { CANONICAL_ENTITY_BLOCKS } from '../../core/src/index.js';
import { CONSUMER_EFFECT_KINDS } from './node-catalog.js';
import { operationKindOf } from '../../cts/src/index.js';

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
  preset: {},
  ...options
});

const definitionPaletteItem = (id, type, options = {}) => Object.freeze({
  id,
  type,
  label: id,
  description: id,
  icon: 'pi pi-circle-fill',
  preset: {},
  ...options
});

// This is an authoring catalog, not the runtime operation catalog. Runtime-only
// coercions and plumbing are deliberately absent: the connection planner owns
// those operations and may insert them when two compatible sockets are joined.
export const PROCESS_DESIGNER_PALETTE_GROUPS = Object.freeze([
  {
    id: 'operations',
    items: [
      paletteItem('construct', 'cts.construct', { preset: { via: 'genericCreate' } }),
      paletteItem('mutate', 'cts.mutate'),
      paletteItem('transition', 'cts.transition'),
      paletteItem('remove', 'cts.remove'),
      paletteItem('runService', 'cts.command'),
      definitionPaletteItem('defineStatus', 'statusDefinition'),
      paletteItem('joinProducers', 'cts.join'),
      paletteItem('currentInstance', 'cts.read', { preset: { select: 'current' } }),
      paletteItem('findById', 'cts.read', { preset: { select: 'byId' } }),
      paletteItem('findByReference', 'cts.read', { preset: { select: 'byRef' } }),
      paletteItem('parentInstance', 'cts.read', { preset: { select: 'parent' } }),
      paletteItem('childInstances', 'cts.read', { preset: { select: 'children' } }),
      paletteItem('relatedInstances', 'cts.read', { preset: { select: 'related' } }),
      paletteItem('queryInstances', 'cts.read', { preset: { select: 'query' } }),
      paletteItem('readField', 'cts.field'),
      paletteItem('composeFields', 'cts.compose', { preset: { mode: 'compose' } }),
      paletteItem('decomposeInstance', 'cts.decompose'),
      definitionPaletteItem('typeReference', 'ctsType')
    ]
  },
  {
    id: 'values',
    items: [
      paletteItem('valueInput', 'source.literalItem', { preset: { type: { base: 'string', nullable: false }, access: 'item', value: '' } }),
      paletteItem('logic', 'value.logic', { preset: { type: { base: 'string', nullable: true }, operation: 'eq' } }),
      paletteItem('text', 'value.string', { preset: { type: { base: 'string', nullable: false }, operation: 'concat' } }),
      paletteItem('calculate', 'value.math', { preset: { type: { base: 'number', nullable: false } } }),
      paletteItem('date', 'value.dateTime', {
        preset: {
          type: { base: 'dateTime', nullable: false },
          operation: 'addDays',
          inputDefaults: { amount: 30 }
        }
      })
    ]
  },
  {
    id: 'listTree',
    items: [
      paletteItem('makeList', 'collection.makeList'),
      paletteItem('collectArray', 'collection.packArray'),
      paletteItem('expandArray', 'collection.unpackArray'),
      paletteItem('joinLists', 'collection.concat'),
      paletteItem('itemAtPosition', 'collection.itemAt'),
      paletteItem('sliceList', 'collection.slice'),
      paletteItem('listCount', 'collection.count'),
      paletteItem('filterList', 'collection.filter'),
      paletteItem('sortItems', 'collection.sort'),
      paletteItem('dispatchItems', 'collection.dispatch'),
      paletteItem('removeDuplicates', 'collection.distinct'),
      paletteItem('groupItems', 'collection.groupBy')
    ]
  }
].map(group => Object.freeze({
  ...group,
  items: Object.freeze(group.items)
})));

export function syncProcessNodeProducerOutputs(data = {}, node = {}) {
  if (!node.id) return [];
  const pruneOwnOutputs = () => {
    const producerOutputs = data.producerOutputs ||= {};
    for (const [producerOutputId, output] of Object.entries(producerOutputs)) {
      if (output?.nodeId === node.id) delete producerOutputs[producerOutputId];
    }
  };
  // The explicit producer join routes its output under the producer output
  // its configuration selects; it must never become a producer anchor itself.
  if (operationKindOf(node) === 'producer.join') {
    pruneOwnOutputs();
    return [];
  }
  // Consumer effects transform entities that arrived over an input wire:
  // they own no producer output and carry no producer identity of their own.
  if (CONSUMER_EFFECT_KINDS.includes(operationKindOf(node))) {
    pruneOwnOutputs();
    delete node.producerOutputId;
    return [];
  }
  const outputs = (node.outputs || []).filter(output => (
    output?.id && output.type?.base === 'entity' && output.type?.entityType
  ));
  const producerOutputs = data.producerOutputs ||= {};
  const outputIds = new Set(outputs.map(output => `${node.id}:${output.id}`));

  for (const [producerOutputId, output] of Object.entries(producerOutputs)) {
    if (output?.nodeId === node.id && !outputIds.has(producerOutputId)) delete producerOutputs[producerOutputId];
  }

  for (const output of outputs) {
    const producerOutputId = `${node.id}:${output.id}`;
    producerOutputs[producerOutputId] = {
      ...producerOutputs[producerOutputId],
      producerOutputId,
      nodeId: node.id,
      outputSocketId: output.id,
      entityType: output.type.entityType,
      lifecycle: producerOutputs[producerOutputId]?.lifecycle || { mode: 'defaultCreated' },
      fields: producerOutputs[producerOutputId]?.fields || { read: [], write: [], private: [] }
    };
  }

  if (operationKindOf(node)?.startsWith('effect.') && outputIds.size === 1) {
    [node.producerOutputId] = outputIds;
  }
  return [...outputIds];
}

// Class groups from the registry view (the palette IS the type catalog):
// one group per CTS class, one item per type — dragging a type drops a
// construct bound to it via the preset. Party types are framework-owned and
// stay off the authoring palette.
export function typeCatalogPaletteGroups(typeView = []) {
  return ['file', 'item', 'group', 'process']
    .map(classOf => ({
      id: classOf,
      items: (typeView || [])
        .filter(entry => entry.class === classOf)
        // only constructible types are drag-constructible; derived products
        // enter graphs as operator outputs and meta types are configuration
        .filter(entry => entry.constructible !== false)
        .map(entry => paletteItem(`type:${entry.id}`, 'cts.construct', {
          label: entry.label || entry.id,
          description: entry.description || entry.label || entry.id,
          icon: entry.icon || iconForNode('cts.construct'),
          preset: { type: entry.id, via: entry.via || 'genericCreate' }
        }))
    }))
    .filter(group => group.items.length);
}

export function createProcessDesignerContract(domain = {}, capabilities = null, options = {}) {
  const entities = Array.isArray(domain.entities) ? domain.entities : [];
  const entityByType = new Map(entities.map(entity => [entity.type, entity]));

  function capabilityFor(entityType = '') {
    return capabilities ? (lookupEntityContract(capabilities, entityType) || null) : null;
  }

  function createModes(entityType = '') {
    if (capabilities) {
      const capability = capabilityFor(entityType);
      return Array.isArray(capability?.createModes) ? [...capability.createModes] : [];
    }
    const contract = lookupEntityContract(domain.construction, entityType);
    return contract && Array.isArray(contract.modes) ? [...contract.modes] : [];
  }

  function fieldPolicy(entityType = '') {
    return lookupEntityContract(domain.fieldAccess, entityType) || {};
  }

  function construction(entityType = '') {
    return lookupEntityContract(domain.construction, entityType) || null;
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

  function blockFields(block = '') {
    const schemas = block
      ? (domain.blockSchemas?.[block] || [])
      : Object.values(domain.blockSchemas || {}).flat();
    return schemas.map(schema => ({
      ...schema,
      label: schema.label || schema.path,
      value: schema.path
    }));
  }

  const paletteGroups = [
    ...typeCatalogPaletteGroups(options.typeView || []),
    ...PROCESS_DESIGNER_PALETTE_GROUPS.map(group => ({
      ...group,
      items: group.items.filter(item => !options.typeView || item.id !== 'construct')
    }))
  ];

  const entityOption = entity => ({ label: entity.label || entity.type, value: entity.type });

  const listableEntityOptions = entities
    .filter(entity => capabilities ? Boolean(capabilityFor(entity.type)?.list) : true)
    .map(entityOption);

  const readableEntityOptions = entities
    .filter(entity => capabilities ? Boolean(capabilityFor(entity.type)?.getById) : true)
    .map(entityOption);

  const createEntityOptions = entities
    .filter(entity => createModes(entity.type).length > 0)
    .map(entityOption);

  const updateEntityOptions = entities
    .filter(entity => capabilities
      ? Boolean(capabilityFor(entity.type)?.processUpdate)
      : (lookupEntityContract(domain.fieldSchemas, entity.type) || []).some(schema => schema.writable === true))
    .map(entityOption);

  const changeStatusOptions = entities
    .filter(entity => capabilities
      ? Boolean(capabilityFor(entity.type)?.statusMutation)
      : Boolean((domain.workflows || {})[entity.type]))
    .map(entityOption);

  const deleteEntityOptions = entities
    .filter(entity => capabilities && Boolean(capabilityFor(entity.type)?.delete))
    .map(entityOption);

  const archivableEntityOptions = entities
    .filter(entity => capabilities && Boolean(capabilityFor(entity.type)?.archive))
    .map(entityOption);

  const enabledPaletteGroups = paletteGroups.map(group => ({
    ...group,
    items: group.items.filter(item => (
      item.kind !== 'cts.remove' || deleteEntityOptions.length > 0
    ))
  }));

  return {
    domain,
    paletteGroups: enabledPaletteGroups,
    blocks: CANONICAL_ENTITY_BLOCKS.map(id => ({ id, label: id, ...BLOCK_PRESENTATION[id] })),
    entityOptions: entities.map(entityOption),
    listableEntityOptions,
    readableEntityOptions,
    createEntityOptions,
    createModes,
    updateEntityOptions,
    changeStatusOptions,
    deleteEntityOptions,
    archivableEntityOptions,
    workflowOptions: Object.entries(domain.workflows || {}).map(([entityType, workflow]) => ({ label: workflow.label || entityType, value: entityType })),
    commandOptions: definitionOptions(domain.commands),
    taskOptions: definitionOptions(domain.tasks),
    eventOptions: definitionOptions(domain.events),
    hookOptions: definitionOptions(domain.hooks),
    effectOptions: definitionOptions(domain.effects),
    attachmentKindOptions: Object.values(domain.attachmentKinds || {}).map(definition => ({
      label: `${definition.label || definition.name || definition.kind} · ${definition.creation?.mode || 'workflow'}`,
      value: definition.kind,
      creation: definition.creation || { mode: 'workflow' },
      editor: definition.editor || { mode: 'none' }
    })),
    entity: entityType => entityByType.get(entityType) || null,
    fieldPolicy,
    construction,
    blocksForEntity: blocks,
    fieldsForEntity: fields,
    fieldsForBlock: blockFields,
    blockComposition: block => domain.blockComposition?.[block] || null,
    blockFieldType: path => blockFields(String(path || '').split('.')[0])
      .find(field => field.value === path)?.type || {
        base: 'json',
        nullable: true
      },
    fieldType: (entityType, path) => fields(entityType).find(field => field.value === path)?.type || {
      base: 'json',
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
  if (kind.startsWith('value.')) return kind.includes('logic') || kind.includes('compare') ? 'pi pi-sitemap' : 'pi pi-sliders-h';
  if (kind.startsWith('collection.') || kind.startsWith('tree.')) return 'pi pi-list';
  if (kind.startsWith('record.')) return 'pi pi-box';
  if (kind.startsWith('predicate.')) return 'pi pi-filter';
  if (kind.startsWith('read.')) return 'pi pi-database';
  if (kind.startsWith('effect.')) return 'pi pi-bolt';
  return 'pi pi-directions';
}
