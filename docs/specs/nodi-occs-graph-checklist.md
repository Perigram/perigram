# Nodi3d OCCS Graph Build Sheet

Use this while creating Nodi3d graphs. Build the first slice only, then expand.
The formal manifest rules live in
[nodi-operation-contract.md](./nodi-operation-contract.md).

## Main Rule

For live designer preview, evaluate one Nodi3d operation graph per face, cache
each evaluated `out.boundary`, and feed child faces from the cached parent
boundary through a generated Nodi `Polyline` input. Compose OCCS into one Nodi3d
graph only when export/debug needs a whole-document graph.

Perigram handles:

- OCCS expression resolution
- recursive face/fold traversal
- choosing graph operations
- socket wiring
- semantic layer collection if Nodi does not own it
- preview edge overlays from evaluated Nodi boundary curves

Nodi3d handles:

- CAD geometry creation
- region union/difference/offset
- optional export operations
- boundary direction and edge extraction from connected parent geometry

The designer stores only topology and parameter values. It must not construct
trapezoids, compute normals, or choose extrusion sides.

## Root vs Child Faces

Do not standardize separate OCCS concepts for root and regular trapezoids or
polygons. Standardize one logical operation per shape:

- `face.trapezoid`
- `face.polygon`

Each gets a placement mode:

```json
{ "mode": "root" }
```

or the edge placement documented in the
[operation contract](./nodi-operation-contract.md).

If Nodi3d optional branches are inconvenient, create wrapper graphs:

- `face.trapezoid.root`
- `face.trapezoid.edge`
- `face.polygon.root`
- `face.polygon.edge`

Perigram still treats those as one logical `face.trapezoid` or `face.polygon`
operation with different placement modes.

## Anchor Naming

Use `start` and `end`, not `source.start` / `source.end`.

Reason: the active base edge is already known from context. For a child face it
is selected by `parentEdgeIndex` from the connected `parentPolygon` boundary.
Numeric `0` / `1` is acceptable inside a Nodi graph, but less readable in OCCS
or Perigram IR.

## Boundary Direction

Every face graph must output a counter-clockwise closed `out.boundary` polyline.
Edges are defined by vertex order:

```text
Ei = vertex[i] -> vertex[(i + 1) % vertexCount]
```

When composing graphs, connect the parent `out.boundary` to the child
`parentPolygon` input and pass `parentEdgeIndex`. For incremental preview,
connect an adapter `Polyline` created from the cached parent boundary vertices.
If the graph has a test parent polygon for authoring, Perigram replaces that
connection for child instances.

The trapezoid point rule (`P0..P3`) is defined in the
[operation contract](./nodi-operation-contract.md).

## Manifest Template

One manifest per exported graph:

```json
{
  "id": "face.trapezoid",
  "version": "0.1.0",
  "graphFile": "face-trapezoid.nodi.json",
  "inputs": [
    { "name": "parentPolygon", "type": "closedCurve", "socket": "in.parentPolygon" },
    { "name": "parentEdgeIndex", "type": "integer", "socket": "in.parentEdgeIndex" },
    { "name": "height", "type": "number", "socket": "in.height" }
  ],
  "outputs": [
    { "name": "region", "type": "region", "socket": "out.region" },
    { "name": "edges", "type": "edgeList", "socket": "out.edges" }
  ]
}
```

Use `in.<name>` and `out.<name>` labels when Nodi export preserves them. If it
only preserves generated socket IDs, record those IDs in the manifest.

## First Slice

Build these first:

- [ ] `face.trapezoid`
- [ ] `region.union`
- [ ] `entity.circleHole`
- [ ] `region.difference`
- [ ] `layer.collect` or Perigram-side layer collector

This is enough for: main face, simple returns, route lines, holes, final flat
pattern contour, and semantic layer output.

## Graphs To Create

| Done | Graph | Inputs | Outputs | Notes |
|---|---|---|---|---|
| [ ] | `face.trapezoid` | `parentPolygon`, `parentEdgeIndex`, `height`, `startAnchor`, `endAnchor`, `baseStartOffset`, `baseEndOffset`, `topStartOffset`, `topEndOffset`, `p2Height`, `p3Height` | `region`, `boundary`, `points`, `edges`, `foldLine?` | Child instances connect parent `out.boundary` to `parentPolygon`. Must output CCW boundary and stable `E0..E3`. Manifest records both semantic type and Nodi access/hint. |
| [ ] | `face.polygon` | `parentPolygon`, `parentEdgeIndex`, `points`, `attachEdge`, `segments?` | `region`, `boundary`, `edgeList`, `foldLine?` | For non-trapezoid faces. `attachEdge` defaults to `0`; boundary output must be CCW. |
| [ ] | `region.union` | `regions` | `region`, `boundary` | Produces `contour.flat_pattern.face_and_returns`. |
| [ ] | `region.difference` | `baseRegion`, `cutRegions` | `region`, `boundary` | Holes, slots, hang cuts. |
| [ ] | `entity.circleHole` | `faceFrame`, `origin`, `diameter` | `cutRegion`, `geometry` | Geometry layer is `cut.hole`. |
| [ ] | `entity.slot` | `faceFrame`, `origin`, `width`, `height`, `cornerRadius`, `rotation` | `cutRegion`, `geometry` | Geometry layer is `cut.inner`. |
| [ ] | `entity.polygonCutout` | `faceFrame`, `origin`, `points`, `rotation` | `cutRegion`, `geometry` | For arbitrary cutouts/hang cuts. |
| [ ] | `region.offset` | `region`, `distance`, `mode` | `boundary` | Produces `contour.flat_pattern.offset_envelope`. |
| [ ] | `layer.collect` | `items` | `layers` | Can be Nodi-side or Perigram-side. |

## Minimum Tests

- [ ] root rectangle from `face.trapezoid`
- [ ] child return from `main.E2`
- [ ] recursive child from return `E2`
- [ ] trimmed child using start/end offsets
- [ ] union of main + four returns
- [ ] one hole subtracted from blank
- [ ] semantic output layers: contour, fold route, hole

## Later

- [ ] `entity.textMark`
- [ ] `fold.to3d`
- [ ] `profile.place`
- [ ] `assembly.placeWorkpiece`
- [ ] `export.dxf` if Nodi owns DXF export
