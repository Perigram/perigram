// Legacy process-definition storage codec. This is not a second graph engine
// and must not grow new graph behavior. Existing process records still store
// this shape, so retain normalization at the persistence boundary until that
// storage format is explicitly retired. Canonical graph behavior belongs to
// packages/core and provider contracts belong to the Plugin SDK.

export function normalizeGraph(graph = {}) {
  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map(normalizeNode) : [],
    // Declaration wires (`role: 'type'`) survive normalization: machine
    // vocabulary (state nesting, entry wires) reads them from the
    // normalized graph by node type and handle. They are not dataflow —
    // every role-classifying consumer (cycle checks, control/data walkers)
    // skips a `type`-role edge, so a declaration wire never counts as a
    // data or control connection.
    edges: Array.isArray(graph.edges)
      ? graph.edges.map(normalizeEdge)
      : [],
    viewport: {
      x: Number(graph.viewport?.x || 0),
      y: Number(graph.viewport?.y || 0),
      zoom: Number(graph.viewport?.zoom || 1)
    }
  };
}

function normalizeNode(node = {}) {
  return {
    id: String(node.id || ''),
    type: node.type || 'default',
    position: {
      x: Number(node.position?.x || 0),
      y: Number(node.position?.y || 0)
    },
    data: node.data && typeof node.data === 'object' ? node.data : {}
  };
}

function normalizeEdge(edge = {}) {
  const sourceHandle = edge.sourceHandle || inferEdgeHandle(edge, 'source');
  const targetHandle = edge.targetHandle || inferEdgeHandle(edge, 'target');
  return {
    id: String(edge.id || `${edge.source || ''}-${edge.target || ''}`),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    sourceHandle,
    targetHandle,
    type: edge.type || 'default',
    // The declaration wire's role and label are its semantics (children/
    // declares/entry/targets); stripping them here reclassified every
    // declaration wire as data, so a declaration self-wire read as a
    // one-node data cycle.
    ...(edge.role ? { role: edge.role } : {}),
    ...(edge.label ? { label: edge.label } : {}),
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

export function normalizeRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

export function normalizeActions(value) {
  return Object.fromEntries(Object.entries(normalizeRecord(value)).map(([id, action]) => [id, normalizeActionRecord(action)]));
}

function normalizeActionRecord(action = {}) {
  if (action.actionKind !== 'changeStatus') return { ...action };
  const typeId = action.typeId || action.inputs?.find(input => input.typeId)?.typeId || '';
  const inputs = [...(action.inputs || [])];
  if (!inputs.some(input => input.id === 'entity')) {
    inputs.unshift({ id: 'entity', kind: 'entity', typeId, required: false });
  }
  if (!inputs.some(input => input.id === 'state')) {
    inputs.push({
      id: 'state',
      kind: 'state',
      stateRef: action.stateRef || null,
      state: action.state?.to || action.access?.stateTo || '',
      required: false
    });
  }
  return {
    ...action,
    actionKind: 'updateEntity',
    typeId,
    inputs,
    mutation: action.mutation || { fields: [] },
    access: {
      ...(action.access || {}),
      stateFrom: action.access?.stateFrom || action.state?.from || '',
      stateTo: action.access?.stateTo || action.state?.to || ''
    }
  };
}

