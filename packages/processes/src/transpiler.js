const CANVAS_RECORD_KEYS = {
  entity: 'producerOutputs',
  action: 'actions',
  service: 'services',
  socket: 'sockets',
  statusDefinition: 'statusDefinitions',
  valueInput: 'valueInputs',
  processNode: 'processNodes'
};

// Only these record kinds are owned by canvas nodes: deleting the canvas node
// deletes the record, and the projection recreates it on load. Every other
// record kind is panel-owned definition-plane data: it is never projected as
// a canvas node and survives the canvas round trip untouched.
const CANVAS_OWNED_RECORD_KEYS = {
  statusDefinition: 'statusDefinitions',
  processNode: 'processNodes'
};

const RECORD_NODE_TYPES = Object.keys(CANVAS_OWNED_RECORD_KEYS);

// `ctsType` canvas nodes are type-system reference anchors: they persist in
// the graph, own no records, and their wires carry type bindings into
// species records (role: 'type' edges — canvas gestures, not dataflow).
const CANVAS_PERSISTENT_NODE_TYPES = [...RECORD_NODE_TYPES, 'ctsType'];


export function hasCanonicalProcessSource(definition = {}) {
  const data = definition.data || definition;
  return ['roleGrants', 'servicePrincipals', 'producerOutputs', 'actions', 'services', 'sockets', 'statusDefinitions', 'valueInputs', 'processNodes', 'screens']
    .some(key => data[key] && typeof data[key] === 'object' && Object.keys(data[key]).length > 0);
}

export function definitionToCanvas(definition = {}) {
  const process = normalizeProcessLike(definition);
  assertEditableSource(process);

  const projectedNodes = projectRecordNodes(process);
  const projectedBySemanticId = new Map(projectedNodes.map(node => [semanticNodeId(node), node]));
  const savedNodes = (process.graph.nodes || [])
    .filter(node => CANVAS_PERSISTENT_NODE_TYPES.includes(node.type))
    .map(node => node.type === 'ctsType'
      ? normalizeCanvasNode(node)
      : (projectedBySemanticId.has(semanticNodeId(node))
        ? mergeProjectedNode(projectedBySemanticId.get(semanticNodeId(node)), node)
        : null))
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
    const mismatches = compareSemanticRecords(process, roundTripped);
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

export function validateCanvasSemantics(canvas = {}, previousDefinition = {}) {
  const definition = canvasToDefinition(canvas, previousDefinition);
  return validateRoundTrip(definition);
}

function assertEditableSource(process = {}) {
  if (process.compiled && !hasCanonicalProcessSource(process)) {
    throw new Error('Process definition has only a compiled runtime contract; canonical semantic records are required for editing');
  }
}

function normalizeProcessLike(definition = {}) {
  const data = definition.data || definition;
  return {
    schemaVersion: data.schemaVersion || 1,
    dataflowVersion: data.dataflowVersion,
    sourceTemplateId: data.sourceTemplateId || null,
    sourceProcessDefinitionId: data.sourceProcessDefinitionId || null,
    graph: normalizeGraph(data.graph),
    roleGrants: normalizeRecord(data.roleGrants),
    servicePrincipals: normalizeRecord(data.servicePrincipals),
    producerOutputs: normalizeRecord(data.producerOutputs),
    actions: normalizeRecord(data.actions),
    services: normalizeRecord(data.services),
    sockets: normalizeRecord(data.sockets),
    statusDefinitions: normalizeRecord(data.statusDefinitions),
    valueInputs: normalizeRecord(data.valueInputs),
    processNodes: normalizeRecord(data.processNodes),
    screens: normalizeRecord(data.screens),
    // Graph protocol marker survives the canvas round trip (SPEC §20).
    ...(data.graphProtocol ? { graphProtocol: data.graphProtocol } : {}),
    compiled: data.compiled || null
  };
}

function projectRecordNodes(process) {
  return [
    ...projectRecords(process.statusDefinitions, 'statusDefinition', 560),
    ...projectRecords(process.processNodes, 'processNode', 420)
  ];
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
        label: record.label || record.entityType || record.commandId || refId
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
  for (const key of ['roleGrants', 'servicePrincipals', 'producerOutputs', 'actions', 'services', 'sockets', 'statusDefinitions', 'valueInputs', 'processNodes', 'screens']) {
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

function normalizeGraph(graph = {}) {
  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map(normalizeCanvasNode) : [],
    edges: Array.isArray(graph.edges) ? graph.edges.map(normalizeCanvasEdge) : [],
    viewport: normalizeViewport(graph.viewport)
  };
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
  const sourceHandle = edge.sourceHandle || inferEdgeHandle(edge, 'source');
  const targetHandle = edge.targetHandle || inferEdgeHandle(edge, 'target');
  return {
    id: String(edge.id || `${edge.source || ''}-${edge.target || ''}`),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    sourceHandle,
    targetHandle,
    type: edge.type || 'default',
    // 'type'-role wires are binding gestures (type node -> species node);
    // they persist with the canvas and are filtered from validation.
    ...(edge.role ? { role: edge.role } : {}),
    data: edge.data && typeof edge.data === 'object' ? edge.data : {}
  };
}

function inferEdgeHandle(edge = {}, side = 'source') {
  const dataKey = side === 'source' ? 'sourceHandle' : 'targetHandle';
  if (edge.data?.[dataKey]) return edge.data[dataKey];
  const id = String(edge.id || '');
  const pattern = side === 'source'
    ? /(?:^|[-])((?:output)(?::[A-Za-z0-9_.:]+)?)(?=[-]|$)/
    : /(?:^|[-])((?:input|data)(?::[A-Za-z0-9_.:]+)?)(?=[-]|$)/;
  const match = id.match(pattern);
  return match?.[1] || null;
}

function normalizePosition(position = {}) {
  return {
    x: Number(position.x || 0),
    y: Number(position.y || 0)
  };
}

function normalizeViewport(viewport = {}) {
  return {
    x: Number(viewport?.x || 0),
    y: Number(viewport?.y || 0),
    zoom: Number(viewport?.zoom || 1)
  };
}

function normalizeRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}
