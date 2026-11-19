import { normalizeGraph as normalizeStoredGraph, normalizeRecord } from './compiler-core.js';
import { normalizeRowRelativeFieldRefs, orientChildrenEdgesChildFirst } from '@perigram/cts';

const CANVAS_RECORD_KEYS = {
  entity: 'producerOutputs',
  action: 'actions',
  service: 'services',
  socket: 'sockets',
  stateDefinition: 'stateDefinitions',
  valueInput: 'valueInputs',
  processNode: 'processNodes',
  ctsClass: 'ctsTypes',
  ctsField: 'ctsTypes',
  ctsState: 'ctsTypes',
  ctsType: 'ctsTypes'
};

// Only these record kinds are owned by canvas nodes: deleting the canvas node
// deletes the record, and the projection recreates it on load. Every other
// record kind is panel-owned definition-plane data: it is never projected as
// a canvas node and survives the canvas round trip untouched.
const CANVAS_OWNED_RECORD_KEYS = {
  stateDefinition: 'stateDefinitions',
  processNode: 'processNodes',
  // Declaration-plane nodes own their authoring records in `ctsTypes`
  // (SPEC §20/§21 one tree): classes, fields, states, and type references
  // persist with the draft exactly like status definitions do — saving
  // never drops them, and they compile to the registry at activation.
  ctsClass: 'ctsTypes',
  ctsField: 'ctsTypes',
  ctsState: 'ctsTypes',
  ctsType: 'ctsTypes'
};

const RECORD_NODE_TYPES = Object.keys(CANVAS_OWNED_RECORD_KEYS);

const CANVAS_PERSISTENT_NODE_TYPES = [...RECORD_NODE_TYPES];


export function hasCanonicalProcessSource(definition = {}) {
  const data = definition.data || definition;
  return ['roleGrants', 'servicePrincipals', 'producerOutputs', 'actions', 'services', 'sockets', 'stateDefinitions', 'valueInputs', 'processNodes', 'screens', 'ctsTypes']
    .some(key => data[key] && typeof data[key] === 'object' && Object.keys(data[key]).length > 0);
}

export function definitionToCanvas(definition = {}) {
  // Stored children edges heal to the child-first direction at the load
  // projection, so the canvas never displays the retired parent-first
  // wire (the same heal the acceptance and save seams apply).
  const process = orientChildrenEdgesChildFirst(normalizeProcessLike(definition));
  assertEditableSource(process);

  const projectedNodes = projectRecordNodes(process);
  const projectedBySemanticId = new Map(projectedNodes.map(node => [semanticNodeId(node), node]));
  const savedNodes = (process.graph.nodes || [])
    .filter(node => CANVAS_PERSISTENT_NODE_TYPES.includes(node.type))
    .map(node => (projectedBySemanticId.has(semanticNodeId(node))
      ? mergeProjectedNode(projectedBySemanticId.get(semanticNodeId(node)), node)
      : normalizeCanvasNode(node)))
    .filter(Boolean);

  const savedSemanticIds = new Set(savedNodes.map(semanticNodeId));
  const occupiedNodeIds = new Set(savedNodes.map(node => node.id));
  const missingProjectedNodes = projectedNodes
    .filter(node => !savedSemanticIds.has(semanticNodeId(node)))
    .map(node => withUniqueCanvasNodeId(node, occupiedNodeIds));
  const nodes = [...savedNodes, ...missingProjectedNodes];
  const nodeIds = new Set(nodes.map(node => node.id));
  const edges = (process.graph.edges || [])
    .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map(edge => ({ ...edge }));

  return {
    nodes,
    edges,
    viewport: process.graph.viewport || { x: 0, y: 0, zoom: 1 }
  };
}

function semanticNodeId(node = {}) {
  return `${node.type}:${String(node.data?.refId || node.id || '')}`;
}

function withUniqueCanvasNodeId(node, occupiedNodeIds) {
  let id = String(node.id);
  if (occupiedNodeIds.has(id)) id = semanticNodeId(node);
  let suffix = 2;
  const base = id;
  while (occupiedNodeIds.has(id)) id = `${base}:${suffix++}`;
  occupiedNodeIds.add(id);
  return id === node.id ? node : { ...node, id };
}

export function canvasToDefinition(canvas = {}, previousDefinition = {}) {
  const process = normalizeProcessLike(previousDefinition);
  const nodes = (canvas.nodes || [])
    .filter(node => CANVAS_PERSISTENT_NODE_TYPES.includes(node.type))
    .map(node => normalizeCanvasNode(node));
  const nodeIds = new Set(nodes.map(node => node.id));
  const refsByKey = collectCanvasRefs(nodes);

  for (const [type, key] of Object.entries(CANVAS_OWNED_RECORD_KEYS)) {
    const refs = refsByKey[key] || new Set();
    process[key] = Object.fromEntries(
      Object.entries(process[key] || {}).filter(([id, record]) => refs.has(String(record?.id || id)))
    );
  }

  // Declaration authoring state is written from the canvas itself — the
  // record is the persisted form of the node: authored keys only, so a
  // cleared facet stays cleared.
  process.ctsTypes = { ...(process.ctsTypes || {}) };
  const kindByType = { ctsClass: 'class', ctsField: 'field', ctsState: 'state', ctsType: 'type' };
  for (const node of nodes) {
    const kind = kindByType[node.type];
    if (!kind) continue;
    const refId = String(node.data?.refId || node.id);
    const data = node.data || {};
    process.ctsTypes[refId] = {
      id: refId,
      kind,
      // Binding normalizes one way everywhere: a non-empty string or null.
      // The projection below writes the same shape, so `''` never survives
      // one half of the round trip only to fail compareSemanticRecords.
      typeId: data.typeId || null,
      ...(kind === 'class' ? {
        class: data.class || 'file',
        name: data.name || '',
        // Authored glyph normalizes like the binding: a non-empty string
        // or null on both halves of the round trip (absent means the
        // class default table derives one).
        glyph: data.glyph || null,
        idCustom: data.idCustom === true,
        payload: data.payload || null,
        operators: Array.isArray(data.operators) ? data.operators : []
      } : {}),
      ...(kind === 'field' ? { name: data.name || '', descriptor: { ...(data.descriptor || { base: 'string' }) } } : {}),
      // A state is a value token (SPEC §7): no axis, no parent, no
      // initial flag.
      ...(kind === 'state' ? {
        value: data.value || '',
        ...(data.label ? { label: data.label } : {}),
        ...(data.severity ? { severity: data.severity } : {}),
        ...(data.icon ? { icon: data.icon } : {})
      } : {})
    };
  }

  const edges = (canvas.edges || [])
    .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map(edge => normalizeCanvasEdge(edge));

  return {
    ...process,
    graph: {
      nodes,
      edges,
      viewport: normalizeViewport(canvas.viewport || process.graph.viewport)
    },
    compiled: null
  };
}

export function validateRoundTrip(definition = {}) {
  const errors = [];
  const warnings = [];
  let canvas;
  let roundTripped;

  try {
    const process = normalizeProcessLike(definition);
    assertEditableSource(process);
    canvas = definitionToCanvas(process);
    roundTripped = canvasToDefinition(canvas, process);
    // Second-generation stability compare (law: README Designer round trip).
    const canvasTwo = definitionToCanvas(roundTripped);
    const roundTrippedTwo = canvasToDefinition(canvasTwo, roundTripped);
    const mismatches = compareSemanticRecords(roundTripped, roundTrippedTwo);
    errors.push(...mismatches);
  } catch (error) {
    errors.push(error.message);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    canvas,
    definition: roundTripped || null
  };
}

function assertEditableSource(process = {}) {
  if (process.compiled && !hasCanonicalProcessSource(process)) {
    throw new Error('Process definition has only a compiled runtime contract; canonical semantic records are required for editing');
  }
}

function normalizeProcessLike(definition = {}) {
  const data = definition.data || definition;
  return normalizeRowRelativeFieldRefs({
    schemaVersion: data.schemaVersion || 1,
    dataflowVersion: data.dataflowVersion,
    sourceTemplateId: data.sourceTemplateId || null,
    sourceProcessDefinitionId: data.sourceProcessDefinitionId || null,
    graph: normalizeStoredGraph(data.graph, { includeRefId: true }),
    roleGrants: normalizeRecord(data.roleGrants),
    servicePrincipals: normalizeRecord(data.servicePrincipals),
    producerOutputs: normalizeRecord(data.producerOutputs),
    actions: normalizeRecord(data.actions),
    services: normalizeRecord(data.services),
    sockets: normalizeRecord(data.sockets),
    stateDefinitions: normalizeRecord(data.stateDefinitions),
    ctsTypes: normalizeRecord(data.ctsTypes),
    valueInputs: normalizeRecord(data.valueInputs),
    processNodes: normalizeRecord(data.processNodes),
    screens: normalizeRecord(data.screens),
    // Definition-local records that survive the canvas round trip:
    // activation history (version control) and the last-activated
    // snapshot (the runtime source for active-set members).
    ...(Array.isArray(data.history) ? { history: data.history } : {}),
    ...(data.activated && typeof data.activated === 'object' ? { activated: data.activated } : {}),
    // Graph protocol marker survives the canvas round trip (SPEC §20).
    ...(data.graphProtocol ? { graphProtocol: data.graphProtocol } : {}),
    compiled: data.compiled || null
  });
}

function projectRecordNodes(process) {
  return [
    ...projectRecords(process.stateDefinitions, 'stateDefinition', 560),
    ...projectRecords(process.processNodes, 'processNode', 420),
    ...projectDeclarationRecords(process.ctsTypes, 80)
  ];
}

// Declaration records project by their kind discriminator (SPEC §20/§21
// one tree): the record data is the authoring state the canvas node edits.
function projectDeclarationRecords(records = {}, x) {
  const nodeTypeByKind = { class: 'ctsClass', field: 'ctsField', state: 'ctsState', type: 'ctsType' };
  return Object.entries(records).map(([id, record], index) => {
    const refId = String(record.id || id);
    const type = nodeTypeByKind[record.kind] || 'ctsClass';
    return {
      id: refId,
      type,
      position: { x, y: 60 + index * 130 },
      data: {
        refId,
        semanticId: `${type}:${refId}`,
        ...(record.kind === 'class' ? {
          typeId: record.typeId || null,
          name: record.name || '',
          glyph: record.glyph || null,
          idCustom: record.idCustom === true,
          class: record.class || 'file',
          payload: record.payload || null,
          operators: record.operators || []
        } : {}),
        ...(record.kind === 'field' ? { typeId: record.typeId || null, name: record.name || '', descriptor: { ...(record.descriptor || { base: 'string' }) } } : {}),
        ...(record.kind === 'state' ? {
          typeId: record.typeId || null,
          value: record.value || '',
          severity: record.severity || null,
          icon: record.icon || null
        } : {}),
        ...(record.kind === 'type' ? { typeId: record.typeId || null } : {})
      }
    };
  });
}

function projectRecords(records = {}, type, x) {
  return Object.entries(records).map(([id, record], index) => {
    const refId = String(record.id || id);
    return {
      id: refId,
      type,
      position: { x, y: 140 + index * 150 },
      data: {
        refId,
        semanticId: `${type}:${refId}`,
        label: record.label || record.typeId || record.commandId || refId
      }
    };
  });
}

function mergeProjectedNode(projected, saved) {
  return {
    ...projected,
    position: normalizePosition(saved.position || projected.position),
    data: {
      ...projected.data,
      ...(saved.data || {}),
      refId: projected.data.refId,
      semanticId: projected.data.semanticId
    }
  };
}

function collectCanvasRefs(nodes = []) {
  const refsByKey = {};
  for (const node of nodes) {
    const key = CANVAS_OWNED_RECORD_KEYS[node.type];
    if (!key) continue;
    refsByKey[key] ||= new Set();
    refsByKey[key].add(String(node.data?.refId || node.id));
  }
  return refsByKey;
}

function compareSemanticRecords(source, next) {
  const errors = [];
  for (const key of ['roleGrants', 'servicePrincipals', 'producerOutputs', 'actions', 'services', 'sockets', 'stateDefinitions', 'valueInputs', 'processNodes', 'screens', 'ctsTypes']) {
    const sourceJson = JSON.stringify(sortObject(source[key] || {}));
    const nextJson = JSON.stringify(sortObject(next[key] || {}));
    if (sourceJson !== nextJson) errors.push(`Round-trip changed ${key}`);
  }
  return errors;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortObject(value[key])]));
}

function normalizeCanvasNode(node = {}) {
  const refId = String(node.data?.refId || node.id || '');
  return {
    id: String(node.id || refId),
    type: node.type || 'default',
    position: normalizePosition(node.position),
    data: {
      ...(node.data && typeof node.data === 'object' ? node.data : {}),
      refId
    }
  };
}

function normalizeCanvasEdge(edge = {}) {
  const sourceHandle = edge.sourceHandle || inferCanvasEdgeHandle(edge, 'source');
  const targetHandle = edge.targetHandle || inferCanvasEdgeHandle(edge, 'target');
  return {
    id: String(edge.id || `${edge.source || ''}-${edge.target || ''}`),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    sourceHandle,
    targetHandle,
    type: edge.type || 'default',
    ...(edge.role ? { role: edge.role } : {}),
    ...(edge.label ? { label: edge.label } : {}),
    data: edge.data && typeof edge.data === 'object' ? edge.data : {}
  };
}

function inferCanvasEdgeHandle(edge = {}, side = 'source') {
  const dataKey = side === 'source' ? 'sourceHandle' : 'targetHandle';
  if (edge.data?.[dataKey]) return edge.data[dataKey];
  const id = String(edge.id || '');
  const pattern = side === 'source'
    ? /(?:^|[-])((?:output)(?::[A-Za-z0-9_.:]+)?)(?=[-]|$)/
    : /(?:^|[-])((?:input|data)(?::[A-Za-z0-9_.:]+)?)(?=[-]|$)/;
  return id.match(pattern)?.[1] || null;
}

function normalizePosition(position = {}) {
  return { x: Number(position?.x || 0), y: Number(position?.y || 0) };
}

function normalizeViewport(viewport = {}) {
  return {
    x: Number(viewport?.x || 0),
    y: Number(viewport?.y || 0),
    zoom: Number(viewport?.zoom || 1)
  };
}
