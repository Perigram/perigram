export const FACADE_PATTERN_NODE_TYPES = [
  'number', 'vector', 'series', 'rectangle', 'move', 'rotate', 'scale',
  'grid', 'stagger', 'clip', 'meshPart', 'surfaceMap', 'cassette', 'placements'
];

export function validateFacadePatternGraph(graph = {}) {
  const issues = [];
  if (graph.schemaVersion !== 1) issues.push('Facade pattern graph schemaVersion must be 1');
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const ids = new Set();
  for (const node of nodes) {
    if (!node?.id || ids.has(node.id)) issues.push('Facade pattern graph node ids must be unique');
    ids.add(node?.id);
    if (!FACADE_PATTERN_NODE_TYPES.includes(node?.type)) issues.push(`Unsupported facade pattern node type: ${node?.type || 'unknown'}`);
  }
  const nodeIds = new Set(nodes.map(node => node.id));
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  for (const edge of edges) if (!nodeIds.has(edge?.source) || !nodeIds.has(edge?.target)) issues.push('Facade pattern graph edges must connect existing nodes');
  const adjacency = new Map(nodes.map(node => [node.id, []]));
  for (const edge of edges) adjacency.get(edge.source)?.push(edge.target);
  const visiting = new Set(); const visited = new Set();
  const visit = id => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); const cyclic = (adjacency.get(id) || []).some(visit); visiting.delete(id); visited.add(id); return cyclic; };
  if (nodes.some(node => visit(node.id))) issues.push('Facade pattern graph must be acyclic');
  return [...new Set(issues)];
}

export function evaluateFacadeGrid({ width = 0, height = 0, cellWidth = 1, cellHeight = 1, gap = 0, stagger = false } = {}) {
  const columns = Math.max(0, Math.floor((Number(width) + Number(gap)) / Math.max(1, Number(cellWidth) + Number(gap))));
  const rows = Math.max(0, Math.floor((Number(height) + Number(gap)) / Math.max(1, Number(cellHeight) + Number(gap))));
  const placements = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const x = column * (Number(cellWidth) + Number(gap)) + (stagger && row % 2 ? (Number(cellWidth) + Number(gap)) / 2 : 0);
    if (x + Number(cellWidth) > Number(width)) continue;
    placements.push({ id: `r${row}c${column}`, outline: [[x, row * (Number(cellHeight) + Number(gap))], [x + Number(cellWidth), row * (Number(cellHeight) + Number(gap))], [x + Number(cellWidth), row * (Number(cellHeight) + Number(gap)) + Number(cellHeight)], [x, row * (Number(cellHeight) + Number(gap)) + Number(cellHeight)]] });
  }
  return placements;
}
