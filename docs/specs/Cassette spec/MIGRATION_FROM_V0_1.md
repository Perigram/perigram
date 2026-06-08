# Migration from recursive node schema v0.1 to OCCS v0.4-draft

The earlier schema used a recursive root/node model:

```txt
root node → children by north/east/south/west edge → attach → cuts
```

OCCS v0.4 keeps the same deterministic idea but normalizes the data model for interoperability.

## Main changes

| v0.1 concept | v0.4 concept |
|---|---|
| `meta.units` | top-level `units` |
| `meta.thickness` | workpiece `thickness` or material data |
| `meta.bendRadius` | fold `radius` or parameter such as `BR` |
| `params` | `parameters` |
| `root` | first `sheet` workpiece face, usually role `main` |
| `node.kind` | face `role` |
| `node.depth` | `shape.height` |
| inherited node width | `trapezoid.baseLength: "inherit"` through a fold |
| `attach.bendAngle` | `fold.angle` |
| `attach.offsetStart` / `offsetEnd` | `trapezoid.baseStartOffset` / `baseEndOffset` on the target face |
| `children.north/east/south/west` | `folds[]` from parent edge to child `E0` |
| `cuts[]` | `entities[]` on cutting layers |
| implicit miter cuts | explicit entities or importer/exporter-generated geometry |

## Suggested conversion algorithm

1. Create one `sheet` workpiece definition for the old root tree.
2. Convert each old node to a `face`.
3. Convert root width/depth to a root `trapezoid` using `baseLength` and `height`.
4. Convert every child node to a `trapezoid` with `baseLength: "inherit"` and `height` from old `depth`.
5. Convert each `attach` object into one `fold` record.
6. Convert child edge key into source edge mapping:
   - `north` → `E2`
   - `east` → `E1`
   - `south` → `E0`
   - `west` → `E3`
7. Convert old `cuts` into `entities` on layers such as `cut.inner`, `cut.outer`, `cut.hole`, or project-specific layers.
8. Create one cassette occurrence referencing the converted workpiece definition.

## Edge alias mapping

OCCS canonical edges are `E0`, `E1`, `E2`, `E3`.

For rectangular/trapezoid faces:

| Old edge name | OCCS edge |
|---|---|
| `south` | `E0` |
| `east` | `E1` |
| `north` | `E2` |
| `west` | `E3` |
