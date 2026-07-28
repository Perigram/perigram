const CURRENT_KINDS = new Set([
  'entityQuery', 'entityRef', 'entityDecompose', 'entityField', 'entityFilter', 'entitySelect', 'entityCompose', 'entityModify',
  'blockRead', 'blockCompose', 'blockModify',
  'cast', 'fallback', 'stringOp', 'compare', 'logic', 'listLength'
]);

export function migrateProcessDataflowDefinition(definition = {}) {
  const process = definition?.data?.graph ? definition.data : definition;
  const graph = process.graph || { nodes: [], edges: [] };
  const graphNodeIdsByRecord = new Map((graph.nodes || [])
    .filter(node => node.type === 'processNode')
    .map(node => [String(node.data?.refId || node.id), String(node.id)]));
  let changed = false;

  const valueInputs = Object.fromEntries(Object.entries(process.valueInputs || {}).map(([id, input = {}]) => {
    const { block: _block, path: _path, outputs: _outputs, ...rest } = input;
    const next = {
      ...rest,
      id: input.id || id,
      valueType: normalizeValueType(input.valueType),
      structure: input.structure === 'list' ? 'list' : 'item'
    };
    if (_block || _path || _outputs || input.structure !== next.structure || input.valueType !== next.valueType) changed = true;
    return [id, next];
  }));

  const processNodes = Object.fromEntries(Object.entries(process.processNodes || {}).map(([id, record = {}]) => {
    const next = migrateNode(id, record, graph, graphNodeIdsByRecord.get(String(id)));
    if (JSON.stringify(next) !== JSON.stringify(record)) changed = true;
    return [id, next];
  }));
  const migratedGraph = migrateGraph(graph, process.processNodes || {}, graphNodeIdsByRecord);
  if (JSON.stringify(migratedGraph) !== JSON.stringify(graph)) changed = true;

  const migrated = {
    ...process,
    graph: migratedGraph,
    valueInputs,
    processNodes,
    compiled: changed ? null : process.compiled
  };
  return definition?.data?.graph
    ? { changed, value: { ...definition, data: migrated } }
    : { changed, value: migrated };
}

function migrateNode(id, record, graph, graphNodeId) {
  let kind = record.kind;
  let operation = record.operation || '';
  if (kind === 'fieldRead') kind = 'entityDecompose';
  if (kind === 'collection') {
    kind = operation === 'count' ? 'listLength' : 'entitySelect';
    operation = operation === 'count' ? '' : 'first';
  }
  if (kind === 'blockCompose' && hasIncomingBlock(graph, graphNodeId)) kind = 'blockModify';
  if (kind === 'logic' && operation === 'coalesce') {
    kind = 'fallback';
    operation = '';
  }
  if (!CURRENT_KINDS.has(kind)) throw new Error(`Cannot migrate process node ${id}: unknown kind ${kind || '(empty)'}`);
  const path = ['blockRead', 'blockCompose', 'blockModify'].includes(kind)
    ? canonicalBlockPath(record.block, record.path)
    : (record.path || '');

  return {
    ...record,
    id: record.id || id,
    kind,
    operation,
    path,
    structure: record.structure === 'list' ? 'list' : 'item',
    valueType: normalizeValueType(record.valueType),
    sourceValueType: kind === 'cast' ? normalizeValueType(record.sourceValueType) : (record.sourceValueType || ''),
    inputs: [],
    outputs: []
  };
}

function canonicalBlockPath(block, path) {
  const cleanBlock = String(block || '').trim();
  const cleanPath = String(path || '').trim();
  if (!cleanBlock || !cleanPath || cleanPath.startsWith(`${cleanBlock}.`)) return cleanPath;
  return `${cleanBlock}.${cleanPath}`;
}

function migrateGraph(graph, records, graphNodeIdsByRecord) {
  const entitySelectNodeIds = new Set(Object.entries(records)
    .filter(([, record]) => record.kind === 'collection' && record.operation !== 'count')
    .map(([id]) => graphNodeIdsByRecord.get(String(id)))
    .filter(Boolean));
  return {
    ...graph,
    nodes: (graph.nodes || []).map(node => {
      if (node.type === 'valueInput') {
        const { block: _block, path: _path, outputs: _outputs, ...data } = node.data || {};
        return { ...node, data };
      }
      if (node.type !== 'processNode') return node;
      const { inputs: _inputs, outputs: _outputs, ...data } = node.data || {};
      return { ...node, data };
    }),
    edges: (graph.edges || []).map(edge => (
      entitySelectNodeIds.has(String(edge.target))
      && ['items', 'input:items'].includes(String(edge.targetHandle || ''))
        ? { ...edge, targetHandle: String(edge.targetHandle).startsWith('input:') ? 'input:entities' : 'entities' }
        : edge
    ))
  };
}

function hasIncomingBlock(graph, graphNodeId) {
  return Boolean(graphNodeId && (graph.edges || []).some(edge => (
    String(edge.target) === graphNodeId
    && ['input:block', 'block'].includes(String(edge.targetHandle || ''))
  )));
}

function normalizeValueType(value) {
  if (value === 'object') return 'json';
  return ['string', 'number', 'boolean', 'json', 'date'].includes(value) ? value : 'string';
}
