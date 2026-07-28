import { PROCESS_DATAFLOW_VERSION } from './ports.js';

const CURRENT_KINDS = new Set([
  'entityQuery', 'entityRef', 'entityDecompose', 'entityField', 'entityFilter', 'entitySelect', 'entityCompose', 'entityModify',
  'blockRead', 'blockCompose', 'blockModify',
  'cast', 'fallback', 'stringOp', 'compare', 'logic', 'entityCondition', 'predicateLogic', 'listLength'
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

  let processNodes = Object.fromEntries(Object.entries(process.processNodes || {}).map(([id, record = {}]) => {
    const next = migrateNode(id, record, graph, graphNodeIdsByRecord.get(String(id)));
    if (JSON.stringify(next) !== JSON.stringify(record)) changed = true;
    return [id, next];
  }));
  let migratedGraph = migrateGraph(graph, process.processNodes || {}, graphNodeIdsByRecord);
  const predicateMigration = migratePredicatePipelines(migratedGraph, processNodes);
  migratedGraph = predicateMigration.graph;
  processNodes = predicateMigration.processNodes;
  if (predicateMigration.changed || process.dataflowVersion !== PROCESS_DATAFLOW_VERSION) changed = true;
  if (JSON.stringify(migratedGraph) !== JSON.stringify(graph)) changed = true;

  const migrated = {
    ...process,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
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

  const { sourceValueType: _sourceValueType, ...cleanRecord } = record;
  return {
    ...cleanRecord,
    id: record.id || id,
    kind,
    operation,
    path,
    structure: record.structure === 'list' ? 'list' : 'item',
    valueType: normalizeValueType(record.valueType),
    inputs: [],
    outputs: []
  };
}

function migratePredicatePipelines(graph, records) {
  const processNodes = Object.fromEntries(Object.entries(records).map(([id, record]) => [id, { ...record }]));
  let nodes = [...(graph.nodes || [])];
  let edges = [...(graph.edges || [])];
  const recordIdByGraphId = new Map(nodes
    .filter(node => node.type === 'processNode')
    .map(node => [String(node.id), String(node.data?.refId || node.id)]));
  let changed = false;

  function recordForGraphNode(graphNodeId) {
    return processNodes[recordIdByGraphId.get(String(graphNodeId))];
  }

  function incoming(graphNodeId, inputId) {
    return edges.find(edge => (
      String(edge.target) === String(graphNodeId)
      && normalizedHandle(edge.targetHandle) === inputId
    ));
  }

  function convert(graphNodeId, entityType) {
    const recordId = recordIdByGraphId.get(String(graphNodeId));
    const record = processNodes[recordId];
    if (!record) throw new Error(`Cannot migrate entity predicate: missing process node ${graphNodeId}`);
    if (record.kind === 'entityCondition' || record.kind === 'predicateLogic') return;

    if (record.kind === 'logic') {
      const left = incoming(graphNodeId, 'left');
      const right = record.operation === 'not' ? null : incoming(graphNodeId, 'right');
      if (!left || (record.operation !== 'not' && !right)) {
        throw new Error(`Cannot migrate process node ${recordId}: predicate logic is incomplete`);
      }
      convert(left.source, entityType);
      if (right) convert(right.source, entityType);
      processNodes[recordId] = { ...record, kind: 'predicateLogic', entityType, structure: 'item' };
      changed = true;
      return;
    }

    if (record.kind !== 'compare') {
      throw new Error(`Cannot migrate process node ${recordId}: Boolean masks are no longer entity predicates`);
    }
    const left = incoming(graphNodeId, 'left');
    const fieldRecord = left && recordForGraphNode(left.source);
    if (!left || fieldRecord?.kind !== 'entityField' || fieldRecord.entityType !== entityType) {
      throw new Error(`Cannot migrate process node ${recordId}: comparison must read a ${entityType} field`);
    }
    processNodes[recordId] = {
      ...record,
      kind: 'entityCondition',
      entityType,
      path: fieldRecord.path,
      valueType: fieldRecord.valueType,
      structure: 'item'
    };
    edges = edges
      .filter(edge => edge !== left)
      .map(edge => (
        String(edge.target) === String(graphNodeId) && normalizedHandle(edge.targetHandle) === 'right'
          ? { ...edge, targetHandle: prefixedHandle(edge.targetHandle, 'value') }
          : edge
      ));
    const otherFieldOutputs = edges.filter(edge => String(edge.source) === String(left.source));
    if (!otherFieldOutputs.length) {
      nodes = nodes.filter(node => String(node.id) !== String(left.source));
      edges = edges.filter(edge => String(edge.source) !== String(left.source) && String(edge.target) !== String(left.source));
      delete processNodes[recordIdByGraphId.get(String(left.source))];
    }
    changed = true;
  }

  for (const edge of [...edges]) {
    const filter = recordForGraphNode(edge.target);
    if (filter?.kind !== 'entityFilter' || !['mask', 'predicate'].includes(normalizedHandle(edge.targetHandle))) continue;
    if (normalizedHandle(edge.targetHandle) === 'mask') {
      convert(edge.source, filter.entityType);
      const liveEdge = edges.find(item => item === edge);
      if (liveEdge) liveEdge.targetHandle = prefixedHandle(liveEdge.targetHandle, 'predicate');
      changed = true;
    }
  }
  return { changed, graph: { ...graph, nodes, edges }, processNodes };
}

function normalizedHandle(handle = '') {
  return String(handle || '').replace(/^(input|output|data):/, '') || 'input';
}

function prefixedHandle(handle = '', id) {
  return String(handle || '').startsWith('input:') ? `input:${id}` : id;
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
