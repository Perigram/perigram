// The demo engine's wheel: staged module turning WASM linear memory
// into the platform's tessellated scene value (perigram.scene-3d —
// vertices, triangle faces, per-vertex normals). Structured-cloneable
// plain data: it crosses the worker boundary into graph outputs.
export function buildSceneValue(buffer, offset, count, major, minor) {
  const view = new Float64Array(buffer, offset, count * 6);
  const vertices = [];
  const normals = [];
  for (let vertex = 0; vertex < count; vertex += 1) {
    vertices.push([view[vertex * 3], view[vertex * 3 + 1], view[vertex * 3 + 2]]);
    const base = count * 3 + vertex * 3;
    normals.push([view[base], view[base + 1], view[base + 2]]);
  }
  const faces = [];
  for (let i = 0; i < major; i += 1) {
    const next = ((i + 1) % major) * minor;
    const current = i * minor;
    for (let j = 0; j < minor; j += 1) {
      const jNext = (j + 1) % minor;
      faces.push([current + j, next + j, next + jNext], [current + j, next + jNext, current + jNext]);
    }
  }
  return { representation: 'perigram.scene-3d', vertices, faces, normals };
}
