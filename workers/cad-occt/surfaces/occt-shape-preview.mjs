import { OcctWasmAdapter, fromBREP, mesh, registerKernel, unwrap } from 'brepjs';
import { OcctKernel } from 'occt-wasm';

const WASM_URL = new URL('../assets/vendor/occt-wasm.wasm', import.meta.url);
let kernelPromise = null;

async function ensureKernel() {
  kernelPromise ||= fetch(WASM_URL, { credentials: 'same-origin' })
    .then(response => {
      if (!response.ok) throw new Error(`The occt-wasm kernel asset is unavailable (${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    })
    .then(wasm => OcctKernel.init({ wasm }))
    .then(kernel => {
      registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
      return kernel;
    });
  return kernelPromise;
}

function sceneValue(shapeMesh) {
  const vertices = [];
  for (let index = 0; index < shapeMesh.vertices.length; index += 3) {
    vertices.push([shapeMesh.vertices[index], shapeMesh.vertices[index + 1], shapeMesh.vertices[index + 2]]);
  }
  const faces = [];
  for (let index = 0; index < shapeMesh.triangles.length; index += 3) {
    faces.push([shapeMesh.triangles[index], shapeMesh.triangles[index + 1], shapeMesh.triangles[index + 2]]);
  }
  const value = { representation: 'perigram.scene-3d', vertices, faces };
  if (shapeMesh.normals.length === shapeMesh.vertices.length) {
    const normals = [];
    for (let index = 0; index < shapeMesh.normals.length; index += 3) {
      normals.push([shapeMesh.normals[index], shapeMesh.normals[index + 1], shapeMesh.normals[index + 2]]);
    }
    value.normals = normals;
  }
  return value;
}

function shapeValues(payload = {}) {
  const found = [];
  const seen = new Set();
  const add = value => {
    if (typeof value?.brep !== 'string' || seen.has(value.brep)) return;
    seen.add(value.brep);
    found.push(value);
  };
  add(payload?.value);
  for (const value of Object.values(payload?.outputs || {})) add(value);
  for (const node of Object.values(payload?.nodeOutputs || {})) {
    for (const value of Object.values(node || {})) add(value);
  }
  for (const node of Object.values(payload?.nodes || {})) {
    for (const tree of Object.values(node?.outputs || {})) {
      for (const branch of Array.isArray(tree?.branches) ? tree.branches : []) {
        for (const item of Array.isArray(branch?.items) ? branch.items : []) add(item);
      }
    }
  }
  return found;
}

export default function createSurface(ctx) {
  const { h, ref, watch } = ctx?.vue || {};
  const Scene3DViewer = ctx?.components?.Scene3DViewer;

  return {
    props: {
      record: { type: Object, default: null },
      payload: { type: Object, default: null }
    },
    setup(props) {
      const scenes = ref([]);
      const loading = ref(false);
      const error = ref('');
      let token = 0;

      async function build() {
        const values = shapeValues(props.payload);
        const current = ++token;
        scenes.value = [];
        error.value = '';
        if (!values.length) return;
        loading.value = true;
        try {
          await ensureKernel();
          const built = values.map(value => sceneValue(mesh(unwrap(fromBREP(value.brep)), {})));
          if (current === token) scenes.value = built;
        } catch (cause) {
          if (current === token) error.value = cause?.message || String(cause);
        } finally {
          if (current === token) loading.value = false;
        }
      }

      watch(() => props.payload, build, { immediate: true });

      return () => {
        if (loading.value) return h('div', { class: 'text-supporting text-muted' }, 'Building 3D preview…');
        if (error.value) return h('div', { class: 'text-supporting' }, error.value);
        if (!scenes.value.length) return h('div');
        return h('div', { class: 'flex h-full min-h-0 flex-col gap-3 overflow-auto' }, scenes.value.map((value, index) => h(
          Scene3DViewer,
          { key: index, value, fill: scenes.value.length === 1 }
        )));
      };
    }
  };
}
