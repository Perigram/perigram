// Open-profile edge embedding (owner law, 2026-10-15): array settings
// alone place an open profile against its host face — there is no
// perpendicular offset, the profile's start and end anchors lie ON the
// bound edge. The whole edge is then replaced by the composite chain:
// the host edge start, a straight run to the first copy's start anchor,
// the copy chains joined by straight runs (end of one to the start of
// the next), and a straight run from the last copy's end anchor to the
// host edge end. Overlaps — a copy's end past the next copy's start, or
// past the edge end — are detected and reported, never silently
// clamped. Pure module: no renderer, no platform imports.
import { edgeArrayDistances } from './hardware.js';
import { occProfileSectionChainedVertices } from './profiles.js';

const numeric = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const withoutClosingVertex = (vertices = []) => {
  const points = vertices.map(vertex => [numeric(vertex?.[0]), numeric(vertex?.[1])]);
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9) points.pop();
  }
  return points;
};

// Fabrication-grade rounding (nanometre) keeps placed geometry stable.
const roundPoint = (point) => [
  Math.round((point[0] + Number.EPSILON) * 1e6) / 1e6,
  Math.round((point[1] + Number.EPSILON) * 1e6) / 1e6
];

// Builds the composite replacement for one host edge. `section` is the
// normalized profile section ({ vertices, open }); `vertices` the host
// contour; `relation` carries the array pattern (edge, mode,
// count/spacing) with offsetX as the margin from both edge ends —
// offsetY is deliberately ignored (open profiles keep their feet on the
// edge). Mirrors still apply (the chain may flip before alignment).
export const embedOccsProfileEdge = ({ section = {}, vertices = [], relation = {}, resolve = numeric } = {}) => {
  // The authored fillet corners resolve to their arc points — the chain
  // the edge embedding stitches is the drawable geometry, not the
  // theoretical sharp polygon.
  const chain = occProfileSectionChainedVertices(section);
  if (chain.length < 2) {
    return { ok: false, reason: 'profile section has no chain' };
  }
  const contour = withoutClosingVertex(vertices);
  if (contour.length < 2) {
    return { ok: false, reason: 'host face has no contour' };
  }
  const pattern = relation.pattern?.type === 'edgeArray'
    ? relation.pattern
    : { type: 'edgeArray', edge: 'E0', mode: 'count', count: '1' };

  const match = String(pattern.edge || 'E0').match(/\d+/);
  const edgeIndex = match ? Math.max(0, Math.round(numeric(match[0], 0))) % contour.length : 0;
  const edgeStart = contour[edgeIndex];
  const edgeEnd = contour[(edgeIndex + 1) % contour.length];
  const edgeVector = [edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1]];
  const edgeLength = Math.hypot(edgeVector[0], edgeVector[1]);
  if (edgeLength <= 1e-6) {
    return { ok: false, reason: 'host edge is degenerate' };
  }
  const axis = [edgeVector[0] / edgeLength, edgeVector[1] / edgeLength];

  // Orient the authored chain so its anchor-to-anchor chord runs along
  // the edge; mirror first when the relation asks for it.
  const mirrorX = Boolean(relation.mirrorX);
  const mirrorY = Boolean(relation.mirrorY);
  const mirrored = chain.map(([x, y]) => [mirrorX ? -x : x, mirrorY ? -y : y]);
  const start = mirrored[0];
  const end = mirrored[mirrored.length - 1];
  const chord = [end[0] - start[0], end[1] - start[1]];
  const chordLength = Math.hypot(chord[0], chord[1]);
  const rotation = Math.atan2(axis[1], axis[0]) - Math.atan2(chord[1], chord[0]);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const oriented = mirrored.map(([x, y]) => [
    start[0] + (x - start[0]) * cos - (y - start[1]) * sin,
    start[1] + (x - start[0]) * sin + (y - start[1]) * cos
  ]);

  // Array starts are chord-aware: the margin holds from both edge ends
  // for the WHOLE copy (not just its start anchor), so the last copy
  // ends at edgeLength − margin and count/spacing distribute copy starts
  // over the span that is left. Spacing is the gap between adjacent
  // copies, so a zero spacing butts them together. The perpendicular
  // component of the origin is dropped on purpose — open profiles keep
  // their feet on the edge.
  const spanStart = Math.max(0, Math.min(edgeLength, resolve(pattern.spanStart, 0)));
  const rawSpanWidth = pattern.spanWidth;
  const spanWidth = rawSpanWidth === undefined || rawSpanWidth === ''
    ? edgeLength - spanStart
    : Math.max(0, resolve(rawSpanWidth, edgeLength - spanStart));
  const spanLength = Math.max(0, Math.min(edgeLength - spanStart, spanWidth));
  const margin = Math.max(0, resolve(relation.offsetX, 0));
  const rowSpan = spanLength - 2 * margin - chordLength;
  if (rowSpan < -1e-6) {
    return { ok: false, reason: 'edge too short for the profile at this margin' };
  }
  const starts = edgeArrayDistances({
    edgeLength: rowSpan,
    pattern,
    startOffset: 0,
    binding: relation.targetSnap || 'start',
    copyLength: chordLength,
    resolve
  }).map(distance => spanStart + margin + distance);
  if (!starts.length) {
    return { ok: false, reason: 'array settings place no copy on the edge' };
  }
  // The binding decides where the array sits, never the direction the
  // composite walks: copies always run edge-start -> edge-end, so an
  // end-anchored array (distances returned descending) is reordered
  // before the span and overlap validation see it.
  starts.sort((left, right) => left - right);

  // Place each copy at its start; validate spans along the edge.
  const copies = [];
  for (const startAlong of starts) {
    const origin = [edgeStart[0] + axis[0] * startAlong, edgeStart[1] + axis[1] * startAlong];
    const placed = oriented.map(([x, y]) => roundPoint([
      origin[0] + x - start[0],
      origin[1] + y - start[1]
    ]));
    copies.push({
      points: placed,
      startAlong,
      endAlong: startAlong + chordLength
    });
  }
  for (let index = 0; index < copies.length; index += 1) {
    const copy = copies[index];
    if (copy.endAlong > edgeLength + 1e-6) {
      return { ok: false, reason: `copy ${index + 1} runs past the host edge end` };
    }
    const next = copies[index + 1];
    if (next && copy.endAlong > next.startAlong + 1e-6) {
      return { ok: false, reason: `copy ${index + 1} overlaps copy ${index + 2}` };
    }
  }

  // The composite chain replaces the edge between the host vertices;
  // coincident joint points (a copy starting exactly where the previous
  // ended) collapse instead of duplicating.
  const composite = [edgeStart];
  for (const copy of copies) {
    for (const point of copy.points) {
      const last = composite[composite.length - 1];
      if (Math.hypot(last[0] - point[0], last[1] - point[1]) < 1e-9) continue;
      composite.push(point);
    }
  }
  const lastPoint = composite[composite.length - 1];
  if (Math.hypot(lastPoint[0] - edgeEnd[0], lastPoint[1] - edgeEnd[1]) >= 1e-9) {
    composite.push(edgeEnd);
  }
  return {
    ok: true,
    edgeIndex,
    edgeStart,
    edgeEnd,
    frame: {
      origin: [edgeStart[0] + axis[0] * starts[0], edgeStart[1] + axis[1] * starts[0], 0],
      anchor: start,
      rotation,
      mirrorX,
      mirrorY
    },
    copies: copies.map(copy => copy.points),
    copySpans: copies.map(copy => ({ startAlong: copy.startAlong, endAlong: copy.endAlong, points: copy.points })),
    breakPoints: [copies[0].points[0], copies[copies.length - 1].points[copies[copies.length - 1].points.length - 1]],
    composite
  };
};

// Splices every embedding into its host contour: the edge [i, i+1] is
// replaced by the composite interior, so the production boundary truly
// follows the profile chains. A relation whose embedding reports a
// problem fails the whole pass — overlapping or overflowing profiles
// are forbidden, never silently clamped.
const edgeKey = embedding => (
  `${roundPoint(embedding.edgeStart).join(',')}|${roundPoint(embedding.edgeEnd).join(',')}`
);

const mergeEdgeEmbeddings = (embeddings = []) => {
  const copies = embeddings
    .flatMap(embedding => embedding.copySpans || [])
    .sort((left, right) => left.startAlong - right.startAlong);
  for (let index = 1; index < copies.length; index += 1) {
    if (copies[index].startAlong < copies[index - 1].endAlong - 1e-6) {
      return { ok: false, reason: 'profile copies overlap on the host edge' };
    }
  }
  const composite = [embeddings[0].edgeStart];
  for (const copy of copies) {
    for (const point of copy.points) {
      const last = composite[composite.length - 1];
      if (Math.hypot(last[0] - point[0], last[1] - point[1]) < 1e-9) continue;
      composite.push(point);
    }
  }
  const end = embeddings[0].edgeEnd;
  const lastPoint = composite[composite.length - 1];
  if (Math.hypot(lastPoint[0] - end[0], lastPoint[1] - end[1]) >= 1e-9) composite.push(end);
  return { ok: true, composite };
};

export const embedOccsProfilesIntoContour = (vertices = [], embeddings = []) => {
  let contour = withoutClosingVertex(vertices);
  const errors = [];
  const applied = [];
  const groups = new Map();
  for (const embedding of embeddings) {
    if (!embedding.ok) {
      errors.push(embedding.reason);
      continue;
    }
    const key = edgeKey(embedding);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(embedding);
  }

  for (const group of groups.values()) {
    const merged = group.length === 1
      ? { ok: true, composite: group[0].composite }
      : mergeEdgeEmbeddings(group);
    if (!merged.ok) {
      errors.push(merged.reason);
      continue;
    }
    const at = contour.findIndex((point, index) => {
      const next = contour[(index + 1) % contour.length];
      return (Math.hypot(point[0] - group[0].edgeStart[0], point[1] - group[0].edgeStart[1]) < 1e-6
        && Math.hypot(next[0] - group[0].edgeEnd[0], next[1] - group[0].edgeEnd[1]) < 1e-6);
    });
    if (at === -1) {
      errors.push('host edge no longer present after an earlier embedding');
      continue;
    }
    contour = [
      ...contour.slice(0, at + 1),
      ...merged.composite.slice(1, -1),
      ...contour.slice(at + 1)
    ];
    group.forEach(embedding => applied.push({ ...embedding, composite: merged.composite }));
  }
  return { contour, errors, applied };
};
