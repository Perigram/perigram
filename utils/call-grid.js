// Meet-style call grid math, adapted from LiveKit components-js
// (grid-layouts + visual-stable tile ordering) to plain tile records.
// The grid fills the stage with equal cells: the participant count and
// the container size choose the layout, and tile positions stay visually
// stable while speaking order changes underneath.

export const CALL_GRID_LAYOUTS = [
  { columns: 1, rows: 1 },
  { columns: 1, rows: 2, orientation: 'portrait' },
  { columns: 2, rows: 1, orientation: 'landscape' },
  { columns: 2, rows: 2, minWidth: 560 },
  { columns: 3, rows: 3, minWidth: 700 },
  { columns: 4, rows: 4, minWidth: 960 },
  { columns: 5, rows: 5, minWidth: 1100 }
];

export function selectCallGridLayout(participantCount, width, height) {
  const layouts = expandLayouts();
  if (!(width > 0) || !(height > 0)) return layouts[0];
  const orientation = width / height > 1 ? 'landscape' : 'portrait';
  let index = layouts.findIndex((layout, i) => (
    layout.maxTiles >= participantCount
    && !hasBiggerLayoutForCount(layouts, i, orientation)
  ));
  if (index < 0) index = layouts.length - 1;
  let layout = layouts[index];
  while (index > 0 && (width < layout.minWidth || height < layout.minHeight)) {
    index -= 1;
    layout = layouts[index];
  }
  return layout;
}

function expandLayouts() {
  return CALL_GRID_LAYOUTS
    .map(layout => ({
      name: `${layout.columns}x${layout.rows}`,
      columns: layout.columns,
      rows: layout.rows,
      maxTiles: layout.columns * layout.rows,
      minWidth: layout.minWidth || 0,
      minHeight: layout.minHeight || 0,
      orientation: layout.orientation
    }))
    .sort((a, b) => a.maxTiles - b.maxTiles || a.minWidth - b.minWidth || a.minHeight - b.minHeight);
}

// The 1x2/2x1 pair shares a tile count: the orientation-fitting twin
// wins, so the finder skips its sibling.
function hasBiggerLayoutForCount(layouts, index, orientation) {
  return layouts.some((candidate, i) => (
    i > index
    && candidate.maxTiles === layouts[index].maxTiles
    && (!candidate.orientation || candidate.orientation === orientation)
  ));
}

// Speaker-priority tile order: local camera first, screen shares, then
// cameras by speaking state, audio level, speaking recency, camera on,
// join time.
export function sortCallTiles(tiles = []) {
  const local = [];
  const screens = [];
  const cameras = [];
  for (const tile of tiles) {
    if (tile.isScreen) screens.push(tile);
    else if (tile.isLocal) local.push(tile);
    else cameras.push(tile);
  }
  screens.sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || (a.joinedAt || 0) - (b.joinedAt || 0));
  cameras.sort((a, b) => {
    if (Boolean(a.speaking) !== Boolean(b.speaking)) return Number(b.speaking) - Number(a.speaking);
    if ((b.audioLevel || 0) !== (a.audioLevel || 0)) return (b.audioLevel || 0) - (a.audioLevel || 0);
    if ((b.lastSpokeAt || 0) !== (a.lastSpokeAt || 0)) return (b.lastSpokeAt || 0) - (a.lastSpokeAt || 0);
    if (Boolean(a.hasVideo) !== Boolean(b.hasVideo)) return Number(b.hasVideo) - Number(a.hasVideo);
    return (a.joinedAt || 0) - (b.joinedAt || 0);
  });
  return [...local, ...screens, ...cameras];
}

// The sorted order decides page membership; the current order keeps
// positions: departed tiles vacate their slots and arrivals fill them, so
// a pure reorder (a new speaker) moves nothing until someone joins or
// leaves. A member displaced from its slot moves to a later page instead
// of disappearing.
export function visuallyStableOrder(currentOrder = [], sortedOrder = [], maxOnPage = 1) {
  const sortedSet = new Set(sortedOrder);
  const arrivals = sortedOrder.filter(id => !currentOrder.includes(id));
  const order = currentOrder.filter(id => sortedSet.has(id));
  if (!arrivals.length && order.length === currentOrder.length) return currentOrder;
  const pageOf = index => Math.floor(index / maxOnPage);
  const sortedPages = new Map();
  sortedOrder.forEach((id, index) => {
    if (!sortedPages.has(pageOf(index))) sortedPages.set(pageOf(index), new Set());
    sortedPages.get(pageOf(index)).add(id);
  });
  const displaced = [];
  for (let slot = 0; slot < order.length && arrivals.length; slot++) {
    const membership = sortedPages.get(pageOf(slot));
    if (membership && !membership.has(order[slot])) {
      displaced.push(order[slot]);
      order[slot] = arrivals.shift();
    }
  }
  const placed = new Set(order);
  const seen = new Set();
  const unique = [...displaced, ...arrivals].filter(id => {
    if (seen.has(id) || !sortedSet.has(id) || placed.has(id)) return false;
    seen.add(id);
    return true;
  });
  return [...order, ...unique];
}
