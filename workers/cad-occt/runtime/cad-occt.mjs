// The cad-occt plugin's shared runtime (SPEC §20 geometry program):
// exact B-rep solid modeling over brepjs on the occt-wasm kernel, one
// runtime for browser and server targets. Kernel shapes are
// runtime-scoped handles (SPEC §30.13 engine-native law); the package
// README (workers/cad-occt/README.md) owns the handle contract and the
// operation catalog. Dependencies resolve from the package's own vendor
// scope: the browser module proxy rewrites the bare names, the managed
// Deno child resolves them through its generated import map.
import listing from '../listing.json' with { type: 'json' };
import {
  RAD2DEG,
  OcctWasmAdapter,
  box,
  cone,
  cut,
  cylinder,
  exportSTEP,
  fillet,
  fromBREP,
  fuse,
  importSTEP,
  intersect,
  mesh,
  registerKernel,
  rotate,
  sphere,
  toBREP,
  translate,
  unwrap
} from 'brepjs';
import { OcctKernel } from 'occt-wasm';
import { nodeDefinitionFromService } from '@perigram/plugin-sdk/nodes';

export const CAD_PROVIDER = 'plugin.cad-occt';
export const RUNTIME_ID = 'cad-occt';
export const OCCT_WASM_URL = new URL('../assets/vendor/occt-wasm.wasm', import.meta.url);

// The OCCT kernel binary is a staged package asset: same-origin fetch in
// the browser (the module proxy serves the bytes), a file read where the
// package sits on a filesystem (the managed child, local test runs).
async function readWasmBytes() {
  if (OCCT_WASM_URL.protocol !== 'file:') {
    const response = await fetch(OCCT_WASM_URL, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`The occt-wasm kernel asset is unavailable (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }
  const { readFile } = await import('node:fs/promises');
  return readFile(OCCT_WASM_URL);
}

let kernelPromise = null;

function ensureKernel() {
  kernelPromise ||= readWasmBytes()
    .then(wasm => OcctKernel.init({ wasm }))
    .then(kernel => {
      registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
      return kernel;
    });
  return kernelPromise;
}

// ── shape handles ───────────────────────────────────────────────────────
// A geometry.occt.shape value carries its runtime handle beside the exact
// serializable B-rep: the handle resolves inside the runtime instance
// that produced it (a browser Worker session or one managed process),
// the BREP text rebuilds the shape anywhere. The table empties when the
// execution ends; resolution then falls back to the BREP form.

const shapeTable = new Map();
let shapeSequence = 0;

function emitShape(shape) {
  shapeSequence += 1;
  const handle = `occt-${shapeSequence}`;
  shapeTable.set(handle, shape);
  return { handle, brep: unwrap(toBREP(shape)) };
}

function resolveShape(value, port) {
  if (!value || typeof value !== 'object' || typeof value.brep !== 'string') {
    throw new Error(`${port} requires a geometry.occt.shape value (a shape handle from another cad-occt operation)`);
  }
  const live = typeof value.handle === 'string' ? shapeTable.get(value.handle) : null;
  return live || unwrap(fromBREP(value.brep));
}

// ── geometry.base value mapping ────────────────────────────────────────
// point3/vector3 reinterpret onto brepjs Vec3 tuples; finite inputs only
// (the geometry.base boundary law). Vec3 options absent from the input
// keep brepjs's own defaults.

function vec3(value, port) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const z = Number(value?.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new Error(`${port} requires finite x, y, z components`);
  }
  return [x, y, z];
}

function vec3Options(input, keys) {
  const options = {};
  for (const key of keys) {
    if (input[key] !== undefined) options[key] = vec3(input[key], key);
  }
  return options;
}

function scalarOptions(input, keys) {
  const options = {};
  for (const key of keys) {
    if (input[key] !== undefined) options[key] = input[key];
  }
  return options;
}

// Synchronous shape→shape operations; boolean and fillet results unwrap
// here so an Err fails the node with the kernel's own message.
const OPERATIONS = {
  'make-box': input => box(input.width ?? 10, input.depth ?? 10, input.height ?? 10, {
    ...vec3Options(input, ['at']),
    ...scalarOptions(input, ['centered'])
  }),
  'make-cylinder': input => cylinder(input.radius ?? 5, input.height ?? 10, {
    ...vec3Options(input, ['at', 'axis']),
    ...scalarOptions(input, ['centered'])
  }),
  'make-sphere': input => sphere(input.radius ?? 5, vec3Options(input, ['at'])),
  'make-cone': input => cone(input.bottomRadius ?? 5, input.topRadius ?? 0, input.height ?? 10, vec3Options(input, ['at', 'axis'])),
  'translate-shape': input => translate(resolveShape(input.shape, 'shape'), vec3(input.offset, 'offset')),
  // brepjs rotates in degrees; the port carries geometry.angle radians.
  'rotate-shape': input => rotate(
    resolveShape(input.shape, 'shape'),
    Number(input.angle ?? 0) * RAD2DEG,
    vec3Options(input, ['axis', 'at'])
  ),
  'fuse-shapes': input => unwrap(fuse(resolveShape(input.a, 'a'), resolveShape(input.b, 'b'))),
  'cut-shapes': input => unwrap(cut(resolveShape(input.base, 'base'), resolveShape(input.tool, 'tool'))),
  'intersect-shapes': input => unwrap(intersect(resolveShape(input.a, 'a'), resolveShape(input.b, 'b'))),
  'fillet-all-edges': input => unwrap(fillet(resolveShape(input.shape, 'shape'), input.radius ?? 1))
};

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

async function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

const ASYNC_OPERATIONS = {
  'import-step': async input => {
    const payload = input.file?.payload;
    if (!payload || typeof payload.base64 !== 'string') {
      throw new Error('file requires a documents.file payload (base64, mime, name)');
    }
    const bytes = await base64ToBytes(payload.base64);
    return emitShape(unwrap(await importSTEP(new Blob([bytes]))));
  },
  'export-step': async input => {
    const exported = unwrap(exportSTEP(resolveShape(input.shape, 'shape')));
    const bytes = new Uint8Array(await exported.arrayBuffer());
    return {
      payload: {
        base64: bytesToBase64(bytes),
        mime: 'application/step',
        name: input.name || 'part.step'
      }
    };
  },
  'tessellate-shape': async (input, context) => {
    const options = scalarOptions(input, ['tolerance', 'angularTolerance']);
    if (context?.signal) options.signal = context.signal;
    return sceneValue(mesh(resolveShape(input.shape, 'shape'), options));
  }
};

// Conversions this provider declares beside its operations (the SDK
// conversion grammar): STEP exchange is exact; tessellation trades the
// exact boundary for triangles bounded by the deflection tolerances.
export const CONVERSIONS = [
  {
    id: 'occt-shape-to-step-file',
    from: { base: 'json', kind: 'geometry.occt.shape' },
    to: { base: 'json', kind: 'documents.file' },
    provider: CAD_PROVIDER,
    runtime: RUNTIME_ID,
    deterministic: true,
    fidelity: 'lossless'
  },
  {
    id: 'step-file-to-occt-shape',
    from: { base: 'json', kind: 'documents.file' },
    to: { base: 'json', kind: 'geometry.occt.shape' },
    provider: CAD_PROVIDER,
    runtime: RUNTIME_ID,
    deterministic: true,
    fidelity: 'lossless'
  },
  {
    id: 'occt-shape-to-mesh',
    from: { base: 'json', kind: 'geometry.occt.shape' },
    to: { base: 'json', representation: 'perigram.scene-3d' },
    provider: CAD_PROVIDER,
    runtime: RUNTIME_ID,
    deterministic: true,
    fidelity: 'semantically-lossy'
  }
];

export function nodeDefinitions(source = listing, runtimeId = RUNTIME_ID, provider = CAD_PROVIDER) {
  const runtime = source.declarations?.runtimes?.find(item => item.id === runtimeId);
  if (!runtime) throw new Error(`cad-occt runtime declaration is missing: ${runtimeId}`);
  return source.declarations.services
    .filter(service => service.execution?.runtime === runtimeId
      && service.execution.targets?.includes('browser')
      && service.palette?.visible !== false
      && service.palette?.group)
    .map(service => nodeDefinitionFromService(service, { provider, runtimeId }));
}

export function createRuntime() {
  return {
    async execute(operationId, input = {}, context = {}) {
      if (!OPERATIONS[operationId] && !ASYNC_OPERATIONS[operationId]) {
        throw new Error(`Unsupported cad-occt operation: ${operationId}`);
      }
      const graphInvocation = input?.mode === 'preview' && input?.inputs && typeof input.inputs === 'object';
      const args = graphInvocation ? input.inputs : input;
      await ensureKernel();
      const value = ASYNC_OPERATIONS[operationId]
        ? await ASYNC_OPERATIONS[operationId](args, context)
        : emitShape(OPERATIONS[operationId](args, context));
      return graphInvocation ? { value } : value;
    },
    async clearExecution() {
      const hadShapes = shapeTable.size > 0;
      shapeTable.clear();
      return hadShapes;
    },
    providers: [{
      provider: CAD_PROVIDER,
      definitions: nodeDefinitions(),
      conversions: CONVERSIONS
    }]
  };
}
