// Headless definition authoring (the one authoring seam): composing a
// process definition is data work with designer semantics — palette-item
// drops (record factory + preset), record configuration (the writes the
// inspector performs), and port-gated connections (the same compatibility
// gate the canvas applies). The designer page is a presentation adapter
// over this module; everything authorable in the browser is authorable
// without one. A palette item that cannot be dropped, configured, and
// round-tripped through this seam is a defect (authoring.spec.js pins it).
import { operationKindOf, typeIdOf, setTypeBinding } from '../../cts/src/index.js';
import { createProcessDesignerContract, syncProcessNodeProducerOutputs } from './designer.js';
import { constructionInputsForContract, resolveCatalogNodePorts } from './node-catalog.js';
import { mintProcessSocketHandle, parseProcessSocketHandleId, PROCESS_DATAFLOW_VERSION } from './ports.js';
import { processSocketsCompatible, processType } from './types.js';

// Designer access-row normalization: explicit { roleId, level } grant rows
// over a legacy flat roleIds list, one rank order shared by every surface
// that renders or merges access.
export const ACCESS_LEVEL_RANK = Object.freeze({ read: 1, write: 2, admin: 3 });

export function normalizeAccessLevel(level) {
  return ['read', 'write', 'admin'].includes(level) ? level : 'write';
}

export function normalizeDesignerAccess(access = {}) {
  const level = normalizeAccessLevel(access?.level);
  const grants = Array.isArray(access?.grants)
    ? access.grants
      .filter(grant => grant?.roleId)
      .map(grant => ({ ...grant, roleId: grant.roleId, level: normalizeAccessLevel(grant.level || level) }))
    : (access?.roleIds || []).map(roleId => ({ roleId, level }));
  const normalizedLevel = grants.reduce((current, grant) => (
    ACCESS_LEVEL_RANK[grant.level] > ACCESS_LEVEL_RANK[current] ? grant.level : current
  ), level);
  return {
    level: normalizedLevel,
    roleIds: [...new Set(grants.map(grant => grant.roleId))],
    grants
  };
}

const PROCESS_NODE_OPERATIONS = {
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
  return (PROCESS_NODE_OPERATIONS[kind] || [''])[0] || '';
}

export const PROCESS_NODE_OPERATIONS_BY_KIND = PROCESS_NODE_OPERATIONS;

const MANAGED_PROCESS_BLOCKS = new Set(['origin', 'status', 'provenance', 'summary']);

// The record factory: seeds only keys every record genuinely carries.
// Kind-specific envelopes (construction, state) land in their own branches
// and are filled by the sync pass, not the factory. No default bindings —
// nodes stay unbound until the author binds them.
export function createProcessNodeRecord(id, kind = 'source.literalItem', { defaultEntityTypeId = '' } = {}) {
  const op = operationKindOf({ kind });
  const nativeSpecies = String(kind || '').startsWith('cts.');
  const createLike = ['effect.createEntity', 'effect.runProducer'].includes(op);
  const node = {
    id,
    kind,
    typeId: '',
    icon: iconForProcessNode(kind),
    inputs: [],
    outputs: []
  };
  if (!nativeSpecies) {
    node.operation = defaultProcessNodeOperation(kind);
    node.value = op === 'source.literalList' ? [] : op === 'source.literalTree' ? { branches: [] } : null;
    node.fields = [];
  }
  if (createLike) node.construction = { mode: 'genericCreate', inputs: [] };
  return node;
}

// The record sync pipeline over a designer contract: defaults, envelopes,
// binding normalization, and port resolution in the fixed order later steps
// read from — idempotent, so repeated passes converge. `portLabel` is the
// presentation hook (the page decorates i18n labels; headless authoring
// keeps raw labels).
export function createProcessRecordSync({ contract, defaultEntityTypeId = () => '', portLabel = null }) {
  const domain = contract.domain;

  function catalogContext(node = {}) {
    const bound = typeIdOf(node);
    const fields = node.kind === 'cts.field' || bound
      ? contract.fieldsForEntity(bound)
      : [];
    return {
      fieldSchema: fields.find(field => field.path === (node.inputDefaults?.field || node.path)) || null,
      fieldSchemas: fields,
      command: domain.commands?.[node.commandId] || null,
      domain
    };
  }

  function catalogPorts(record) {
    return resolveCatalogNodePorts(record, catalogContext(record));
  }

  function decorate(node, ports) {
    if (!portLabel) return ports;
    return ports.map(port => ({ ...port, label: portLabel(node, port) }));
  }

  function constructibleEntityBlocks(typeId = '') {
    const fieldBlocks = contract.fieldsForEntity(typeId)
      .filter(field => field.constructible !== false)
      .map(field => field.block)
      .filter(block => block && !MANAGED_PROCESS_BLOCKS.has(block));
    const openBlocks = contract.blocksForEntity(typeId)
      .map(block => block.id)
      .filter(block => contract.blockComposition(block) && !MANAGED_PROCESS_BLOCKS.has(block));
    return [...new Set([...fieldBlocks, ...openBlocks])];
  }

  function normalizeProcessNodeDefaults(node = {}) {
    node.kind ||= 'source.literalItem';
    const op = operationKindOf(node);
    const nativeSpecies = String(node.kind || '').startsWith('cts.');
    if (nativeSpecies) {
      delete node.operation;
      delete node.matching;
      delete node.inputTransforms;
      delete node.selectedProducerOutputId;
      delete node.value;
      delete node.fields;
      if (typeof node.type === 'string') delete node.type;
    } else if (op === 'collection.sort') {
      node.direction = ['asc', 'desc'].includes(node.direction) ? node.direction : 'asc';
      delete node.operation;
    } else {
      node.operation ||= defaultProcessNodeOperation(node.kind);
    }
    if (!nativeSpecies) {
      node.type = node.type?.base ? processType(node.type.base, node.type) : processType('json');
    }
    if (!op.startsWith('effect.')) {
      node.access = node.kind === 'source.literalList' ? 'list' : node.kind === 'source.literalTree' ? 'tree' : (node.access || 'item');
    }
    node.icon = iconForProcessNode(node.kind);
    delete node.retry;
    delete node.status;
  }

  function seedLiteralEntityBinding(node = {}) {
    if (operationKindOf(node) !== 'source.literalItem' || node.type?.base !== 'entityRef') return;
    const seeded = defaultEntityTypeId();
    node.typeId ||= seeded;
    node.type.typeId = node.typeId;
    if (node.value?.id) node.value = { ...node.value, type: node.typeId };
  }

  function normalizeEffectEnvelope(node = {}) {
    if (!operationKindOf(node).startsWith('effect.')) return;
    node.access = normalizeDesignerAccess(node.access);
    node.entryTriggerId = node.id;
  }

  function syncProcessNodeConstruction(node = {}) {
    const contractForType = contract.construction(typeIdOf(node)) || {};
    const modes = contractForType.modes?.length ? contractForType.modes : ['genericCreate'];
    node.construction ||= {};
    if (!node.construction.mode && node.via && modes.includes(node.via)) {
      node.construction.mode = node.via;
    }
    if (node.via !== undefined) delete node.via;
    if (!modes.includes(node.construction.mode)) {
      node.construction.mode = contractForType.defaultMode && modes.includes(contractForType.defaultMode)
        ? contractForType.defaultMode
        : modes[0];
    }
    node.construction.inputs = constructionInputsForContract(contractForType, node.construction.mode)
      .map(input => ({ ...input }));
  }

  function normalizeCreateEnvelope(node = {}) {
    const op = operationKindOf(node);
    const nativeSpecies = String(node.kind || '').startsWith('cts.');
    if (['effect.createEntity', 'effect.runProducer'].includes(op)) {
      syncProcessNodeConstruction(node);
      if (nativeSpecies) delete node.state;
    }
    if (op === 'effect.createEntity' && !nativeSpecies) {
      node.blocks = constructibleEntityBlocks(typeIdOf(node));
      node.fields = [];
    }
  }

  function relationKeysForEntity(typeId = '') {
    return (domain.relations || []).filter(relation => relation.ownerType === typeId);
  }

  function normalizeBindingDefaults(node = {}) {
    if (node.kind === 'cts.field') {
      if (!node.typeId && node.type?.typeId) node.typeId = node.type.typeId;
      delete node.fieldSchemas;
      delete node.fieldSchema;
      const bound = typeIdOf(node);
      const available = bound
        ? contract.fieldsForEntity(bound).filter(field => field.readable !== false)
        : [];
      if (!available.some(field => field.value === node.path)) node.path = available[0]?.value || '';
    } else {
      // `value.recordField` owns an authored key path (plain records have
      // no declared row to select from); every other kind carries no path.
      if (node.kind !== 'value.recordField') node.path = '';
      delete node.fieldSchemas;
      delete node.fieldSchema;
    }
    if (node.kind === 'cts.read' && node.select === 'related') {
      const relations = relationKeysForEntity(typeIdOf(node));
      if (!relations.some(relation => relation.key === node.relationKey)) node.relationKey = relations[0]?.key || '';
    }
  }

  function resolveProcessNodePorts(node = {}, draftData = {}) {
    node.label = node.kind;
    node.inputs = decorate(node, catalogPorts(node).inputs);
    node.outputs = decorate(node, catalogPorts(node).outputs);
    syncProcessNodeProducerOutputs(draftData, node);
    node.inputDefaults ||= {};
    const inputIds = new Set(node.inputs.map(input => input.id));
    for (const inputId of Object.keys(node.inputDefaults)) {
      if (!inputIds.has(inputId)) delete node.inputDefaults[inputId];
    }
  }

  function syncProcessNode(node = {}, { draftData = {} } = {}) {
    normalizeProcessNodeDefaults(node);
    seedLiteralEntityBinding(node);
    normalizeEffectEnvelope(node);
    normalizeCreateEnvelope(node);
    normalizeBindingDefaults(node);
    resolveProcessNodePorts(node, draftData);
  }

  return {
    catalogContext,
    catalogPorts,
    relationKeysForEntity,
    constructibleEntityBlocks,
    syncProcessNode
  };
}

// Connection type propagation: connecting a typed source into a
// type-carrying socket writes the source's element type onto the target
// record — the same gesture the canvas performs. Generic collection
// kinds, logic, and the string/math/dateTime value nodes carry their
// operand type on the record; everything else resolves from its own
// contract.
const TYPE_PROPAGATING_INPUTS = {
  'value.logic': ['left', 'value', '']
};

export function propagateConnectionType(targetRecord = {}, targetInput = '', sourcePort = null) {
  if (!sourcePort?.type) return;
  const kind = targetRecord.kind || '';
  const input = String(targetInput || '');
  const generic = TYPE_PROPAGATING_INPUTS[kind]?.includes(input)
    || (['collection.makeList', 'collection.concat', 'collection.itemAt', 'collection.slice', 'collection.count', 'collection.distinct',
      'collection.sort', 'collection.groupBy', 'collection.filter', 'collection.packArray', 'collection.unpackArray',
      'collection.reverse', 'collection.shift', 'collection.partition', 'collection.dispatch', 'control.forEach',
      'tree.flatten', 'tree.graft', 'tree.simplify', 'tree.branch', 'tree.zip', 'tree.unzip', 'tree.cross',
      'tree.transpose'].includes(kind) && ['', 'value', 'items', 'tree', 'left'].includes(input))
    || (['value.string', 'value.math', 'value.dateTime'].includes(kind) && ['left', 'text', 'date', 'value', ''].includes(input));
  if (generic) targetRecord.type = { ...sourcePort.type };
}

// Compose a definition the way the designer does. Drops create records
// from palette items (the loop item creates its pair — the closer is part
// of loop semantics), configure writes record semantics (the inspector's
// writes), connect is the port-gated wire gesture, and definition()
// returns the authored data ready for validation/activation.
export function createDefinitionAuthoring(domain, capabilities = null) {
  const contract = createProcessDesignerContract(domain, capabilities);
  const defaultEntityTypeId = () => contract.entityOptions[0]?.value || '';
  const sync = createProcessRecordSync({ contract, defaultEntityTypeId });

  const data = {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graphProtocol: 5,
    graph: { nodes: [], edges: [] },
    roleGrants: {},
    producerOutputs: {},
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {}
  };

  function paletteItem(itemId) {
    return contract.paletteGroups
      .flatMap(group => group.items)
      .find(item => item.id === itemId) || null;
  }

  function recordOf(recordId) {
    return data.processNodes[recordId] || null;
  }

  function registerNode(recordId) {
    if (!data.graph.nodes.some(node => node.id === recordId)) {
      data.graph.nodes.push({ id: recordId, type: 'processNode', data: { refId: recordId } });
    }
  }

  function createFromItem(itemId, recordId) {
    const item = paletteItem(itemId);
    if (!item?.kind) throw new Error(`No palette item ${itemId}`);
    const id = recordId || itemId;
    const record = createProcessNodeRecord(id, item.kind, { defaultEntityTypeId });
    Object.assign(record, structuredClone(item.preset || {}));
    data.processNodes[id] = record;
    registerNode(id);
    syncProcessNode(id);
    return record;
  }

  // The loop pair: forEach and its forEachEnd closer. The closer is loop
  // vocabulary, not an independent authoring choice.
  const PAIRED_DROPS = { 'control.forEach': 'control.forEachEnd' };

  function drop(itemId, { id } = {}) {
    const record = createFromItem(itemId, id);
    const pairedKind = PAIRED_DROPS[record.kind];
    if (pairedKind) {
      const closerId = `${record.id}End`;
      const closer = createProcessNodeRecord(closerId, pairedKind, { defaultEntityTypeId });
      data.processNodes[closerId] = closer;
      registerNode(closerId);
      syncProcessNode(closerId);
      return [record, closer];
    }
    return record;
  }

  function configure(recordId, updates = {}) {
    const record = recordOf(recordId);
    if (!record) throw new Error(`No process node ${recordId}`);
    const currentTypeId = typeIdOf(record);
    if (updates.typeId && updates.typeId !== currentTypeId) {
      record.path = '';
      record.relationKey = '';
    }
    const { typeId, ...rest } = updates;
    Object.assign(record, rest);
    if (typeId !== undefined) setTypeBinding(record, typeId);
    syncProcessNode(recordId);
    return record;
  }

  // An authored socket fallback: the scalar is stored as one broadcast
  // item, the packet shape every consumer of inputDefaults reads.
  function setInputDefault(recordId, socketId, value) {
    const record = recordOf(recordId);
    if (!record) throw new Error(`No process node ${recordId}`);
    const inputDefaults = { ...(record.inputDefaults || {}) };
    if (value == null || value === '') delete inputDefaults[socketId];
    else inputDefaults[socketId] = { branches: [{ path: [], items: [value] }] };
    record.inputDefaults = inputDefaults;
    syncProcessNode(recordId);
    return record;
  }

  function portOf(record, portId, direction) {
    const ports = sync.catalogPorts(record)[direction === 'output' ? 'outputs' : 'inputs'];
    return ports.find(port => port.id === portId) || null;
  }

  function connectedInputHandles(recordId) {
    return data.graph.edges
      .filter(edge => edge.target === recordId)
      .map(edge => parseProcessSocketHandleId(edge.targetHandle))
      .filter(Boolean);
  }

  // The connect gesture: data ports go through the shared compatibility
  // gate; control ports pair by role. Single-value inputs reject a second
  // wire. Effects derive their trigger mode from the event input's wire.
  function connect(sourceId, sourcePortId, targetId, targetPortId) {
    const source = recordOf(sourceId);
    const target = recordOf(targetId);
    if (!source || !target) throw new Error(`connect requires composed nodes (${sourceId} → ${targetId})`);
    const sourcePort = portOf(source, sourcePortId, 'output');
    const targetPort = portOf(target, targetPortId, 'input');
    if (!sourcePort || !targetPort) {
      throw new Error(`Unknown port ${!sourcePort ? `${sourceId}:${sourcePortId}` : `${targetId}:${targetPortId}`}`);
    }
    if (sourcePort.role !== 'data') {
      if (targetPort.role === 'data') {
        throw new Error(`Incompatible ports ${sourceId}:${sourcePortId} → ${targetId}:${targetPortId} — control into a data socket`);
      }
    } else {
      const compatibility = processSocketsCompatible(sourcePort, targetPort);
      if (!compatibility.ok) {
        throw new Error(`Incompatible ports ${sourceId}:${sourcePortId} → ${targetId}:${targetPortId}${compatibility.reason ? ` — ${compatibility.reason}` : ''}`);
      }
    }
    const id = `e-${sourceId}-${sourcePortId}-${targetId}-${targetPortId}`;
    if (data.graph.edges.some(edge => edge.id === id)) return data.graph.edges.find(edge => edge.id === id);
    if (targetPort.multiple !== true) {
      const occupied = connectedInputHandles(targetId).includes(targetPortId);
      if (occupied) throw new Error(`Socket ${targetId}:${targetPortId} accepts one wire`);
    }
    propagateConnectionType(target, targetPortId, sourcePort);
    const edge = {
      id,
      source: sourceId,
      target: targetId,
      sourceHandle: mintProcessSocketHandle(sourcePort),
      targetHandle: mintProcessSocketHandle(targetPort)
    };
    data.graph.edges.push(edge);
    syncProcessNode(targetId);
    return edge;
  }

  function syncProcessNode(recordId) {
    const record = recordOf(recordId);
    if (!record) throw new Error(`No process node ${recordId}`);
    sync.syncProcessNode(record, { draftData: data });
    // Trigger mode derives from the graph, never authored: an effect
    // runs automatically iff its event input is wired (the page derives
    // the same fact from canvas edges).
    if (operationKindOf(record).startsWith('effect.')) {
      const wired = data.graph.edges.some(edge => (
        edge.target === recordId && parseProcessSocketHandleId(edge.targetHandle) === 'in'
      ));
      record.trigger = { mode: wired ? 'event' : 'manual' };
    }
    return record;
  }

  return {
    contract,
    paletteItem,
    drop,
    configure,
    setInputDefault,
    connect,
    record: recordOf,
    records: data.processNodes,
    edges: data.graph.edges,
    sync: syncProcessNode,
    definition: () => structuredClone(data)
  };
}
