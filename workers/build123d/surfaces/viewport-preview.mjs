// The build123d designer preview channel (SPEC §28): one read-only tab
// rendering the whole-graph preview evaluation's bake meshes as one
// orthographic SVG projection — three isometric faces distinguishable,
// no runtime dependency (the surface contract's ctx is unused here; the
// payload is the channel's data).
export default function createSurface() {
  return {
    props: { record: { type: Object, default: null }, payload: { type: Object, default: null } },
    template: `
      <div v-if="meshes.length" class="flex h-full min-h-48 flex-col gap-2">
        <svg
          v-for="(entry, index) in meshes"
          :key="index"
          :viewBox="entry.viewBox"
          class="h-full min-h-24 w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <g :fill="'var(--ck-entity-tone-fabrication)'" fill-opacity="0.35" :stroke="'currentColor'" stroke-width="0.8">
            <polygon v-for="(face, faceIndex) in entry.faces" :key="faceIndex" :points="face" />
          </g>
        </svg>
      </div>
      <div v-else class="text-supporting text-muted">no bake outputs</div>
    `,
    computed: {
      meshes() {
        const nodes = this.payload?.nodes || {};
        const results = [];
        for (const [nodeId, node] of Object.entries(nodes)) {
          const outputs = node?.outputs || {};
          for (const [socketId, tree] of Object.entries(outputs)) {
            const mesh = meshOf(tree);
            if (mesh) results.push(project(mesh, nodeId, socketId));
          }
        }
        return results;
      }
    }
  };
}

function meshOf(tree) {
  const item = tree?.branches?.[0]?.items?.[0];
  if (!item || typeof item !== 'object') return null;
  const candidate = item.data?.mesh || item.mesh || null;
  if (!candidate || !Array.isArray(candidate.vertices) || !Array.isArray(candidate.triangles)) return null;
  return candidate;
}

// Orthographic isometric projection: x-axis right-down, y-axis right-up,
// z-axis up — three faces distinguishable, painter-ordered by depth.
function project(mesh, nodeId, socketId) {
  const iso = ([x, y, z]) => [(x - y) * 0.866, (x + y) * 0.5 + z];
  const points = [];
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    points.push(iso([mesh.vertices[i], mesh.vertices[i + 1], mesh.vertices[i + 2]]));
  }
  const faces = [];
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const [a, b, c] = [mesh.triangles[i], mesh.triangles[i + 1], mesh.triangles[i + 2]];
    faces.push([points[a], points[b], points[c]].map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' '));
  }
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs) - 1;
  const maxX = Math.max(...xs) + 1;
  const minY = Math.min(...ys) - 1;
  const maxY = Math.max(...ys) + 1;
  return {
    label: `${nodeId}:${socketId}`,
    faces,
    viewBox: `${minX.toFixed(2)} ${minY.toFixed(2)} ${(maxX - minX).toFixed(2)} ${(maxY - minY).toFixed(2)}`
  };
}
