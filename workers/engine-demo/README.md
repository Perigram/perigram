# COMPONENT: Engine Demo (client-carried engine)

The E3b/E6 proof package: a demo plugin that carries its whole engine as
package assets — an expression interpreter, a Rust-compiled WASM
tessellation kernel, and a staged wheel — bootstraps them in a browser
Worker from its own package scope, and previews the result through a
mesh channel. It is a live-dogfood package published by an operator
(`perigram-dev-operator`), kept out of the built-in seed set.

Parent: [workers README](../README.md). Contract:
[plugin SDK](../../packages/plugin-sdk/README.md); platform consumer:
[plugins feature](../../server/features/plugins/README.md).

## Package

| Path | Role |
|---|---|
| `listing.json` | One item type, the `engine` declaration (`module` + staged `assets`), a preview surface, and the `engine-demo-mesh` preview channel. |
| `engine/index.mjs` | The engine entry (`createEngine()`): spawns the module Worker from its own scope and exposes `dispatch('make-mesh', parameters)` plus the `plugin.engine-demo` node provider (`make-mesh`, browser-pure, config-carried parameters). |
| `engine/worker.mjs` | The bootstrap: fetches the runtime manifest, then each staged asset through the module proxy (same-origin, session credentials), verifies the pinned sha256, persists verified bytes in the Cache API keyed by the manifest digest, instantiates the kernel, imports the wheel, and serves dispatches. |
| `engine/interpreter.mjs` | A shunting-yard expression evaluator (arithmetic, `pi`/`tau`/`e`, `sin`/`cos`/`sqrt`/`min`/`max`/…) — the scripting layer that turns authored config strings into kernel parameters. |
| `runtime/manifest.json` | The checksum pin: `{ assets: [{ path, sha256 }] }` for the kernel and wheel. |
| `runtime/kernel.wasm` | The tessellation kernel (torus positions + per-vertex normals into linear memory), compiled from `kernel/lib.rs`. |
| `runtime/ops-shapes.mjs` | The wheel: reads kernel memory into the `perigram.scene-3d` scene value. |
| `surfaces/mesh-preview.mjs` | The preview-channel surface (contract 1): SVG isometric projection of `perigram.scene-3d` values, faces shaded by vertex normals. |
| `kernel/` | The kernel source and `build.sh` — rebuilds `runtime/kernel.wasm` and `runtime/manifest.json` (needs `rustc` with `wasm32-unknown-unknown`). |

## Publish and install (dev stack)

```sh
curl -sS -X POST http://localhost:3001/api/plugins/catalog \
  -H 'x-operator-token: perigram-dev-operator' -H 'content-type: application/json' \
  --data-binary @workers/engine-demo/listing.json
for f in engine/index.mjs engine/worker.mjs engine/interpreter.mjs \
         runtime/ops-shapes.mjs surfaces/mesh-preview.mjs; do
  curl -sS -X PUT "http://localhost:3001/api/plugins/catalog/engine-demo/assets/$f?version=1" \
    -H 'x-operator-token: perigram-dev-operator' -H 'content-type: text/javascript' \
    --data-binary @workers/engine-demo/$f
done
curl -sS -X PUT "http://localhost:3001/api/plugins/catalog/engine-demo/assets/runtime/kernel.wasm?version=1" \
  -H 'x-operator-token: perigram-dev-operator' -H 'content-type: application/wasm' \
  --data-binary @workers/engine-demo/runtime/kernel.wasm
curl -sS -X PUT "http://localhost:3001/api/plugins/catalog/engine-demo/assets/runtime/manifest.json?version=1" \
  -H 'x-operator-token: perigram-dev-operator' -H 'content-type: application/json' \
  --data-binary @workers/engine-demo/runtime/manifest.json
```

Install from the org's Plugins section, then author a graph with the
palette's Engine demo node and open Preview: the graph evaluates in the
browser (no server round-trip), the outputs carry the mesh, and the
Mesh channel renders it. Uninstall + retract after dogfooding.

## Focused tests

`engine-demo.spec.js` proves the package without a browser: the listing
validates through `parseListing`, `prepareListingRelease` stages the
complete asset set, the manifest checksums match the shipped bytes, and
the real worker module bootstraps against a module-proxy-shaped HTTP
server (checksum refusal on tamper, ETag/304 revalidation) and
dispatches the tessellated mesh; the surface renders scene values from
every payload position.

## Related

- [workers README](../README.md) — the worker tier inventory.
- [plugins feature](../../server/features/plugins/README.md) — asset
  publishing and the module proxy that serves this package.
- [Frontend utilities](../../utils/README.md) — the `perigram.scene-3d`
  representation this engine emits.
