// Layered arrangement for the process canvas — the Tidy command's engine.
// Contract (canonical): components/process-designer/README.md
// "Auto-arrangement (Tidy)". Pure: nodes, edges, lane bands in → positions
// out. Deterministic and idempotent: every choice is a stable order or a
// selection from constant inputs, so running the pass over its own output
// reproduces it.
const COLUMN_PITCH = 420;
const LANE_ROW_HEIGHT = 170;
const LANE_ROW_INSET = 24;
const SECONDARY_GAP = 150;
const DECLARATION_PITCH = 120;

function isDeclaration(node) {
  return node?.type !== 'processNode';
}

function byAuthoredY(byId, left, right) {
  return (byId.get(left).position?.y || 0) - (byId.get(right).position?.y || 0)
    || (left < right ? -1 : left > right ? 1 : 0);
}

export function arrangeProcessGraph({ nodes = [], edges = [], effectIds, bands = [], bandOfNodeId } = {}) {
  const effects = new Set(effectIds || []);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const processEdges = edges.filter(edge => (
    (edge.role || 'data') !== 'type'
    && byId.has(edge.source) && byId.has(edge.target)
    && !isDeclaration(byId.get(edge.source)) && !isDeclaration(byId.get(edge.target))
  ));

  const predecessors = new Map();
  const successors = new Map();
  for (const edge of processEdges) {
    if (!successors.has(edge.source)) successors.set(edge.source, []);
    successors.get(edge.source).push(edge.target);
    if (!predecessors.has(edge.target)) predecessors.set(edge.target, []);
    predecessors.get(edge.target).push(edge.source);
  }

  // x = column: longest-path layering over flow edges. A predecessor on
  // the current DFS path is a transient authoring cycle — it does not
  // advance the layer, so the pass terminates on cyclic drafts.
  const layer = new Map();
  const visiting = new Set();
  const depth = id => {
    if (layer.has(id)) return layer.get(id);
    visiting.add(id);
    let value = 0;
    for (const pred of predecessors.get(id) || []) {
      if (visiting.has(pred)) continue;
      value = Math.max(value, depth(pred) + 1);
    }
    visiting.delete(id);
    layer.set(id, value);
    return value;
  };
  for (const node of nodes) if (!isDeclaration(node)) depth(node.id);

  // Pull pred-less nodes toward their first consumer: longest-path
  // layering strands a fresh source at the leftmost column even when its
  // only consumer sits far right, producing long edges over empty
  // columns. A pred-less node never depends on another node's layer, so
  // one pass settles every pull.
  for (const node of nodes) {
    if (isDeclaration(node)) continue;
    const id = node.id;
    if ((predecessors.get(id) || []).length) continue;
    const successorLayers = (successors.get(id) || []).map(next => layer.get(next));
    if (!successorLayers.length) continue;
    const cap = Math.min(...successorLayers) - 1;
    if (cap > layer.get(id)) layer.set(id, cap);
  }

  const columns = new Map();
  for (const node of nodes) if (!isDeclaration(node)) columns.set(node.id, layer.get(node.id));
  const y = new Map();

  // y for effects: packed rows per band. Columns process left-to-right; a
  // member takes the free row of its band nearest the median row of its
  // already-placed same-band flow neighbors — a sequence continues level,
  // and an unanchored member takes the lowest free row. Same-column
  // members stack; rows are reused across columns.
  const bandIds = new Set((bands || []).map(band => band.id));
  const rows = new Map();
  const sameBandNeighbors = new Map();
  for (const edge of processEdges) {
    if (!effects.has(edge.source) || !effects.has(edge.target)) continue;
    if (bandOfNodeId?.get(edge.source)?.id !== bandOfNodeId?.get(edge.target)?.id) continue;
    for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!sameBandNeighbors.has(from)) sameBandNeighbors.set(from, []);
      sameBandNeighbors.get(from).push(to);
    }
  }
  const columnBands = new Map();
  for (const node of nodes) {
    if (!effects.has(node.id)) continue;
    const band = bandOfNodeId?.get(node.id);
    if (!band || !bandIds.has(band.id)) continue;
    const column = layer.get(node.id);
    if (!columnBands.has(column)) columnBands.set(column, []);
    columnBands.get(column).push({ id: node.id, bandId: band.id });
  }
  const rowY = id => bandOfNodeId.get(id).top + LANE_ROW_INSET + rows.get(id) * LANE_ROW_HEIGHT;
  const bandRowColumns = new Map();
  const targetRow = id => {
    const placed = (sameBandNeighbors.get(id) || []).filter(other => rows.has(other));
    if (!placed.length) return null;
    const sorted = placed.map(other => rows.get(other)).sort((left, right) => left - right);
    return sorted[(sorted.length - 1) >> 1];
  };
  for (const column of [...columnBands.keys()].sort((left, right) => left - right)) {
    const byBand = new Map();
    for (const entry of columnBands.get(column)) {
      if (!byBand.has(entry.bandId)) byBand.set(entry.bandId, []);
      byBand.get(entry.bandId).push(entry);
    }
    for (const [bandId, entries] of byBand) {
      if (!bandRowColumns.has(bandId)) bandRowColumns.set(bandId, []);
      const rowColumns = bandRowColumns.get(bandId);
      entries.sort((left, right) => {
        const leftTarget = targetRow(left.id);
        const rightTarget = targetRow(right.id);
        return (leftTarget === null ? 1 : 0) - (rightTarget === null ? 1 : 0)
          || (leftTarget ?? 0) - (rightTarget ?? 0)
          || (left.id < right.id ? -1 : 1);
      });
      for (const entry of entries) {
        const target = targetRow(entry.id);
        let row = 0;
        if (target === null) {
          while ((rowColumns[row] || new Set()).has(column)) row += 1;
        } else {
          // Nearest free row to the target; on a tie, the upper row.
          for (let distance = 0; ; distance += 1) {
            const up = target - distance;
            const down = target + distance;
            if (up >= 0 && !(rowColumns[up] || new Set()).has(column)) { row = up; break; }
            if (!(rowColumns[down] || new Set()).has(column)) { row = down; break; }
          }
        }
        if (!rowColumns[row]) rowColumns[row] = new Set();
        rowColumns[row].add(column);
        rows.set(entry.id, row);
      }
    }
  }
  for (const id of rows.keys()) y.set(id, rowY(id));

  // y for secondary process nodes: the median of the EFFECT rows they
  // touch — direct effect neighbors plus the nearest upstream and
  // downstream effects through secondary chains. Effect rows never
  // depend on secondaries, so the targets are constants: the placement
  // is idempotent by construction. Same-column cards spread to clear
  // each other and the fixed effect rows; a node touching no effect
  // keeps its authored y.
  const neighborsOf = new Map();
  for (const edge of processEdges) {
    for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!neighborsOf.has(from)) neighborsOf.set(from, []);
      neighborsOf.get(from).push(to);
    }
  }
  const authoredY = id => Math.round(byId.get(id).position?.y || 0);
  const medianOf = values => {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  };
  // Nearest effect along a direction, walking through non-effect nodes;
  // ties resolve to the leftmost layer, then id.
  const nearestEffect = (id, walk) => {
    const queue = [[id, 0]];
    const seen = new Set([id]);
    let best = null;
    while (queue.length) {
      const [current, hops] = queue.shift();
      for (const next of walk.get(current) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        if (effects.has(next)) {
          if (!best || hops < best.hops
            || (hops === best.hops && (layer.get(next) < layer.get(best.id)
              || (layer.get(next) === layer.get(best.id) && next < best.id)))) {
            best = { id: next, hops };
          }
          continue;
        }
        queue.push([next, hops + 1]);
      }
    }
    return best?.id || null;
  };
  const effectAnchorsY = id => {
    const anchors = new Set();
    for (const other of neighborsOf.get(id) || []) if (effects.has(other)) anchors.add(other);
    const downstream = nearestEffect(id, successors);
    const upstream = nearestEffect(id, predecessors);
    if (downstream) anchors.add(downstream);
    if (upstream) anchors.add(upstream);
    return [...anchors].map(other => y.get(other));
  };
  const columnItems = new Map();
  for (const node of nodes) {
    if (isDeclaration(node)) continue;
    const column = layer.get(node.id);
    if (!columnItems.has(column)) columnItems.set(column, { fixed: [], movable: [] });
    columnItems.get(column)[effects.has(node.id) ? 'fixed' : 'movable'].push(node.id);
  }
  for (const column of [...columnItems.keys()].sort((left, right) => left - right)) {
    const { fixed, movable } = columnItems.get(column);
    const items = [
      ...fixed.map(id => ({ id, fixed: true, target: y.get(id) })),
      ...movable.map(id => ({ id, fixed: false, target: medianOf(effectAnchorsY(id)) ?? authoredY(id) }))
    ].sort((left, right) => left.target - right.target
      || byAuthoredY(byId, left.id, right.id));
    let cursor = null;
    for (const item of items) {
      if (item.fixed) {
        cursor = y.get(item.id);
        continue;
      }
      const placed = cursor === null ? item.target : Math.max(item.target, cursor + SECONDARY_GAP);
      y.set(item.id, Math.round(placed));
      cursor = placed;
    }
  }

  // Declarations never flow: a cluster anchors one column left of the
  // nearest process node its type wires touch and stacks around it. A
  // declaration island bound to no process node is not moved.
  const typeNeighbors = new Map();
  for (const edge of edges) {
    if (edge.role !== 'type') continue;
    for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!byId.has(from) || !byId.has(to)) continue;
      if (!typeNeighbors.has(from)) typeNeighbors.set(from, []);
      typeNeighbors.get(from).push(to);
    }
  }
  const declarationAnchor = id => {
    const queue = [id];
    const seen = new Set([id]);
    let best = null;
    while (queue.length) {
      const current = queue.shift();
      for (const next of typeNeighbors.get(current) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        if (isDeclaration(byId.get(next))) {
          queue.push(next);
          continue;
        }
        if (!best || layer.get(next) < layer.get(best)
          || (layer.get(next) === layer.get(best) && next < best)) best = next;
      }
    }
    return best;
  };
  const declarationGroups = new Map();
  for (const node of nodes) {
    if (!isDeclaration(node)) continue;
    const anchor = declarationAnchor(node.id);
    if (!anchor) continue;
    if (!declarationGroups.has(anchor)) declarationGroups.set(anchor, []);
    declarationGroups.get(anchor).push(node.id);
  }
  const nodeY = id => y.get(id) ?? Math.round(byId.get(id).position?.y || 0);
  for (const [anchor, memberIds] of declarationGroups) {
    memberIds.sort((left, right) => byAuthoredY(byId, left, right));
    // Half a secondary gap off the secondary positions: declarations and
    // secondaries sharing a column interleave instead of colliding.
    const interleave = SECONDARY_GAP / 2;
    memberIds.forEach((id, index) => {
      columns.set(id, layer.get(anchor) - 1);
      y.set(id, Math.round(nodeY(anchor) + (index - (memberIds.length - 1) / 2) * DECLARATION_PITCH + interleave));
    });
  }

  // Column normalization: declarations may sit one column left of the
  // flow sources — shift so the leftmost column starts at x = 0.
  let shift = 0;
  for (const column of columns.values()) if (column + shift < 0) shift = -column;

  const arranged = new Map();
  for (const node of nodes) {
    if (!columns.has(node.id) || !y.has(node.id)) continue;
    arranged.set(node.id, {
      x: (columns.get(node.id) + shift) * COLUMN_PITCH,
      y: y.get(node.id)
    });
  }
  return arranged;
}
