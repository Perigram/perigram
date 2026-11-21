// The standardized 3D scene value (SPEC §28.4, §28.14):
// `{ representation: 'perigram.scene-3d', vertices: [[x,y,z], ...],
// faces: [[i,j,k], ...], edges?: [[a,b], ...] }`. The host projects it for
// its interactive viewer; faces sort back-to-front so the orbit reads as
// a solid wireframe.
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 500;
const FIT_MARGIN = 80;

export function projectScene3d(value = {}, { yaw = 0, pitch = 0, zoom = 1, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {}) {
  const vertices = (Array.isArray(value?.vertices) ? value.vertices : [])
    .map(vertex => (Array.isArray(vertex) ? vertex : []).map(Number))
    .filter(vertex => vertex.length >= 3 && vertex.slice(0, 3).every(Number.isFinite));
  if (!vertices.length) return { faces: [], edges: [] };

  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
  const rotated = vertices.map(([x, y, z]) => {
    const rx = x * cosYaw - z * sinYaw;
    const rz = x * sinYaw + z * cosYaw;
    return { x: rx, y: y * cosPitch - rz * sinPitch, depth: y * sinPitch + rz * cosPitch };
  });

  const xs = rotated.map(point => point.x);
  const ys = rotated.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.max(0.01, zoom) * Math.min((width - FIT_MARGIN) / spanX, (height - FIT_MARGIN) / spanY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const points = rotated.map(point => ({
    x: width / 2 + (point.x - centerX) * scale,
    y: height / 2 - (point.y - centerY) * scale,
    depth: point.depth
  }));

  const faceIndexes = (Array.isArray(value?.faces) ? value.faces : [])
    .map(face => (Array.isArray(face) ? face : []).filter(index => Number.isInteger(index) && index >= 0 && index < points.length))
    .filter(face => face.length >= 3);
  const faces = faceIndexes
    .map(face => ({
      points: face.map(index => `${points[index].x},${points[index].y}`).join(' '),
      depth: face.reduce((sum, index) => sum + points[index].depth, 0) / face.length
    }))
    .sort((left, right) => left.depth - right.depth)
    .map(face => face.points);

  const edgePairs = Array.isArray(value?.edges) && value.edges.length
    ? value.edges
    : faceIndexes.flatMap(face => face.map((index, position) => [index, face[(position + 1) % face.length]]));
  const edges = edgePairs
    .filter(edge => Array.isArray(edge) && edge.length === 2 && points[edge[0]] && points[edge[1]])
    .map(([from, to]) => ({
      x1: points[from].x,
      y1: points[from].y,
      x2: points[to].x,
      y2: points[to].y
    }));

  return { faces, edges };
}
