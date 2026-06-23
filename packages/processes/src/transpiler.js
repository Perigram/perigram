const CANVAS_RECORD_KEYS = {
  entity: 'entityProfiles',
  action: 'actions',
  service: 'services',
  socket: 'sockets',
  statusDefinition: 'statusDefinitions',
  valueInput: 'valueInputs'
};

const RECORD_NODE_TYPES = Object.keys(CANVAS_RECORD_KEYS);

export function hasCanonicalProcessSource(definition = {}) {
  const data = definition.data || definition;
  return ['roles', 'servicePrincipals', 'entityProfiles', 'actions', 'services', 'sockets', 'statusDefinitions', 'valueInputs', 'screens', 'assignments']
    .some(key => data[key] && typeof data[key] === 'object' && Object.keys(data[key]).length > 0);
}

export function definitionToCanvas(definition = {}) {
  const process = normalizeProcessLike(definition);
  assertEditableSource(process);

  const projectedNodes = projectRecordNodes(process);
  const projectedById = new Map(projectedNodes.map(node => [node.id, node]));
  const savedNodes = (process.graph.nodes || [])
    .filter(node => RECORD_NODE_TYPES.includes(node.type))
    .filter(node => projectedById.has(node.id))
    .map(node => mergeProjectedNode(projectedById.get(node.id), node));

  const savedIds = new Set(savedNodes.map(node => node.id));
  const missingProjectedNodes = projectedNodes.filter(node => !savedIds.has(node.id));
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

export function canvasToDefinition(canvas = {}, previousDefinition = {}) {
  const process = normalizeProcessLike(previousDefinition);
  const nodes = (canvas.nodes || [])
    .filter(node => RECORD_NODE_TYPES.includes(node.type))
    .map(node => normalizeCanvasNode(node));
  const nodeIds = new Set(nodes.map(node => node.id));
  const refsByKey = collectCanvasRefs(nodes);

  for (const [type, key] of Object.entries(CANVAS_RECORD_KEYS)) {
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
    sourceTemplateId: data.sourceTemplateId || null,
    sourceProcessDefinitionId: data.sourceProcessDefinitionId || null,
    graph: normalizeGraph(data.graph),
    roles: normalizeRecord(data.roles),
    servicePrincipals: normalizeRecord(data.servicePrincipals),
    entityProfiles: normalizeRecord(data.entityProfiles),
    actions: normalizeRecord(data.actions),
    services: normalizeRecord(data.services),
    sockets: normalizeRecord(data.sockets),
    statusDefinitions: normalizeRecord(data.statusDefinitions),
    valueInputs: normalizeRecord(data.valueInputs),
    screens: normalizeRecord(data.screens),
    assignments: normalizeRecord(data.assignments),
    compiled: data.compiled || null
  };
}

function projectRecordNodes(process) {
  return [
    ...projectRecords(process.entityProfiles, 'entity', 260),
    ...projectRecords(process.actions, 'action', 560),
    ...projectRecords(process.services, 'service', 860),
    ...projectRecords(process.sockets, 'socket', 1160),
    ...projectRecords(process.statusDefinitions, 'statusDefinition', 560),
    ...projectRecords(process.valueInputs, 'valueInput', 260)
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
    const key = CANVAS_RECORD_KEYS[node.type];
    if (!key) continue;
    refsByKey[key] ||= new Set();
    refsByKey[key].add(String(node.data?.refId || node.id));
  }
  return refsByKey;
}

function compareSemanticRecords(source, next) {
  const errors = [];
  for (const key of ['roles', 'servicePrincipals', 'entityProfiles', 'actions', 'services', 'sockets', 'statusDefinitions', 'valueInputs', 'screens', 'assignments']) {
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
  return {
    id: String(edge.id || `${edge.source || ''}-${edge.target || ''}`),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    sourceHandle: edge.sourceHandle || null,
    targetHandle: edge.targetHandle || null,
    type: edge.type || 'default',
    data: edge.data && typeof edge.data === 'object' ? edge.data : {}
  };
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
