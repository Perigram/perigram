import { CANONICAL_ENTITY_BLOCKS } from '../../core/src/index.js';
import { CONSUMER_EFFECT_KINDS } from './node-catalog.js';
import { operationKindOf, describeType } from '../../cts/src/index.js';

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
    id: 'declarations',
    items: [
      definitionPaletteItem('class', 'ctsClass'),
      definitionPaletteItem('field', 'ctsField'),
      definitionPaletteItem('state', 'ctsState')
    ]
  },
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

// Declaration-plane wire legality (SPEC §20/§21 one tree): declaration
// canvas nodes wire only to declaration partners. Field/state nodes declare
// on a class node; class/type-reference nodes bind the `type` of a cts.*
// species record. Their typed port specs are authoring contracts for those
// wires only — a declaration node is never a value source, and no data node
// can feed a class declare input — so the generic data-socket compatibility
// path must never apply to them.
export const DECLARATION_NODE_TYPES = Object.freeze(['ctsClass', 'ctsType', 'ctsField', 'ctsState']);

export function declarationWireLegality({ sourceType = '', targetType = '', targetRecordKind = '' } = {}) {
  if ((sourceType === 'ctsField' || sourceType === 'ctsState') && targetType === 'ctsClass') return 'declares';
  if (sourceType === 'ctsClass' && targetType === 'ctsClass') return 'children';
  if (sourceType === 'ctsState' && targetType === 'ctsState') return 'transition';
  if ((sourceType === 'ctsClass' || sourceType === 'ctsType')
    && targetType === 'processNode'
    && String(targetRecordKind || '').startsWith('cts.')) return 'binds';
  return null;
}

// Tree declarations compile from the canvas vocabulary (SPEC §20/§21 one
// tree): class nodes with wired field/state nodes become registry
// declarations; state-to-state wires are transitions with intents;
// class-to-class wires are children edges with onRemove. Pure over the
// canvas arrays — the page supplies nodes/edges, the server re-validates
// through the real registry. States follow R4: exactly one initial when any
// state is declared; the compiler never picks a default.
export function compileTreeDeclarations(nodes = [], edges = []) {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const classes = nodes.filter(node => node.type === 'ctsClass' && node.data?.typeId);
  const fieldsByType = new Map();
  const statesByType = new Map();
  const transitionsByType = new Map();
  const childrenByType = new Map();
  const diagnostics = [];

  for (const edge of edges) {
    if (edge.role !== 'type') continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    if (edge.label === 'field' && source.type === 'ctsField' && target.type === 'ctsClass') {
      const map = fieldsByType.get(target.data.typeId) || new Map();
      const name = String(source.data.name || '').trim();
      if (name) {
        try {
          describeType(source.data.descriptor || {});
          map.set(name, { ...(source.data.descriptor || {}) });
        } catch (error) {
          diagnostics.push(`type ${target.data.typeId}: field ${name}: ${error.message}`);
        }
      }
      fieldsByType.set(target.data.typeId, map);
    }
    if (edge.label === 'state' && source.type === 'ctsState' && target.type === 'ctsClass') {
      const map = statesByType.get(target.data.typeId) || new Map();
      const value = String(source.data.value || '').trim();
      if (value) {
        map.set(value, { initial: source.data.initial === true, terminal: source.data.terminal === true });
      }
      statesByType.set(target.data.typeId, map);
    }
    if (edge.label === 'transition' && source.type === 'ctsState' && target.type === 'ctsState') {
      const typeId = source.data?.typeId;
      if (!typeId || typeId !== target.data?.typeId) {
        diagnostics.push(`transition ${source.data?.value || '(state)'} -> ${target.data?.value || '(state)'}: states of one declared type only`);
        continue;
      }
      const list = transitionsByType.get(typeId) || [];
      const intent = String(edge.data?.intent || '').trim();
      list.push({ from: String(source.data.value || ''), to: String(target.data.value || ''), ...(intent ? { intent } : {}) });
      transitionsByType.set(typeId, list);
    }
    if (edge.label === 'children' && source.type === 'ctsClass' && target.type === 'ctsClass') {
      const parentTypeId = source.data?.typeId;
      const childTypeId = target.data?.typeId;
      if (!parentTypeId || !childTypeId) {
        diagnostics.push('children wire requires both classes to carry a type id');
        continue;
      }
      const map = childrenByType.get(parentTypeId) || new Map();
      const key = String(edge.data?.key || `${childTypeId}s`).trim();
      const entry = map.get(key) || { types: [], onRemove: edge.data?.onRemove || 'restrict' };
      if (!entry.types.includes(childTypeId)) entry.types.push(childTypeId);
      map.set(key, entry);
      childrenByType.set(parentTypeId, map);
    }
  }

  const declarations = classes.map(classNode => {
    const typeId = classNode.data.typeId;
    const states = statesByType.get(typeId) || new Map();
    const declaration = {
      id: typeId,
      class: classNode.data.class,
      fields: Object.fromEntries([...(fieldsByType.get(typeId) || new Map()).entries()]),
      ...(classNode.data.payload ? { payload: classNode.data.payload } : {})
    };
    if (states.size) {
      const initial = [...states.entries()].filter(([, flags]) => flags.initial).map(([value]) => value);
      if (initial.length !== 1) {
        diagnostics.push(`type ${typeId}: mark exactly one initial state (R4) — got ${initial.length}`);
      } else {
        declaration.states = {
          main: {
            initial: initial[0],
            values: [...states.keys()],
            terminal: [...states.entries()].filter(([, flags]) => flags.terminal).map(([value]) => value)
          }
        };
        const declared = new Set(states.keys());
        declaration.transitions = (transitionsByType.get(typeId) || [])
          .filter(transition => declared.has(transition.from) && declared.has(transition.to))
          .map(({ from, to, intent }) => (intent ? { from, to, intent } : { from, to }));
      }
    }
    const children = childrenByType.get(typeId);
    if (children?.size) declaration.edges = { children: Object.fromEntries(children.entries()) };
    return declaration;
  });

  return { declarations, diagnostics };
}

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

// Services group from the operator registry (SPEC §8 s species): one item
// per registered service — dropping one binds the operator; the executable
// twin is the operator's declared command.
export function servicesPaletteGroups(services = []) {
  const items = (services || [])
    .filter(service => service?.id && service.command)
    .map(service => paletteItem(`service:${service.id}`, 'cts.service', {
      label: service.render?.label || service.id,
      description: service.render?.label || service.id,
      icon: service.render?.icon || 'pi pi-bolt',
      preset: { operator: service.id }
    }));
  return items.length ? [{ id: 'services', items }] : [];
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
    ...servicesPaletteGroups(options.services || []),
    ...PROCESS_DESIGNER_PALETTE_GROUPS.map(group => ({
      ...group,
      items: group.items
    }))
  ];

  const entityOption = entity => ({ label: entity.label || entity.type, value: entity.type });

  const listableEntityOptions = entities
    .filter(entity => capabilities ? Boolean(capabilityFor(entity.type)?.list) : true)
    .map(entityOption);

  const readableEntityOptions = entities
    .filter(entity => capabilities ? Boolean(capabilityFor(entity.type)?.getById) : true)
    .map(entityOption);

  // Capability-gated with a declaration fallback: view types (pack, org)
  // synthesize construction and are served by the generic instance
  // services, so a missing capability entry means constructible, not dead —
  // legacy services keep their explicit capability truth.
  const constructible = entityType => {
    if (!capabilities) return createModes(entityType).length > 0;
    const capability = capabilityFor(entityType);
    if (capability) return (capability.createModes?.length || 0) > 0;
    return createModes(entityType).length > 0;
  };
  const createEntityOptions = entities
    .filter(entity => constructible(entity.type))
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
    editors: (options.editors || []).map(editor => ({ ...editor })),
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
