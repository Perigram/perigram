import { CANONICAL_ENTITY_BLOCKS } from '../../core/src/index.js';
import { CONSUMER_EFFECT_KINDS, TYPE_BOUND_SPECIES, TYPE_PIN_SPECIES } from './node-catalog.js';
import { operationKindOf, describeType, normalizeOperator, typeIdOf, ctsFieldToProcessType } from '../../cts/src/index.js';
// Single vocabulary seam: the species/operation table is re-exported, never
// imported from the type system package directly by app surfaces.
export { operationKindOf };
import { migrateV4Definition, resolveCtsDefinition, checkCtsGraphBindings, isCtsGraphDefinition } from '../../cts/src/index.js';
import { processType } from './types.js';

// The single authored-definition seam (SPEC §20): every consumer of an
// authored graph — server validation/activation, canvas round trip —
// flows through here. v4 graphs migrate one-way to the species
// vocabulary (legacy `type` strings normalize to `typeId`), binding
// checks run beside it, and lowering to the executable working shapes
// happens exactly once, internally. Nothing outside this package
// resolves or lowers the vocabulary.
export function migrateProcessDefinition(data = {}, domain = {}) {
  return migrateV4Definition(data, domain);
}

export function prepareAuthoredDefinition(data = {}, domain = {}) {
  const wasCts = isCtsGraphDefinition(data);
  const { definition: migrated } = migrateV4Definition(data, domain);
  const { definition, diagnostics } = resolveCtsDefinition(migrated, domain);
  // Declaration-binding checks are the cts vocabulary's gate; v4-authored
  // graphs keep the compiler's own validation as their correctness gate.
  const errors = [...(wasCts ? checkCtsGraphBindings(migrated, domain) : []), ...diagnostics];
  return { definition, errors };
}

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
//
// Group structure: `types` (declaration authoring + the registry catalog),
// `operations` (the effect species over declarations), `instances` (reads),
// `structure` (field/record shaping), `values`, `listTree`. Services come
// from the projected domain's `serviceContracts` — the registered operator
// surface — never from a legacy command table: running a service means
// dropping its registered item, so there is no separate "run service"
// operation against the legacy command registry.
export const TYPE_AUTHORING_PALETTE_ITEMS = Object.freeze([
  definitionPaletteItem('class', 'ctsClass'),
  definitionPaletteItem('field', 'ctsField'),
  definitionPaletteItem('state', 'ctsState'),
  definitionPaletteItem('typeReference', 'ctsType')
].map(Object.freeze));

export const PROCESS_DESIGNER_PALETTE_GROUPS = Object.freeze([
  {
    id: 'types',
    items: TYPE_AUTHORING_PALETTE_ITEMS
  },
  {
    id: 'operations',
    items: [
      paletteItem('construct', 'cts.construct', { preset: { via: 'genericCreate' } }),
      paletteItem('mutate', 'cts.mutate'),
      paletteItem('transition', 'cts.transition'),
      paletteItem('remove', 'cts.remove'),
      paletteItem('joinProducers', 'cts.join')
    ]
  },
  {
    id: 'instances',
    items: [
      paletteItem('contextEntity', 'cts.read', { preset: { select: 'current' } }),
      paletteItem('findEntityById', 'cts.read', { preset: { select: 'byId' } }),
      paletteItem('findEntityByReference', 'cts.read', { preset: { select: 'byRef' } }),
      paletteItem('parentEntity', 'cts.read', { preset: { select: 'parent' } }),
      paletteItem('childEntities', 'cts.read', { preset: { select: 'children' } }),
      paletteItem('relatedEntities', 'cts.read', { preset: { select: 'related' } }),
      paletteItem('queryEntities', 'cts.read', { preset: { select: 'query' } })
    ]
  },
  {
    id: 'structure',
    items: [
      paletteItem('readField', 'cts.field'),
      paletteItem('composeFields', 'cts.compose', { preset: { mode: 'compose' } }),
      paletteItem('decomposeInstance', 'cts.decompose')
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
  // Binding wires land on the Type pin — an origin-species socket. Consumer
  // species (mutate/transition/remove) carry no pin: their entity input
  // accepts instance streams only and their binding adapts to the stream's
  // type, so a declaration node never wires into it.
  if ((sourceType === 'ctsClass' || sourceType === 'ctsType')
    && targetType === 'processNode'
    && TYPE_PIN_SPECIES.includes(String(targetRecordKind))) return 'binds';
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
      // A sole wired state is necessarily the initial one — there is no
      // choice to make, so it is not a guess. Among several states the
      // author marks exactly one (R4); a missing or ambiguous mark is a
      // named diagnostic, never a default.
      if (initial.length > 1 || (states.size > 1 && initial.length === 0)) {
        diagnostics.push(`type ${typeId}: mark exactly one initial state (R4) — got ${initial.length}`);
      } else {
        declaration.states = {
          main: {
            initial: initial[0] || [...states.keys()][0],
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
    const operators = Array.isArray(classNode.data.operators) ? classNode.data.operators : [];
    if (operators.length) {
      declaration.operators = {};
      for (const operator of operators) {
        const id = String(operator.id || '').trim();
        const triggers = (operator.triggers || []).filter(trigger => String(trigger.event || trigger.schedule || '').trim());
        try {
          normalizeOperator({
            id,
            species: operator.species,
            input: operator.input || null,
            output: operator.output || null,
            triggers,
            declaringType: typeId
          });
          declaration.operators[id] = {
            species: operator.species,
            ...(operator.input ? { input: operator.input } : {}),
            ...(operator.output ? { output: operator.output } : {}),
            triggers
          };
        } catch (error) {
          diagnostics.push(`type ${typeId}: operator ${id || '(unnamed)'}: ${error.message}`);
        }
      }
    }
    return declaration;
  });

  return { declarations, diagnostics };
}

// Typed port specs for declaration canvas nodes: every handle a
// declaration node renders has a spec, exactly like operation nodes —
// fields output their declared type, states expose a status input (the
// transition-from handle) and a status output, classes accept declarations
// and offer a typed entityRef of the declared id, and a type reference
// offers the same typed output as a bound class. `types` is the
// designer's registry view (ctstype entries by id) for reference nodes.
export function declarationNodePorts(node = {}, types = []) {
  if (node.type === 'ctsClass') {
    return {
      inputSpecs: [{ id: 'declare', label: 'fields · states', role: 'data', type: processType('json'), access: 'item' }],
      outputSpecs: node.data?.typeId
        ? [{ id: 'type', label: node.data.typeId, role: 'data', type: processType('entityRef', { entityType: node.data.typeId }), access: 'item' }]
        : []
    };
  }
  if (node.type === 'ctsField') {
    return {
      inputSpecs: [],
      outputSpecs: [{
        id: 'field',
        label: node.data?.name || 'field',
        role: 'data',
        type: ctsFieldToProcessType(node.data?.descriptor || {}) || processType('json'),
        access: 'item'
      }]
    };
  }
  if (node.type === 'ctsState') {
    return {
      inputSpecs: [{ id: 'in', label: 'transition from', role: 'data', type: processType('status'), access: 'item' }],
      outputSpecs: [{ id: 'state', label: node.data?.value || 'state', role: 'data', type: processType('status'), access: 'item' }]
    };
  }
  if (node.type === 'ctsType') {
    const entry = types.find(candidate => candidate.id === node.data?.typeId);
    return {
      inputSpecs: [],
      outputSpecs: entry
        ? [{ id: 'type', label: entry.id, role: 'data', type: processType('entityRef', { entityType: entry.id }), access: 'item' }]
        : []
    };
  }
  return null;
}

// Live interpretation of declaration wires (SPEC §20/§21 one tree): the
// wire IS the binding channel, evaluated on every graph change — not a
// write-once gesture. A field/state node's type id follows the class it
// declares on. A species record's binding resolves by precedence:
// 1. an explicit binds wire (class/type reference -> record): the source's
//    type id, live — renaming the source re-binds every wired descendant;
// 2. for consumer species (no Type pin), the entity input's source type —
//    `resolvers.entityInputType(recordId)` supplies it from the designer's
//    port resolution, so plugging an entity stream into an unbound
//    mutate/transition/remove adapts it to that type;
// 3. the stored binding (palette preset, migration) — authored data.
// Removing the channel that supplied a binding clears it. Pure over the
// canvas arrays: returns only the mutations that differ from current
// state, so an unchanged graph evaluates to no writes.
export function interpretDeclarationEdges(nodes = [], edges = [], records = {}, previousBindings = {}, resolvers = {}) {
  const mutations = [];
  const bindings = {};
  const fieldCounts = new Map();
  const stateCounts = new Map();
  const declaredBy = new Map();
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const bindEdges = [];

  for (const edge of edges) {
    if (edge.role !== 'type') continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    if ((source.type === 'ctsField' || source.type === 'ctsState') && target.type === 'ctsClass') {
      declaredBy.set(source.id, target.id);
      if (source.type === 'ctsField') fieldCounts.set(target.id, (fieldCounts.get(target.id) || 0) + 1);
      else stateCounts.set(target.id, (stateCounts.get(target.id) || 0) + 1);
    } else if ((source.type === 'ctsClass' || source.type === 'ctsType') && target.type === 'processNode') {
      bindEdges.push([source, target]);
    }
  }

  for (const node of nodes) {
    if (node.type === 'ctsField' || node.type === 'ctsState') {
      const classNode = declaredBy.has(node.id) ? nodeById.get(declaredBy.get(node.id)) : null;
      const value = classNode?.data?.typeId || null;
      if ((node.data?.typeId ?? null) !== value) {
        mutations.push({ scope: 'node', nodeId: node.id, key: 'typeId', value });
      }
    }
    if (node.type === 'ctsClass') {
      const fields = fieldCounts.get(node.id) || 0;
      const states = stateCounts.get(node.id) || 0;
      if (node.data?.fields !== fields) mutations.push({ scope: 'node', nodeId: node.id, key: 'fields', value: fields });
      if (node.data?.states !== states) mutations.push({ scope: 'node', nodeId: node.id, key: 'states', value: states });
    }
  }

  const entityBound = new Set();
  for (const [source, target] of bindEdges) {
    const record = records[target.data?.refId];
    if (record && TYPE_BOUND_SPECIES.includes(String(record.kind || ''))) {
      bindings[record.id] = source.data?.typeId || '';
      entityBound.add(record.id);
    }
  }
  if (typeof resolvers.entityInputType === 'function') {
    for (const record of Object.values(records)) {
      if (entityBound.has(record.id)) continue;
      if (!TYPE_BOUND_SPECIES.includes(String(record.kind || '')) || TYPE_PIN_SPECIES.includes(record.kind)) continue;
      const fromWire = resolvers.entityInputType(record.id);
      if (fromWire) bindings[record.id] = fromWire;
    }
  }
  // A channel removed since the last evaluation unbinds the record it
  // carried (unless another channel or an authored preset supplies one).
  for (const [recordId] of Object.entries(previousBindings)) {
    if (bindings[recordId] === undefined && records[recordId]) bindings[recordId] = '';
  }
  for (const [recordId, typeId] of Object.entries(bindings)) {
    const record = records[recordId];
    if (!record) continue;
    if (typeIdOf(record) !== typeId) {
      mutations.push({ scope: 'record', recordId, key: 'typeId', value: typeId });
    }
  }

  return { mutations, bindings };
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
// twin is the operator's declared command. The projected domain's
// `serviceContracts` is the single source: what is not registered is not
// offered.
export function servicesPaletteGroups(serviceContracts = {}) {
  const items = Object.values(serviceContracts || {})
    .filter(service => service?.id && service.command)
    .map(service => paletteItem(`service:${service.id}`, 'cts.service', {
      label: service.render?.label || service.id,
      description: service.render?.label || service.id,
      icon: service.render?.icon || 'pi pi-bolt',
      preset: { operator: service.id }
    }));
  return items.length ? [{ id: 'services', items }] : [];
}

// Type catalog palette (SPEC §20/§21, L2): registry types are draggable
// composables — one bound construct per constructible type, plus one
// variant per declared construct operator (the org-authored `via`). One
// group beside the declaration items, labeled by the item's class in the
// description.
export function typeCatalogPaletteGroups(types = []) {
  const items = [];
  for (const entry of types) {
    if (!entry?.constructible) continue;
    items.push(paletteItem(entry.id, 'cts.construct', {
      label: entry.label || entry.id,
      icon: entry.icon,
      description: entry.description || entry.id,
      preset: { typeId: entry.id, via: entry.via || 'genericCreate' }
    }));
    for (const operatorId of entry.constructOperators || []) {
      items.push(paletteItem(`${entry.id}:${operatorId}`, 'cts.construct', {
        label: `${entry.label || entry.id} · ${operatorId}`,
        icon: entry.icon,
        description: entry.description || entry.id,
        preset: { typeId: entry.id, via: operatorId }
      }));
    }
  }
  return items.length ? [{ id: 'types', items: Object.freeze(items) }] : [];
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
    ...servicesPaletteGroups(domain.serviceContracts || {}),
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
