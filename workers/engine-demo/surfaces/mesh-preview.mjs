// The demo engine's mesh preview channel surface (contract 1): a
// read-only SVG isometric projection of perigram.scene-3d values in the
// graph's preview evaluation. Faces shade by their vertex normals; the
// host owns the chrome and the preview workspace.
export default function createSurface(ctx) {
  const h = ctx?.vue?.h || (() => null);

  return {
    props: {
      record: { type: Object, default: null },
      payload: { type: Object, default: null }
    },
    render() {
      const meshes = sceneMeshesOf(this.payload);
      if (!meshes.length) return h('div');
      return h('div', { class: 'flex flex-col gap-3' }, meshes.map((mesh, index) => {
        const scene = projectScene(mesh);
        if (!scene.polygons.length) return null;
        return h('svg', {
          key: index,
          viewBox: '0 0 720 480',
          role: 'img',
          'aria-label': 'Tessellated mesh preview',
          class: 'h-80 w-full'
        }, [
          ...scene.polygons.map((polygon, face) => h('polygon', {
            key: `f${face}`,
            points: polygon.points,
            fill: polygon.fill,
            'fill-opacity': polygon.opacity,
            stroke: 'currentColor',
            'stroke-opacity': 0.35,
            'stroke-width': 0.75,
            'stroke-linejoin': 'round'
          })),
          ...scene.edges.map((edge, edgeIndex) => h('line', {
            key: `e${edgeIndex}`,
            x1: edge.x1,
            y1: edge.y1,
            x2: edge.x2,
            y2: edge.y2,
            stroke: 'currentColor',
            'stroke-opacity': 0.6,
            'stroke-width': 1.25
          }))
        ]);
      }));
    }
  };
}

// Scene values in preview payload order: the selected output first,
// then graph outputs, then every node's outputs.
export function sceneMeshesOf(payload) {
  const found = [];
  const seen = new Set();
  const add = value => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    if (value.representation === 'perigram.scene-3d' && Array.isArray(value.vertices) && Array.isArray(value.faces)) {
      seen.add(value);
      found.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) add(item);
    }
  };
  add(payload?.selectedOutput?.value);
  for (const value of Object.values(payload?.outputs || {})) add(value);
  for (const node of Object.values(payload?.nodeOutputs || {})) {
    for (const value of Object.values(node || {})) add(value);
  }
  return found;
}

const LIGHT = normal => Math.max(0.15, 0.25 + 0.75 * Math.abs(normal[1] * 0.85 + normal[2] * 0.53));

function projectScene(mesh) {
  const vertices = mesh.vertices
    .map(vertex => (Array.isArray(vertex) && vertex.length >= 3
      ? [Number(vertex[0]) || 0, Number(vertex[1]) || 0, Number(vertex[2]) || 0]
      : null));
  const normals = Array.isArray(mesh.normals)
    ? mesh.normals.map(normal => (Array.isArray(normal) && normal.length >= 3
      ? [Number(normal[0]) || 0, Number(normal[1]) || 0, Number(normal[2]) || 0]
      : [0, 1, 0]))
    : null;
  const projected = vertices.map(vertex => vertex && [
    (vertex[0] - vertex[1]) * 0.8660254,
    (vertex[0] + vertex[1]) * 0.5 - vertex[2],
    vertex[0] + vertex[1] + vertex[2]
  ]);
  const xs = projected.map(point => point?.[0] ?? 0);
  const ys = projected.map(point => point?.[1] ?? 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(660 / Math.max(1e-6, maxX - minX), 400 / Math.max(1e-6, maxY - minY));
  const toPlane = point => point && ({
    x: 360 + (point[0] - (minX + maxX) / 2) * scale,
    y: 240 - (point[1] - (minY + maxY) / 2) * scale
  });
  const points = projected.map(toPlane);

  const faces = mesh.faces
    .map(face => (Array.isArray(face) ? face : []))
    .filter(face => face.length >= 3 && face.every(index => points[index]))
    .map(face => {
      const depth = face.reduce((sum, index) => sum + (projected[index]?.[2] ?? 0), 0) / face.length;
      const normal = normals
        ? face.reduce((sum, index) => [
            sum[0] + (normals[index]?.[0] ?? 0),
            sum[1] + (normals[index]?.[1] ?? 0),
            sum[2] + (normals[index]?.[2] ?? 0)
          ], [0, 0, 0]).map(component => component / face.length)
        : [0, 1, 0];
      return { face, depth, shade: LIGHT(normal) };
    })
    .sort((left, right) => left.depth - right.depth);

  const polygons = faces.map(({ face, shade }) => ({
    points: face.map(index => `${points[index].x.toFixed(2)},${points[index].y.toFixed(2)}`).join(' '),
    fill: 'currentColor',
    opacity: shade
  }));

  const seenEdges = new Set();
  const edges = [];
  for (const { face } of faces) {
    for (let position = 0; position < face.length; position += 1) {
      const pair = [face[position], face[(position + 1) % face.length]].sort((a, b) => a - b);
      const key = pair.join(':');
      if (seenEdges.has(key) || !points[pair[0]] || !points[pair[1]]) continue;
      seenEdges.add(key);
      edges.push({ x1: points[pair[0]].x, y1: points[pair[0]].y, x2: points[pair[1]].x, y2: points[pair[1]].y });
    }
  }
  return { polygons, edges };
}
