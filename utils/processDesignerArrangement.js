// Layered arrangement for the process canvas — the Tidy command's
// engine ("Auto-arrangement (Tidy)" and "Lanes"). Pure: nodes, edges,
// lane band membership in → positions plus content-hugging band
// geometry out. x = column (condensation layering: mutual pairs share
// a column; weakly connected components pack side by side, largest
// first; columns span their widest card plus air). y = inset plus a row
// on the band's grid: each card takes the free row nearest the median
// row of its wired neighbors in other cells, sweeping to a fixed point.
// Deterministic and idempotent: running it over its own output moves
// nothing.
const ROW_PASSES = 32;
const COLUMN_SNAP = 420;
const COLUMN_AIR = 120;
const COLUMN_MIN_SPAN = 360;
const LANE_INSET = 24;
const LANE_MIN_HEIGHT = 150;
const LANE_PADDING = 24;
const COLUMN_GAP = 16;
const PROCESS_CARD_HEIGHT = 140;
const DECLARATION_CARD_HEIGHT = 96;
const PROCESS_CARD_WIDTH = 384;
const DECLARATION_CARD_WIDTH = 224;

function isDeclaration(node) {
  return node?.type !== 'processNode';
}

function cardHeightOf(node) {
  if (node?.dimensions?.height) return node.dimensions.height;
  return isDeclaration(node) ? DECLARATION_CARD_HEIGHT : PROCESS_CARD_HEIGHT;
}

function cardWidthOf(node) {
  if (node?.dimensions?.width) return node.dimensions.width;
  return isDeclaration(node) ? DECLARATION_CARD_WIDTH : PROCESS_CARD_WIDTH;
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

  // Weakly connected components arrange independently and pack side by
  // side, largest first: unwired clusters keep their own columns
  // instead of piling onto the flow's.
  const weakAdj = new Map(nodes.map(node => [node.id, new Set()]));
  for (const edge of edges) {
    if (!weakAdj.has(edge.source) || !weakAdj.has(edge.target)) continue;
    weakAdj.get(edge.source).add(edge.target);
    weakAdj.get(edge.target).add(edge.source);
  }
  const weakOf = new Map();
  const weakComponents = [];
  for (const node of nodes) {
    if (weakOf.has(node.id)) continue;
    const members = [];
    const stack = [node.id];
    weakOf.set(node.id, weakComponents.length);
    while (stack.length) {
      const current = stack.pop();
      members.push(current);
      for (const next of weakAdj.get(current) || []) {
        if (weakOf.has(next)) continue;
        weakOf.set(next, weakComponents.length);
        stack.push(next);
      }
    }
    weakComponents.push(members);
  }
  const weakOrder = weakComponents
    .map((members, index) => ({ index, members }))
    .sort((left, right) => right.members.length - left.members.length
      || (left.members[0] < right.members[0] ? -1 : 1))
    .map(entry => entry.index);
  const weakRank = new Map(weakOrder.map((componentIndex, rank) => [componentIndex, rank]));

  // x = column: longest-path layering over the condensation of the flow
  // edges — a strongly connected component (an authoring loop, a
  // forEach pair) shares one column, so a back edge spans one arc.
  const sccOf = new Map();
  {
    let index = 0;
    const indices = new Map();
    const low = new Map();
    const onStack = new Set();
    const stack = [];
    const strongConnect = id => {
      indices.set(id, index);
      low.set(id, index);
      index += 1;
      stack.push(id);
      onStack.add(id);
      for (const next of successors.get(id) || []) {
        if (!indices.has(next)) {
          strongConnect(next);
          low.set(id, Math.min(low.get(id), low.get(next)));
        } else if (onStack.has(next)) {
          low.set(id, Math.min(low.get(id), indices.get(next)));
        }
      }
      if (low.get(id) === indices.get(id)) {
        for (;;) {
          const member = stack.pop();
          onStack.delete(member);
          sccOf.set(member, id);
          if (member === id) break;
        }
      }
    };
    for (const node of nodes) {
      if (!isDeclaration(node) && !indices.has(node.id)) strongConnect(node.id);
    }
  }
  const compPreds = new Map();
  const compSuccs = new Map();
  for (const edge of processEdges) {
    const from = sccOf.get(edge.source);
    const to = sccOf.get(edge.target);
    if (from === to) continue;
    if (!compPreds.has(to)) compPreds.set(to, []);
    if (!compPreds.get(to).includes(from)) compPreds.get(to).push(from);
    if (!compSuccs.has(from)) compSuccs.set(from, []);
    if (!compSuccs.get(from).includes(to)) compSuccs.get(from).push(to);
  }
  const compLayer = new Map();
  const compDepth = component => {
    if (compLayer.has(component)) return compLayer.get(component);
    let value = 0;
    for (const pred of compPreds.get(component) || []) {
      value = Math.max(value, compDepth(pred) + 1);
    }
    compLayer.set(component, value);
    return value;
  };
  for (const component of new Set([...sccOf.values()])) compDepth(component);
  // A pred-less component pulls up to the column before its first
  // consumer, so a fresh source strands beside what consumes it.
  for (const component of compLayer.keys()) {
    if ((compPreds.get(component) || []).length) continue;
    const consumerLayers = (compSuccs.get(component) || []).map(next => compLayer.get(next));
    if (!consumerLayers.length) continue;
    const cap = Math.min(...consumerLayers) - 1;
    if (cap > compLayer.get(component)) compLayer.set(component, cap);
  }
  const layer = new Map();
  {
    const compMembers = new Map();
    for (const [id, component] of sccOf) {
      if (!compMembers.has(component)) compMembers.set(component, []);
      compMembers.get(component).push(id);
    }
    for (const [component, members] of compMembers) {
      // A pair (a mutual wire, a forEach closer) is one visual unit on
      // one column; a larger cycle layers internally with its closing
      // edge as the one backward span.
      if (members.length <= 2) {
        for (const id of members) layer.set(id, compLayer.get(component));
        continue;
      }
      const memberSet = new Set(members);
      const inner = new Map();
      const visiting = new Set();
      const innerDepth = id => {
        if (inner.has(id)) return inner.get(id);
        visiting.add(id);
        let value = 0;
        for (const pred of predecessors.get(id) || []) {
          if (!memberSet.has(pred) || visiting.has(pred)) continue;
          value = Math.max(value, innerDepth(pred) + 1);
        }
        visiting.delete(id);
        inner.set(id, value);
        return value;
      };
      for (const id of members) layer.set(id, compLayer.get(component) + innerDepth(id));
    }
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
      : Math.round((node.position?.x || 0) / COLUMN_SNAP));
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
  // Process nodes first: effects by grant, everything else by its nearest
  // wired effect's grant — both order-independent, so the map is complete
  // before declarations read it.
  for (const node of nodes) {
    if (isDeclaration(node)) continue;
    if (effects.has(node.id)) {
      const band = grantedBand(node.id);
      if (band) bandOf.set(node.id, band);
      continue;
    }
    const downstream = nearestEffect(node.id, successors);
    const anchor = grantedBand(downstream) ? downstream
      : grantedBand(nearestEffect(node.id, predecessors)) ? nearestEffect(node.id, predecessors)
        : null;
    const band = anchor ? grantedBand(anchor) : nearestBand(node);
    if (band) bandOf.set(node.id, band);
  }
  for (const node of nodes) {
    if (bandOf.has(node.id) || !isDeclaration(node)) continue;
    const anchor = declarationAnchor(node.id);
    const band = (anchor && bandOf.get(anchor)) || nearestBand(node);
    if (band) bandOf.set(node.id, band);
  }

  // Undirected wires: a card's row follows the median row of its wired
  // neighbors in other cells of the same band.
  const neighbors = new Map();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    if (!neighbors.has(edge.source)) neighbors.set(edge.source, []);
    if (!neighbors.get(edge.source).includes(edge.target)) neighbors.get(edge.source).push(edge.target);
    if (!neighbors.has(edge.target)) neighbors.set(edge.target, []);
    if (!neighbors.get(edge.target).includes(edge.source)) neighbors.get(edge.target).push(edge.source);
  }

  // Cells: one row stack per (band, column).
  const cells = [];
  const cellFor = new Map();
  const cellKey = new Map();
  for (const node of nodes) {
    const band = bandOf.get(node.id);
    const column = columns.get(node.id);
    if (!band || column === undefined) continue;
    const key = `${band.id}|${weakRank.get(weakOf.get(node.id))}|${column}`;
    let cell = cellKey.get(key);
    if (!cell) {
      cell = [];
      cellKey.set(key, cell);
      cells.push(cell);
    }
    cell.push(node);
    cellFor.set(node.id, cell);
  }

  // Rows: one grid per band, its tallest card plus the gap. Every card
  // sits on the free row nearest the median row of its wired neighbors in
  // other cells (a sequence reads level). The rows settle by sweeping to a
  // fixed point; a sweep loop is cut at its smallest state.
  const bandPitch = new Map();
  for (const node of nodes) {
    const band = bandOf.get(node.id);
    if (!band || !cellFor.has(node.id)) continue;
    bandPitch.set(band.id, Math.max(bandPitch.get(band.id) || 0, cardHeightOf(node) + COLUMN_GAP));
  }
  const pitchOf = id => {
    const band = bandOf.get(id);
    return bandPitch.get(band.id) || PROCESS_CARD_HEIGHT + COLUMN_GAP;
  };
  const authoredRow = id => {
    const band = bandOf.get(id);
    return Math.max(0, Math.round(((byId.get(id).position?.y || 0) - band.top - LANE_INSET) / pitchOf(id)));
  };
  const stackCell = cell => {
    const placed = [];
    const used = new Set();
    const queue = cell
      .map(node => {
        const band = bandOf.get(node.id);
        const keys = (neighbors.get(node.id) || [])
          .filter(other => cellFor.get(other) !== cell
            && bandOf.get(other)?.id === band.id
            && rowOf.has(other))
          .map(other => rowOf.get(other));
        return { node, target: keys.length ? medianOf(keys) : rowOf.get(node.id) };
      })
      .sort((left, right) => left.target - right.target || (left.node.id < right.node.id ? -1 : 1));
    for (const { node, target } of queue) {
      const seat = Math.max(0, Math.round(target));
      let row = seat;
      if (used.has(row)) {
        for (let step = 1; ; step += 1) {
          const lower = seat - step;
          if (lower >= 0 && !used.has(lower)) { row = lower; break; }
          if (!used.has(seat + step)) { row = seat + step; break; }
        }
      }
      used.add(row);
      placed.push([node.id, row]);
    }
    return placed;
  };
  const bandRank = new Map(bands.map((band, index) => [band.id, index]));
  const cellColumn = cell => Math.min(...cell.map(node => columns.get(node.id)));
  const sweepOrder = [...cells].sort((left, right) => (cellColumn(left) - cellColumn(right))
    || (bandRank.get(bandOf.get(left[0].id).id) - bandRank.get(bandOf.get(right[0].id).id))
    || (left.map(node => node.id).sort()[0] < right.map(node => node.id).sort()[0] ? -1 : 1));
  const serializeRows = state => [...state.keys()].sort()
    .map(id => `${id}:${state.get(id)}`)
    .join(',');
  let rowOf = new Map();
  for (const node of nodes) if (cellFor.has(node.id)) rowOf.set(node.id, authoredRow(node.id));
  const history = [];
  const seenAt = new Map();
  for (let pass = 0; pass < ROW_PASSES; pass += 1) {
    const before = serializeRows(rowOf);
    const seen = seenAt.get(before);
    if (seen !== undefined && pass > 0) {
      rowOf = history.slice(seen)
        .reduce((best, state) => (serializeRows(state) < serializeRows(best) ? state : best));
      break;
    }
    seenAt.set(before, history.length);
    history.push(new Map(rowOf));
    for (const cell of sweepOrder) for (const [id, row] of stackCell(cell)) rowOf.set(id, row);
    if (serializeRows(rowOf) === before) break;
  }
  // Bands hug their content: every row index is relative to the band's
  // first used row.
  for (const band of bands) {
    const members = nodes.filter(node => bandOf.get(node.id)?.id === band.id && rowOf.has(node.id));
    if (!members.length) continue;
    const first = Math.min(...members.map(node => rowOf.get(node.id)));
    for (const node of members) rowOf.set(node.id, rowOf.get(node.id) - first);
  }
  const y = new Map();
  for (const node of nodes) {
    if (!rowOf.has(node.id)) continue;
    y.set(node.id, LANE_INSET + rowOf.get(node.id) * pitchOf(node.id));
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
  const { tops } = bandGeometry();

  // Columns span their widest card plus air, floored at the resting
  // span: neighbors keep readable distance at any card size. Components
  // pack in rank order, each counting its own columns from zero.
  const columnWidth = new Map();
  for (const node of nodes) {
    const column = columns.get(node.id);
    if (column === undefined) continue;
    const key = `${weakRank.get(weakOf.get(node.id))}|${column}`;
    columnWidth.set(key, Math.max(columnWidth.get(key) || 0, cardWidthOf(node)));
  }
  const columnStart = new Map();
  const componentColumns = new Map();
  for (const node of nodes) {
    const column = columns.get(node.id);
    if (column === undefined) continue;
    const component = weakRank.get(weakOf.get(node.id));
    if (!componentColumns.has(component)) componentColumns.set(component, new Set());
    componentColumns.get(component).add(column);
  }
  let columnX = 0;
  for (const component of [...componentColumns.keys()].sort((left, right) => left - right)) {
    let spanX = 0;
    for (const column of [...componentColumns.get(component)].sort((left, right) => left - right)) {
      columnStart.set(`${component}|${column}`, columnX + spanX);
      spanX += Math.max(COLUMN_MIN_SPAN, columnWidth.get(`${component}|${column}`) + COLUMN_AIR);
    }
    columnX += spanX;
  }

  const arranged = new Map();
  for (const node of nodes) {
    if (!y.has(node.id)) continue;
    const band = bandOf.get(node.id);
    const absolute = band ? tops.get(band.id) + y.get(node.id) : y.get(node.id);
    arranged.set(node.id, {
      x: Math.round(columnStart.get(`${weakRank.get(weakOf.get(node.id))}|${columns.get(node.id)}`)),
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
