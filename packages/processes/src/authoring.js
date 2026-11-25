// Headless definition authoring (the one authoring seam): composing a
// process definition is data work with designer semantics — palette-item
// drops (record factory + preset), record configuration (the writes the
// inspector performs), and port-gated connections (the same compatibility
// gate the canvas applies). The designer page is a presentation adapter
// over this module. A palette item that cannot be dropped, configured,
// and round-tripped through this seam is a defect (authoring.spec.js).
import { operationKindOf, typeIdOf, setTypeBinding, normalizeRowRelativeGuard } from '@perigram/cts';
import { PROCESS_OPERATION_REGISTRY } from './operations.js';
import {
  createProcessDesignerContract,
  declarationWireLegality,
  effectTriggerFor,
  interpretDeclarationEdges,
  syncProcessNodeProducerOutputs
} from './designer.js';
import { constructionInputsForContract, EFFECT_SPECIES_KINDS, resolveCatalogNodePorts } from './node-catalog.js';
import { mintProcessSocketHandle, parseProcessSocketHandleId, PROCESS_DATAFLOW_VERSION } from './ports.js';
import { authoredSocketDefault } from './data-tree.js';
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

// One home per polymorphic operation (SPEC §8 atomicity law): the
// operation registry owns the operation lists; only kinds with a
// non-registry discriminator (sort's direction) carry fixed entries here.
const PROCESS_NODE_OPERATIONS = {
  ...Object.fromEntries(Object.entries(PROCESS_OPERATION_REGISTRY)
    .map(([kind, operations]) => [kind, Object.keys(operations)])),
  'collection.sort': ['asc', 'desc']
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
  if (kind.startsWith('cts.payload')) return 'pi pi-file-edit';
  if (kind.startsWith('cts.command')) return 'pi pi-bolt';
  if (kind === 'cts.valueService') return 'pi pi-cog';
  if (kind.startsWith('cts.conversion')) return 'pi pi-replay';
  if (kind.startsWith('cts.read')) return 'pi pi-database';
  if (kind.startsWith('cts.field')) return 'pi pi-angle-right';
  if (kind.startsWith('cts.compose')) return 'pi pi-box';
  if (kind.startsWith('cts.decompose')) return 'pi pi-objects-column';
  if (kind.startsWith('source.')) return 'pi pi-circle-fill';
  if (kind.startsWith('value.')) return 'pi pi-sliders-h';
  if (kind.startsWith('collection.') || kind.startsWith('tree.')) return 'pi pi-list';
  if (kind.startsWith('record.')) return 'pi pi-box';
  return 'pi pi-directions';
}

export function defaultProcessNodeOperation(kind = '') {
  return (PROCESS_NODE_OPERATIONS[kind] || [''])[0] || '';
}

export const PROCESS_NODE_OPERATIONS_BY_KIND = PROCESS_NODE_OPERATIONS;


// The record factory: seeds only keys every record genuinely carries.
// Kind-specific envelopes (construction, state) land in their own branches
// and are filled by the sync pass, not the factory. No default bindings —
// nodes stay unbound until the author binds them.
export function createProcessNodeRecord(id, kind = 'source.literalItem', { defaultEntityTypeId = '' } = {}) {
  const op = operationKindOf({ kind });
  const nativeSpecies = String(kind || '').startsWith('cts.');
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
  if (kind === 'cts.construct') node.construction = { mode: 'genericCreate', inputs: [] };
  return node;
}

// The record sync pipeline over a designer contract: defaults, envelopes,
// binding normalization, and port resolution in the fixed order later steps
// read from — idempotent, so repeated passes converge. `portLabel` is the
// presentation hook (the page decorates i18n labels; headless authoring
// keeps raw labels).
export function createProcessRecordSync({ contract, defaultEntityTypeId = () => '', portLabel = null }) {
  // The domain is read per call: the designer rescaffolds its projected
  // domain when the served organization projection arrives, and every
  // later sync must resolve ports against that current domain.
  function catalogContext(node = {}) {
    const bound = typeIdOf(node);
    const fields = node.kind === 'cts.field' || bound
      ? contract.fieldsForEntity(bound)
      : [];
    return {
      // The authored field arrives as the record's `path` or as the field
      // socket's default (a packet from the inline fallback) — unwrap both,
      // exactly the pair the catalog's field ports read.
      fieldSchema: fields.find(field => field.path === node.path) || null,
      fieldSchemas: fields,
      command: contract.domain?.commands?.[node.commandId] || null,
      domain: contract.domain
    };
  }

  function catalogPorts(record) {
    return resolveCatalogNodePorts(record, catalogContext(record));
  }

  function decorate(node, ports) {
    if (!portLabel) return ports;
    return ports.map(port => ({ ...port, label: portLabel(node, port) }));
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
    if (!EFFECT_SPECIES_KINDS.has(node.kind)) {
      node.access = node.kind === 'source.literalList' ? 'list' : node.kind === 'source.literalTree' ? 'tree' : (node.access || 'item');
    }
    node.icon = iconForProcessNode(node.kind);
    // The retired per-output preview selection migrates to the per-node
    // eye: only a fully hidden node stays hidden.
    if (Array.isArray(node.previewOutputs)) {
      if (node.previewOutputs.length === 0) node.previewVisible = false;
      delete node.previewOutputs;
    }
    if (node.previewVisible !== false) delete node.previewVisible;
    // Guard field paths heal row-relative in place (SPEC §7/§20): a
    // block-prefixed persisted path is the bare row id.
    if (node.kind === 'cts.transition' && node.guard) {
      node.guard = normalizeRowRelativeGuard(node.guard);
    }
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
    if (!EFFECT_SPECIES_KINDS.has(node.kind)) return;
    node.access = normalizeDesignerAccess(node.access);
    node.entryTriggerId = node.id;
    // Construction is a procedural operation: entry scheduling and
    // event subscriptions belong to profile entry effects.
    if (node.kind === 'cts.construct') {
      const mode = node.trigger?.mode;
      node.trigger = mode && mode !== 'manual' ? { mode: 'manual' } : (node.trigger || { mode: 'manual' });
      delete node.eventId;
    }
  }

  function syncProcessNodeConstruction(node = {}) {
    const contractForType = contract.construction(typeIdOf(node)) || {};
    // A vocabulary gap (the domain carries no construction contract for
    // the bound type — a fetch-ordering race, a retired type) preserves
    // the authored construction verbatim; validation owns the
    // unknown-type report.
    if (!contractForType.modes?.length) return;
    const modes = contractForType.modes;
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
    if (node.kind === 'cts.construct') {
      syncProcessNodeConstruction(node);
      delete node.state;
    }
  }

  function relationKeysForEntity(typeId = '') {
    return (contract.domain?.relations || []).filter(relation => relation.ownerType === typeId);
  }

  // Get Field default: the first declared row field, else the identity
  // name, else the first readable entry. Identity slots (`_id`) carry
  // the untyped json base, so defaulting to them leaves the output as
  // json until the author picks a real field.
  function preferredFieldDefault(available = []) {
    return (available.find(field => String(field.value || '').startsWith('fields.'))
      || available.find(field => field.value === 'name')
      || available[0])?.value || '';
  }

  function normalizeBindingDefaults(node = {}) {
    if (node.kind === 'cts.field') {
      if (!node.typeId && node.type?.typeId) node.typeId = node.type.typeId;
      delete node.fieldSchemas;
      delete node.fieldSchema;
      // `path` is the single persisted home of the field selection. A
      // `field` socket default older drafts carry (string or packet)
      // unwraps into the path once; the channel itself retires.
      const wiredField = authoredSocketDefault(node.inputDefaults?.field);
      if (node.inputDefaults && Object.hasOwn(node.inputDefaults, 'field')) {
        if (wiredField) node.path = String(wiredField);
        delete node.inputDefaults.field;
      }
      const bound = typeIdOf(node);
      const available = bound
        ? contract.fieldsForEntity(bound).filter(field => field.readable !== false)
        : [];
      // Unbound consumers keep their authored path: the entity wire
      // determines the bound type (SPEC §20), so clearing here would
      // destroy intent authored before the wire exists. Validation
      // owns the report when the path is genuinely undeclared.
      if (!available.length) return;
      // `path === '_id'` is the derived default; it re-defaults like an
      // unset path.
      if (node.path && node.path !== '_id' && available.some(field => field.value === node.path)) return;
      node.path = preferredFieldDefault(available);
    } else {
      // `value.recordField` and `source.triggerPayload` own an authored
      // key path (plain records and the run trigger have no declared row
      // to select from); every other kind carries no path.
      if (!['value.recordField', 'source.triggerPayload'].includes(node.kind)) node.path = '';
      delete node.fieldSchemas;
      delete node.fieldSchema;
    }
    if (node.kind === 'cts.read' && node.select === 'related') {
      // An authored relation selection survives a vocabulary gap the same
      // way the binding and the socket defaults do: a domain without the
      // bound type has no relations to re-derive from, so the selection
      // stays authored until a full domain syncs.
      if (typeIsKnown(node)) {
        const relations = relationKeysForEntity(typeIdOf(node));
        // A known type with no exposed relations is a vocabulary gap too
        // (partial domain, load race): the authored selection survives;
        // validation owns the report when it is genuinely wrong.
        if (relations.length && !relations.some(relation => relation.key === node.relationKey)) {
          node.relationKey = relations[0]?.key || '';
        }
      }
    }
  }

  function resolveProcessNodePorts(node = {}, draftData = {}) {
    node.label = node.kind;
    node.inputs = decorate(node, catalogPorts(node).inputs);
    node.outputs = decorate(node, catalogPorts(node).outputs);
    syncProcessNodeProducerOutputs(draftData, node);
    node.inputDefaults ||= {};
    for (const input of node.inputs) {
      if (input.default === undefined || Object.hasOwn(node.inputDefaults, input.id)) continue;
      node.inputDefaults[input.id] = { branches: [{ path: [], items: [input.default] }] };
    }
    // Authored socket defaults survive a vocabulary gap (law: README
    // Authoring seam).
    if (typeIsKnown(node)) {
      const inputIds = new Set(node.inputs.map(input => input.id));
      for (const inputId of Object.keys(node.inputDefaults)) {
        if (!inputIds.has(inputId)) delete node.inputDefaults[inputId];
      }
    }
  }

  function typeIsKnown(node = {}) {
    const typeId = typeIdOf(node);
    if (!typeId) return true;
    return Boolean((contract.domain?.entities || []).some(entity => entity.type === typeId));
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
    syncProcessNode
  };
}

// Connection type propagation: connecting a typed source into a
// type-carrying socket writes the source's element type onto the target
// record — the same gesture the canvas performs. Generic collection
// kinds and the value nodes whose sockets read the record's operand type
// (compare, logic, string/math/dateTime) carry that type on the record;
// everything else resolves from its own contract.
const TYPE_PROPAGATING_INPUTS = {
  'value.compare': ['left', 'right'],
  'value.select': ['left', 'right'],
  'value.logic': ['left', 'value', '']
};

export function propagateConnectionType(targetRecord = {}, targetInput = '', sourcePort = null) {
  if (!sourcePort?.type) return;
  const kind = targetRecord.kind || '';
  // The canvas passes the bare socket id, the seam the handle spelling.
  const input = parseProcessSocketHandleId(String(targetInput || '')) || String(targetInput || '');
  const generic = TYPE_PROPAGATING_INPUTS[kind]?.includes(input)
    || (['collection.makeList', 'collection.concat', 'collection.itemAt', 'collection.slice', 'collection.count', 'collection.distinct',
      'collection.sort', 'collection.groupBy', 'collection.filter', 'collection.packArray', 'collection.unpackArray',
      'collection.reverse', 'collection.shift', 'collection.partition', 'collection.dispatch', 'control.forEach',
      'tree.flatten', 'tree.graft', 'tree.simplify', 'tree.branch', 'tree.zip', 'tree.unzip', 'tree.cross',
      'tree.transpose'].includes(kind) && ['', 'value', 'items', 'tree', 'left'].includes(input))
    || (['value.string', 'value.math', 'value.dateTime'].includes(kind) && ['left', 'text', 'date', 'value', ''].includes(input));
  if (generic) targetRecord.type = { ...sourcePort.type };
}

// Declaration-tree authoring: the same gestures the designer's tree
// canvas makes. Classes, fields, and type references are dropped as
// canvas nodes with their persisted ctsTypes records; declaration wires
// (declares, targets, children, binds, entry, field) are gated by
// `declarationWireLegality` and persisted as role:'type' edges. The
// composed state runs the platform's own interpretation
// (`interpretDeclarationEdges`) before serialization, so record bindings
// derive from wires exactly as the designer's live pass derives them.
const DECLARATION_NODE_KINDS = Object.freeze({
  ctsClass: 'class',
  ctsField: 'field',
  ctsState: 'state',
  ctsType: 'type'
});

function declarationNode(nodeType, { id, data, position }) {
  return { id, type: nodeType, position: position || { x: 0, y: 0 }, data: { refId: id, ...data } };
}

const CANVAS_NODE_TYPES = new Set(['processNode', ...Object.keys(DECLARATION_NODE_KINDS)]);

// The structural floor every persisted graph must pass: nodes are
// addressable (unique non-empty id), typed with a canvas type the
// designer renders, placed (numeric position — a canvas node without
// coordinates renders nowhere), resolvable (a processNode addresses a
// processNodes record, a declaration node a ctsTypes record), and edges
// address existing nodes. Semantic validity is the validator's job; this
// is integrity, enforced at the save seam.
export function graphIntegrityProblems(authored = null) {
  const graph = authored?.graph;
  if (!graph || typeof graph !== 'object') return ['graph must be an object'];
  const problems = [];
  if (!Array.isArray(graph.nodes)) return ['graph.nodes must be an array'];
  const ids = new Set();
  const records = authored?.processNodes || {};
  const declarations = authored?.ctsTypes || {};
  graph.nodes.forEach((node, index) => {
    if (!node || typeof node !== 'object') {
      problems.push(`node ${index} is not an object`);
      return;
    }
    if (!node.id) problems.push(`node ${index} has no id`);
    else if (ids.has(node.id)) problems.push(`duplicate node id ${node.id}`);
    else ids.add(node.id);
    if (!node.type) problems.push(`node ${node.id || index} has no type`);
    else if (!CANVAS_NODE_TYPES.has(node.type)) {
      problems.push(`node ${node.id} has unknown canvas type ${node.type}`);
    }
    const position = node.position;
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      problems.push(`node ${node.id || index} has no numeric position`);
    }
    if (node.type === 'processNode' && !records[node.data?.refId]) {
      problems.push(`node ${node.id} addresses no processNodes record`);
    }
    if (DECLARATION_NODE_KINDS[node.type] && !declarations[node.data?.refId]) {
      problems.push(`node ${node.id} addresses no ctsTypes record`);
    }
  });
  if (Array.isArray(graph.edges)) {
    graph.edges.forEach((edge, index) => {
      if (!edge || !ids.has(edge.source) || !ids.has(edge.target)) {
        problems.push(`edge ${edge?.id || index} references a missing node`);
        return;
      }
      // A handle-less data edge binds nothing while looking connected;
      // declaration edges (role 'type', 'decl*' ids) are node-to-node.
      const declaration = edge.role === 'type' || String(edge?.id || '').startsWith('decl');
      if (!declaration && (!String(edge.sourceHandle || '').trim() || !String(edge.targetHandle || '').trim())) {
        problems.push(`edge ${edge.id || index} wires ${edge.source} to ${edge.target} without sockets — data edges address node:socket`);
      }
    });
  }
  return problems;
}

// Data edges address sockets: a handle the addressed record does not
// carry renders as a wire pinned to the node body. Called at the save
// seam AFTER the persisted rewrites — a rewrite may drop retired
// handles this pass would flag.
export function graphEdgeSocketProblems(authored = null) {
  const graph = authored?.graph;
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.edges)) return [];
  const records = authored?.processNodes || {};
  const nodesById = new Map((Array.isArray(graph.nodes) ? graph.nodes : [])
    .filter(Boolean).map(node => [node.id, node]));
  const problems = [];
  graph.edges.forEach((edge, index) => {
    if (!edge || typeof edge !== 'object') return;
    const declaration = edge.role === 'type' || String(edge.id || '').startsWith('decl');
    if (declaration) return;
    for (const [nodeKey, handleKey, portList] of [['source', 'sourceHandle', 'outputs'], ['target', 'targetHandle', 'inputs']]) {
      if (!String(edge[handleKey] || '').trim()) continue;
      const node = nodesById.get(edge[nodeKey]);
      const record = node?.type === 'processNode' ? records[node.data?.refId] : null;
      const socketId = parseProcessSocketHandleId(edge[handleKey]);
      const carried = Array.isArray(record?.[portList])
        && record[portList].some(port => port?.id === socketId);
      if (!carried) {
        problems.push(`edge ${edge.id || index} handle ${edge[handleKey]} addresses no ${portList} socket on ${edge[nodeKey]}`);
      }
    }
  });
  return problems;
}

// One grant per effect (the lane law): a stored record carrying several
// grants collapses to its primary — the lane projection already seats
// the node by grants[0].
export function collapseEffectAccessGrants(authored = null) {
  const records = authored?.processNodes;
  if (!records || typeof records !== 'object') return authored;
  for (const record of Object.values(records)) {
    if (!record || !EFFECT_SPECIES_KINDS.has(record.kind)) continue;
    const grants = record.access?.grants;
    if (!Array.isArray(grants) || grants.length < 2) continue;
    record.access = normalizeDesignerAccess({ grants: [grants[0]] });
  }
  return authored;
}

function syncDeclarationRecordFromNode(record, nodeType, data) {
  if (nodeType === 'ctsClass') {
    record.kind = 'class';
    record.typeId = data.typeId || '';
    record.name = data.name || '';
    record.class = data.class || 'file';
    record.glyph = data.glyph || null;
    record.payload = data.payload || null;
    record.operators = Array.isArray(data.operators) ? data.operators : [];
    record.projections = Array.isArray(data.projections) ? data.projections : [];
  } else if (nodeType === 'ctsField') {
    record.kind = 'field';
    record.typeId = data.typeId || null;
    record.name = data.name || '';
    record.descriptor = { ...(data.descriptor || { base: 'string' }) };
  } else if (nodeType === 'ctsState') {
    record.kind = 'state';
    record.value = data.value || '';
  } else {
    record.kind = 'type';
    record.typeId = data.typeId || '';
  }
  return record;
}

// Compose a definition the way the designer does. Drops create records
// from palette items (the loop item creates its pair — the closer is part
// of loop semantics), configure writes record semantics (the inspector's
// writes), connect is the port-gated wire gesture, and definition()
// returns the authored data ready for validation/activation.

// The empty current-protocol document every fresh draft starts from.
export function emptyAuthoredDocument() {
  return {
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
    ctsTypes: {},
    processNodes: {}
  };
}

export function createDefinitionAuthoring(domain, capabilities = null, seedData = null) {
  let contract = createProcessDesignerContract(domain, capabilities);
  const defaultEntityTypeId = () => contract.entityOptions[0]?.value || '';
  let sync = createProcessRecordSync({ contract, defaultEntityTypeId });
  // Headless drops have no mouse: every new canvas node takes the next slot
  // of a default grid — a lane of declarations, then the graph below.
  let layoutCursor = 0;
  const nextPosition = () => {
    const position = { x: (layoutCursor % 4) * 300, y: Math.floor(layoutCursor / 4) * 190 };
    layoutCursor += 1;
    return position;
  };
  // The Apply-shaped composition re-seats the contract once the tree's
  // declarations are posted: the graph composes over the overlaid domain
  // (the draft-overlay rule), exactly as the designer re-projects after
  // APPLY posts in-tree declarations.
  function withDomain(nextDomain) {
    contract = createProcessDesignerContract(nextDomain, capabilities);
    sync = createProcessRecordSync({ contract, defaultEntityTypeId });
    for (const recordId of Object.keys(data.processNodes)) syncProcessNode(recordId);
  }

  const data = emptyAuthoredDocument();
  const declarationNodes = new Map();

  // Seeding (the edit path): gestures apply to the stored document;
  // only authored keys seed.
  const AUTHORED_DATA_KEYS = ['graph', 'roleGrants', 'producerOutputs', 'actions', 'services', 'sockets', 'screens', 'ctsTypes', 'processNodes', 'valueInputs'];
  if (seedData && typeof seedData === 'object') {
    for (const key of AUTHORED_DATA_KEYS) {
      if (seedData[key] !== undefined) data[key] = structuredClone(seedData[key]);
    }
    if (!Array.isArray(data.graph?.nodes) || !Array.isArray(data.graph?.edges)) {
      data.graph = { nodes: [], edges: [] };
    }
    for (const node of data.graph.nodes) {
      if (node && DECLARATION_NODE_KINDS[node.type]) declarationNodes.set(node.data?.refId || node.id, node);
    }
    layoutCursor = data.graph.nodes.length;
  }

  function declarationNodeOf(recordId) {
    return declarationNodes.get(recordId) || null;
  }

  // Drops a declaration canvas node with its persisted ctsTypes record —
  // the tree authoring gesture behind the palette's declaration items.
  function declare({ id, nodeType, data: nodeData }) {
    if (data.ctsTypes[id]) throw new Error(`Declaration ${id} already exists`);
    const node = declarationNode(nodeType, { id, data: nodeData, position: nextPosition() });
    declarationNodes.set(id, node);
    data.graph.nodes.push(node);
    data.ctsTypes[id] = syncDeclarationRecordFromNode({ id }, nodeType, node.data);
    return node;
  }

  function declareClass({ id, typeId, class: classKind = 'file', name, glyph, payload, operators, projections }) {
    return declare({
      id, nodeType: 'ctsClass',
      data: { typeId, name: name || typeId, class: classKind, glyph: glyph || null, payload: payload || null, operators: operators || [], projections: Array.isArray(projections) ? projections : [], label: '', fields: 0, states: 0 }
    });
  }

  function declareField({ id, ownerClassId, name, descriptor }) {
    const owner = declarationNodeOf(ownerClassId);
    if (!owner || owner.type !== 'ctsClass') throw new Error(`Field ${id} declares on unknown class ${ownerClassId}`);
    if (!String(name || '').trim()) throw new Error(`Field ${id} has no name`);
    const node = declare({
      id, nodeType: 'ctsField',
      data: { typeId: owner.data.typeId, name, descriptor: descriptor || { base: 'string' } }
    });
    wireDeclaration(id, ownerClassId, 'declares');
    return node;
  }

  function declareTypeRef({ id, typeId }) {
    return declare({ id, nodeType: 'ctsType', data: { typeId, label: typeId } });
  }

  // A state node is a flat lifecycle value (SPEC §7): its only wiring is
  // the entry wire into a construct's or transition's state socket and
  // the nesting wire under a parent state.
  function declareState({ id, value }) {
    if (!value) throw new Error(`State ${id} has no value`);
    return declare({
      id, nodeType: 'ctsState',
      data: { value }
    });
  }

  // The declaration wire gesture: gated by the same legality table the
  // canvas applies, persisted as a role:'type' edge the interpretation
  // and the tree compile read.
  function wireDeclaration(sourceId, targetId, label, edgeData = {}) {
    const graphNode = id => data.graph.nodes.find(node => node.id === id) || null;
    const source = graphNode(sourceId);
    const target = graphNode(targetId);
    const targetRecord = target?.type === 'processNode'
      ? data.processNodes[target.data?.refId || target.id] || null
      : null;
    const legality = declarationWireLegality({
      sourceType: source?.type || '',
      targetType: target?.type || '',
      targetRecord,
      targetRecordKind: targetRecord?.kind || ''
    });
    if (legality !== label) {
      throw new Error(`Declaration wire ${sourceId} -> ${targetId} is not a legal '${label}' gesture (legality: ${legality || 'none'})`);
    }
    const id = label === 'declares' ? `declares:${sourceId}-${targetId}` : `decl:${label}:${sourceId}-${targetId}`;
    if (data.graph.edges.some(edge => edge.id === id)) return null;
    const edge = {
      id,
      source: sourceId,
      target: targetId,
      sourceHandle: null,
      targetHandle: null,
      type: 'default',
      role: 'type',
      label,
      ...(Object.keys(edgeData).length ? { data: edgeData } : {})
    };
    if (label === 'children') {
      const childTypeId = source.data?.typeId;
      edge.data = { key: edgeData.key || `${childTypeId}s`, onRemove: edgeData.onRemove || 'restrict' };
    }
    // The state-entry wire is the value (SPEC §7); handles follow the
    // machine-vocabulary wire shape (see designer.js 'entry' legality).
    if (label === 'entry') {
      edge.sourceHandle = mintProcessSocketHandle({ id: 'state', role: 'data' });
      edge.targetHandle = mintProcessSocketHandle({ id: 'state', role: 'data' });
    }
    data.graph.edges.push(edge);
    interpretNow();
    return edge;
  }

  // Applies the platform's own interpretation to the composed state, so
  // record bindings derive from wires exactly as the designer's live
  // pass derives them — and the persisted records carry the same state.
  function interpretNow() {
    // The designer's consumer-binding resolver (the page's
    // incomingEntityContract): the entity wire's source output type, read
    // from the source record's own resolved ports. The seam supplies it
    // itself so headless composition binds consumers exactly like the
    // canvas — an entity stream into an unbound consumer adapts it.
    const entityInputType = recordId => {
      const graphNode = data.graph.nodes.find(node => node.type === 'processNode' && node.data?.refId === recordId);
      const edge = data.graph.edges.find(item => (
        item.target === graphNode?.id
        && String(item.targetHandle || '').replace(/^(?:input|data):/, '') === 'entity'
      ));
      if (!edge) return '';
      const source = data.graph.nodes.find(node => node.id === edge.source);
      const sourceRecord = source?.data?.refId ? data.processNodes[source.data.refId] : null;
      const ports = sourceRecord ? sync.catalogPorts(sourceRecord).outputs : [];
      const port = ports.find(candidate => candidate.type?.typeId || candidate.type?.itemType?.typeId);
      return port?.type?.typeId || port?.type?.itemType?.typeId || '';
    };
    const { mutations } = interpretDeclarationEdges(
      data.graph.nodes,
      data.graph.edges.filter(edge => edge.role === 'type'),
      data.processNodes,
      {},
      { entityInputType }
    );
    for (const mutation of mutations || []) {
      if (mutation.scope === 'node') {
        const node = declarationNodes.get(mutation.nodeId)
          || data.graph.nodes.find(candidate => candidate.id === mutation.nodeId);
        if (node) node.data[mutation.key] = mutation.value;
        continue;
      }
      const record = data.ctsTypes[mutation.recordId] || data.processNodes[mutation.recordId];
      if (!record) continue;
      if (mutation.key === 'typeId') {
        setTypeBinding(record, mutation.value);
        const node = declarationNodes.get(mutation.recordId);
        if (node) node.data.typeId = mutation.value;
        if (data.processNodes[mutation.recordId]) syncProcessNode(mutation.recordId);
        continue;
      }
      if (mutation.key?.startsWith('inputDefaults.')) {
        const inputId = mutation.key.slice('inputDefaults.'.length);
        record.inputDefaults = { ...(record.inputDefaults || {}), [inputId]: mutation.value };
        continue;
      }
      if (mutation.key === 'path') {
        record.path = mutation.value;
        if (data.processNodes[mutation.recordId]) syncProcessNode(mutation.recordId);
        continue;
      }
      if (mutation.key?.startsWith('state.')) {
        record.state = { ...(record.state || {}), [mutation.key.slice('state.'.length)]: mutation.value };
      }
    }
    // Declaration records mirror their node data after interpretation.
    for (const node of declarationNodes.values()) {
      syncDeclarationRecordFromNode(data.ctsTypes[node.data.refId], node.type, node.data);
    }
  }

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
      data.graph.nodes.push({ id: recordId, type: 'processNode', position: nextPosition(), data: { refId: recordId } });
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

  // The inspector's declaration writes: display policy and value on
  // states, identity chrome on classes, the row contract on fields.
  const DECLARATION_NODE_WRITES = Object.freeze({
    ctsState: ['value', 'label', 'severity', 'icon'],
    ctsClass: ['name', 'glyph', 'projections'],
    ctsField: ['name', 'descriptor']
  });

  function configureDeclaration(recordId, updates = {}) {
    const node = data.graph.nodes.find(candidate => candidate.id === recordId) || null;
    const writable = node ? DECLARATION_NODE_WRITES[node.type] || null : null;
    if (!writable) throw new Error(`No process node ${recordId}`);
    const refused = Object.keys(updates).filter(key => !writable.includes(key));
    if (refused.length) {
      throw new Error(`${node.type} ${recordId} authors ${writable.join(', ')}: ${refused.join(', ')} refused`);
    }
    Object.assign(node.data, updates);
    interpretNow();
    return node;
  }

  function configure(recordId, updates = {}) {
    const record = recordOf(recordId);
    if (!record) return configureDeclaration(recordId, updates);
    // A construct's type arrives by its binds declaration wire — the
    // designer's only binding flow. The wire's interpretation writes the
    // derived typeId; authoring it on the record has no gesture.
    if (updates.typeId !== undefined && record.kind === 'cts.construct') {
      throw new Error(`Construct ${recordId} binds its type by wire — declare the type (declareClass in-tree, declareTypeRef for registry types) and wireDeclaration role 'binds' onto it`);
    }
    const literalKind = operationKindOf(record);
    if (updates.value !== undefined && ['source.literalItem', 'source.literalList'].includes(literalKind)) {
      const items = literalKind === 'source.literalList' ? (Array.isArray(updates.value) ? updates.value : [updates.value]) : [updates.value];
      for (const item of items) assertAuthoredValue(record.kind, `${recordId} value`, item);
    }
    // An effect's lane is its one grant.
    if (updates.access !== undefined && EFFECT_SPECIES_KINDS.has(record.kind)) {
      const grants = normalizeDesignerAccess(updates.access).grants;
      if (grants.length > 1) {
        throw new Error(`Effect ${recordId} carries one role grant (its lane) — got ${grants.length}: ${grants.map(grant => grant.roleId).join(', ')}`);
      }
    }
    // Rebind keeps a still-valid path/relation selection and defaults
    // an invalid one.
    if (updates.inputDefaults !== undefined) {
      throw new Error(`Socket defaults ride setInputDefault (${recordId}, input, value) — configure writes record semantics only`);
    }
    const { typeId, ...rest } = updates;
    Object.assign(record, rest);
    if (typeId !== undefined) setTypeBinding(record, typeId);
    syncProcessNode(recordId);
    return record;
  }

  // The typed-value authoring law: value inputs and literal sources carry
  // the scalars the typed control authors — the entityRef picker's
  // {type, id} shape included. Records arrive from reads, services, and
  // record composition.
  function assertAuthoredValue(kind, where, value) {
    if (value == null || typeof value !== 'object') return;
    const entityRefPickerShape = !Array.isArray(value)
      && typeof value.type === 'string' && typeof value.id === 'string'
      && Object.keys(value).length === 2;
    if (entityRefPickerShape) return;
    throw new Error(`${where} (${kind}): value inputs author typed scalars (boolean, number, date, status, string, entityRef {type, id}) — records arrive from reads, services, and record composition`);
  }

  // An authored socket fallback: the scalar is stored as one broadcast
  // item, the packet shape every consumer of inputDefaults reads.
  function setInputDefault(recordId, socketId, value) {
    const record = recordOf(recordId);
    if (!record) throw new Error(`No process node ${recordId}`);
    const inputPorts = resolveCatalogNodePorts(record, sync.catalogContext(record)).inputs;
    const port = inputPorts.find(candidate => candidate.id === socketId);
    if (!port) {
      throw new Error(`${recordId} has no input socket ${socketId} — valid: ${inputPorts.map(candidate => candidate.id).join(', ') || '(none)'}`);
    }
    assertAuthoredValue(record.kind, `${recordId}:${socketId}`, value);
    if (port.type?.base === 'entityRef' && value != null && value !== '') {
      const pickerShape = typeof value === 'object' && !Array.isArray(value)
        && typeof value.type === 'string' && typeof value.id === 'string';
      if (!pickerShape) {
        throw new Error(`${recordId}:${socketId} authors an entity reference as {type, id}`);
      }
    }
    const inputDefaults = { ...(record.inputDefaults || {}) };
    if (value == null || value === '') delete inputDefaults[socketId];
    else inputDefaults[socketId] = { branches: [{ path: [], items: [value] }] };
    record.inputDefaults = inputDefaults;
    syncProcessNode(recordId);
    return record;
  }

  function portOf(record, portId, direction) {
    const ports = sync.catalogPorts(record)[direction === 'output' ? 'outputs' : 'inputs'];
    // Socket handles ('data:<id>' and the legacy spellings) carry the same
    // meaning as the bare socket id — the one regex home parses them.
    const bare = parseProcessSocketHandleId(portId) || String(portId || '');
    return ports.find(port => port.id === bare) || null;
  }

  function connectedInputHandles(recordId) {
    return data.graph.edges
      .filter(edge => edge.target === recordId)
      .map(edge => parseProcessSocketHandleId(edge.targetHandle))
      .filter(Boolean);
  }

  // Socket addressing on wire gestures: the handle names the port's
  // plane — data:<socketId> for data sockets, control:<socketId> for
  // control. Bare ids and the retired input:/output: spellings refuse.
  function requireSocketHandle(nodeId, portId) {
    const value = String(portId || '');
    if (value.startsWith('input:') || value.startsWith('output:')) {
      throw new Error(`Socket address ${nodeId}:${value} uses a retired handle spelling — address data:<socketId> (control sockets control:<socketId>)`);
    }
    if (!/^(data|control):./.test(value)) {
      throw new Error(`Socket address ${nodeId}:${value || '(empty)'} must be a handle — data:<socketId> for data sockets, control:<socketId> for control`);
    }
  }

  // The connect gesture: data ports go through the shared compatibility
  // gate; control ports pair by role. Single-value inputs reject a second
  // wire. Effects derive their trigger mode from the event input's wire.
  function connect(sourceId, sourcePortId, targetId, targetPortId) {
    requireSocketHandle(sourceId, sourcePortId);
    requireSocketHandle(targetId, targetPortId);
    const source = recordOf(sourceId);
    const target = recordOf(targetId);
    if (!source || !target) throw new Error(`connect requires composed nodes (${sourceId} → ${targetId})`);
    const sourcePort = portOf(source, sourcePortId, 'output');
    const targetPort = portOf(target, targetPortId, 'input');
    if (!sourcePort || !targetPort) {
      const socketsOf = (record, direction) => sync.catalogPorts(record)[direction]
        .map(port => `${port.role === 'data' ? 'data' : 'control'}:${port.id}`)
        .join(', ') || '(none)';
      throw new Error(`Unknown port ${!sourcePort ? `${sourceId}:${sourcePortId}` : `${targetId}:${targetPortId}`} — ${sourceId} outputs: ${socketsOf(source, 'outputs')}; ${targetId} inputs: ${socketsOf(target, 'inputs')}`);
    }
    for (const [nodeId, portId, port] of [[sourceId, sourcePortId, sourcePort], [targetId, targetPortId, targetPort]]) {
      const plane = port.role === 'data' ? 'data' : 'control';
      if (!String(portId).startsWith(`${plane}:`)) {
        throw new Error(`Socket address ${nodeId}:${portId} names the wrong plane — ${port.id} is a ${plane} socket`);
      }
    }
    if (sourcePort.role !== 'data') {
      if (targetPort.role === 'data') {
        throw new Error(`Incompatible ports ${sourceId}:${sourcePortId} → ${targetId}:${targetPortId} — control into a data socket`);
      }
    } else {
      // The canvas gesture propagates the source type before the gate and
      // the gate reads the record it will keep; a refused wire rolls the
      // retype back.
      const previousType = target.type ? { ...target.type } : target.type;
      propagateConnectionType(target, targetPortId, sourcePort);
      const compatibility = processSocketsCompatible(sourcePort, portOf(target, targetPortId, 'input') || targetPort);
      if (!compatibility.ok) {
        target.type = previousType;
        throw new Error(`Incompatible ports ${sourceId}:${sourcePortId} → ${targetId}:${targetPortId}${compatibility.reason ? ` — ${compatibility.reason}` : ''}`);
      }
    }
    const id = `e-${sourceId}-${sourcePortId}-${targetId}-${targetPortId}`;
    if (data.graph.edges.some(edge => edge.id === id)) return data.graph.edges.find(edge => edge.id === id);
    if (targetPort.multiple !== true) {
      const occupied = connectedInputHandles(targetId).includes(targetPort.id);
      if (occupied) throw new Error(`Socket ${targetId}:${targetPortId} accepts one wire`);
    }
    const edge = {
      id,
      source: sourceId,
      target: targetId,
      sourceHandle: mintProcessSocketHandle(sourcePort),
      targetHandle: mintProcessSocketHandle(targetPort),
      ...(sourcePort.role === 'data' ? {} : { role: 'control' })
    };
    data.graph.edges.push(edge);
    // Wires are live binding channels here too: the same interpretation
    // pass the canvas runs on connect (an entity stream into an unbound
    // consumer adapts it) — one inference home, not a connect-local twin.
    interpretNow();
    syncProcessNode(targetId);
    return edge;
  }

  // The disconnect gesture: removes the data wire those addresses name
  // (addressing mirrors connect). Bindings the wire carried re-derive.
  function disconnect(sourceId, sourcePortId, targetId, targetPortId) {
    requireSocketHandle(sourceId, sourcePortId);
    requireSocketHandle(targetId, targetPortId);
    const source = recordOf(sourceId);
    const target = recordOf(targetId);
    if (!source || !target) throw new Error(`disconnect requires composed nodes (${sourceId} → ${targetId})`);
    const sourcePort = portOf(source, sourcePortId, 'output');
    const targetPort = portOf(target, targetPortId, 'input');
    if (!sourcePort || !targetPort) {
      throw new Error(`Unknown port ${!sourcePort ? `${sourceId}:${sourcePortId}` : `${targetId}:${targetPortId}`}`);
    }
    const index = data.graph.edges.findIndex(edge => (
      edge.source === sourceId
      && edge.target === targetId
      && parseProcessSocketHandleId(edge.sourceHandle) === sourcePort.id
      && parseProcessSocketHandleId(edge.targetHandle) === targetPort.id
    ));
    if (index < 0) {
      throw new Error(`No wire ${sourceId}:${sourcePort.id} → ${targetId}:${targetPort.id}`);
    }
    const [edge] = data.graph.edges.splice(index, 1);
    interpretNow();
    syncProcessNode(targetId);
    return edge;
  }

  // The unwire gesture: removes the declaration wire (addressing mirrors
  // wireDeclaration). Bindings the wire supplied re-derive.
  function unwireDeclaration(sourceId, targetId, label) {
    const id = label === 'declares' ? `declares:${sourceId}-${targetId}` : `decl:${label}:${sourceId}-${targetId}`;
    const index = data.graph.edges.findIndex(edge => edge.id === id);
    if (index < 0) {
      throw new Error(`No declaration wire ${sourceId} -${label}-> ${targetId}`);
    }
    const [edge] = data.graph.edges.splice(index, 1);
    interpretNow();
    return edge;
  }

  // The remove gesture: a node goes with everything anchored to it — its
  // record, every wire touching it, and the producer outputs it owned;
  // join selections pointing at those outputs reset.
  function removeNode(nodeId) {
    const node = data.graph.nodes.find(candidate => candidate.id === nodeId);
    if (!node) throw new Error(`No node ${nodeId}`);
    const recordId = node.data?.refId || nodeId;
    data.graph.edges = data.graph.edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId);
    data.graph.nodes = data.graph.nodes.filter(candidate => candidate.id !== nodeId);
    declarationNodes.delete(recordId);
    if (node.type === 'processNode') {
      delete data.processNodes[recordId];
      const orphanedOutputs = new Set();
      for (const [producerOutputId, output] of Object.entries(data.producerOutputs || {})) {
        if (output?.nodeId === recordId) {
          orphanedOutputs.add(producerOutputId);
          delete data.producerOutputs[producerOutputId];
        }
      }
      for (const record of Object.values(data.processNodes)) {
        if (record?.selectedProducerOutputId && orphanedOutputs.has(record.selectedProducerOutputId)) {
          delete record.selectedProducerOutputId;
        }
      }
    } else {
      delete data.ctsTypes[recordId];
    }
    interpretNow();
    return node;
  }

  function syncProcessNode(recordId) {
    const record = recordOf(recordId);
    if (!record) throw new Error(`No process node ${recordId}`);
    sync.syncProcessNode(record, { draftData: data });
    // Trigger mode derives from the graph: an effect runs automatically
    // iff its event input is wired.
    if (EFFECT_SPECIES_KINDS.has(record.kind)) {
      const wired = data.graph.edges.some(edge => (
        edge.target === recordId && parseProcessSocketHandleId(edge.targetHandle) === 'in'
      ));
      record.trigger = effectTriggerFor(wired, record);
    }
    return record;
  }

  return {
    contract,
    withDomain,
    paletteItem,
    drop,
    declareClass,
    declareField,
    declareTypeRef,
    declareState,
    wireDeclaration,
    unwireDeclaration,
    configure,
    setInputDefault,
    connect,
    disconnect,
    removeNode,
    record: recordOf,
    records: data.processNodes,
    edges: data.graph.edges,
    sync: syncProcessNode,
    definition: () => structuredClone(data)
  };
}
