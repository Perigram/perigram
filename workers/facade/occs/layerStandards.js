// The cassette layer standards (owner direction 2026-10-11): the OCCS
// layer vocabulary and its pens ship with the plugin — they were
// system-seeded instance rows before the extraction. The registry of
// record is the spec package
// (docs/specs/Cassette spec/layers.json); this runtime table carries the
// rendering-relevant layer of it (code, group, kind, purpose, production,
// pen) and the pinned spec below refuses drift between the two homes.
// Pens are the historical system pen set (cut red 0.6 solid, fold amber
// 0.35 dashed, contour blue 0.35, code green 0.35, dimension violet 0.25
// dotted, envelope slate 0.25 dashed, engrave indigo 0.25 dotted, cut
// inner/hole orange 0.45, flat pattern cyan 0.4).
//
// Rendering law: plugin renderers bake these pens into their drawing
// layers; an org-authored layer-standard instance with the same code
// (shadow-by-code over the host transport) still wins host-side — the
// plugin pen is the base, never an override.
export const OCCS_LAYER_STANDARDS = Object.freeze([
  { code: "contour.prefix", group: "contour", kind: "group", purpose: "layer_group_prefix", production: false, pen: { color: "#64748B", weight: 0.25, pattern: "DASHED" } },
  { code: "contour.cassette_face", group: "contour", kind: "reference", purpose: "visible_cassette_face_contour", production: false, pen: { color: "#2563EB", weight: 0.35, pattern: "SOLID" } },
  { code: "contour.flat_pattern.face_and_returns", group: "contour", kind: "reference", purpose: "flat_pattern_face_and_returns_contour", production: false, pen: { color: "#0891B2", weight: 0.4, pattern: "SOLID" } },
  { code: "contour.flat_pattern.offset_envelope", group: "contour", kind: "reference", purpose: "flat_pattern_offset_envelope", production: false, pen: { color: "#64748B", weight: 0.25, pattern: "DASHED" } },
  { code: "contour.material_sheet", group: "contour", kind: "reference", purpose: "material_sheet_boundary", production: false, pen: { color: "#0891B2", weight: 0.4, pattern: "SOLID" } },
  { code: "contour.nesting_field", group: "contour", kind: "reference", purpose: "nesting_batch_field_boundary", production: false, pen: { color: "#64748B", weight: 0.25, pattern: "DASHED" } },
  { code: "cut.prefix", group: "cut", kind: "group", purpose: "layer_group_prefix", production: false, pen: { color: "#64748B", weight: 0.25, pattern: "DASHED" } },
  { code: "cut.outer", group: "cut", kind: "production", purpose: "outer_through_cut", production: true, pen: { color: "#DC2626", weight: 0.6, pattern: "SOLID" } },
  { code: "cut.inner", group: "cut", kind: "production", purpose: "inner_through_cut", production: true, pen: { color: "#F97316", weight: 0.45, pattern: "SOLID" } },
  { code: "cut.hole", group: "cut", kind: "production", purpose: "through_cut_hole", production: true, pen: { color: "#F97316", weight: 0.45, pattern: "SOLID" } },
  { code: "fold.prefix", group: "fold", kind: "group", purpose: "layer_group_prefix", production: false, pen: { color: "#64748B", weight: 0.25, pattern: "DASHED" } },
  { code: "fold.route", group: "fold", kind: "production", purpose: "fold_routing", production: true, pen: { color: "#D97706", weight: 0.35, pattern: "DASHED" } },
  { code: "fold.engrave", group: "fold", kind: "production", purpose: "engraving_or_marking_line", production: true, pen: { color: "#4F46E5", weight: 0.25, pattern: "DOTTED" } },
  { code: "fold.reserved", group: "fold", kind: "reserved", purpose: "reserved_future_fold_operation", production: false, pen: { color: "#64748B", weight: 0.25, pattern: "DASHED" } },
  { code: "code.prefix", group: "code", kind: "group", purpose: "layer_group_prefix", production: false, pen: { color: "#64748B", weight: 0.25, pattern: "DASHED" } },
  { code: "code.cassette_mark", group: "code", kind: "annotation", purpose: "cassette_identifier_mark", production: true, pen: { color: "#16A34A", weight: 0.35, pattern: "SOLID" } },
  { code: "code.batch_number", group: "code", kind: "annotation", purpose: "cutting_batch_number", production: true, pen: { color: "#16A34A", weight: 0.35, pattern: "SOLID" } },
  { code: "code.paint_direction", group: "code", kind: "annotation", purpose: "paint_or_grain_direction", production: true, pen: { color: "#16A34A", weight: 0.35, pattern: "SOLID" } },
  { code: "dimension.prefix", group: "dimension", kind: "group", purpose: "layer_group_prefix", production: false, pen: { color: "#64748B", weight: 0.25, pattern: "DASHED" } },
  { code: "dimension.cassette", group: "dimension", kind: "annotation", purpose: "cassette_dimension_annotation", production: false, pen: { color: "#7C3AED", weight: 0.25, pattern: "DOTTED" } },
  { code: "dimension.material_sheet", group: "dimension", kind: "annotation", purpose: "material_sheet_dimension_annotation", production: false, pen: { color: "#7C3AED", weight: 0.25, pattern: "DOTTED" } },
  { code: "dimension.envelope", group: "dimension", kind: "annotation", purpose: "overall_envelope_dimension_annotation", production: false, pen: { color: "#7C3AED", weight: 0.25, pattern: "DOTTED" } }
].map(standard => Object.freeze(standard)));

const STANDARD_BY_CODE = new Map(OCCS_LAYER_STANDARDS.map(standard => [standard.code, standard]));

export function occsLayerStandard(code) {
  return STANDARD_BY_CODE.get(String(code || "")) || null;
}

// The pen for one layer code: the standard row pen, else the neutral
// default pen (unknown layers stay unstyled by callers that check
// `occsLayerStandard` first).
export const OCCS_DEFAULT_PEN = Object.freeze({ color: "currentColor", weight: 0.5, pattern: "SOLID" });

export function penForLayer(code) {
  return occsLayerStandard(code)?.pen || OCCS_DEFAULT_PEN;
}

export function strokeDasharray(pattern = "SOLID") {
  if (pattern === "DASHED") return "5,5";
  if (pattern === "DOTTED") return "1,3";
  return "none";
}

// Bake the standard pens into a drawing ({ viewBox, layers }): layers
// keep their structure; color/weight/dasharray become the standard pen
// per standardCode (falling back to the layer name). Layers no standard
// matches keep their own style.
export function applyOccsLayerPens(drawing) {
  if (!drawing?.layers) return drawing;
  return {
    ...drawing,
    layers: drawing.layers.map(layer => {
      const key = layer.standardCode || layer.name;
      if (!occsLayerStandard(key)) return layer;
      const pen = penForLayer(key);
      return { ...layer, color: pen.color, weight: pen.weight, dasharray: strokeDasharray(pen.pattern) };
    })
  };
}
