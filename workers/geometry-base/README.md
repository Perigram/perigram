# COMPONENT: Geometry Base (plugin package)

The first plugin of the geometry program (SPEC §20, owner decision
2026-11-20): the canonical geometry kinds, coordinate conventions, and
basic point, vector, plane, and frame operations the kernel plugins
compose with. Pure compute in one dependency-free shared runtime for
browser and server targets.

Parent: [workers README](../README.md). Contract:
[plugin SDK](../../packages/plugin-sdk/README.md); platform consumer:
[plugins feature](../../server/features/plugins/README.md).

## Package

| Path | Role |
|---|---|
| `listing.json` | Type-less node-library listing: one shared runtime and 24 hand-authored managed services — the one catalog. |
| `runtime/geometry-base.mjs` | The runtime entry (`createRuntime()`): dispatches operations and derives its provider definitions from the listing. |
| `runtime/math.mjs` | The pure math behind every operation. |

- The listing declares no CTS type: geometry values are provider-qualified
  semantic port kinds, and server-side node discovery resolves from
  installed services
  ([plugins feature](../../server/features/plugins/README.md)), so a
  business record type would be a dummy type (SPEC §20 owner direction
  2026-11-20).
- The runtime derives its provider definitions from the listing's service
  signatures; the same derivation feeds the browser Worker (`providers`)
  and mirrors what the server derives from the installed services.
- The entry is a dependency-free source module: its static import graph
  (entry, math, `listing.json` import) is complete inside the package with
  zero bare specifiers, so one artifact serves both the browser Worker and
  the managed Deno child.

## Semantic kinds

| Kind | Value shape | Meaning |
|---|---|---|
| `geometry.point3` | `{ x, y, z }` | A location. |
| `geometry.vector3` | `{ x, y, z }` | A displacement; a unit direction is the vector of length 1 mm in that direction. |
| `geometry.plane` | `{ origin: point3, normal: vector3 }` | `normal` is unit length. |
| `geometry.frame` | `{ origin: point3, xAxis, yAxis, zAxis }` | Orthonormal right-handed basis. |
| `geometry.angle` | number | Radians. |

Numbers carry the CTS unit vocabulary where a unit applies
([units](../../packages/cts/README.md)): every port of a length-bearing
kind declares `unit: 'mm'`. The `vector-dot` output carries no unit — its
natural unit mm² is outside the CTS set. `geometry.angle` carries no unit:
radians are the recorded convention, and CTS `deg` belongs to authored
fields.

The `geometry.` namespace is owned here; kernel plugins reuse these kinds
for their convertible values and declare engine-native kinds of their own
(SPEC §30.13).

## Conventions

- Right-handed coordinates, Z up.
- Lengths in millimetres (CTS spelling `mm`).
- Angles in radians.
- A frame obeys `xAxis × yAxis = zAxis`; frame consumers validate
  orthonormality within `1e-6` and refuse skew or left-handed input.
- Signed plane distance is positive on the normal side.
- A vector shorter than `1e-12` mm is zero; operations that need a
  direction refuse it.
- Inputs must be finite: `NaN` and `Infinity` refuse at the boundary.
- Frame construction is deterministic: the x axis follows the hint's
  component perpendicular to z; a hint that is absent or parallel to z
  falls back to the world axis least aligned with z, with ties going to
  the lowest axis.

## Operations

| Palette group | Operations |
|---|---|
| `points-vectors` — Points & vectors | `make-point3`, `make-vector3`, `vector-between`, `vector-add`, `vector-subtract`, `vector-scale`, `vector-dot`, `vector-cross`, `vector-norm`, `vector-normalize`, `vector-angle`, `point-translate`, `point-distance` |
| `planes-frames` — Planes & frames | `make-plane`, `plane-normal`, `plane-distance`, `make-frame`, `frame-from-plane`, `frame-origin`, `frame-axis`, `point-to-local`, `point-to-world` |
| `conversions` — Conversions | `point-to-vector`, `vector-to-point` |

Every service is pure, deterministic, idempotent, capability-free, and
dual-target (`browser` + `server`). Constructors default their scalar
inputs (`make-point3` with nothing wired builds the origin; `factor`
defaults to 1; `frame-axis` defaults to `z`).

## Conversions

`point3 ↔ vector3` reinterpret components and round-trip bit-identically:
declared through the SDK conversion grammar with
`fidelity: 'lossless'` beside the operations of the same meaning. A
cross-kind edge is `incompatible` in the port comparator (the kind
qualifier), so a conversion is always an explicit graph operation.

## Publish and install (dev stack)

```sh
curl -sS -X POST http://localhost:3001/api/plugins/catalog \
  -H 'x-operator-token: perigram-dev-operator' -H 'content-type: application/json' \
  --data-binary @workers/geometry-base/listing.json
for f in runtime/geometry-base.mjs runtime/math.mjs; do
  curl -sS -X PUT "http://localhost:3001/api/plugins/catalog/geometry-base/assets/$f?version=1" \
    -H 'x-operator-token: perigram-dev-operator' -H 'content-type: text/javascript' \
    --data-binary @workers/geometry-base/$f
done
curl -sS -X PUT "http://localhost:3001/api/plugins/catalog/geometry-base/assets/listing.json?version=1" \
  -H 'x-operator-token: perigram-dev-operator' -H 'content-type: application/json' \
  --data-binary @workers/geometry-base/listing.json
```

The `listing.json` asset serves the runtime's JSON import; the proxy must
store it as `application/json` for the browser to load it as a JSON
module.

Install from the org's Plugins section, then author a graph from the
Geometry Base palette section: browser preview evaluates in the plugin
Worker, saved-graph evaluation runs the same operations through the
managed server runtime. Uninstall + retract after dogfooding.

## Tests

`npx vitest run workers/geometry-base` — the contract suite
(`contract.spec.js`: listing/provider/palette/socket honesty, chains
through the graph invocation envelope, refusal guidance) and the math
laws (`runtime/math.spec.js`: arithmetic identities, orthonormal frames,
plane queries, degenerate-input policy).

## Related

- [workers README](../README.md) — the worker tier inventory.
- [plugin SDK](../../packages/plugin-sdk/README.md) — the listing
  contract, node contracts, palette law, and the conversion grammar.
- [plugins feature](../../server/features/plugins/README.md) — publish,
  install, and managed execution.
