# CONTAINER: build123d Plugin Executor

Parametric B-Rep CAD as a third-party plugin (SPEC §28's engine-as-plugin
vertical): `listing.json` declares the part/recipe types, the box-bake
services, and the designer preview channel; this process is the executor
that owns the compute and the preview surface. The platform carries zero
CAD code.

Runs from the repo mount (compose `build123d-executor`, port 8793) or as
its own deployment — nothing here imports platform code.

## Services

Service compute is value→value (SPEC §8): values in, computed values
out, free of service imports, persistence, and auth.

| Service | Contract |
|---|---|
| `bake` | `{ operation: 'box', parameters: { width, height, depth } }` in → `{ data: { name, shape, bounds, mesh } }` out — exact bounds and a watertight triangle mesh (12 outward triangles, every edge shared by exactly two faces); the `fromBake` construction stores it as a part record's data |
| `preview-mesh` | the same input → the bare `{ vertices, triangles }` mesh; deterministic (cache-declared), so the preview channel replays without an executor call |

Both services declare `cache: 'deterministic'` (endpoint-only listing
law): the platform replays same-input executions through its service
cache.

## Preview channel

`previewChannels: [{ id: 'b3d-viewport', surface: 'viewport-preview',
label: '3D viewport' }]` — the process designer's Preview tab mounts
`surfaces/viewport-preview.mjs` (contract 1, read-only) over the
whole-graph preview evaluation: every bake output in the evaluation
result projects as one orthographic isometric SVG (three faces
distinguishable, painter depth, no runtime dependency).

## Publish, install

- Listing: `workers/build123d/listing.json` (validated by
  [@perigram/plugin-sdk](../../packages/plugin-sdk/README.md)).
- Deploy + seed: `node server/scripts/seed-plugin-catalog.js`.
- Connection settings: point `bake` and `preview-mesh` at
  `http://build123d-executor:8793/<serviceId>` (dev compose) with the
  executor key.

Parent: [workers README](../README.md). One-graph law:
[root SPEC §28](../../SPEC.md).
