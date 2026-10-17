// Layered arrangement for the process canvas — the Tidy command's
// engine ("Auto-arrangement (Tidy)" and "Lanes"). Pure: nodes, edges,
// lane band membership in → positions plus content-hugging band
// geometry out. x = column (longest-path layering + pull-up). Within
// each lane×column cell, barycenter sweeps over wired neighbors pick
// the row order; y = row pitch, then a median polish whose clamps keep
// the in-cell order and the lane bounds. Deterministic and idempotent:
// running it over its own output moves nothing.
const COLUMN_PITCH = 420;
const LANE_ROW_HEIGHT = 170;
const LANE_INSET = 24;
const LANE_MIN_HEIGHT = 150;
const LANE_PADDING = 24;
const COLUMN_GAP = 16;
const PROCESS_CARD_HEIGHT = 140;
const DECLARATION_CARD_HEIGHT = 96;
const ORDER_SWEEPS = 8;
const POLISH_PASSES = 24;
const POLISH_EPSILON = 0.5;

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
  const wiresFrom = new Map();
  const wiresTo = new Map();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!neighbors.has(from)) neighbors.set(from, []);
      if (!neighbors.get(from).includes(to)) neighbors.get(from).push(to);
    }
    if (!wiresFrom.has(edge.source)) wiresFrom.set(edge.source, []);
    wiresFrom.get(edge.source).push(edge.target);
    if (!wiresTo.has(edge.target)) wiresTo.set(edge.target, []);
    wiresTo.get(edge.target).push(edge.source);
  }

  // Cells: one row stack per (band, column). The authored y seeds the
  // first order.
  const bandRank = new Map(bands.map((band, index) => [band.id, index]));
  const cells = [];
  const cellFor = new Map();
  const cellKey = new Map();
  for (const node of nodes) {
    const band = bandOf.get(node.id);
    const column = columns.get(node.id);
    if (!band || column === undefined) continue;
    const key = `${band.id}|${column}`;
    let cell = cellKey.get(key);
    if (!cell) {
      cell = [];
      cellKey.set(key, cell);
      cells.push(cell);
    }
    cell.push(node);
    cellFor.set(node.id, cell);
  }
  const order = new Map();
  for (const cell of cells) {
    cell.sort((left, right) => (left.position?.y || 0) - (right.position?.y || 0)
      || (left.id < right.id ? -1 : 1));
    cell.forEach((node, index) => order.set(node.id, index));
  }

  // A node's sweep position: band rank plus its fraction inside the
  // cell, so barycenters read the lane stack as one axis.
  const KEY_SPAN = 1024;
  const keyOf = id => {
    const band = bandOf.get(id);
    const size = Math.max(1, cellFor.get(id).length);
    return (bandRank.get(band.id) || 0) * KEY_SPAN
      + ((order.get(id) + 0.5) / size) * KEY_SPAN;
  };

  const columnValues = [...new Set([...columns.values()])].sort((left, right) => left - right);
  for (let sweep = 0; sweep < ORDER_SWEEPS; sweep += 1) {
    const rightward = sweep % 2 === 0;
    for (const column of rightward ? [...columnValues].reverse() : columnValues) {
      for (const cell of cells) {
        if (columns.get(cell[0].id) !== column) continue;
        const bary = new Map();
        for (const node of cell) {
          const side = rightward ? wiresFrom.get(node.id) : wiresTo.get(node.id);
          const keys = (side || []).filter(other => order.has(other)).map(keyOf);
          bary.set(node.id, keys.length
            ? keys.reduce((sum, key) => sum + key, 0) / keys.length
            : keyOf(node.id));
        }
        cell.sort((left, right) => (bary.get(left.id) - bary.get(right.id))
          || (left.id < right.id ? -1 : 1));
        cell.forEach((node, index) => order.set(node.id, index));
      }
    }
  }

  // Row stacking: row index is shared across a band's cells, so a
  // horizontal chain sits on one row.
  const y = new Map();
  for (const cell of cells) {
    cell.forEach((node, index) => y.set(node.id, LANE_INSET + index * LANE_ROW_HEIGHT));
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
  let { tops } = bandGeometry();
  let bandHeights = new Map(bandGeometry().geometry.map(band => [band.id, band.height]));

  // Median polish: each card moves toward its wired neighbors' median,
  // clamped below its in-cell predecessor and inside its band — the
  // clamps are the overlap and lane laws, so any exit state is legal.
  const inCellAbove = id => {
    const index = order.get(id);
    return index > 0 ? cellFor.get(id)[index - 1] : null;
  };
  const polishOrder = [...y.keys()]
    .sort((left, right) => columns.get(left) - columns.get(right)
      || order.get(left) - order.get(right)
      || (left < right ? -1 : 1));
  for (let pass = 0; pass < POLISH_PASSES; pass += 1) {
    let moved = 0;
    for (const id of polishOrder) {
      const band = bandOf.get(id);
      const target = medianOf((neighbors.get(id) || [])
        .filter(other => y.has(other))
        .map(other => tops.get(bandOf.get(other).id) + y.get(other)));
      if (target === null) continue;
      const above = inCellAbove(id);
      const min = above ? y.get(above.id) + cardHeightOf(byId.get(above.id)) + COLUMN_GAP : LANE_INSET;
      const max = Math.max(min, tops.get(band.id) + bandHeights.get(band.id) - LANE_INSET - cardHeightOf(byId.get(id)));
      const relative = target - tops.get(band.id);
      const next = Math.round(Math.min(max, Math.max(min, relative)));
      moved += Math.abs(next - y.get(id));
      y.set(id, next);
    }
    const { tops: newTops, geometry } = bandGeometry();
    bandHeights = new Map(geometry.map(band => [band.id, band.height]));
    tops = newTops;
    if (moved < POLISH_EPSILON) break;
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

// The lane container pass ("Lanes"). Node vertical coordinates are LANE-RELATIVE authored facts;
// given membership (`membershipOf(node)` → band id or null) and each
// node's lane offset (`laneYOf(node)` → number), derive the full layout:
// every band hugs its content (height = member offset extent + padding,
// floored at the minimum; content seats at the top inset — a band's
// members shift together by at most that seating correction, offsets
// between lane-mates never change), bands stack in the given order, and
// each member's absolute y is band top + normalized offset. A member
// whose offset is negative sits ABOVE its lane: it is strayed (dropped
// outside every band) and stays exactly where it fell, outside the hug,
// until re-dropped. Deterministic and idempotent: running it over its
// own output moves nothing.
export function laneContainerLayout({ nodes = [], bandIds = [], membershipOf = null, laneYOf = null } = {}) {
  const resolve = node => {
    const bandId = membershipOf?.(node) || null;
    if (!bandId || !bandIds.includes(bandId)) return null;
    const offset = laneYOf?.(node);
    return { bandId, offset: Number.isFinite(offset) ? offset : null };
  };
  const membersByBand = new Map(bandIds.map(id => [id, []]));
  for (const node of nodes) {
    const resolved = resolve(node);
    if (!resolved || resolved.offset === null || resolved.offset < 0) continue;
    membersByBand.get(resolved.bandId).push({ node, offset: resolved.offset });
  }
  const bands = [];
  const laneY = new Map();
  const positions = new Map();
  let top = 0;
  for (const bandId of bandIds) {
    const members = membersByBand.get(bandId);
    let height = LANE_MIN_HEIGHT;
    if (members.length) {
      // Hug: content seats at the band's top inset.
      const shift = LANE_INSET - Math.min(...members.map(member => member.offset));
      let bottom = 0;
      for (const { node, offset } of members) {
        const seated = Math.round(offset + shift);
        laneY.set(node.id, seated);
        positions.set(node.id, Math.round(top + seated));
        bottom = Math.max(bottom, seated + cardHeightOf(node));
      }
      height = Math.max(LANE_MIN_HEIGHT, bottom + LANE_INSET);
    }
    bands.push({ id: bandId, top, height });
    top += height;
  }
  return { bands, laneY, positions };
}

// One-time fact derivation for drafts authored before lane containers:
// nodes carrying no lane offset yet adopt membership + offset from their
// stored absolute position, measured against the minimum-height seed
// stack (membership-known nodes — effects — take their offset against
// THEIR band's seed top, wherever they sit). Nodes above the stack with
// no membership stay fact-less (free-floating). Returns new node data;
// nodes that already carry facts pass through untouched.
export function deriveLaneFacts({ nodes = [], bandIds = [], membershipOf = null } = {}) {
  const seed = [];
  let top = 0;
  for (const bandId of bandIds) {
    seed.push({ id: bandId, top });
    top += LANE_MIN_HEIGHT;
  }
  const bandTopOf = bandId => seed.find(band => band.id === bandId)?.top ?? null;
  const containingBand = y => {
    for (const band of seed) {
      if (y >= band.top && y < band.top + LANE_MIN_HEIGHT) return band.id;
    }
    return y >= top && seed.length ? seed[seed.length - 1].id : null;
  };
  return nodes.map(node => {
    if (Number.isFinite(node.data?.laneY)) return node;
    const data = { ...(node.data || {}) };
    const y = node.position?.y ?? 0;
    const membership = membershipOf?.(node) || null;
    if (membership && bandIds.includes(membership)) {
      data.laneY = Math.max(0, Math.round(y - bandTopOf(membership)));
      return { ...node, data };
    }
    const bandId = containingBand(y);
    if (!bandId) return node;
    data.lane = bandId;
    data.laneY = Math.round(y - bandTopOf(bandId));
    return { ...node, data };
  });
}
