// The build123d plugin's executor services (endpoint mode): pure compute
// over values. The vertical slice ships the box primitive bake — exact
// bounds and a watertight triangle mesh — as one complete, correct
// B-Rep operation. Each further primitive and boolean joins here behind
// its own signature; the OCCT-backed engine is the executor's own
// deployment concern (SPEC §28: engines arrive as plugins).
function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function numberOf(value, fallback = 0) {
  const parsed = Number(value?.value ?? value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// A unit box centered on the origin, scaled by the baked parameters —
// exact bounds, watertight mesh, no approximation.
function bakeBox(parameters = {}) {
  const w = Math.max(0, numberOf(parameters.width, 1));
  const h = Math.max(0, numberOf(parameters.height, 1));
  const d = Math.max(0, numberOf(parameters.depth, 1));
  if (!w || !h || !d) badRequest('box parameters width, height, depth must be positive numbers');
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const vertices = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]
  ];
  // Outward-facing triangles: bottom, top, and the four sides.
  const triangles = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]
  ];
  return {
    shape: 'box',
    parameters: { width: w, height: h, depth: d },
    bounds: { min: [-x, -y, -z], max: [x, y, z] },
    mesh: {
      vertices: vertices.flat(),
      triangles: triangles.flat()
    }
  };
}

export const services = {
  bake: input => {
    const operation = String(input?.operation || '');
    if (operation !== 'box') badRequest("operation must be 'box' (the slice's primitive)");
    const bake = bakeBox(input.parameters || {});
    return {
      data: {
        name: `box ${bake.parameters.width}x${bake.parameters.height}x${bake.parameters.depth}`,
        shape: bake.shape,
        bounds: bake.bounds,
        mesh: bake.mesh
      }
    };
  },
  'preview-mesh': input => {
    const operation = String(input?.operation || '');
    if (operation !== 'box') badRequest("operation must be 'box' (the slice's primitive)");
    return bakeBox(input.parameters || {}).mesh;
  }
};
