// Layered arrangement for the process canvas — the Tidy command's engine.
// Contract (canonical): components/process-designer/README.md
// "Auto-arrangement (Tidy)". Pure: nodes, edges, lane band membership in →
// positions plus content-hugging band geometry out.
//
// x is columnar (layering + pull-up; flow direction is preserved by
// construction). y is a constrained relaxation run to a stable state:
// each card settles to the median of its wired neighbors' y — the
// short-edge objective once columns are fixed — under hard constraints:
// every card stays inside its lane band, and no two cards in a column
// overlap. Bounded passes and stable orders make it deterministic and
// idempotent: running it over its own output moves nothing.
const COLUMN_PITCH = 420;
const LANE_ROW_HEIGHT = 170;
const LANE_INSET = 24;
const LANE_MIN_HEIGHT = 150;
const LANE_PADDING = 24;
const COLUMN_GAP = 16;
const PROCESS_CARD_HEIGHT = 140;
const DECLARATION_CARD_HEIGHT = 96;
const RELAX_PASSES = 24;
const RELAX_OUTER = 6;
const RELAX_EPSILON = 0.5;

function isDeclaration(node) {
  return node?.type !== 'processNode';
}

function cardHeightOf(node) {
  if (node?.dimensions?.height) return node.dimensions.height;
  return isDeclaration(node) ? DECLARATION_CARD_HEIGHT : PROCESS_CARD_HEIGHT;
}

function medianOf(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[(sorted.length - 1) >> 1];
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
  // only consumer sits far right. A pred-less node never depends on
  // another node's layer, so one pass settles every pull.
  for (const node of nodes) {
    if (isDeclaration(node)) continue;
    const id = node.id;
    if ((predecessors.get(id) || []).length) continue;
    const successorLayers = (successors.get(id) || []).map(next => layer.get(next));
    if (!successorLayers.length) continue;
    const cap = Math.min(...successorLayers) - 1;
    if (cap > layer.get(id)) layer.set(id, cap);
  }

  // Declarations anchor one column left of the nearest process node their
  // type wires touch; an unbound declaration island keeps its authored x.
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
  const columns = new Map();
  for (const node of nodes) {
    if (!isDeclaration(node)) {
      columns.set(node.id, layer.get(node.id));
      continue;
    }
    const anchor = declarationAnchor(node.id);
    // Anchored declarations sit one column left of their anchor; an
    // island snaps to the column grid nearest its authored x so the
    // per-column separation owns it like every other card.
    columns.set(node.id, anchor
      ? layer.get(anchor) - 1
      : Math.round((node.position?.x || 0) / COLUMN_PITCH));
  }

  // Band assignment: effects by grant; secondaries and declarations by
  // their anchor node's band; anything without an anchor by the band
  // nearest its authored position (a node may never cross a divider, so
  // it must live in some band).
  const bandIds = new Set(bands.map(band => band.id));
  const grantedBand = id => {
    const band = bandOfNodeId?.get(id);
    return band && bandIds.has(band.id) ? band : null;
  };
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
  const nearestBand = node => {
    if (!bands.length) return null;
    const center = (node.position?.y || 0) + cardHeightOf(node) / 2;
    let best = null;
    for (const band of bands) {
      const distance = center < band.top
        ? band.top - center
        : Math.max(0, center - (band.top + band.height));
      if (!best || distance < best.distance) best = { band, distance };
    }
    return best.band;
  };
  const bandOf = new Map();
  for (const node of nodes) {
    if (effects.has(node.id)) {
      const band = grantedBand(node.id);
      if (band) bandOf.set(node.id, band);
      continue;
    }
    if (!isDeclaration(node)) {
      const downstream = nearestEffect(node.id, successors);
      const anchor = grantedBand(downstream) ? downstream
        : grantedBand(nearestEffect(node.id, predecessors)) ? nearestEffect(node.id, predecessors)
          : null;
      const band = anchor ? grantedBand(anchor) : nearestBand(node);
      if (band) bandOf.set(node.id, band);
      continue;
    }
    const anchor = declarationAnchor(node.id);
    const band = (anchor && bandOf.get(anchor)) || nearestBand(node);
    if (band) bandOf.set(node.id, band);
  }

  // Relaxation neighbors: every wire counts, flow and declaration alike.
  const neighbors = new Map();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!neighbors.has(from)) neighbors.set(from, []);
      if (!neighbors.get(from).includes(to)) neighbors.get(from).push(to);
    }
  }

  // Init: effects stack per band and column (one row per same-column
  // member), secondaries start at the median of their anchor effects,
  // declarations at their anchor; everything clamps into its band.
  const y = new Map();
  const bandRows = new Map();
  for (const node of nodes) {
    if (!effects.has(node.id) || !bandOf.has(node.id)) continue;
    const band = bandOf.get(node.id);
    const column = columns.get(node.id);
    const key = `${band.id}|${column}`;
    const row = bandRows.get(key) || 0;
    bandRows.set(key, row + 1);
    y.set(node.id, LANE_INSET + row * LANE_ROW_HEIGHT);
  }
  const bandGeometry = () => {
    const heights = new Map();
    for (const band of bands) heights.set(band.id, LANE_MIN_HEIGHT);
    for (const node of nodes) {
      const band = bandOf.get(node.id);
      if (!band || !y.has(node.id)) continue;
      const bottom = y.get(node.id) + cardHeightOf(node);
      heights.set(band.id, Math.max(heights.get(band.id), bottom + LANE_PADDING));
    }
    const tops = new Map();
    const geometry = [];
    let top = 0;
    for (const band of bands) {
      const height = heights.get(band.id);
      tops.set(band.id, top);
      geometry.push({ ...band, top, height });
      top += height;
    }
    return { tops, geometry };
  };
  const absoluteY = id => (bandOf.has(id) ? tops.get(bandOf.get(id).id) : 0) + (y.get(id) || 0);
  const clampIntoBand = id => {
    const band = bandOf.get(id);
    if (!band || !y.has(id)) return 0;
    const before = y.get(id);
    const min = LANE_INSET;
    const max = Math.max(min, tops.get(band.id) + bandHeights.get(band.id) - LANE_INSET - cardHeightOf(byId.get(id)));
    y.set(id, Math.min(max, Math.max(min, before)));
    return Math.abs(y.get(id) - before);
  };
  let { tops, geometry: initGeometry } = bandGeometry();
  let bandHeights = new Map(initGeometry.map(band => [band.id, band.height]));
  const anchorMedian = id => {
    const anchors = (neighbors.get(id) || []).filter(other => effects.has(other) && y.has(other));
    if (!anchors.length) return null;
    return medianOf(anchors.map(other => absoluteY(other)));
  };
  for (const node of nodes) {
    if (effects.has(node.id) || y.has(node.id)) continue;
    const anchorNeighbor = (neighbors.get(node.id) || []).find(other => y.has(other));
    const start = !isDeclaration(node) ? anchorMedian(node.id)
      : anchorNeighbor !== undefined ? absoluteY(anchorNeighbor)
        : (node.position?.y || 0);
    if (start === null) {
      y.set(node.id, node.position?.y || 0);
    } else {
      y.set(node.id, start - (bandOf.has(node.id) ? tops.get(bandOf.get(node.id).id) : 0));
    }
  }
  for (const node of nodes) if (bandOf.has(node.id)) clampIntoBand(node.id);

  // The relaxation: median moves clamped into the band, then per-column
  // separation, then band heights re-derive from content and the bands
  // restack. Repeat until stable (bounded).
  const relaxOrder = [...nodes].map(node => node.id)
    .sort((left, right) => (columns.get(left) ?? -1) - (columns.get(right) ?? -1) || (left < right ? -1 : 1));
  const columnOf = id => columns.get(id) ?? null;
  for (let outer = 0; outer < RELAX_OUTER; outer += 1) {
    let moved = 0;
    for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
      let passMoved = 0;
      for (const id of relaxOrder) {
        if (!y.has(id)) continue;
        const target = medianOf((neighbors.get(id) || [])
          .filter(other => y.has(other))
          .map(other => absoluteY(other)));
        if (target === null) continue;
        const band = bandOf.get(id);
        const before = y.get(id);
        const relative = target - (band ? tops.get(band.id) : 0);
        y.set(id, relative);
        if (band) clampIntoBand(id);
        passMoved += Math.abs(y.get(id) - before);
      }
      if (passMoved < RELAX_EPSILON) break;
      moved += passMoved;
    }
    // Per-column separation: no two cards in a column overlap. This runs
    // AFTER the clamped relaxation and nothing clamps afterwards — the
    // exit condition requires a full iteration that moved nothing, so an
    // exit state is always overlap-free.
    const byColumn = new Map();
    for (const node of nodes) {
      if (!y.has(node.id) || columnOf(node.id) === null) continue;
      const column = columnOf(node.id);
      if (!byColumn.has(column)) byColumn.set(column, []);
      byColumn.get(column).push(node);
    }
    for (const column of [...byColumn.keys()].sort((left, right) => left - right)) {
      const items = byColumn.get(column)
        .sort((left, right) => absoluteY(left.id) - absoluteY(right.id) || (left.id < right.id ? -1 : 1));
      let previous = null;
      for (const item of items) {
        const band = bandOf.get(item.id);
        const absolute = absoluteY(item.id);
        if (previous !== null && absolute < previous.y + cardHeightOf(byId.get(previous.id)) + COLUMN_GAP) {
          const pushed = previous.y + cardHeightOf(byId.get(previous.id)) + COLUMN_GAP;
          y.set(item.id, pushed - (band ? tops.get(band.id) : 0));
          moved += pushed - absolute;
        }
        previous = { id: item.id, y: absoluteY(item.id) };
      }
    }
    // Band heights re-derive from (possibly separated) content and the
    // bands restack; relative y makes top shifts transparent.
    const previousTops = tops;
    const { tops: newTops, geometry: newGeometry } = bandGeometry();
    bandHeights = new Map(newGeometry.map(band => [band.id, band.height]));
    tops = newTops;
    let topsMoved = 0;
    for (const band of newGeometry) {
      if (previousTops.get(band.id) !== band.top) topsMoved += 1;
    }
    if (moved < RELAX_EPSILON && !topsMoved) break;
  }

  // Column normalization: declarations may sit one column left of the
  // flow sources — shift so the leftmost column starts at x = 0.
  let shift = 0;
  for (const column of columns.values()) if (column + shift < 0) shift = -column;

  const arranged = new Map();
  for (const node of nodes) {
    if (!y.has(node.id)) continue;
    const band = bandOf.get(node.id);
    const absolute = band ? tops.get(band.id) + y.get(node.id) : y.get(node.id);
    arranged.set(node.id, {
      x: Math.round((columns.get(node.id) + shift) * COLUMN_PITCH),
      y: Math.round(absolute)
    });
  }
  return { positions: arranged, bands: bandGeometry().geometry };
}

// The settle pass (contract: components/process-designer/README.md
// "Lanes"): lane bounds wrap their nodes, recalculated on the fly. Given
// each node's band and position, derive per-band content-wrapped heights,
// stack the bands in their given order, and return the uniform shift that
// seats each band's content at its top — relative order inside a lane is
// never touched.
export function settleLaneGeometry({ nodes = [], bands = [], bandOfNodeId } = {}) {
  const shifts = new Map();
  const geometry = [];
  let top = 0;
  for (const band of bands) {
    const members = nodes.filter(node => bandOfNodeId?.get(node.id) === band);
    let height = LANE_MIN_HEIGHT;
    let shift = 0;
    if (members.length) {
      const minY = Math.min(...members.map(node => node.position?.y || 0));
      const bottom = Math.max(...members.map(node => (node.position?.y || 0) + cardHeightOf(node)));
      height = Math.max(LANE_MIN_HEIGHT, bottom - minY + 2 * LANE_INSET);
      shift = top + LANE_INSET - minY;
    }
    shifts.set(band.id, shift);
    geometry.push({ ...band, top, height });
    top += height;
  }
  return { bands: geometry, shifts };
}
