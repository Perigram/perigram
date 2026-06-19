# OCCS Core Specification v0.4-draft

Open Cassette Cladding Specification

Status: draft for discussion
Canonical serialization: JSON
Default file extension: `.occs.json`
Optional package extension: `.occs`
Curated examples directory: `examples/`

---

## 1. Scope

OCCS defines a deterministic data model for storing, exchanging, drawing, unfolding, nesting, and producing cassette cladding geometry from parametric templates and exact designs.

OCCS covers:

- cassette-level structure;
- reusable workpiece definitions;
- workpiece occurrences inside a cassette;
- sheet faces;
- fold relationships between sheet faces;
- production entities located on faces or blanks;
- standardized semantic layers;
- placement of workpieces, entities, joints, hardware, stiffeners, ribs, hooks, and profiles;
- basic expression-based parametrization;
- deterministic template-to-design materialization;
- tool-offset intent for cut, route, and CAM export workflows.

OCCS does not by itself certify structural, fire, thermal, or weather performance. Those are external performance declarations and may be added in a later module.

---

## 2. Design goals

A conforming OCCS document should allow software to:

1. store a reusable cassette template;
2. materialize the template into an exact cassette design from exact parameters;
3. resolve parameters and arithmetic expressions;
4. construct 2D face geometry;
5. construct folded 3D sheet geometry;
6. unwrap a folded sheet into a 2D blank;
7. generate CAD/CAM production files from standardized layers;
8. import CAD/CAM layer geometry back into OCCS entities;
9. position profiles, ribs, hardware, and other workpieces relative to sheet faces;
10. export or draw the assembled cassette.

OCCS is a **data model first**. JSON is the canonical serialization. CAD formats such as DXF/SVG are exchange outputs or import sources, not the canonical source of truth.

---

## 3. Normative terms

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as normative requirement levels.

---

## 4. Top-level document

An OCCS JSON document has this top-level shape:

```jsonc
{
  "occs": "0.4",
  "documentType": "template",
  "id": "cassette-001",
  "units": "mm",
  "parameters": {},
  "layers": {},
  "definitions": {
    "workpieces": [],
    "libraryParts": []
  },
  "cassette": {
    "occurrences": [],
    "joints": []
  }
}
```

### 4.1 Required top-level fields

| Field | Required | Meaning |
|---|---:|---|
| `occs` | yes | OCCS version string. For this draft: `0.4`. |
| `documentType` | yes | Document profile: `template` or `design`. |
| `id` | yes | Document identifier. |
| `units` | yes | Primary document units: `mm`, `cm`, `m`, or `in`. |
| `parameters` | no | Named scalar values and expressions. |
| `layers` | no | Document-level layer overrides or additions. |
| `definitions` | yes | Reusable workpiece and library-part definitions. |
| `cassette` | yes | Cassette occurrence graph and joints. |

### 4.2 Document profiles

OCCS uses one core JSON model with two normative document profiles.

#### 4.2.1 `template`

A `template` document is a reusable parametric cassette definition.

Template documents:

- MAY contain symbolic parameters and expressions;
- MAY contain default parameter values;
- SHOULD encode layers as abstract production semantics such as `cut.outer`, `cut.inner`, `cut.hole`, and `fold.route`;
- MUST NOT encode machine names, tool names, or tool diameters in canonical layer IDs;
- MAY specify `toolOffset` intent, but SHOULD NOT require a concrete machine or cutter selection.

#### 4.2.2 `design`

A `design` document is a materialized cassette generated from a template and exact parameters.

Design documents:

- MUST contain enough exact parameter values to resolve all geometry without user input;
- MAY preserve source expressions for traceability;
- SHOULD identify the source template, version, hash, and parameter set under `derivedFrom`;
- MAY contain tool-specific layer aliases and exact tool parameters for CAD/CAM export;
- MUST keep canonical layer IDs semantic even when export aliases include tool names or diameters.

Template and design documents are not separate incompatible formats. They are profiles of the same OCCS model.

---

## 5. Identifiers and naming conventions

### 5.1 IDs

IDs SHOULD be stable ASCII strings using:

```txt
[a-zA-Z_][a-zA-Z0-9_.:-]*
```

Examples:

```txt
tray_def
main
top_return
fold_top
rib_01
joint_rib_01
```

IDs are case-sensitive.

### 5.2 Canonical layer IDs

Layer IDs MUST use lowercase dot-separated English names:

```txt
contour.flat_pattern.face_and_returns
cut.hole
fold.route
code.cassette_mark
dimension.cassette
```

Layer aliases MAY contain any CAD-native or human-language naming convention, including Cyrillic names.

---

## 6. Parameters and expressions

A dimension value MAY be either:

- a JSON number;
- a string containing a number;
- a string containing an expression.

Examples:

```json
{
  "A": "1200",
  "B": "600",
  "R": "35",
  "slotX": "A / 2 - 25"
}
```

### 6.1 Expression grammar

OCCS v0.4 supports a strict expression grammar:

```txt
number
identifier
+  -  *  /
parentheses
unary minus
sin(expr)
cos(expr)
tan(expr)
```

Allowed examples:

```txt
A + R / 2 - 1
(A - 2 * R) / 3
-thickness
sin(30) * R
cos(foldAngle) * R
```

Trigonometric functions use degrees because OCCS fold angles are degrees.

Disallowed examples:

```txt
eval(...)
foo.bar
A ? B : C
random()
```

### 6.2 Special value `inherit`

The string value `inherit` is allowed only where explicitly specified by this standard. In v0.4 it is allowed for `trapezoid.baseLength`.

### 6.3 Parameter validation

OCCS does not define a fixed global list of parameter names. Parameter names are document-scoped identifiers such as `A`, `B`, `R_TOP`, `T`, or `TOOL_OFFSET`.

A conforming validator MUST verify that every identifier referenced by an expression is declared in the active parameter scope or is a built-in document constant defined by this standard. A validator MAY apply project, vendor, material, or manufacturer-specific parameter registries as an additional validation layer, but those registries are not required for core OCCS conformance.

For face shape expressions, the active scope is the document/workpiece parameter
scope plus face context identifiers defined by the relation that places the
face. For a child face connected through a fold, `foldAngle` is the incoming
fold angle from its parent in degrees. Root faces do not have `foldAngle`.

---

## 7. Workpiece model

A **workpiece** is a reusable physical part definition.

Canonical workpiece types:

| Type | Meaning |
|---|---|
| `sheet` | Flat stock that may be cut, routed, folded, and engraved. |
| `profile` | Linear workpiece with a cross-section and length/path. |
| `solid` | Non-sheet, non-profile rigid body. |
| `hardware` | Small standard component or library item. |

### 7.1 Sheet vs plate

OCCS does not distinguish sheet and plate at the core level. Both are encoded as `sheet`. Thickness, material, and manufacturing metadata distinguish them.

### 7.2 Profile vs extrusion

`profile` describes the form: a linear part with a cross-section. `extruded`, `roll_formed`, `brake_formed`, and `machined` are manufacturing processes and SHOULD be stored in `manufacturing.process`.

### 7.3 Profile workpiece

A profile workpiece contains a declarative cross-section and a sweep. Template
profiles SHOULD preserve expression text instead of evaluated numeric values.

```jsonc
{
  "id": "hanger_profile_def",
  "type": "profile",
  "role": "hanger",
  "parameters": { "W": "42", "H": "28", "R": "3", "D": "6", "L": "120" },
  "profile": {
    "section": {
      "type": "polygon",
      "vertices": [["0", "0"], ["W", "0"], ["W", "H"], ["0", "H"]],
      "edges": [{ "type": "line" }, { "type": "line" }, { "type": "line" }, { "type": "line" }],
      "holes": [{ "type": "circle", "center": ["W / 2", "H / 2"], "diameter": "D" }],
      "modifiers": [{ "type": "fillet", "vertices": ["p0", "p1", "p2", "p3"], "radius": "R" }]
    },
    "sweep": { "type": "linear", "length": "L" }
  },
  "manufacturing": { "process": "extruded" }
}
```

`profile.section.modifiers` is a CutKit draft extension for non-destructive
rounding/chamfer intent. Editable sketch source MAY be carried under
`extensions.cutkit.sketch`; consumers that do not understand it can still use
the normalized `profile.section`.

### 7.4 Sheet workpiece

A sheet workpiece contains:

- `faces[]` — planar regions;
- `folds[]` — connections between faces in the same sheet;
- `entities[]` — production/vector entities on standardized layers.

Example:

```jsonc
{
  "id": "tray_def",
  "type": "sheet",
  "role": "cassette_tray",
  "material": "ACM_4",
  "thickness": "T",
  "faces": [],
  "folds": [],
  "entities": []
}
```

### 7.4 Hardware and solid workpieces

Hardware is declared as a component contract, not as a constructive solid
operation history. A workpiece MAY use:

- `type: "hardware"` for standard fasteners and small purchased parts;
- `type: "solid"` for rigid non-sheet bodies such as cast hanger clips;
- `type: "sheet"` plus `hardware.family` for separately cut sheet hardware,
  such as sheet-part hanger clips.

Recommended hardware families are `bolt`, `nut`, `washer`, `rivet`, `screw`,
`spacer`, `standoff`, and `hanger_clip`. Hanger clips MAY set
`hardware.productionMode` to `sheetPart`, `integralCut`, or `castSolid`.
`integralCut` hanger clips are produced as parent sheet geometry: the target
face SHOULD become a resolved `polygon` shape with `holes[]` produced by curve
boolean difference, and the helper cut polygons SHOULD remain available as
`cut.inner` entities for manufacturing traceability. Fastener families that
require through holes, such as bolts, rivets, screws, spacers, and standoffs,
SHOULD emit exact `circle` entities on `cut.hole` at their resolved placement
points.

Example:

```jsonc
{
  "id": "hanger_clip_def",
  "type": "solid",
  "role": "hanger_clip",
  "parameters": {
    "width": "42",
    "height": "28",
    "thickness": "2"
  },
  "hardware": {
    "family": "hanger_clip",
    "productionMode": "castSolid",
    "standard": "",
    "parameters": {
      "width": "42",
      "height": "28",
      "thickness": "2"
    },
    "interfaces": [
      { "id": "mount", "kind": "hanger" }
    ],
    "preview": { "kind": "hanger_clip" }
  },
  "solid": { "kind": "hanger_clip" }
}
```

---

## 8. Faces

A **face** is a planar region of a sheet workpiece.

Inside `faces[]`, an object is already a face. Therefore it MUST NOT need a redundant field such as `type: "face"`.

Example:

```jsonc
{
  "id": "main",
  "role": "main",
  "shape": {
    "type": "trapezoid",
    "baseLength": "A",
    "height": "B"
  }
}
```

### 8.1 Face roles

Recommended face roles:

| Role | Meaning |
|---|---|
| `main` | Primary cassette face. |
| `visible` | Visible face. |
| `rear` | Rear/non-visible face. |
| `return_flange` | Folded return from main face. |
| `mounting_flange` | Flange used for mechanical attachment. |
| `hook_flange` | Hook-like folded face. |
| `lap_flange` | Overlap flange. |
| `hem` | Folded-over hem. |
| `closure_flange` | Closure face. |
| `joint_baffle` | Joint baffle face. |
| `drip_flange` | Drip edge/flange. |
| `reveal_face` | Reveal face. |
| `soffit_face` | Soffit face. |
| `corner_face` | Corner face. |
| `rib_face` | Integral rib face. |
| `stiffener_face` | Face belonging to a stiffener. |

Roles are descriptive. They do not define geometry by themselves.

---

## 9. Face coordinate system and edges

Each face has a local 2D coordinate system.

- The local `u` axis runs along the base edge `E0`.
- The local `v` axis runs away from `E0` into the face.
- The point `P0` is the start of `E0`.
- Positive `v` points into the face.

Edges are generated from resolved face points.

### 9.1 Trapezoid edges

For `trapezoid`, edges are:

| Edge | Points |
|---|---|
| `E0` | `P0 → P1` base edge |
| `E1` | `P1 → P2` right side |
| `E2` | `P2 → P3` top/counter edge |
| `E3` | `P3 → P0` left side |

### 9.2 Polygon edges

For `polygon`, edge `Ei` connects vertex `i` to vertex `i + 1`. The last edge connects the last vertex to vertex `0`.

---

## 10. Face shapes

OCCS v0.4 has two canonical face shapes:

```txt
trapezoid
polygon
```

### 10.1 Trapezoid

`trapezoid` is the primary parametric face shape for cassettes. Rectangles, ordinary returns, ordinary mounting flanges, and many tapered faces SHOULD be encoded as `trapezoid`.

Fields:

| Field | Required | Default | Meaning |
|---|---:|---|---|
| `type` | yes | — | Must be `trapezoid`. |
| `baseLength` | conditional | `inherit` when folded | Reference length of `E0`. Required for root/unfolded standalone faces. |
| `baseStartOffset` | no | `0` | Offset from referenced base edge start before local `P0`. |
| `baseEndOffset` | no | `0` | Offset from referenced base edge end before local `P1`. |
| `height` | conditional | — | Default height of top points. |
| `topStartOffset` | no | `0` | Horizontal offset of `P3` from `P0`. |
| `topEndOffset` | no | `0` | Horizontal inset of `P2` from `P1`. |
| `p2Height` | no | `height` | Overrides height for `P2`. |
| `p3Height` | no | `height` | Overrides height for `P3`. |

#### 10.1.1 Resolution

Trapezoid resolution uses two coordinate frames:

1. The **reference-edge frame** has its origin at the referenced edge start, with `+X` along the referenced edge.
2. The **canonical face-local frame** has its origin at the trimmed base start of the resolved face. Entity placements targeting the face use this canonical face-local frame.

Let:

```txt
referenceLength = explicit baseLength, or inherited fold source-edge length
L = referenceLength - baseStartOffset - baseEndOffset
H2 = p2Height if present, otherwise height
H3 = p3Height if present, otherwise height
```

Resolved points in the reference-edge frame:

```txt
Q0 = (baseStartOffset, 0)
Q1 = (referenceLength - baseEndOffset, 0)
Q2 = (referenceLength - baseEndOffset - topEndOffset, H2)
Q3 = (baseStartOffset + topStartOffset, H3)
```

Resolved points in the canonical face-local frame:

```txt
P0 = (0, 0)
P1 = (L, 0)
P2 = (L - topEndOffset, H2)
P3 = (topStartOffset, H3)
```

`Q0` and `P0` describe the same physical corner in different frames. With `baseStartOffset > 0`, that corner is not at `(0,0)` in the reference-edge frame, but it is rebased to `(0,0)` in the canonical face-local frame.

Resolved or world-space coordinates MAY be cached in a materialized `design` document or implementation output, but they MUST NOT replace the local face shape definition in the canonical template model.

#### 10.1.2 Rectangle

A rectangle is a trapezoid with zero top offsets and equal top heights:

```json
{
  "type": "trapezoid",
  "baseLength": "A",
  "height": "B"
}
```

Equivalent expanded form:

```json
{
  "type": "trapezoid",
  "baseLength": "A",
  "baseStartOffset": "0",
  "baseEndOffset": "0",
  "height": "B",
  "topStartOffset": "0",
  "topEndOffset": "0"
}
```

#### 10.1.3 Folded return using inherited base

```json
{
  "id": "top_return",
  "role": "return_flange",
  "shape": {
    "type": "trapezoid",
    "baseLength": "inherit",
    "height": "R"
  }
}
```

#### 10.1.4 Tapered trapezoid

```json
{
  "type": "trapezoid",
  "baseLength": "inherit",
  "height": "R",
  "topStartOffset": "10",
  "topEndOffset": "25"
}
```

#### 10.1.5 Non-parallel top by individual point heights

```json
{
  "type": "trapezoid",
  "baseLength": "inherit",
  "height": "R",
  "p2Height": "R + 5",
  "p3Height": "R - 3"
}
```

Rule: `p2Height` and `p3Height` override `height` for their corresponding points only.

### 10.2 Polygon

`polygon` is the escape hatch for arbitrary closed face boundaries that are not well represented by `trapezoid`.

In OCCS, a polygon MAY contain curved edges. This is technically a closed contour, but the canonical schema name remains `polygon` for compactness and consistency with common CAD user vocabulary.

Minimal straight-edge polygon:

```json
{
  "type": "polygon",
  "vertices": [
    ["0", "0"],
    ["A", "0"],
    ["A - 40", "B"],
    ["0", "B"]
  ]
}
```

Curved-edge polygon:

```json
{
  "type": "polygon",
  "vertices": [
    ["0", "0"],
    ["A", "0"],
    ["A", "B"],
    ["0", "B"]
  ],
  "edges": [
    { "type": "line" },
    { "type": "arc", "radius": "50", "sweep": "ccw" },
    {
      "type": "cubicBezier",
      "c1": ["A - 100", "B + 20"],
      "c2": ["100", "B + 20"]
    },
    { "type": "line" }
  ]
}
```

`edges[i]` describes the segment from `vertices[i]` to `vertices[(i + 1) mod n]`.

Allowed polygon edge types:

| Type | Meaning |
|---|---|
| `line` | Straight segment. |
| `arc` | Circular arc. |
| `quadraticBezier` | Quadratic Bézier segment. |
| `cubicBezier` | Cubic Bézier segment. |
| `spline` | B-spline/NURBS-like segment. Support MAY be limited by software. |

If `edges` is omitted, all edges are straight lines.

### 10.3 Holes in face shape

A face shape MAY include `holes[]` when inherent topology must be represented inside the face shape.

However, for production workflows, holes SHOULD normally be represented as `entities[]` on a cutting layer such as `cut.hole` or `cut.inner` because the layer carries manufacturing semantics.

---

## 11. Folds

A **fold** connects two faces of the same `sheet` workpiece.

A fold MUST NOT connect different workpieces. Connections between different workpieces are `joints`.

Example:

```json
{
  "id": "fold_top",
  "from": "main.E2",
  "to": "top_return.E0",
  "angle": "90deg",
  "radius": "BR",
  "method": "routed",
  "layer": "fold.route"
}
```

Fields:

| Field | Required | Meaning |
|---|---:|---|
| `id` | yes | Fold identifier. |
| `from` | yes | Source face edge reference. |
| `to` | yes | Target face edge reference. |
| `angle` | yes | Fold rotation angle in degrees. Range: `-180 <= angle <= 180`; `0` is invalid for a fold. |
| `radius` | no | Fold radius. |
| `method` | no | `routed`, `brake`, `roll_formed`, `hemmed`, `crimped`, etc. |
| `layer` | no | Semantic layer, normally `fold.route` or similar. |

### 11.1 Fold angle convention

Fold sign is defined by the source edge direction in `fold.from`.

To construct folded 3D geometry:

1. Resolve and place the source face.
2. Let the fold axis point from the start point of `fold.from` to the end point of `fold.from`.
3. Align the target edge `fold.to` to the source edge before rotation.
4. Apply `fold.angle` using the right-hand rule around the source edge axis.

Positive angles rotate counterclockwise when looking along the source edge axis. Negative angles rotate clockwise. For `+180` and `-180`, final planar orientation can be geometrically equivalent, but the sign still records the intended fold side.

Flat-pattern exporters MAY ignore angle sign for 2D unwrapping, but 3D exporters, CAM exporters, and transcribers MUST preserve it.

### 11.2 Inherited trapezoid base length

If the target face shape has `baseLength: "inherit"`, the inherited reference length is the source edge length from `fold.from`.

The target trapezoid's `baseStartOffset` and `baseEndOffset` trim that inherited source edge before resolving local points.

### 11.3 Fold and flat pattern

A flat-pattern exporter SHOULD use folds to place adjacent faces in 2D by rotating them around their common fold edge. A 3D-to-OCCS transcriber SHOULD detect planar faces and shared edges, then encode each face as `trapezoid` when possible and `polygon` otherwise.

---

## 12. Entities

An **entity** is a 2D or annotation object placed on a face, blank, workpiece, or occurrence. Entities are the canonical way to encode production geometry such as cuts, holes, engravings, fold centerlines, labels, paint direction marks, and dimensions.

Entity operation is dictated by its `layer`.

Example:

```json
{
  "id": "hole_01",
  "layer": "cut.hole",
  "target": "top_return",
  "placement": {
    "origin": ["A / 2", "R / 2"],
    "rotation": "0deg",
    "anchor": "center"
  },
  "geometry": {
    "type": "circle",
    "diameter": "5"
  }
}
```

### 12.1 Entity fields

| Field | Required | Meaning |
|---|---:|---|
| `id` | yes | Entity identifier. |
| `layer` | yes | Canonical OCCS layer ID. |
| `target` | yes | Face/workpiece/blank target reference. |
| `placement` | no | Uniform placement object. |
| `geometry` | yes | Entity geometry. |

### 12.2 Entity geometry types

Allowed entity geometry types:

| Type | Meaning |
|---|---|
| `polygon` | Closed contour, optionally with curved edges. |
| `circle` | Exact circular entity. |
| `path` | Open or closed vector path. |
| `text` | Text mark or label. |
| `dimension` | Dimension annotation. |
| `point` | Point mark, drill center, construction point. |

`circle` is distinct because many production workflows treat exact circular holes differently from approximated polygonal contours.

### 12.3 Tool offset

`toolOffset` describes cutter compensation intent for production entities. It is not a tool name and it is not part of the canonical layer ID.

Example:

```json
{
  "id": "outer_cut",
  "layer": "cut.outer",
  "target": "main",
  "toolOffset": {
    "mode": "outside",
    "value": "toolOffset"
  },
  "geometry": {
    "type": "polygon",
    "vertices": [["0", "0"], ["A", "0"], ["A", "B"], ["0", "B"]]
  }
}
```

Fields:

| Field | Required | Meaning |
|---|---:|---|
| `mode` | yes | `none`, `centerline`, `inside`, `outside`, `left`, `right`, or `auto`. |
| `value` | no | Offset distance. Positive values move the toolpath according to `mode`. |
| `source` | no | `template`, `design`, `machine`, `exporter`, or `imported`. |

For closed contours, `inside` and `outside` refer to material side. For open paths, `left` and `right` follow path direction. `centerline` means the geometry is already the intended tool centerline.

Template documents SHOULD use semantic offset intent such as `outside` or `inside` and MAY use an expression such as `toolOffset`. Design documents SHOULD resolve `value` to an exact distance or record the exact machine/tool source that produced it.

---

## 13. Path geometry

`path` uses the same segment vocabulary as polygon but can be open.

```json
{
  "type": "path",
  "closed": false,
  "start": ["0", "0"],
  "segments": [
    { "type": "line", "to": ["A", "0"] },
    { "type": "cubicBezier", "c1": ["A", "30"], "c2": ["20", "50"], "to": ["0", "B"] }
  ]
}
```

Allowed path segment types:

```txt
line
arc
quadraticBezier
cubicBezier
spline
```

---

## 14. Placement

OCCS uses one placement language for entities, workpiece occurrences, library parts, hardware, joints, ribs, stiffeners, and marks.

### 14.1 Face-relative placement

```json
{
  "relativeTo": {
    "occurrence": "tray",
    "face": "main",
    "side": "back"
  },
  "origin": ["A / 2", "B / 2"],
  "rotation": "90deg",
  "anchor": "center"
}
```

### 14.2 Edge-relative placement

```json
{
  "relativeTo": {
    "occurrence": "tray",
    "face": "main",
    "edge": "E2"
  },
  "origin": ["50", "0"],
  "rotation": "0deg"
}
```

Repeated hardware along a face edge SHOULD use a placement `pattern` instead of
duplicating occurrence data. The base placement `origin` defines the first item
location in edge-local coordinates: X is distance along the selected edge and Y
is the in-face normal offset. The pattern MUST use one non-conflicting rule:
`mode: "count"` distributes `count` items between symmetric origin-X edge
margins; `mode: "spacing"` repeats by `spacing` from origin-X until the edge
ends.

```jsonc
{
  "relativeTo": {
    "occurrence": "tray",
    "face": "main",
    "side": "back"
  },
  "origin": ["50", "12"],
  "anchor": "center",
  "targetAnchor": "center",
  "pattern": {
    "type": "edgeArray",
    "edge": "E2",
    "mode": "count",
    "spacing": "160",
    "count": "3",
    "alignment": "start"
  }
}
```

### 14.3 Transform placement

A transform MAY be used when a precise parametric placement is impossible or when importing arbitrary geometry.

```json
{
  "relativeTo": "world",
  "transform": {
    "translation": ["0", "0", "0"],
    "rotation": ["0deg", "0deg", "0deg"],
    "scale": ["1", "1", "1"]
  }
}
```

A 4×4 matrix MAY also be used:

```json
{
  "relativeTo": "world",
  "matrix": [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]
}
```

Parametric placement SHOULD be preferred over raw matrix placement when the geometry is intended to round-trip through CAD/CAM production files.

---

## 15. Definitions, occurrences, and joints

### 15.1 Definition

A workpiece definition describes reusable geometry.

### 15.2 Occurrence

An occurrence instantiates a workpiece definition in a cassette.

```json
{
  "id": "rib_01",
  "ref": "rib_def",
  "placement": {
    "relativeTo": {
      "occurrence": "tray",
      "face": "main",
      "side": "back"
    },
    "origin": ["A / 2", "B / 2"],
    "rotation": "0deg",
    "anchor": "center"
  }
}
```

### 15.3 Joint

A joint connects two occurrences, or an occurrence and hardware/library part.

```json
{
  "id": "joint_rib_01",
  "type": "mechanical",
  "method": "rivet",
  "source": { "occurrence": "rib_01" },
  "target": { "occurrence": "tray", "face": "main", "side": "back" },
  "placement": {
    "relativeTo": { "occurrence": "tray", "face": "main", "side": "back" },
    "origin": ["A / 2", "B / 2"],
    "rotation": "0deg",
    "anchor": "center"
  }
}
```

A complex stiffener riveted in the middle of a cassette SHOULD be represented as a separate `sheet`, `profile`, or `solid` workpiece occurrence plus a `joint`. It SHOULD NOT be represented as a face feature.

---

## 16. Layers

Layers provide production semantics.

An entity does not need an `operation` field. Its operation is inferred from the layer registry.

Example:

```json
{
  "id": "hole_01",
  "layer": "cut.hole",
  "geometry": { "type": "circle", "diameter": "5" }
}
```

The default OCCS layer registry is defined in `layers.json` and described in `LAYERS.md`.

Canonical layer IDs describe operation semantics. They SHOULD NOT include machine names, cutter names, cutter diameters, or shop-specific layer text. Tool-specific information belongs in `entity.toolOffset`, layer `parameters`, document manufacturing/export settings, or CAD/CAM export aliases generated from a `design` document.

### 16.1 Layer fields

A layer definition includes:

| Field | Meaning |
|---|---|
| `id` | Canonical OCCS layer ID. |
| `group` | Canonical group: `contour`, `cut`, `fold`, `code`, `dimension`. |
| `purpose` | Semantic meaning. |
| `production` | Whether the layer is used for manufacturing. |
| `allowedGeometry` | Geometry types allowed on this layer. |
| `aliases` | Import aliases, including Russian layer names. |
| `defaultExport` | Default export names for DXF/SVG/CAM. |
| `parameters` | Layer-specific defaults such as offset mode, cut type, route type, or design/export tool data. |

### 16.2 Layer import/export

Importers SHOULD map CAD layer names to canonical OCCS layer IDs using:

1. exact canonical ID match;
2. exact alias match;
3. normalized alias match;
4. project-specific mapping.

Exporters SHOULD output canonical IDs as metadata where possible. For DXF/SVG where metadata may be stripped, exporters SHOULD also use configured layer aliases.

---

## 17. Unwrapping and transcription

A transcription tool converting folded 3D cassette geometry into OCCS SHOULD:

1. detect physical workpieces;
2. detect planar sheet faces;
3. detect shared fold edges;
4. choose a root/main face for each sheet;
5. encode each face as `trapezoid` when it fits this model;
6. encode all other boundaries as `polygon`;
7. encode fold relations using `folds[]`;
8. encode holes, slots, routing, engraving, labels, and dimensions as `entities[]` on layers;
9. encode separate ribs/stiffeners/hooks as workpiece definitions and occurrences;
10. encode physical connections as `joints[]`.

A face SHOULD be encoded as `trapezoid` when it is a four-sided straight-edge face resolvable by the trapezoid point equations. Otherwise it MUST be encoded as `polygon`.

---

## 18. Validation rules

A conforming OCCS document MUST satisfy these rules:

1. `occs`, `documentType`, `id`, `units`, `definitions`, and `cassette` are required.
2. `documentType` MUST be `template` or `design`.
3. Every workpiece definition MUST have a unique `id`.
4. Every occurrence MUST reference an existing workpiece or library part.
5. A `sheet` workpiece SHOULD contain `faces[]`, `folds[]`, and `entities[]` arrays.
6. Face shapes MUST be `trapezoid` or `polygon`.
7. `trapezoid.baseLength` MUST be explicit unless it is inherited from a fold.
8. If `trapezoid.height` is omitted, both `p2Height` and `p3Height` MUST be present.
9. If `trapezoid.p2Height` or `trapezoid.p3Height` is present, it overrides `height` only for that point.
10. Fold `from` and `to` references MUST point to faces in the same sheet workpiece.
11. Joint references MUST point to occurrences or library parts.
12. Every entity MUST specify a valid layer ID or a document-defined custom layer.
13. Layer semantics determine production operation.
14. Template canonical layer IDs MUST remain tool-neutral. Tool names and tool diameters belong in design/export metadata, aliases, or `toolOffset`, not in canonical template layer IDs.
15. A `design` document MUST contain exact parameter values sufficient to resolve all geometry without user input.
16. Polygon vertices MUST be ordered consistently. Counterclockwise orientation is RECOMMENDED for outer boundaries. Opposite orientation MAY be used for holes by importers/exporters, but explicit `holes[]` is preferred.
17. Expressions MUST reference only declared parameters, built-in document constants, or context identifiers valid for the expression owner.
18. Fold angles MUST resolve to a non-zero value in the range `-180 <= angle <= 180`.
19. Core validators MUST NOT require a predefined global list of parameter names. They MUST validate expression syntax, declared references, cycles, and exact resolvability.

---

## 19. Extension policy

Custom fields SHOULD be placed under `extensions` to avoid collisions.

```json
{
  "extensions": {
    "vendor.example": {
      "machinePreset": "router-a"
    }
  }
}
```

Custom layer IDs SHOULD use a namespace prefix:

```txt
vendorname.custom_layer
project.custom_layer
```

---

## 20. Versioning

The `occs` field identifies the OCCS core version used by the document.

Draft version strings MAY use suffixes:

```txt
0.4
0.4-draft
0.4.1
```

Consumers SHOULD reject a document only when they cannot safely interpret required fields. Unknown optional fields SHOULD be ignored unless strict validation is requested.

---

## 21. Non-normative design references

OCCS v0.4-draft borrows design conventions from established interchange formats while keeping the cassette model domain-specific:

- JSON Schema Draft 2020-12 for schema validation structure.
- SVG path segment vocabulary for line, arc, and Bézier-style vector geometry.
- DXF layer-based CAD/CAM exchange conventions.
- glTF-style local placement/transform thinking for occurrence placement.

These references are design influences only. OCCS is not a profile of any of those formats.
