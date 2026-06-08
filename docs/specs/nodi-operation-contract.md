# Nodi3d Operation Contract

This contract defines how CutKit compiles OCCS cassette documents into Nodi3d
graphs. It is not an OCCS schema extension. OCCS remains the saved cassette
format; this contract describes the CAD backend manifest and compiler rules.

## Execution Model

- Live designer preview evaluates one Nodi3d operation graph per face and
  caches the evaluated `out.boundary` vertices. A child face receives its parent
  boundary by adapting those vertices back into a generated Nodi `Polyline`
  connected to the child's `parentPolygon` input.
- Composed graph compilation remains the export/debug path when CutKit needs a
  single Nodi graph for a whole OCCS document.
- CutKit resolves OCCS expressions before wiring Nodi number sockets.
- CutKit walks face/fold topology recursively and wires child operations from
  parent face edge outputs.
- The designer/adoption layer stores topology and parameter values only. It
  must not synthesize face geometry, choose extrusion normals, or reinterpret
  Nodi output direction.
- Child face graphs receive the evaluated parent boundary directly: in a
  composed graph, connect the parent graph's `out.boundary` curve to the child
  graph's `parentPolygon`; in live incremental preview, connect an adapter
  `Polyline` created from the cached parent `out.boundary` vertices. Then set
  `parentEdgeIndex`.
- Nodi3d operation graphs create geometry and region operations; CutKit may
  collect semantic layers if that is simpler than doing it inside Nodi.

## Logical Operations

Root and child faces are not separate OCCS concepts. They are placement modes
of the same logical operation.

Required logical face operations:

| Operation | Placement modes | Required stable outputs |
|---|---|---|
| `face.trapezoid` | `root`, `edge` | `region`, `boundary`, `points.P0..P3`, `edges.E0..E3` |
| `face.polygon` | `root`, `edge` | `region`, `boundary`, `edgeList` |

If one Nodi graph cannot conveniently support both placement modes, create
wrapper graph manifests such as `face.trapezoid.root` and
`face.trapezoid.edge`. Their manifest `operation` stays `face.trapezoid`, so
CutKit still sees one logical operation.

## Placement Modes

### `root`

For root placement, the operation graph uses its root/default input path. During
graph authoring this may be an internal test polygon; production composition
must replace test-only inputs for child instances.

```json
{
  "mode": "root"
}
```

### `edge`

For edge placement, CutKit wires the evaluated parent boundary into the child
operation and passes the selected edge index.

```json
{
  "mode": "edge",
  "parentPolygon": "$faces.main.boundary",
  "parentEdgeIndex": 2,
  "attachEdge": "E0"
}
```

The child graph extracts the active edge from `parentPolygon` using
`parentEdgeIndex`. The child graph does not need to know whether the parent was
a trapezoid or polygon.

For polygon children, `attachEdge` defaults to `E0` or edge index `0`.

## Boundary Direction

Every face-producing graph must output `out.boundary` as a counter-clockwise
closed polyline in its evaluated 2D plane. Edges are derived from boundary
vertex order:

```text
Ei = vertex[i] -> vertex[(i + 1) % vertexCount]
```

Children inherit the selected parent edge direction. CutKit must not compute a
normal or flip extrusion side in the designer. If a graph contains a fallback or
test parent polygon, graph composition replaces that fallback connection at the
`parentPolygon` input for child instances.

## Trapezoid Anchors

Use these anchor names in CutKit IR and manifests:

| Anchor | Meaning |
|---|---|
| `start` | Start point of the active base edge. |
| `end` | End point of the active base edge. |
| `P0` | Already computed face point `P0`. |
| `P1` | Already computed face point `P1`. |
| `P2` | Already computed face point `P2`. |
| `P3` | Already computed face point `P3`. |

Numeric anchors `0` and `1` may be used inside a Nodi graph, but manifests and
CutKit IR should use `start` and `end`.

If the Nodi graph exposes numeric anchor sockets, they are contract inputs, not
private internals. Name them `startAnchor` and `endAnchor` and document their
domain:

| Socket | Type | Values |
|---|---|---|
| `startAnchor` | `integer` | `0 = start`, `1 = end` |
| `endAnchor` | `integer` | `0 = start`, `1 = end` |

Standard trapezoid point rule:

```json
{
  "P0": { "from": "start", "u": "baseStartOffset", "v": 0 },
  "P1": { "from": "end", "u": "-baseEndOffset", "v": 0 },
  "P2": { "from": "P1", "u": "-topEndOffset", "v": "p2Height || height" },
  "P3": { "from": "P0", "u": "topStartOffset", "v": "p3Height || height" }
}
```

## Socket Type Layers

The manifest records both the CutKit semantic type and the concrete Nodi socket
shape. Graph-to-graph composition should primarily use Nodi-native socket
metadata so operations can be wired directly without artificial adapters.

Use `type` for the semantic contract:

```json
{ "name": "parentPolygon", "type": "closedCurve" }
```

Use `nodi` for the actual exported Nodi socket:

```json
{
  "name": "parentPolygon",
  "type": "closedCurve",
  "socket": "in.parentPolygon",
  "nodi": {
    "access": "Item",
    "hint": "Curve"
  }
}
```

If a Nodi export uses numeric hint flags, the manifest may record both forms:

```json
{
  "nodi": {
    "access": "Item",
    "hint": "Curve",
    "hintCode": 512
  }
}
```

CutKit compiler validation must check Nodi compatibility by comparing
`nodi.access` and `nodi.hint`/`nodi.hintCode` between connected sockets. The
semantic `type` is for OCCS mapping, readability, and higher-level validation.

## Manifest Shape

Manifests are validated by
[nodi-operation-manifest.schema.json](./nodi-operation-manifest.schema.json).

Example:

```json
{
  "id": "face.trapezoid.edge",
  "operation": "face.trapezoid",
  "version": "0.1.0",
  "graphFile": "face-trapezoid-edge.nodi.json",
  "placementModes": ["edge"],
  "inputs": [
    { "name": "parentPolygon", "type": "closedCurve", "socket": "in.parentPolygon", "nodi": { "access": "Item", "hint": "Curve" } },
    { "name": "parentEdgeIndex", "type": "integer", "socket": "in.parentEdgeIndex", "nodi": { "access": "Item", "hint": "Number" } },
    { "name": "height", "type": "number", "socket": "in.height", "nodi": { "access": "Item", "hint": "Number" } },
    { "name": "startAnchor", "type": "integer", "socket": "in.startAnchor", "default": 0, "enum": [0, 1], "nodi": { "access": "Item", "hint": "Number" } },
    { "name": "endAnchor", "type": "integer", "socket": "in.endAnchor", "default": 1, "enum": [0, 1], "nodi": { "access": "Item", "hint": "Number" } },
    { "name": "baseStartOffset", "type": "number", "socket": "in.baseStartOffset", "default": 0, "nodi": { "access": "Item", "hint": "Number" } },
    { "name": "baseEndOffset", "type": "number", "socket": "in.baseEndOffset", "default": 0, "nodi": { "access": "Item", "hint": "Number" } }
  ],
  "outputs": [
    { "name": "region", "type": "region", "socket": "out.region", "nodi": { "access": "Item", "hint": "Surface" } },
    { "name": "boundary", "type": "closedCurve", "socket": "out.boundary", "layer": "contour.flat_pattern.face_and_returns", "nodi": { "access": "Item", "hint": "Curve" } },
    { "name": "edges.E0", "type": "edge", "socket": "out.edges.E0", "nodi": { "access": "Item", "hint": "Curve" } },
    { "name": "edges.E1", "type": "edge", "socket": "out.edges.E1", "nodi": { "access": "Item", "hint": "Curve" } },
    { "name": "edges.E2", "type": "edge", "socket": "out.edges.E2", "nodi": { "access": "Item", "hint": "Curve" } },
    { "name": "edges.E3", "type": "edge", "socket": "out.edges.E3", "nodi": { "access": "Item", "hint": "Curve" } },
    { "name": "foldLine", "type": "curve", "socket": "out.foldLine", "layer": "fold.route", "optional": true, "nodi": { "access": "Item", "hint": "Curve" } }
  ]
}
```

## Required First-Slice Manifests

| Operation | Notes |
|---|---|
| `face.trapezoid` | Root and edge placement. Must expose stable `E0..E3`. |
| `region.union` | Produces `contour.flat_pattern.face_and_returns`. |
| `entity.circleHole` | Produces `cut.hole` geometry and a subtractable region. |
| `region.difference` | Subtracts holes/cutouts from a face or blank. |
| `layer.collect` | Optional if CutKit collects layers outside Nodi. |

## Compiler Requirements

- For child faces, `parentPolygon` plus `parentEdgeIndex` is the graph-to-graph
  geometry input. CutKit wires the parent `out.boundary` to the child
  `parentPolygon` socket.
- `attachEdge` is a child-face edge selector, not a parent selector.
- Parent polygon edge indexes are passed to the child graph; the graph extracts
  the edge from the connected CCW boundary.
- A face-producing operation must output enough stable edge data for recursive
  children.
- A face-producing operation must output `out.boundary` as a CCW closed
  polyline. Designer previews and click targets are derived from evaluated
  Nodi boundaries only.
- Direct graph-to-graph wiring must validate concrete Nodi socket shape, not
  only semantic type names.
- Layer IDs are semantic OCCS layer IDs, not machine/tool aliases.
- Export aliases, tool names, tool diameters, and machine choices belong in
  export/profile metadata, not operation IDs.
