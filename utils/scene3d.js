// Renderer buffers for the standardized 3D scene value
// (`perigram.scene-3d`; contract in utils/README.md). Source vertex indexes
// stay stable so faces and edges address the original array.

const EMPTY = Object.freeze({
  positions: [],
  normals: [],
  indices: [],
  triangles: [],
  edges: [],
  bounds: null,
  vertexCount: 0,
  triangleCount: 0,
  edgeCount: 0
});

function finiteTriple(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const triple = value.slice(0, 3).map(Number);
  return triple.every(Number.isFinite) ? triple : null;
}

function faceTriangles(face) {
  const result = [];
  for (let index = 1; index < face.length - 1; index += 1) {
    result.push([face[0], face[index], face[index + 1]]);
  }
  return result;
}

export function scene3dGeometry(value = {}) {
  const sourceVertices = Array.isArray(value?.vertices) ? value.vertices : [];
  if (!sourceVertices.length) return EMPTY;

  const vertices = sourceVertices.map(finiteTriple);
  const positions = new Array(sourceVertices.length * 3).fill(0);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let vertexCount = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const vertex = vertices[index];
    if (!vertex) continue;
    positions[index * 3] = vertex[0];
    positions[index * 3 + 1] = vertex[1];
    positions[index * 3 + 2] = vertex[2];
    minX = Math.min(minX, vertex[0]);
    minY = Math.min(minY, vertex[1]);
    minZ = Math.min(minZ, vertex[2]);
    maxX = Math.max(maxX, vertex[0]);
    maxY = Math.max(maxY, vertex[1]);
    maxZ = Math.max(maxZ, vertex[2]);
    vertexCount += 1;
  }
  if (!vertexCount) return EMPTY;

  const validIndex = index => Number.isInteger(index) && index >= 0 && index < vertices.length && vertices[index];
  const sourceFaces = Array.isArray(value?.faces) ? value.faces : [];
  const indices = [];
  const triangles = [];
  for (let faceIndex = 0; faceIndex < sourceFaces.length; faceIndex += 1) {
    const face = sourceFaces[faceIndex];
    if (!Array.isArray(face) || face.length < 3 || !face.every(validIndex)) continue;
    for (const triangle of faceTriangles(face)) {
      indices.push(...triangle);
      triangles.push(faceIndex);
    }
  }

  const sourceEdges = Array.isArray(value?.edges) ? value.edges : [];
  const edgePairs = [];
  const seen = new Set();
  const addEdge = (from, to) => {
    if (from === to || !validIndex(from) || !validIndex(to)) return;
    const key = from < to ? `${from}:${to}` : `${to}:${from}`;
    if (seen.has(key)) return;
    seen.add(key);
    edgePairs.push(from, to);
  };
  if (sourceEdges.length) {
    for (const edge of sourceEdges) {
      if (Array.isArray(edge) && edge.length === 2) addEdge(edge[0], edge[1]);
    }
  } else {
    for (const face of sourceFaces) {
      if (!Array.isArray(face) || face.length < 3 || !face.every(validIndex)) continue;
      face.forEach((index, position) => addEdge(index, face[(position + 1) % face.length]));
    }
  }

  const sourceNormals = Array.isArray(value?.normals) ? value.normals : [];
  const normals = sourceNormals.length === sourceVertices.length
    ? sourceNormals.flatMap(normal => finiteTriple(normal) || [0, 0, 0])
    : [];

  return {
    positions,
    normals,
    indices,
    triangles,
    edges: edgePairs,
    bounds: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
    },
    vertexCount,
    triangleCount: triangles.length,
    edgeCount: edgePairs.length / 2
  };
}
