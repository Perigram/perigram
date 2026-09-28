// Layered arrangement for the process canvas — the Tidy command's engine.
// Contract (canonical): components/process-designer/README.md
// "Auto-arrangement (Tidy)". Pure: nodes, edges, lane band membership in →
// positions plus content-hugging band geometry out. Deterministic and
// idempotent: every choice is a stable order or a selection from constant
// inputs, so running the pass over its own output reproduces it.
const COLUMN_PITCH = 420;
const LANE_ROW_HEIGHT = 170;
const LANE_ROW_INSET = 24;
const LANE_MIN_HEIGHT = 150;
const LANE_PADDING = 24;
const SECONDARY_GAP = 150;
const DECLARATION_PITCH = 120;
const PROCESS_CARD_HEIGHT = 140;
const DECLARATION_CARD_HEIGHT = 96;

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

  // The whole y pass runs in band-relative coordinates: every node is
  // placed inside exactly one band (effects by grant, secondaries and
  // declarations by their anchor), so band geometry derives from content
  // and no node can cross a lane divider.
  const bandIds = new Set(bands.map(band => band.id));
  const bandOf = id => {
    const band = bandOfNodeId?.get(id);
    return band && bandIds.has(band.id) ? band : null;
  };
  const nodeBand = new Map();
  const relY = new Map();
  const absY = new Map();

  // Effects: packed rows per band. Columns process left-to-right; a
  // member takes the free row of its band nearest the median row of its
  // already-placed same-band flow neighbors — a sequence continues level,
  // and an unanchored member takes the lowest free row. Same-column
  // members stack; rows are reused across columns.
  for (const node of nodes) {
    if (!effects.has(node.id)) continue;
    const band = bandOf(node.id);
    if (band) nodeBand.set(node.id, band);
  }
  const sameBandNeighbors = new Map();
  for (const edge of processEdges) {
    if (!nodeBand.has(edge.source) || !nodeBand.has(edge.target)) continue;
    if (nodeBand.get(edge.source).id !== nodeBand.get(edge.target).id) continue;
    for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!sameBandNeighbors.has(from)) sameBandNeighbors.set(from, []);
      sameBandNeighbors.get(from).push(to);
    }
  }
  const rows = new Map();
  const columnBands = new Map();
  for (const [id, band] of nodeBand) {
    const column = layer.get(id);
    if (!columnBands.has(column)) columnBands.set(column, []);
    columnBands.get(column).push({ id, bandId: band.id });
  }
  const targetRow = id => {
    const placed = (sameBandNeighbors.get(id) || []).filter(other => rows.has(other));
    if (!placed.length) return null;
    const sorted = placed.map(other => rows.get(other)).sort((left, right) => left - right);
    return sorted[(sorted.length - 1) >> 1];
  };
  const bandRowColumns = new Map();
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
  for (const [id] of nodeBand) {
    if (rows.has(id)) relY.set(id, LANE_ROW_INSET + rows.get(id) * LANE_ROW_HEIGHT);
  }

  // Secondary process nodes: their band is their anchor effect's band
  // (nearest downstream first); their relative y is the median of the
  // effect rows they touch, spread within the column so cards clear each
  // other and the fixed effect rows. Effect rows never depend on
  // secondaries, so the targets are constants and the placement is
  // idempotent. A node touching no effect keeps its authored y.
  const neighborsOf = new Map();
  for (const edge of processEdges) {
    for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!neighborsOf.has(from)) neighborsOf.set(from, []);
      neighborsOf.get(from).push(to);
    }
  }
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
  const effectAnchors = id => {
    const ordered = [];
    const push = anchor => {
      if (anchor && rows.has(anchor) && !ordered.includes(anchor)) ordered.push(anchor);
    };
    push(nearestEffect(id, successors));
    for (const other of neighborsOf.get(id) || []) if (effects.has(other)) push(other);
    push(nearestEffect(id, predecessors));
    return ordered;
  };
  const spreadGroups = new Map();
  for (const node of nodes) {
    if (isDeclaration(node) || effects.has(node.id)) continue;
    const anchors = effectAnchors(node.id);
    if (!anchors.length) {
      absY.set(node.id, Math.round(node.position?.y || 0));
      continue;
    }
    const band = nodeBand.get(anchors[0]);
    if (!band) {
      absY.set(node.id, Math.round(node.position?.y || 0));
      continue;
    }
    nodeBand.set(node.id, band);
    const key = `${layer.get(node.id)}|${band.id}`;
    if (!spreadGroups.has(key)) spreadGroups.set(key, { column: layer.get(node.id), bandId: band.id, fixed: [], movable: [] });
    spreadGroups.get(key).movable.push({ id: node.id, target: medianOf(anchors.map(anchor => relY.get(anchor))) });
  }
  for (const [id] of nodeBand) {
    if (!effects.has(id) || !rows.has(id)) continue;
    const key = `${layer.get(id)}|${nodeBand.get(id).id}`;
    if (!spreadGroups.has(key)) spreadGroups.set(key, { column: layer.get(id), bandId: nodeBand.get(id).id, fixed: [], movable: [] });
    spreadGroups.get(key).fixed.push({ id, target: relY.get(id) });
  }
  for (const key of [...spreadGroups.keys()].sort((left, right) => {
    const [leftColumn] = left.split('|');
    const [rightColumn] = right.split('|');
    return Number(leftColumn) - Number(rightColumn);
  })) {
    const { fixed, movable } = spreadGroups.get(key);
    const items = [
      ...fixed.map(item => ({ ...item, fixed: true })),
      ...movable.map(item => ({ ...item, fixed: false }))
    ].sort((left, right) => left.target - right.target || byAuthoredY(byId, left.id, right.id));
    let cursor = null;
    for (const item of items) {
      if (item.fixed) {
        cursor = item.target;
        continue;
      }
      const placed = cursor === null ? item.target : Math.max(item.target, cursor + SECONDARY_GAP);
      relY.set(item.id, Math.round(placed));
      cursor = placed;
    }
  }

  // Declarations never flow: a cluster anchors one column left of the
  // nearest process node its type wires touch and stacks around it, in
  // that node's band. A declaration island bound to no process node (or
  // anchored to a bandless one) is not moved.
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
    if (!anchor || !nodeBand.has(anchor)) continue;
    if (!declarationGroups.has(anchor)) declarationGroups.set(anchor, []);
    declarationGroups.get(anchor).push(node.id);
  }
  for (const [anchor, memberIds] of declarationGroups) {
    memberIds.sort((left, right) => byAuthoredY(byId, left, right));
    // Half a secondary gap off the secondary positions: declarations and
    // secondaries sharing a column interleave instead of colliding.
    const interleave = SECONDARY_GAP / 2;
    memberIds.forEach((id, index) => {
      columns.set(id, layer.get(anchor) - 1);
      nodeBand.set(id, nodeBand.get(anchor));
      relY.set(id, Math.round(relY.get(anchor)
        + (index - (memberIds.length - 1) / 2) * DECLARATION_PITCH + interleave));
    });
  }

  // Band geometry: content-hugging. Each band sizes to its content extent
  // plus padding (empty bands keep the minimum) and the bands stack in
  // their given order.
  const cardHeightOf = id => (isDeclaration(byId.get(id)) ? DECLARATION_CARD_HEIGHT : PROCESS_CARD_HEIGHT);
  const bandTops = new Map();
  const geometry = [];
  let top = 0;
  for (const band of bands) {
    const members = [...nodeBand.entries()].filter(([, memberBand]) => memberBand.id === band.id);
    const bottom = members.length
      ? Math.max(...members.map(([id]) => relY.get(id) + cardHeightOf(id)))
      : 0;
    const height = Math.max(LANE_MIN_HEIGHT, bottom + LANE_PADDING);
    bandTops.set(band.id, top);
    geometry.push({ ...band, top, height });
    top += height;
  }

  // Column normalization: declarations may sit one column left of the
  // flow sources — shift so the leftmost column starts at x = 0.
  let shift = 0;
  for (const column of columns.values()) if (column + shift < 0) shift = -column;

  const arranged = new Map();
  for (const node of nodes) {
    if (!columns.has(node.id)) continue;
    const band = nodeBand.get(node.id);
    if (!band && !absY.has(node.id)) continue;
    const y = band
      ? bandTops.get(band.id) + relY.get(node.id)
      : absY.get(node.id);
    arranged.set(node.id, {
      x: (columns.get(node.id) + shift) * COLUMN_PITCH,
      y
    });
  }
  return { positions: arranged, bands: geometry };
}
