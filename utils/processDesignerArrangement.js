// Layered arrangement for the process canvas — the Tidy command's engine.
// Contract (canonical): components/process-designer/README.md
// "Auto-arrangement (Tidy)". Pure: nodes, edges, lane bands in → positions
// out. Deterministic and idempotent: initial orders come from authored y
// (id as tiebreaker) and every later pass is a stable sort, so running the
// pass over its own output reproduces it.
const COLUMN_PITCH = 420;
const LANE_ROW_HEIGHT = 170;
const LANE_ROW_INSET = 24;
const SECONDARY_PITCH = 150;
const DECLARATION_PITCH = 120;
const BARYCENTER_MAX_SWEEPS = 12;

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

  const columns = new Map();
  for (const node of nodes) if (!isDeclaration(node)) columns.set(node.id, layer.get(node.id));
  const y = new Map();

  // y for effects: one row per band member, ordered by barycenter sweeps
  // over flow-connected effects (authored y as the initial order).
  const bandOrder = new Map((bands || []).map(band => [band.id, []]));
  for (const node of nodes) {
    if (!effects.has(node.id)) continue;
    const band = bandOfNodeId?.get(node.id);
    if (band && bandOrder.has(band.id)) bandOrder.get(band.id).push(node.id);
  }
  const rows = new Map();
  const rowY = id => bandOfNodeId.get(id).top + LANE_ROW_INSET + rows.get(id) * LANE_ROW_HEIGHT;
  const flowEffectNeighbors = new Map();
  for (const edge of processEdges) {
    if (!effects.has(edge.source) || !effects.has(edge.target)) continue;
    for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!flowEffectNeighbors.has(from)) flowEffectNeighbors.set(from, []);
      flowEffectNeighbors.get(from).push(to);
    }
  }
  for (const members of bandOrder.values()) {
    members.sort((left, right) => byAuthoredY(byId, left, right));
    members.forEach((id, index) => rows.set(id, index));
  }
  // Sweeps run to a stable order (bounded): the pass is idempotent —
  // running it over its own output reproduces it.
  for (let sweep = 0; sweep < BARYCENTER_MAX_SWEEPS; sweep += 1) {
    const before = [...rows.entries()].sort().map(([, row]) => row).join();
    const downward = sweep % 2 === 0;
    for (const members of bandOrder.values()) {
      const barycenter = id => {
        const along = (flowEffectNeighbors.get(id) || []).filter(other => rows.has(other) && (
          downward
            ? (predecessors.get(id) || []).includes(other)
            : (successors.get(id) || []).includes(other)
        ));
        if (!along.length) return null;
        return along.reduce((sum, other) => sum + rowY(other), 0) / along.length;
      };
      members.sort((left, right) => (
        (barycenter(left) ?? rowY(left)) - (barycenter(right) ?? rowY(right))
        || rows.get(left) - rows.get(right)
      ));
      members.forEach((id, index) => rows.set(id, index));
    }
    if ([...rows.entries()].sort().map(([, row]) => row).join() === before) break;
  }
  for (const members of bandOrder.values()) {
    for (const id of members) y.set(id, rowY(id));
  }

  // y for secondary process nodes: stack near the nearest effect
  // downstream; a node with no downstream effect keeps its authored y.
  const downstreamAnchor = id => {
    const queue = [[id, 0]];
    const seen = new Set([id]);
    let best = null;
    while (queue.length) {
      const [current, hops] = queue.shift();
      for (const next of successors.get(current) || []) {
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
  const anchorGroups = new Map();
  for (const node of nodes) {
    if (isDeclaration(node) || effects.has(node.id)) continue;
    const anchor = downstreamAnchor(node.id);
    if (!anchor) continue;
    if (!anchorGroups.has(anchor)) anchorGroups.set(anchor, []);
    anchorGroups.get(anchor).push(node.id);
  }
  for (const [anchor, memberIds] of anchorGroups) {
    memberIds.sort((left, right) => byAuthoredY(byId, left, right));
    memberIds.forEach((id, index) => {
      y.set(id, Math.round(rowY(anchor) + (index - (memberIds.length - 1) / 2) * SECONDARY_PITCH));
    });
  }
  for (const node of nodes) {
    if (isDeclaration(node) || effects.has(node.id) || y.has(node.id)) continue;
    y.set(node.id, Math.round(node.position?.y || 0));
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
    // Half a secondary pitch off the secondary stack: declarations and
    // secondaries anchored to the same node interleave instead of
    // colliding.
    const interleave = SECONDARY_PITCH / 2;
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
