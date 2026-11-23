# COMPONENT: CAD OCCT (plugin package)

The geometry program's B-rep kernel plugin (SPEC §20 owner decision
2026-11-20): exact solid modeling — primitives, transforms, booleans,
fillet, STEP exchange, tessellation — over brepjs on the occt-wasm
kernel, in one shared runtime for browser and server targets.

Parent: [workers README](../README.md). Contract:
[plugin SDK](../../packages/plugin-sdk/README.md); kind owner:
[geometry base](../geometry-base/README.md); platform consumer:
[plugins feature](../../server/features/plugins/README.md).

## Package

| Path | Role |
|---|---|
| `listing.json` | Generated: the type-less node-library listing — one shared runtime, 13 managed pure services, the native-shape preview surface and its `3D` channel, the vendored-dependency declarations. |
| `generate-listing.mjs` | The generator (the law): reads brepjs's published `.d.ts` declarations, verifies every curated operation against the signature it names, emits the listing. |
| `runtime/cad-occt.mjs` | The runtime entry (`createRuntime()`): dispatches operations through brepjs, owns the shape-handle table, derives providers from the listing through the SDK derivation. |
| `build-runtime.mjs` | The vendor build: bundles the SDK derivation module from this checkout, stages the wasm kernel, rewrites the loader's default wasm URL. |
| `assets/vendor/` | The vendored dependency closure: `brepjs.mjs` + chunks, `occt-wasm.mjs`, `perigram-plugin-sdk-nodes.mjs`, `occt-wasm.wasm` (the staged kernel binary). |

Regeneration pipeline (a maintainer with the packages installed):

```sh
cd workers/cad-occt && npm install
node generate-listing.mjs            # verify curated ops, write listing.json
node ../../packages/plugin-sdk/bin/perigram-plugin.js vendor --entry runtime
node build-runtime.mjs
```

The npm install provides brepjs/occt-wasm for the vendor build; the
`@perigram` shim inside a scratch `node_modules` resolves this checkout's
own SDK sources in an agent worktree.

## Handle contract (geometry.occt.shape, SPEC §30.13)

Kernel shapes are engine-native: opaque outside this plugin, carried on
shape ports as `{ handle, brep }`.

- `handle` (`occt-<sequence>`) references the runtime instance's shape
  table — identity inside one browser Worker session or one managed
  process. `clearExecution` empties the table when a graph execution
  ends.
- `brep` is OCCT BREP text (brepjs `toBREP`): the exact boundary,
  serializable and rebuildable in any fresh runtime. Resolution checks
  the table first, falls back to `fromBREP` — so a value that crossed a
  process or survived a table clear still resolves, and a persisted
  output carries exact geometry, never a live kernel object.
- The managed child runs one operation per process, so every inter-node
  hop on the server travels through the BREP form; the browser Worker
  keeps live handles and pays serialization only on the wire.

## Preview

Shape outputs declare the `occt-shape` node renderer; the provider maps it to
`occt-shape-preview`. The preview surface tessellates each `brep` through the
same occt-wasm kernel in the host page and renders the resulting
`perigram.scene-3d` value through the host `Scene3DViewer`. Its `3D` preview
channel scans the whole preview payload, so a shape-producing node renders
whether or not a Graph Output boundary exposes it.

## Kinds and conventions

| Kind | Where | Meaning |
|---|---|---|
| `geometry.occt.shape` | shape ports | The engine-native handle value above. Owned here. |
| `geometry.point3`, `geometry.vector3`, `geometry.angle` | position, direction, angle ports | Reused from [geometry base](../geometry-base/README.md) — Z-up, millimetres, radians. |
| `documents.file` | STEP exchange ports | The file payload envelope `{ payload: { base64, mime, name } }`, reused from [documents](../documents/README.md). |
| `representation: perigram.scene-3d` | tessellate output | The mesh channel value ([frontend utilities](../../utils/README.md)): `{ representation, vertices, faces, normals? }` in mm, Z-up. |

Positions and directions arrive as geometry.base point3/vector3 values
and reinterpret onto brepjs Vec3 tuples at the boundary; non-finite
components refuse. brepjs's `rotate` takes degrees — the port carries
`geometry.angle` radians and the runtime converts.

## Operations

| Palette group | Operations |
|---|---|
| `primitives` — Solids | `make-box`, `make-cylinder`, `make-sphere`, `make-cone` |
| `transforms` — Transforms | `translate-shape`, `rotate-shape` |
| `booleans` — Booleans | `fuse-shapes`, `cut-shapes`, `intersect-shapes` |
| `modifiers` — Modifiers | `fillet-all-edges` (one constant radius) |
| `exchange` — Exchange | `import-step`, `export-step` |
| `mesh` — Mesh | `tessellate-shape` |

Every service is pure, deterministic, idempotent, capability-free, and
dual-target. Constructors default their scalars (a 10 mm box, a 5 mm
radius). The curated set is bounded to what the generator can verify
against brepjs declarations; the next slices extend it (torus, shells,
chamfer, transforms on frames, measurement).

## Conversions and fidelity

Declared beside the provider through the SDK conversion grammar:

| Conversion | Fidelity |
|---|---|
| `occt-shape-to-step-file` (`export-step`) | `lossless` — STEP carries the exact B-rep. |
| `step-file-to-occt-shape` (`import-step`) | `lossless` — the reader reconstructs the exact boundary. |
| `occt-shape-to-mesh` (`tessellate-shape`) | `semantically-lossy` — triangles approximate the boundary within the linear/angular deflection; analytic exactness and downstream measurement precision are lost. |

IGES: the default occt-wasm kernel is built without the IGES translator
(brepjs answers `UNSUPPORTED_CAPABILITY`); STEP is the exchange format
this plugin ships.

## Vendoring and licenses

| Dependency | Version | License | Vendor module |
|---|---|---|---|
| brepjs | 20.28.3 | Apache-2.0 | `/assets/vendor/brepjs.mjs` (+ chunks) |
| occt-wasm | 5.17.2 | `MIT OR Apache-2.0` — declared as Apache-2.0 (the listing grammar takes one SPDX token) | `/assets/vendor/occt-wasm.mjs` |
| occt-wasm kernel binary | 5.17.2 | LGPL-2.1 (the embedded OCCT build; passes the GPL-prefix license gate) | `/assets/vendor/occt-wasm.wasm` |
| plugin-sdk nodes | this checkout | MIT | `/assets/vendor/perigram-plugin-sdk-nodes.mjs` |

The runtime imports brepjs and occt-wasm bare; the browser module proxy
rewrites the names to this package's vendor scope and the managed Deno
child resolves them through its generated import map. The SDK derivation
module is imported by relative path (the documents shared-bundle
pattern). The wasm binary is staged through the runtime's
`new URL('../assets/vendor/occt-wasm.wasm', import.meta.url)` — the
release walker's asset scan discovers it; the emscripten loader's own
default URL is rewritten to the same location at build time. The kernel
initializes lazily from the staged bytes (`OcctKernel.init({ wasm })`),
so the browser fetches it same-origin through the proxy and the managed
child reads it from the package directory.

## Publish and install (dev stack)

```sh
cd workers/cad-occt && node generate-listing.mjs && node build-runtime.mjs
curl -sS -X POST http://localhost:3001/api/plugins/catalog \
  -H 'x-operator-token: perigram-dev-operator' -H 'content-type: application/json' \
  --data-binary @workers/cad-occt/listing.json
for f in runtime/cad-occt.mjs surfaces/occt-shape-preview.mjs listing.json assets/vendor/brepjs.mjs \
         assets/vendor/occt-wasm.mjs assets/vendor/occt-wasm.wasm \
         assets/vendor/perigram-plugin-sdk-nodes.mjs; do
  curl -sS -X PUT "http://localhost:3001/api/plugins/catalog/cad-occt/assets/$f?version=2" \
    -H 'x-operator-token: perigram-dev-operator' \
    -H 'content-type: ${f##*.}=application/wasm' \
    --data-binary @workers/cad-occt/$f
done
```

Install from the org's Plugins section (geometry-base and documents must
be installed — the listing `requires` them), then author a graph from
the CAD (OCCT) palette section. Uninstall + retract after dogfooding.

## Tests

`npx vitest run workers/cad-occt` — the generator contract
(`generate-listing.spec.js`: scanner syntax, refusal on a drifting
mapping, committed-listing parity with the installed brepjs), the plugin
contract (`contract.spec.js`: listing/dependency/staging honesty, the
bare-import law, provider and conversion honesty, socket semantics, the
kernel chain, the handle contract, refusal guidance), and the shipped
module graph in a Worker thread (`vendor-graph.spec.js`, running
`runtime-worker-check.mjs` as a clean node process: the platform's real
plugin Worker boots the vendored graph and executes primitive → boolean
→ tessellate — the real-Chromium leg stays with the deployed stack's
runtime browser smoke).

`npx vitest run server/features/graph-executions/cad-occt-managed-preview.spec.js`
— the managed-runtime chain through the real evaluator and dispatch
harness (the documents-preview-bake pattern): every cad-occt node runs
as its own managed task against the real runtime module and the preview
answers the mesh channel value.

## Related

- [workers README](../README.md) — the worker tier inventory.
- [geometry base](../geometry-base/README.md) — the kind owner this
  plugin requires and composes with.
- [plugin SDK](../../packages/plugin-sdk/README.md) — the listing
  contract, node contracts, conversion grammar, and the vendor command.
- [plugins feature](../../server/features/plugins/README.md) — publish,
  install, and managed execution.
