import { PROCESS_PROTOCOL_VERSION } from './types.js';

export function migrateProcessDefinitionV4(definition = {}) {
  const source = structuredClone(definition.data || definition);
  if (Number(source.dataflowVersion) === PROCESS_PROTOCOL_VERSION) return { changed: false, data: source, errors: [] };
  if (Number(source.dataflowVersion) !== 3) {
    return { changed: false, data: source, errors: [`Expected dataflow version 3, received ${source.dataflowVersion ?? 'none'}`] };
  }
  const errors = [];
  const graph = structuredClone(source.graph || { nodes: [], edges: [] });
  const processNodes = Object.fromEntries(Object.entries(source.processNodes || {}).map(([id, record]) => {
    const next = stripShapes(record);
    next.matching ||= 'longest';
    next.inputTransforms ||= {};
    if (record.type?.shape) next.access = record.type.shape;
    if (Array.isArray(next.entries)) {
      next.entries = next.entries.map(entry => {
        if (entry.operation && entry.operation !== 'replace') {
          errors.push(`Node ${id} entry ${entry.id} uses ${entry.operation}; rebuild it with explicit array/list operations`);
        }
        const migrated = { ...entry };
        delete migrated.cardinality;
        delete migrated.operation;
        return migrated;
      });
    }
    next.inputDefaults = Object.fromEntries(Object.entries(next.inputDefaults || {}).map(([socketId, value]) => [
      socketId,
      isTree(value) ? value : treeDefault(value, defaultAccess(next.kind, socketId))
    ]));
    return [id, next];
  }));

  for (const node of graph.nodes || []) {
    if (node.type !== 'processNode') continue;
    const recordId = String(node.data?.refId || node.id);
    const original = source.processNodes?.[recordId];
    const migrated = processNodes[recordId];
    if (!original || !migrated?.entries) continue;
    for (const entry of original.entries || []) {
      if (entry.cardinality !== 'many' || (entry.operation && entry.operation !== 'replace')) continue;
      const handle = `entry:${entry.id}`;
      const edgeIndex = graph.edges.findIndex(edge => String(edge.target) === String(node.id) && cleanHandle(edge.targetHandle) === handle);
      if (edgeIndex < 0) continue;
      const edge = graph.edges[edgeIndex];
      const collectId = uniqueId(`collect-${node.id}-${entry.id}`, graph.nodes);
      graph.nodes.push({ id: collectId, type: 'processNode', position: midpointNode(graph.nodes, edge.source, node.id), data: { refId: collectId } });
      processNodes[collectId] = {
        id: collectId,
        kind: 'collection.packArray',
        type: { base: 'entityRef', nullable: false, ...(entry.entityType ? { entityType: entry.entityType } : {}) },
        matching: 'longest',
        inputTransforms: {}
      };
      graph.edges.splice(edgeIndex, 1,
        { ...edge, id: `${edge.id || collectId}:in`, target: collectId, targetHandle: 'input:value' },
        { ...edge, id: `${edge.id || collectId}:out`, source: collectId, sourceHandle: 'output:value' }
      );
    }
  }

  return {
    changed: true,
    errors,
    data: {
      ...source,
      dataflowVersion: PROCESS_PROTOCOL_VERSION,
      graph,
      processNodes,
      compiled: null
    }
  };
}

function stripShapes(value) {
  if (Array.isArray(value)) return value.map(stripShapes);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['shape', 'structure', 'multiple'].includes(key))
    .map(([key, item]) => [key, stripShapes(item)]));
}

function treeDefault(value, access) {
  if (access === 'tree' && isTree(value)) return structuredClone(value);
  return { branches: [{ path: [], items: access === 'list' && Array.isArray(value) ? structuredClone(value) : [structuredClone(value)] }] };
}

function defaultAccess(kind, socketId) {
  if (kind === 'control.forEach' && socketId === 'items') return 'tree';
  if (['collection.packArray', 'collection.concat', 'collection.itemAt', 'collection.slice', 'collection.count', 'collection.distinct', 'collection.sort', 'collection.groupBy', 'collection.filter'].includes(kind)) return 'list';
  if (kind?.startsWith('tree.')) return 'tree';
  return 'item';
}

function isTree(value) { return Boolean(value && typeof value === 'object' && Array.isArray(value.branches)); }
function cleanHandle(handle = '') { return String(handle).replace(/^(input|output|data):/, ''); }
function uniqueId(base, nodes) {
  const ids = new Set(nodes.map(node => String(node.id)));
  let id = base;
  for (let suffix = 2; ids.has(id); suffix += 1) id = `${base}-${suffix}`;
  return id;
}
function midpointNode(nodes, sourceId, targetId) {
  const source = nodes.find(node => String(node.id) === String(sourceId))?.position || { x: 0, y: 0 };
  const target = nodes.find(node => String(node.id) === String(targetId))?.position || { x: source.x + 300, y: source.y };
  return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
}
