// Sketch scene model (the tech-drawing plugin's `sketch` type) — the
// plugin-side copy of the scene contract: a scene is plain JSON persisted
// as the instance payload
// `{ version: 1, background: { fileId, url } | null, strokes: Stroke[] }`
// where `Stroke` is `{ id, tool: 'pen'|'line'|'rect'|'ellipse', points,
// color, size }` and `points` are viewBox-space `[x, y]` pairs. The
// host's utils/sketch.js keeps the DrawingCanvas preview adapter
// (normalizeSketchDrawing) and reads the same stored shape; this copy is
// the plugin's editing truth. `perfect-freehand` is a declared runtime
// dependency (vendored; the module proxy resolves the bare import).
import { getStroke } from 'perfect-freehand';

export const SKETCH_VIEWBOX = { width: 1000, height: 700 };
export const SKETCH_TOOLS = ['pen', 'line', 'rect', 'ellipse', 'eraser'];

export const emptyScene = () => ({ version: 1, background: null, strokes: [] });

export const parseScene = (raw) => {
  let scene;
  try {
    scene = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    scene = null;
  }
  if (!scene || typeof scene !== 'object') return emptyScene();
  return {
    version: 1,
    background: scene.background?.url ? { fileId: scene.background.fileId || null, url: scene.background.url } : null,
    strokes: Array.isArray(scene.strokes)
      ? scene.strokes.filter(stroke => Array.isArray(stroke?.points) && stroke.points.length)
      : []
  };
};

const strokeOptions = stroke => ({
  size: stroke.size || 4,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.5,
  easing: t => Math.sin((t * Math.PI) / 2),
  simulatePressure: true,
  last: true
});

const pointsToPath = (points, closed) => {
  const [first, ...rest] = points;
  return [
    `M ${first[0]},${first[1]}`,
    ...rest.map(([x, y]) => `L ${x},${y}`),
    closed ? 'Z' : ''
  ].join(' ');
};

/** SVG path `d` for one stroke; shapes derive from their two defining points. */
export const strokeToSvgPath = (stroke) => {
  const points = stroke.points.map(([x, y]) => [Number(x) || 0, Number(y) || 0]);
  if (points.length < 2) {
    const [x, y] = points[0] || [0, 0];
    return `M ${x},${y} L ${x},${y}`;
  }
  if (stroke.tool === 'pen') {
    const outline = getStroke(points, strokeOptions(stroke));
    const [first, ...rest] = outline;
    return [
      `M ${first[0]},${first[1]}`,
      ...rest.map(([x, y]) => `L ${x},${y}`),
      'Z'
    ].join(' ');
  }
  if (stroke.tool === 'line') {
    return pointsToPath(points, false);
  }
  const [start, end] = [points[0], points[points.length - 1]];
  if (stroke.tool === 'rect') {
    return pointsToPath([
      start,
      [end[0], start[1]],
      end,
      [start[0], end[1]]
    ], true);
  }
  if (stroke.tool === 'ellipse') {
    const rx = Math.abs(end[0] - start[0]) / 2;
    const ry = Math.abs(end[1] - start[1]) / 2;
    const cx = start[0] + (end[0] > start[0] ? rx : -rx);
    const cy = start[1] + (end[1] > start[1] ? ry : -ry);
    return [
      `M ${cx - rx},${cy}`,
      `A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy}`,
      `A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`,
      'Z'
    ].join(' ');
  }
  return pointsToPath(points, false);
};

const distanceToStroke = ([x, y], stroke) => {
  const threshold = (stroke.size || 4) + 12;
  return stroke.points.some(([px, py]) => {
    const dx = Number(px) - x;
    const dy = Number(py) - y;
    return dx * dx + dy * dy <= threshold * threshold;
  });
};

/** Strokes hit by the eraser at a viewBox point. */
export const strokesAtPoint = (scene, point) => scene.strokes
  .filter(stroke => distanceToStroke(point, stroke))
  .map(stroke => stroke.id);
