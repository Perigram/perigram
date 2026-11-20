import "./chunks/chunk-CO6GXKO3.mjs";

// ../../../../../../../../tmp/opencode/cad-occt-scratch/node_modules/occt-wasm/dist/types.js
var SHAPE_TYPES = [
  "compound",
  "compsolid",
  "solid",
  "shell",
  "face",
  "wire",
  "edge",
  "vertex",
  "shape"
];
var SHAPE_ORIENTATIONS = ["forward", "reversed", "internal", "external"];
var POINT_CLASSIFICATIONS = ["in", "on", "out"];
var TransitionMode;
(function(TransitionMode2) {
  TransitionMode2[TransitionMode2["Transformed"] = 0] = "Transformed";
  TransitionMode2[TransitionMode2["RightCorner"] = 1] = "RightCorner";
  TransitionMode2[TransitionMode2["RoundCorner"] = 2] = "RoundCorner";
})(TransitionMode || (TransitionMode = {}));
var SweepMode;
(function(SweepMode2) {
  SweepMode2[SweepMode2["Fixed"] = 0] = "Fixed";
  SweepMode2[SweepMode2["Frenet"] = 1] = "Frenet";
  SweepMode2[SweepMode2["FixedUp"] = 2] = "FixedUp";
  SweepMode2[SweepMode2["Auxiliary"] = 3] = "Auxiliary";
  SweepMode2[SweepMode2["Parallel"] = 4] = "Parallel";
})(SweepMode || (SweepMode = {}));
var SweepContact;
(function(SweepContact2) {
  SweepContact2[SweepContact2["None"] = 0] = "None";
  SweepContact2[SweepContact2["Contact"] = 1] = "Contact";
  SweepContact2[SweepContact2["ContactOnBorder"] = 2] = "ContactOnBorder";
})(SweepContact || (SweepContact = {}));
var SweepLaw;
(function(SweepLaw2) {
  SweepLaw2[SweepLaw2["None"] = 0] = "None";
  SweepLaw2[SweepLaw2["Linear"] = 1] = "Linear";
  SweepLaw2[SweepLaw2["SCurve"] = 2] = "SCurve";
})(SweepLaw || (SweepLaw = {}));
var JoinType;
(function(JoinType2) {
  JoinType2[JoinType2["Arc"] = 0] = "Arc";
  JoinType2[JoinType2["Tangent"] = 1] = "Tangent";
  JoinType2[JoinType2["Intersection"] = 2] = "Intersection";
})(JoinType || (JoinType = {}));
var BooleanOp;
(function(BooleanOp2) {
  BooleanOp2[BooleanOp2["Fuse"] = 0] = "Fuse";
  BooleanOp2[BooleanOp2["Cut"] = 1] = "Cut";
  BooleanOp2[BooleanOp2["Common"] = 2] = "Common";
})(BooleanOp || (BooleanOp = {}));
var BooleanGlue;
(function(BooleanGlue2) {
  BooleanGlue2[BooleanGlue2["Off"] = 0] = "Off";
  BooleanGlue2[BooleanGlue2["Shift"] = 1] = "Shift";
  BooleanGlue2[BooleanGlue2["Full"] = 2] = "Full";
})(BooleanGlue || (BooleanGlue = {}));
var OcctErrorCode;
(function(OcctErrorCode2) {
  OcctErrorCode2["ConstructionFailed"] = "CONSTRUCTION_FAILED";
  OcctErrorCode2["BooleanFailed"] = "BOOLEAN_FAILED";
  OcctErrorCode2["InvalidShapeId"] = "INVALID_SHAPE_ID";
  OcctErrorCode2["InvalidLabelId"] = "INVALID_LABEL_ID";
  OcctErrorCode2["TessellationFailed"] = "TESSELLATION_FAILED";
  OcctErrorCode2["ImportExportFailed"] = "IMPORT_EXPORT_FAILED";
  OcctErrorCode2["HealingFailed"] = "HEALING_FAILED";
  OcctErrorCode2["DocumentClosed"] = "DOCUMENT_CLOSED";
  OcctErrorCode2["KernelError"] = "KERNEL_ERROR";
  OcctErrorCode2["Unknown"] = "UNKNOWN";
})(OcctErrorCode || (OcctErrorCode = {}));
var OcctError = class extends Error {
  /** Name of the kernel method that failed. */
  operation;
  /** Structured error code for programmatic handling. */
  code;
  /**
   * For a fillet or chamfer OCCT could not build: the edges, as passed in,
   * that lie on a contour that failed. `undefined` when the kernel did not
   * report any.
   */
  faultyEdges;
  constructor(operation, message, code) {
    super(`${operation}: ${message}`);
    this.name = "OcctError";
    this.operation = operation;
    this.code = code ?? classifyError(operation, message);
    this.faultyEdges = parseFaultyEdges(message);
  }
};
function parseFaultyEdges(message) {
  const match = /\[faulty edges: (\d+(?:,\d+)*)\]/.exec(message);
  return match?.[1]?.split(",").map((id) => Number(id));
}
var BOOLEAN_OPS = /* @__PURE__ */ new Set(["fuse", "cut", "common", "intersect", "section", "sectionPlane", "fuseAll", "cutAll", "split", "booleanPipeline", "fuseWithHistory", "cutWithHistory", "intersectWithHistory"]);
var TESSELLATION_OPS = /* @__PURE__ */ new Set(["tessellate", "wireframe", "meshShape", "meshBatch"]);
var IO_OPS = /* @__PURE__ */ new Set(["importStep", "exportStep", "importStl", "exportStl", "toBREP", "fromBREP", "toBREPBinary", "fromBREPBinary", "xcafExportSTEP", "xcafImportSTEP", "xcafExportGLTF", "xcafExportGLB"]);
var HEALING_OPS = /* @__PURE__ */ new Set(["fixShape", "unifySameDomain", "unifySameDomainWithHistory", "healSolid", "healFace", "healWire", "fixFaceOrientations", "removeDegenerateEdges", "fixWireOnFace", "buildCurves3d"]);
function classifyError(operation, message) {
  const msg = message.toLowerCase();
  if (msg.includes("invalid shape id"))
    return OcctErrorCode.InvalidShapeId;
  if (msg.includes("invalid label id"))
    return OcctErrorCode.InvalidLabelId;
  if (msg.includes("document is closed"))
    return OcctErrorCode.DocumentClosed;
  if (msg.includes("boolean operation failed"))
    return OcctErrorCode.BooleanFailed;
  if (msg.includes("construction failed"))
    return OcctErrorCode.ConstructionFailed;
  if (msg.includes("does not intersect the guide wire"))
    return OcctErrorCode.ConstructionFailed;
  if (msg.includes("in contact with the guide wire"))
    return OcctErrorCode.ConstructionFailed;
  if (BOOLEAN_OPS.has(operation))
    return OcctErrorCode.BooleanFailed;
  if (TESSELLATION_OPS.has(operation))
    return OcctErrorCode.TessellationFailed;
  if (IO_OPS.has(operation))
    return OcctErrorCode.ImportExportFailed;
  if (HEALING_OPS.has(operation))
    return OcctErrorCode.HealingFailed;
  if (msg.includes("operation failed"))
    return OcctErrorCode.ConstructionFailed;
  if (operation && operation !== "XCAFDocument")
    return OcctErrorCode.KernelError;
  return OcctErrorCode.Unknown;
}
function messageOf(e) {
  return e instanceof Error ? e.message : String(e);
}
async function wrapAsync(operation, fn) {
  try {
    return await fn();
  } catch (e) {
    return wrap(operation, () => {
      throw e;
    });
  }
}
function wrap(operation, fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof OcctError) {
      throw new OcctError(operation, e.message, e.code);
    }
    const message = messageOf(e);
    const prefix = `${operation}: `;
    throw new OcctError(operation, message.startsWith(prefix) ? message.slice(prefix.length) : message);
  }
}

// ../../../../../../../../tmp/opencode/cad-occt-scratch/node_modules/occt-wasm/dist/xcaf-document.js
function tag(n) {
  return n;
}
var XCAFDocument = class _XCAFDocument {
  #raw;
  #docId;
  #closed = false;
  constructor(raw, docId) {
    this.#raw = raw;
    this.#docId = docId;
  }
  static create(raw) {
    const docId = wrap("xcafNewDocument", () => raw.xcafNewDocument());
    return new _XCAFDocument(raw, docId);
  }
  static fromSTEP(raw, stepData) {
    const docId = wrap("xcafImportSTEP", () => raw.xcafImportSTEP(stepData));
    return new _XCAFDocument(raw, docId);
  }
  /**
   * Add a shape as a root label.
   *
   * By default the shape becomes a single part, even when it is a compound.
   * With `{ assembly: true }` a compound becomes an assembly instead: one
   * component per top-level child, each a placed reference to a prototype
   * label holding that child's geometry. This is the structure STEP import
   * produces, and the only one `exportSTEP` writes as an assembly. Throws if
   * `assembly` is set and the shape is not a compound.
   */
  addShape(shape, options) {
    this.#ensureOpen();
    const t = options?.assembly ? wrap("xcafAddAssembly", () => this.#raw.xcafAddAssembly(this.#docId, shape)) : wrap("xcafAddShape", () => this.#raw.xcafAddShape(this.#docId, shape));
    this.#applyOptions(t, options);
    return tag(t);
  }
  /**
   * Add a shape as a child component of a parent label.
   *
   * `parent` may be an assembly or a part. A part becomes an assembly on
   * its first child: the geometry it held moves into a first component at
   * identity, carrying the part's name and color, so `getChildren(parent)`
   * then lists that component ahead of the new one and exports keep both.
   * A component label cannot take children; resolve it with
   * {@link getReferredLabel} first.
   */
  addChild(parent, shape, options) {
    this.#ensureOpen();
    const loc = options?.location ?? {};
    const t = wrap("xcafAddComponent", () => this.#raw.xcafAddComponent(this.#docId, parent, shape, loc.tx ?? 0, loc.ty ?? 0, loc.tz ?? 0, loc.rx ?? 0, loc.ry ?? 0, loc.rz ?? 0));
    this.#applyOptions(t, options);
    return tag(t);
  }
  /** Set color on an existing label. */
  setColor(label, color) {
    this.#ensureOpen();
    const [r, g, b] = color;
    wrap("xcafSetColor", () => this.#raw.xcafSetColor(this.#docId, label, r, g, b));
  }
  /** Set name on an existing label. */
  setName(label, name) {
    this.#ensureOpen();
    wrap("xcafSetName", () => this.#raw.xcafSetName(this.#docId, label, name));
  }
  /**
   * Get info about a label.
   * If `shapeHandle` is non-null, the caller owns it and must release it.
   */
  getLabelInfo(label) {
    this.#ensureOpen();
    const raw = wrap("xcafGetLabelInfo", () => this.#raw.xcafGetLabelInfo(this.#docId, label));
    return {
      labelId: raw.labelId,
      name: raw.name,
      hasColor: raw.hasColor,
      color: [raw.r, raw.g, raw.b],
      isAssembly: raw.isAssembly,
      isComponent: raw.isComponent,
      shapeHandle: raw.shapeId > 0 ? raw.shapeId : null
    };
  }
  /** Get child label tags of a parent. */
  getChildren(parent) {
    this.#ensureOpen();
    return this.#vecToTags(wrap("xcafGetChildLabels", () => this.#raw.xcafGetChildLabels(this.#docId, parent)));
  }
  /** Get root (free) shape label tags. */
  getRoots() {
    this.#ensureOpen();
    return this.#vecToTags(wrap("xcafGetRootLabels", () => this.#raw.xcafGetRootLabels(this.#docId)));
  }
  /**
   * Resolve a component label to the label it instantiates.
   *
   * In an XCAF assembly a component (`isComponent`) is a placed reference:
   * it carries a location and points at a prototype label, the part or
   * sub-assembly that owns the geometry, the sub-shapes and the children.
   * `getChildren` on the component itself is therefore empty; walk into the
   * referred label instead. Returns `null` when `label` is not a reference.
   */
  getReferredLabel(label) {
    this.#ensureOpen();
    const t = wrap("xcafGetReferredLabel", () => this.#raw.xcafGetReferredLabel(this.#docId, label));
    return t > 0 ? tag(t) : null;
  }
  /**
   * The placement of a label relative to its parent, as a 3x4 row-major
   * affine matrix (`[r00,r01,r02,tx, r10,r11,r12,ty, r20,r21,r22,tz]`), the
   * layout `OcctKernel.transform` and `located` accept. Identity for labels
   * that are not components. Compose these down the tree to place a
   * prototype's geometry once per instance.
   */
  getLocation(label) {
    this.#ensureOpen();
    return this.#vecToNumbers(wrap("xcafGetLabelLocation", () => this.#raw.xcafGetLabelLocation(this.#docId, label)));
  }
  /**
   * Get the named sub-shape labels of a part (faces, edges or solids that
   * carry their own name or color). Pass the prototype label, not a
   * component: see {@link getReferredLabel}.
   */
  getSubShapes(label) {
    this.#ensureOpen();
    return this.#vecToTags(wrap("xcafGetSubShapeLabels", () => this.#raw.xcafGetSubShapeLabels(this.#docId, label)));
  }
  /**
   * Register a sub-shape of a part so it can carry its own name or color.
   * `label` must be a top-level part (one added with `addShape`, or the
   * prototype behind a component) and `shape` one of its sub-shapes, for
   * example a face from `kernel.getSubShapes`. Throws otherwise.
   */
  addSubShape(label, shape, options) {
    this.#ensureOpen();
    const t = wrap("xcafAddSubShape", () => this.#raw.xcafAddSubShape(this.#docId, label, shape));
    this.#applyOptions(t, options);
    return tag(t);
  }
  /**
   * Export as STEP with colors and names preserved.
   *
   * @param options - `unit` picks the length unit the file is written in
   *     (default millimeters); the geometry is scaled to match. `schema`
   *     picks the application protocol (default AP214).
   */
  exportSTEP(options) {
    this.#ensureOpen();
    const unit = options?.unit;
    const schema = options?.schema;
    return wrap("xcafExportSTEP", () => unit === void 0 && schema === void 0 ? this.#raw.xcafExportSTEP(this.#docId) : this.#raw.xcafExportSTEPWithOptions(this.#docId, unit ?? "", schema ?? ""));
  }
  exportGLTF(fsOrOptions, maybeOptions) {
    this.#ensureOpen();
    const legacy = fsOrOptions !== void 0 && "readFile" in fsOrOptions && "unlink" in fsOrOptions;
    const options = legacy ? maybeOptions : fsOrOptions;
    const linDefl = options?.linearDeflection ?? 0.1;
    const angDefl = options?.angularDeflection ?? 0.5;
    return wrap("xcafExportGLB", () => this.#raw.xcafExportGLB(this.#docId, linDefl, angDefl));
  }
  /** Close the document and free OCCT resources. */
  close() {
    if (this.#closed)
      return;
    this.#closed = true;
    wrap("xcafClose", () => this.#raw.xcafClose(this.#docId));
  }
  [Symbol.dispose]() {
    this.close();
  }
  #applyOptions(labelId, options) {
    if (options?.name) {
      wrap("xcafSetName", () => this.#raw.xcafSetName(this.#docId, labelId, options.name));
    }
    if (options?.color) {
      const [r, g, b] = options.color;
      wrap("xcafSetColor", () => this.#raw.xcafSetColor(this.#docId, labelId, r, g, b));
    }
  }
  #vecToTags(vec) {
    return this.#vecToNumbers(vec).map(tag);
  }
  #vecToNumbers(vec) {
    try {
      const result = [];
      for (let i = 0; i < vec.size(); i++) {
        result.push(vec.get(i));
      }
      return result;
    } finally {
      vec.delete();
    }
  }
  #ensureOpen() {
    if (this.#closed) {
      throw new OcctError("XCAFDocument", "Document is closed", OcctErrorCode.DocumentClosed);
    }
  }
};

// ../../../../../../../../tmp/opencode/cad-occt-scratch/node_modules/occt-wasm/dist/views.js
var ORIGIN = { x: 0, y: 0, z: 0 };
function basis(dir, sx) {
  return { dir, sx, sy: cross(neg(dir), sx) };
}
function basisFor(view) {
  switch (view) {
    case "front":
      return basis(v(0, 1, 0), v(1, 0, 0));
    case "back":
      return basis(v(0, -1, 0), v(-1, 0, 0));
    case "top":
      return basis(v(0, 0, -1), v(1, 0, 0));
    case "bottom":
      return basis(v(0, 0, 1), v(1, 0, 0));
    case "right":
      return basis(v(-1, 0, 0), v(0, 1, 0));
    case "left":
      return basis(v(1, 0, 0), v(0, -1, 0));
    case "iso":
      return basis(normalize(v(-1, -1, -1)), normalize(v(-1, 1, 0)));
  }
}
var VIEW_LABEL = {
  front: "Front",
  back: "Back",
  top: "Top",
  bottom: "Bottom",
  left: "Left",
  right: "Right",
  iso: "Iso"
};
function v(x, y, z) {
  return { x, y, z };
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
function neg(a) {
  return { x: -a.x, y: -a.y, z: -a.z };
}
function normalize(a) {
  const len = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}
var PROJECTION_FIELDS = [
  "visibleOutline",
  "visibleSmooth",
  "visibleSharp",
  "hiddenOutline",
  "hiddenSmooth",
  "hiddenSharp"
];
function collectEdges(kernel, shape, viewBasis, deflection) {
  const proj = kernel.projectEdges(shape, ORIGIN, neg(viewBasis.dir), viewBasis.sx);
  try {
    const toLines = (h) => {
      if (Number(h) === 0)
        return [];
      const { points, edgeGroups } = kernel.wireframe(h, deflection);
      const lines = [];
      for (let g = 0; g < edgeGroups.length; g += 3) {
        const start = edgeGroups[g];
        const count = edgeGroups[g + 1];
        const line = [];
        for (let i = 0; i < count; i += 3) {
          line.push(points[start + i], points[start + i + 1]);
        }
        if (line.length >= 4)
          lines.push(line);
      }
      return lines;
    };
    return {
      visible: [
        ...toLines(proj.visibleOutline),
        ...toLines(proj.visibleSmooth),
        ...toLines(proj.visibleSharp)
      ],
      hidden: [
        ...toLines(proj.hiddenOutline),
        ...toLines(proj.hiddenSmooth),
        ...toLines(proj.hiddenSharp)
      ]
    };
  } finally {
    for (const field of PROJECTION_FIELDS) {
      const h = proj[field];
      if (Number(h) !== 0)
        kernel.release(h);
    }
  }
}
function extentOf(views) {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const view of views) {
    for (const line of [...view.visible, ...view.hidden]) {
      for (let i = 0; i < line.length; i += 2) {
        const u = line[i];
        const vv = line[i + 1];
        if (u < minU)
          minU = u;
        if (u > maxU)
          maxU = u;
        if (vv < minV)
          minV = vv;
        if (vv > maxV)
          maxV = vv;
      }
    }
  }
  if (!Number.isFinite(minU))
    return { minU: 0, maxU: 0, minV: 0, maxV: 0 };
  return { minU, maxU, minV, maxV };
}
function panelTransform(ext, scale, panelW, panelH, pad) {
  const midU = (ext.minU + ext.maxU) / 2;
  const midV = (ext.minV + ext.maxV) / 2;
  const offsetX = panelW / 2 - midU * scale;
  const offsetY = panelH / 2 + midV * scale;
  return { scale, offsetX, offsetY, inner: Math.min(panelW, panelH) - 2 * pad, panelW, panelH, pad };
}
function toPixels(line, t) {
  const out = [];
  for (let i = 0; i < line.length; i += 2) {
    out.push(line[i] * t.scale + t.offsetX, -line[i + 1] * t.scale + t.offsetY);
  }
  return out;
}
function resolved(options) {
  return {
    width: options.width ?? 240,
    height: options.height ?? 240,
    padding: options.padding ?? 14,
    showHidden: options.showHidden ?? true,
    showGnomon: options.showGnomon ?? true,
    strokeWidth: options.strokeWidth ?? 1,
    background: options.background ?? "#ffffff",
    visibleColor: options.visibleColor ?? "#111111",
    hiddenColor: options.hiddenColor ?? "#9e9e9e"
  };
}
function deflectionFor(kernel, shape, options) {
  if (options.deflection !== void 0)
    return options.deflection;
  const bb = kernel.getBoundingBox(shape);
  const diag = Math.hypot(bb.xmax - bb.xmin, bb.ymax - bb.ymin, bb.zmax - bb.zmin);
  return Math.max(diag * 2e-3, 1e-4);
}
function gnomonArms(viewBasis, t) {
  const len = 15;
  const gap = 7;
  const ox = t.pad + len + gap;
  const oy = t.panelH - t.pad - len - gap;
  const axes = [
    [v(1, 0, 0), "#d33", "X"],
    [v(0, 1, 0), "#3a3", "Y"],
    [v(0, 0, 1), "#36c", "Z"]
  ];
  const arms = [];
  for (const [axis, color, label] of axes) {
    const dx = dot(axis, viewBasis.sx);
    const dy = -dot(axis, viewBasis.sy);
    const m = Math.hypot(dx, dy);
    if (m < 0.05)
      continue;
    arms.push({
      x0: ox,
      y0: oy,
      x1: ox + dx * len,
      y1: oy + dy * len,
      color,
      label,
      lx: ox + dx * len + dx / m * gap,
      ly: oy + dy * len + dy / m * gap
    });
  }
  return arms;
}
function gridLayout(extents, o, columns, showDimensions) {
  const inner = Math.min(o.width, o.height) - 2 * o.padding;
  let maxRange = 1e-9;
  for (const ext of extents) {
    maxRange = Math.max(maxRange, ext.maxU - ext.minU, ext.maxV - ext.minV);
  }
  const scale = inner / maxRange;
  if (!Number.isInteger(columns) || columns < 1) {
    throw new RangeError(`columns must be a positive integer, got ${columns}`);
  }
  const rows = Math.ceil(extents.length / columns);
  const footerH = showDimensions ? 22 : 0;
  const panels = extents.map((ext, i) => ({
    px: i % columns * o.width,
    py: Math.floor(i / columns) * o.height,
    t: panelTransform(ext, scale, o.width, o.height, o.padding)
  }));
  return {
    columns,
    rows,
    totalW: columns * o.width,
    totalH: rows * o.height + footerH,
    footerH,
    scale,
    panels
  };
}
function singleLayout(ext, o) {
  const inner = Math.min(o.width, o.height) - 2 * o.padding;
  const range = Math.max(ext.maxU - ext.minU, ext.maxV - ext.minV, 1e-9);
  return panelTransform(ext, inner / range, o.width, o.height, o.padding);
}
function dimensionsText(kernel, shape, round2) {
  const bb = kernel.getBoundingBox(shape);
  return `${round2(bb.xmax - bb.xmin)} \xD7 ${round2(bb.ymax - bb.ymin)} \xD7 ${round2(bb.zmax - bb.zmin)} (X\xD7Y\xD7Z)`;
}

// ../../../../../../../../tmp/opencode/cad-occt-scratch/node_modules/occt-wasm/dist/svg.js
function round(n) {
  return Math.round(n * 100) / 100;
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function pathData(lines, t) {
  let d = "";
  for (const line of lines) {
    const px = toPixels(line, t);
    for (let i = 0; i < px.length; i += 2) {
      d += `${i === 0 ? "M" : "L"}${round(px[i])} ${round(px[i + 1])}`;
    }
  }
  return d;
}
function gnomon(basis2, t) {
  let s = "";
  for (const arm of gnomonArms(basis2, t)) {
    const ex = round(arm.x1);
    const ey = round(arm.y1);
    s += `<line x1="${round(arm.x0)}" y1="${round(arm.y0)}" x2="${ex}" y2="${ey}" stroke="${arm.color}" stroke-width="1.5"/>`;
    s += `<text x="${round(arm.lx)}" y="${round(arm.ly)}" font-size="9" fill="${arm.color}" text-anchor="middle" dominant-baseline="middle">${arm.label}</text>`;
  }
  return s;
}
function panelSvg(edges, basis2, t, o, label) {
  let body = `<rect x="0.5" y="0.5" width="${t.panelW - 1}" height="${t.panelH - 1}" fill="${o.background}" stroke="#e0e0e0"/>`;
  if (o.showHidden && edges.hidden.length > 0) {
    const d = pathData(edges.hidden, t);
    if (d)
      body += `<path d="${d}" fill="none" stroke="${o.hiddenColor}" stroke-width="${o.strokeWidth}" stroke-dasharray="3 2"/>`;
  }
  if (edges.visible.length > 0) {
    const d = pathData(edges.visible, t);
    if (d)
      body += `<path d="${d}" fill="none" stroke="${o.visibleColor}" stroke-width="${o.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  if (o.showGnomon)
    body += gnomon(basis2, t);
  if (label !== null)
    body += `<text x="${t.pad}" y="${t.pad + 4}" font-size="11" fill="#333" font-family="sans-serif">${esc(label)}</text>`;
  return body;
}
function renderShapeSVG(kernel, shape, view = "front", options = {}) {
  const o = resolved(options);
  const basis2 = basisFor(view);
  const deflection = deflectionFor(kernel, shape, options);
  const edges = collectEdges(kernel, shape, basis2, deflection);
  const t = singleLayout(extentOf([edges]), o);
  const body = panelSvg(edges, basis2, t, o, null);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}">${body}</svg>`;
}
function renderMultiviewSVG(kernel, shape, options = {}) {
  const o = resolved(options);
  const views = options.views ?? ["front", "top", "right", "iso"];
  const columns = options.columns ?? 2;
  const showLabels = options.showLabels ?? true;
  const showDimensions = options.showDimensions ?? true;
  const deflection = deflectionFor(kernel, shape, options);
  const bases = views.map(basisFor);
  const edges = bases.map((b) => collectEdges(kernel, shape, b, deflection));
  const layout = gridLayout(edges.map((e) => extentOf([e])), o, columns, showDimensions);
  let panels = "";
  for (let i = 0; i < views.length; i++) {
    const { px, py, t } = layout.panels[i];
    const label = showLabels ? VIEW_LABEL[views[i]] : null;
    panels += `<g transform="translate(${px} ${py})">${panelSvg(edges[i], bases[i], t, o, label)}</g>`;
  }
  let footer = "";
  if (showDimensions) {
    const dims = dimensionsText(kernel, shape, round);
    footer = `<text x="${layout.totalW / 2}" y="${layout.rows * o.height + 15}" font-size="11" fill="#444" font-family="sans-serif" text-anchor="middle">${esc(dims)}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.totalW}" height="${layout.totalH}" viewBox="0 0 ${layout.totalW} ${layout.totalH}"><rect width="${layout.totalW}" height="${layout.totalH}" fill="${o.background}"/>${panels}${footer}</svg>`;
}

// ../../../../../../../../tmp/opencode/cad-occt-scratch/node_modules/occt-wasm/dist/font5x7.js
var GLYPH_W = 5;
var GLYPH_H = 7;
var FONT_5X7 = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  "(": [6, 8, 16, 16, 16, 8, 6],
  ")": [12, 2, 1, 1, 1, 2, 12],
  ".": [0, 0, 0, 0, 0, 12, 12],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  "A": [14, 17, 17, 31, 17, 17, 17],
  "B": [30, 17, 17, 30, 17, 17, 30],
  "F": [31, 16, 16, 30, 16, 16, 16],
  "I": [14, 4, 4, 4, 4, 4, 14],
  "L": [16, 16, 16, 16, 16, 16, 31],
  "R": [30, 17, 17, 30, 20, 18, 17],
  "T": [31, 4, 4, 4, 4, 4, 4],
  "X": [17, 17, 10, 4, 10, 17, 17],
  "Y": [17, 17, 10, 4, 4, 4, 4],
  "Z": [31, 1, 2, 4, 8, 16, 31],
  "a": [0, 0, 14, 1, 15, 17, 15],
  "c": [0, 0, 14, 16, 16, 17, 14],
  "e": [0, 0, 14, 17, 31, 16, 14],
  "f": [6, 9, 8, 28, 8, 8, 8],
  "g": [0, 0, 15, 17, 15, 1, 14],
  "h": [16, 16, 22, 25, 17, 17, 17],
  "i": [4, 0, 12, 4, 4, 4, 14],
  "k": [16, 16, 18, 20, 24, 20, 18],
  "m": [0, 0, 26, 21, 21, 21, 21],
  "n": [0, 0, 22, 25, 17, 17, 17],
  "o": [0, 0, 14, 17, 17, 17, 14],
  "p": [0, 0, 30, 17, 30, 16, 16],
  "r": [0, 0, 22, 25, 16, 16, 16],
  "s": [0, 0, 15, 16, 14, 1, 30],
  "t": [8, 8, 28, 8, 8, 9, 6],
  "u": [0, 0, 17, 17, 17, 19, 13],
  "v": [0, 0, 17, 17, 17, 10, 4],
  "w": [0, 0, 21, 21, 21, 21, 10],
  "x": [0, 0, 17, 10, 4, 10, 17],
  "y": [0, 0, 17, 17, 15, 1, 14],
  "\xD7": [0, 17, 10, 4, 10, 17, 0],
  "-": [0, 0, 0, 31, 0, 0, 0],
  ",": [0, 0, 0, 0, 12, 12, 8],
  ":": [0, 12, 12, 0, 12, 12, 0]
};

// ../../../../../../../../tmp/opencode/cad-occt-scratch/node_modules/occt-wasm/dist/png.js
function parseColor(css) {
  const c = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1];
    const pair = (i) => h.length === 3 ? h[i] + h[i] : h.slice(2 * i, 2 * i + 2);
    return { r: parseInt(pair(0), 16), g: parseInt(pair(1), 16), b: parseInt(pair(2), 16) };
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(c);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (r <= 255 && g <= 255 && b <= 255)
      return { r, g, b };
  }
  throw new TypeError(`unsupported colour "${css}" for PNG: use #rgb, #rrggbb or rgb(r, g, b)`);
}
var Canvas = class _Canvas {
  w;
  h;
  px;
  // RGB, row-major
  constructor(w, h, bg) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
    for (let i = 0; i < this.px.length; i += 3) {
      this.px[i] = bg.r;
      this.px[i + 1] = bg.g;
      this.px[i + 2] = bg.b;
    }
  }
  blend(x, y, c, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h)
      return;
    const i = (y * this.w + x) * 3;
    const k = a > 1 ? 1 : a;
    this.px[i] = this.px[i] + (c.r - this.px[i]) * k;
    this.px[i + 1] = this.px[i + 1] + (c.g - this.px[i + 1]) * k;
    this.px[i + 2] = this.px[i + 2] + (c.b - this.px[i + 2]) * k;
  }
  fillRect(x0, y0, x1, y1, c) {
    const xa = Math.max(0, Math.round(x0));
    const ya = Math.max(0, Math.round(y0));
    const xb = Math.min(this.w, Math.round(x1));
    const yb = Math.min(this.h, Math.round(y1));
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++)
        this.blend(x, y, c, 1);
    }
  }
  /**
   * Antialiased thick line, drawn as a distance field over the segment's
   * bounding box. Wu's algorithm only does hairlines; strokeWidth here is a
   * caller-visible option, and a box of a few hundred pixels is cheap.
   */
  line(x0, y0, x1, y1, c, width) {
    if (!(width > 0))
      return;
    const half = Math.max(width, 0.1) / 2;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    const pad = half + 1;
    const xa = Math.max(0, Math.floor(Math.min(x0, x1) - pad));
    const xb = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1) + pad));
    const ya = Math.max(0, Math.floor(Math.min(y0, y1) - pad));
    const yb = Math.min(this.h - 1, Math.ceil(Math.max(y0, y1) + pad));
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const px = x + 0.5 - x0;
        const py = y + 0.5 - y0;
        let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - t * dx;
        const ey = py - t * dy;
        const d = Math.hypot(ex, ey);
        const a = half + 0.5 - d;
        if (a > 0)
          this.blend(x, y, c, a > 1 ? 1 : a);
      }
    }
  }
  /** Draw text with the built-in 5x7 face. `size` is the cell height in px;
   *  the glyphs are nearest-neighbour scaled, which stays crisp at integer
   *  multiples and is acceptable in between. */
  text(s, x, y, size, c, anchor = "start") {
    const px = Math.max(1, Math.round(size / GLYPH_H));
    const advance = (GLYPH_W + 1) * px;
    const totalW = s.length * advance;
    let cx = anchor === "middle" ? x - totalW / 2 : x;
    const top = y - GLYPH_H * px / 2;
    for (const ch of s) {
      const glyph = FONT_5X7[ch];
      if (glyph) {
        for (let row = 0; row < GLYPH_H; row++) {
          const bits = glyph[row];
          for (let col = 0; col < GLYPH_W; col++) {
            if (!(bits & 1 << GLYPH_W - 1 - col))
              continue;
            this.fillRect(cx + col * px, top + row * px, cx + (col + 1) * px, top + (row + 1) * px, c);
          }
        }
      }
      cx += advance;
    }
  }
  /** Box-filter down by an integer factor. */
  downsample(factor) {
    if (factor <= 1)
      return this;
    const w = Math.floor(this.w / factor);
    const h = Math.floor(this.h / factor);
    const out = new _Canvas(w, h, { r: 0, g: 0, b: 0 });
    const n = factor * factor;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let sy = 0; sy < factor; sy++) {
          const row = (y * factor + sy) * this.w;
          for (let sx = 0; sx < factor; sx++) {
            const i = (row + x * factor + sx) * 3;
            r += this.px[i];
            g += this.px[i + 1];
            b += this.px[i + 2];
          }
        }
        const o = (y * w + x) * 3;
        out.px[o] = r / n;
        out.px[o + 1] = g / n;
        out.px[o + 2] = b / n;
      }
    }
    return out;
  }
};
function dashed(canvas, pts, c, width, on, off) {
  let phase = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i];
    const y0 = pts[i + 1];
    const x1 = pts[i + 2];
    const y1 = pts[i + 3];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len === 0)
      continue;
    let travelled = 0;
    while (travelled < len) {
      const inOn = phase < on;
      const remain = inOn ? on - phase : on + off - phase;
      const step = Math.min(remain, len - travelled);
      if (inOn) {
        const ta = travelled / len;
        const tb = (travelled + step) / len;
        canvas.line(x0 + (x1 - x0) * ta, y0 + (y1 - y0) * ta, x0 + (x1 - x0) * tb, y0 + (y1 - y0) * tb, c, width);
      }
      travelled += step;
      phase = (phase + step) % (on + off);
    }
  }
}
function strokePolylines(canvas, lines, t, ox, oy, s, c, width, dash) {
  for (const line of lines) {
    const px = toPixels(line, t);
    for (let i = 0; i < px.length; i += 2) {
      px[i] = (px[i] + ox) * s;
      px[i + 1] = (px[i + 1] + oy) * s;
    }
    if (dash)
      dashed(canvas, px, c, width * s, 3 * s, 2 * s);
    else {
      for (let i = 0; i + 3 < px.length; i += 2) {
        canvas.line(px[i], px[i + 1], px[i + 2], px[i + 3], c, width * s);
      }
    }
  }
}
function drawPanel(canvas, edges, basis2, t, o, label, ox, oy, s) {
  const border = parseColor("#e0e0e0");
  canvas.fillRect(ox * s, oy * s, (ox + t.panelW) * s, (oy + t.panelH) * s, parseColor(o.background));
  const i = s / 2;
  const x0 = ox * s + i;
  const y0 = oy * s + i;
  const x1 = (ox + t.panelW) * s - i;
  const y1 = (oy + t.panelH) * s - i;
  canvas.line(x0, y0, x1, y0, border, s);
  canvas.line(x0, y1, x1, y1, border, s);
  canvas.line(x0, y0, x0, y1, border, s);
  canvas.line(x1, y0, x1, y1, border, s);
  if (o.showHidden && edges.hidden.length > 0) {
    strokePolylines(canvas, edges.hidden, t, ox, oy, s, parseColor(o.hiddenColor), o.strokeWidth, true);
  }
  if (edges.visible.length > 0) {
    strokePolylines(canvas, edges.visible, t, ox, oy, s, parseColor(o.visibleColor), o.strokeWidth, false);
  }
  if (o.showGnomon) {
    for (const arm of gnomonArms(basis2, t)) {
      const c = parseColor(arm.color);
      canvas.line((arm.x0 + ox) * s, (arm.y0 + oy) * s, (arm.x1 + ox) * s, (arm.y1 + oy) * s, c, 1.5 * s);
      canvas.text(arm.label, (arm.lx + ox) * s, (arm.ly + oy) * s, 9 * s, c, "middle");
    }
  }
  if (label !== null) {
    canvas.text(label, (t.pad + ox) * s, (t.pad + oy) * s, 11 * s, parseColor("#333"));
  }
}
var CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 4294967295;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++)
    out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function deflate(raw) {
  const CS = globalThis.CompressionStream;
  if (typeof CS !== "function") {
    throw new Error("PNG export needs CompressionStream (Node 18+, Bun, Deno or a browser)");
  }
  const cs = new CS("deflate");
  const writer = cs.writable.getWriter();
  void writer.write(raw);
  void writer.close();
  const parts = [];
  const reader = cs.readable.getReader();
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done)
      break;
    if (value)
      parts.push(value);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
function isGrey(px) {
  for (let i = 0; i < px.length; i += 3) {
    if (px[i] !== px[i + 1] || px[i] !== px[i + 2])
      return false;
  }
  return true;
}
async function encodePng(canvas) {
  const grey = isGrey(canvas.px);
  const channels = grey ? 1 : 3;
  const stride = canvas.w * channels;
  const raw = new Uint8Array((stride + 1) * canvas.h);
  for (let y = 0; y < canvas.h; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    if (grey) {
      const src = y * canvas.w * 3;
      for (let x = 0; x < canvas.w; x++)
        raw[row + 1 + x] = canvas.px[src + x * 3];
    } else {
      raw.set(canvas.px.subarray(y * stride, (y + 1) * stride), row + 1);
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, canvas.w);
  dv.setUint32(4, canvas.h);
  ihdr[8] = 8;
  ihdr[9] = grey ? 0 : 2;
  const idat = await deflate(raw);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0))
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
function superScale(options) {
  const s = options.supersample ?? 2;
  return Math.max(1, Math.min(4, Math.round(s)));
}
async function renderShapePNG(kernel, shape, view = "front", options = {}) {
  const o = resolved(options);
  const s = superScale(options);
  const basis2 = basisFor(view);
  const deflection = deflectionFor(kernel, shape, options);
  const edges = collectEdges(kernel, shape, basis2, deflection);
  const t = singleLayout(extentOf([edges]), o);
  const canvas = new Canvas(o.width * s, o.height * s, parseColor(o.background));
  drawPanel(canvas, edges, basis2, t, o, null, 0, 0, s);
  return encodePng(canvas.downsample(s));
}
async function renderMultiviewPNG(kernel, shape, options = {}) {
  const o = resolved(options);
  const s = superScale(options);
  const views = options.views ?? ["front", "top", "right", "iso"];
  const columns = options.columns ?? 2;
  const showLabels = options.showLabels ?? true;
  const showDimensions = options.showDimensions ?? true;
  const deflection = deflectionFor(kernel, shape, options);
  const bases = views.map(basisFor);
  const edges = bases.map((b) => collectEdges(kernel, shape, b, deflection));
  const layout = gridLayout(edges.map((e) => extentOf([e])), o, columns, showDimensions);
  const canvas = new Canvas(layout.totalW * s, layout.totalH * s, parseColor(o.background));
  for (let i = 0; i < views.length; i++) {
    const { px, py, t } = layout.panels[i];
    drawPanel(canvas, edges[i], bases[i], t, o, showLabels ? VIEW_LABEL[views[i]] : null, px, py, s);
  }
  if (showDimensions) {
    const dims = dimensionsText(kernel, shape, (n) => Math.round(n * 100) / 100);
    canvas.text(dims, layout.totalW / 2 * s, (layout.rows * o.height + 11) * s, 11 * s, parseColor("#444"), "middle");
  }
  return encodePng(canvas.downsample(s));
}

// ../../../../../../../../tmp/opencode/cad-occt-scratch/node_modules/occt-wasm/dist/index.js
var _a;
function handle(id) {
  return id;
}
async function importModuleFactory() {
  const imported = await import("./chunks/occt-wasm-R2L4X4ZQ.mjs");
  return imported.default;
}
var RAW_JOIN_CODE = {
  [JoinType.Arc]: 0,
  [JoinType.Intersection]: 1,
  [JoinType.Tangent]: 2
};
function perItem(count, value) {
  return Array.isArray(value) ? [...value] : new Array(count).fill(value);
}
function filletRadiusArrays(count, radius) {
  const radii = perItem(count, radius);
  return {
    start: radii.map((r) => typeof r === "number" ? r : r.start),
    end: radii.map((r) => typeof r === "number" ? r : r.end)
  };
}
function chamferArrays(count, distance) {
  const specs = perItem(count, distance);
  return {
    distances1: specs.map((d) => typeof d === "number" ? d : d.distance1),
    distances2: specs.map((d) => typeof d === "number" ? d : d.distance2),
    faces: specs.map((d) => typeof d === "number" ? 0 : d.referenceFace ?? 0)
  };
}
var DEFAULT_NEUTRAL_PLANE = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 }
};
var SHAPE_TYPE_VALUES = new Set(SHAPE_TYPES);
var SHAPE_ORIENTATION_VALUES = new Set(SHAPE_ORIENTATIONS);
var POINT_CLASSIFICATION_VALUES = new Set(POINT_CLASSIFICATIONS);
function asEnum(value, allowed, label) {
  if (!allowed.has(value)) {
    throw new Error(`unexpected ${label} from kernel: "${value}"`);
  }
  return value;
}
var kernelRegistry = new FinalizationRegistry((raw) => {
  try {
    raw.releaseAll();
    raw.delete();
  } catch {
  }
});
var OcctKernel = class {
  #raw;
  #module;
  constructor(module) {
    this.#module = module;
    this.#raw = new module.OcctKernel();
    kernelRegistry.register(this, this.#raw, this);
  }
  /**
   * Initialize the WASM module and create a kernel instance.
   *
   * @example
   * ```ts
   * // Auto-detect (works in browser, Node.js, and Workers):
   * const kernel = await OcctKernel.init();
   *
   * // Explicit WASM location:
   * const kernel = await OcctKernel.init({ wasm: '/path/to/occt-wasm.wasm' });
   *
   * // From pre-fetched binary:
   * const binary = await fetch('/occt-wasm.wasm').then(r => r.arrayBuffer());
   * const kernel = await OcctKernel.init({ wasm: binary });
   * ```
   */
  static async init(options) {
    const createModule = options?.createModule ?? await importModuleFactory();
    const moduleOpts = {};
    const wasmSource = options?.wasm ?? options?.wasmUrl ?? options?.wasmPath;
    if (wasmSource instanceof ArrayBuffer || wasmSource instanceof Uint8Array) {
      const bytes = wasmSource instanceof Uint8Array ? wasmSource.buffer.slice(wasmSource.byteOffset, wasmSource.byteOffset + wasmSource.byteLength) : wasmSource;
      moduleOpts["wasmBinary"] = bytes;
    } else if (wasmSource) {
      const location = wasmSource instanceof URL ? wasmSource.href : wasmSource;
      moduleOpts["locateFile"] = (path) => {
        if (path.endsWith(".wasm"))
          return location;
        return path;
      };
    }
    const module = await createModule(moduleOpts);
    return new _a(module);
  }
  // =======================================================================
  // Primitives
  // =======================================================================
  /** Create an axis-aligned box solid with the given dimensions (BRepPrimAPI_MakeBox).
   * @throws OcctError if dimensions are non-positive */
  makeBox(dx, dy, dz) {
    return wrap("makeBox", () => handle(this.#raw.makeBox(dx, dy, dz)));
  }
  /** Create a box solid from two opposite corner points.
   * @throws OcctError if corners are coincident */
  makeBoxFromCorners(corner1, corner2) {
    return wrap("makeBoxFromCorners", () => handle(this.#raw.makeBoxFromCorners(corner1.x, corner1.y, corner1.z, corner2.x, corner2.y, corner2.z)));
  }
  /** Create a cylinder solid centered on the Z axis (BRepPrimAPI_MakeCylinder).
   * @throws OcctError */
  makeCylinder(radius, height) {
    return wrap("makeCylinder", () => handle(this.#raw.makeCylinder(radius, height)));
  }
  /** Create a sphere solid at the origin (BRepPrimAPI_MakeSphere).
   * @throws OcctError */
  makeSphere(radius) {
    return wrap("makeSphere", () => handle(this.#raw.makeSphere(radius)));
  }
  /** Create a cone (or truncated cone) solid along the Z axis (BRepPrimAPI_MakeCone).
   * @param r1 - bottom radius
   * @param r2 - top radius (0 for a full cone)
   * @throws OcctError */
  makeCone(r1, r2, height) {
    return wrap("makeCone", () => handle(this.#raw.makeCone(r1, r2, height)));
  }
  /** Create a torus solid at the origin (BRepPrimAPI_MakeTorus).
   * @throws OcctError */
  makeTorus(majorRadius, minorRadius) {
    return wrap("makeTorus", () => handle(this.#raw.makeTorus(majorRadius, minorRadius)));
  }
  /**
   * Infinite half-space solid bounded by the plane through `origin` with the
   * given `normal`. The solid fills the side the normal points into — useful
   * as an unbounded boolean cutting tool.
   */
  halfSpace(origin, normal) {
    return wrap("halfSpace", () => handle(this.#raw.halfSpace(origin.x, origin.y, origin.z, normal.x, normal.y, normal.z)));
  }
  /** Create an ellipsoid solid at the origin by scaling a sphere.
   * @param rx - radius along X
   * @param ry - radius along Y
   * @param rz - radius along Z
   * @throws OcctError */
  makeEllipsoid(rx, ry, rz) {
    return wrap("makeEllipsoid", () => handle(this.#raw.makeEllipsoid(rx, ry, rz)));
  }
  /** Create a rectangular planar face on the XY plane at the origin.
   * @throws OcctError */
  makeRectangle(width, height) {
    return wrap("makeRectangle", () => handle(this.#raw.makeRectangle(width, height)));
  }
  // =======================================================================
  // Booleans
  // =======================================================================
  /** Boolean union (BRepAlgoAPI_Fuse). Combines two shapes into one.
   * @throws OcctError */
  fuse(a, b) {
    return wrap("fuse", () => handle(this.#raw.fuse(a, b)));
  }
  /** Boolean subtraction (BRepAlgoAPI_Cut). Removes b from a.
   * @throws OcctError */
  cut(a, b) {
    return wrap("cut", () => handle(this.#raw.cut(a, b)));
  }
  /** Boolean intersection (BRepAlgoAPI_Common). Keeps only the overlapping volume.
   * @throws OcctError */
  common(a, b) {
    return wrap("common", () => handle(this.#raw.common(a, b)));
  }
  /** Boolean intersection — alias for common (BRepAlgoAPI_Common).
   * @throws OcctError */
  intersect(a, b) {
    return wrap("intersect", () => handle(this.#raw.intersect(a, b)));
  }
  /** Compute the intersection edges/vertices of two shapes (BRepAlgoAPI_Section).
   * @returns A compound of edges/vertices at the intersection
   * @throws OcctError */
  section(a, b) {
    return wrap("section", () => handle(this.#raw.section(a, b)));
  }
  /**
   * Section `shape` with the infinite plane through `origin` with the given
   * `normal`. Returns a compound of the intersection edges.
   *
   * The plane overload of {@link OcctKernel.section}: no face has to be built
   * and sized to span the shape. The edges keep their analytic geometry — the
   * section of a cylinder is a circle edge with an exact radius — so lengths
   * and areas measured from the result do not carry a tessellation error.
   * @throws OcctError */
  sectionPlane(shape, origin, normal) {
    return wrap("sectionPlane", () => handle(this.#raw.sectionPlane(shape, origin.x, origin.y, origin.z, normal.x, normal.y, normal.z)));
  }
  /** Fuse all shapes in the array into a single shape.
   * @throws OcctError */
  fuseAll(shapes) {
    return wrap("fuseAll", () => {
      return this.#withU32(shapes, (vec) => handle(this.#raw.fuseAll(vec)));
    });
  }
  /** Subtract all tool shapes from the base shape.
   * @throws OcctError */
  cutAll(shape, tools) {
    return wrap("cutAll", () => {
      return this.#withU32(tools, (vec) => handle(this.#raw.cutAll(shape, vec)));
    });
  }
  /** Split a shape using tool shapes as splitting surfaces (BOPAlgo_Splitter).
   * @returns A compound of the split fragments
   * @throws OcctError */
  split(shape, tools) {
    return wrap("split", () => {
      return this.#withU32(tools, (vec) => handle(this.#raw.split(shape, vec)));
    });
  }
  /**
   * General-fuse cell selection: the union of all regions covered by two or
   * more of the inputs. Unlike {@link fuseAll} (which keeps every cell), this
   * keeps only the overlap regions via BOPAlgo_CellsBuilder.
   */
  intersectionCells(shapes) {
    return wrap("intersectionCells", () => {
      return this.#withU32(shapes, (vec) => handle(this.#raw.intersectionCells(vec)));
    });
  }
  // =======================================================================
  // Modeling
  // =======================================================================
  /** Extrude a shape along a direction vector (BRepPrimAPI_MakePrism).
   * @param dx - extrusion vector X component
   * @param dy - extrusion vector Y component
   * @param dz - extrusion vector Z component
   * @throws OcctError */
  extrude(shape, dx, dy, dz) {
    return wrap("extrude", () => handle(this.#raw.extrude(shape, dx, dy, dz)));
  }
  /** Revolve a shape around an axis (BRepPrimAPI_MakeRevol).
   * @param axis - rotation axis defined by a point and direction
   * @param angleRad - sweep angle in radians (2*PI for full revolution)
   * @throws OcctError */
  revolve(shape, axis, angleRad) {
    return wrap("revolve", () => handle(this.#raw.revolve(shape, axis.point.x, axis.point.y, axis.point.z, axis.direction.x, axis.direction.y, axis.direction.z, angleRad)));
  }
  /**
   * Fillet edges of a solid in one BRepFilletAPI_MakeFillet operation.
   *
   * @param radius - One radius for every edge, or one per edge (an array as
   *     long as `edges`). Each is a constant radius or a `{ start, end }` pair
   *     that varies linearly along the edge. Tangent-continuous edges form one
   *     fillet whose radius cannot jump, so two such edges that meet must
   *     agree on the radius at their shared vertex; an edge of the chain left
   *     out blends between its neighbours' radii. A taper may run out to 0
   *     only at an open end of its chain, never at a joint inside it or on a
   *     closed loop.
   * @throws OcctError, naming the edges of any contour that could not be built,
   *     of a tangent joint whose radii disagree, or with a 0 the fillet continues past
   */
  fillet(solid, edges, radius) {
    return wrap("fillet", () => {
      if (typeof radius === "number") {
        return this.#withU32(edges, (vec) => handle(this.#raw.fillet(solid, vec, radius)));
      }
      const { start, end } = filletRadiusArrays(edges.length, radius);
      return this.#withU32(edges, (edgeVec) => this.#withF64(start, (startVec) => this.#withF64(end, (endVec) => handle(this.#raw.filletRadii(solid, edgeVec, startVec, endVec)))));
    });
  }
  /**
   * Chamfer edges of a solid in one BRepFilletAPI_MakeChamfer operation.
   *
   * @param distance - One setback for every edge, or one per edge (an array
   *     as long as `edges`). Each is a symmetric distance or an asymmetric
   *     `{ distance1, distance2, referenceFace? }`; see {@link ChamferDistance}.
   * @throws OcctError, naming the edges of any contour that could not be built
   */
  chamfer(solid, edges, distance) {
    return wrap("chamfer", () => {
      if (typeof distance === "number") {
        return this.#withU32(edges, (vec) => handle(this.#raw.chamfer(solid, vec, distance)));
      }
      const { distances1, distances2, faces } = chamferArrays(edges.length, distance);
      return this.#withU32(edges, (edgeVec) => this.#withF64(distances1, (d1) => this.#withF64(distances2, (d2) => this.#withU32(faces, (faceVec) => handle(this.#raw.chamferDistances(solid, edgeVec, d1, d2, faceVec))))));
    });
  }
  /**
   * Chamfer edges by a setback `distance` on a reference face and an angle
   * from that face, in one operation.
   *
   * @param distance - One distance, or one per edge.
   * @param angleDeg - One angle in degrees (strictly between 0 and 90), or one per edge.
   * @param referenceFaces - One face per edge, each adjacent to its edge.
   *     Omitted, every edge uses its first adjacent face. Tangent-continuous
   *     edges share one chamfer. Measured from faces on opposite sides, theirs
   *     must make the same setbacks all along the chain, and both faces must
   *     run straight away from the edge.
   * @throws OcctError
   */
  chamferDistAngle(solid, edges, distance, angleDeg, referenceFaces) {
    return wrap("chamferDistAngle", () => {
      if (typeof distance === "number" && typeof angleDeg === "number" && referenceFaces === void 0) {
        return this.#withU32(edges, (vec) => handle(this.#raw.chamferDistAngle(solid, vec, distance, angleDeg)));
      }
      const distances = perItem(edges.length, distance);
      const angles = perItem(edges.length, angleDeg);
      const faces = referenceFaces ? [...referenceFaces] : [];
      return this.#withU32(edges, (edgeVec) => this.#withF64(distances, (d) => this.#withF64(angles, (a) => this.#withU32(faces, (faceVec) => handle(this.#raw.chamferDistAngles(solid, edgeVec, d, a, faceVec))))));
    });
  }
  /** Apply an asymmetric (two-distance) chamfer to a single edge
   * (BRepFilletAPI_MakeChamfer): `distance1` is set back on the reference face,
   * `distance2` on the edge's other adjacent face. Omit `referenceFace` to use
   * the first face adjacent to the edge; pass one (or swap the two distances)
   * to control which side gets `distance1`. A given `referenceFace` must be
   * adjacent to `edge`.
   * @throws OcctError */
  chamferAsymmetric(solid, edge, distance1, distance2, referenceFace) {
    return wrap("chamferAsymmetric", () => handle(this.#raw.chamferAsymmetric(solid, edge, distance1, distance2, referenceFace ?? 0)));
  }
  /**
   * Hollow a solid by removing the listed faces and offsetting remaining
   * faces inward by `thickness`.
   *
   * @param tolerance - OCCT precision for the thick-solid reconstruction.
   *     Use `1e-6` for precise shells (matches brepjs default); `1e-3` is a
   *     coarser legacy value that survives more inputs but produces
   *     different topology than brepjs.
   * @param joinType - How the walls meet where the offset faces move apart.
   *     `JoinType.Arc` (the default) rounds those edges with a radius equal
   *     to `thickness`; `JoinType.Intersection` extends the faces until they
   *     meet and keeps the edges sharp. OCCT's 3D offsets do not implement
   *     `JoinType.Tangent`, so the type excludes it.
   */
  shell(solid, facesToRemove, thickness, tolerance, joinType = JoinType.Arc) {
    return wrap("shell", () => {
      return this.#withU32(facesToRemove, (vec) => handle(joinType === JoinType.Arc ? this.#raw.shell(solid, vec, thickness, tolerance) : this.#raw.shellWithJoin(solid, vec, thickness, tolerance, RAW_JOIN_CODE[joinType])));
    });
  }
  /**
   * Offset all faces of a solid by `distance`.
   *
   * @param tolerance - OCCT precision for the offset reconstruction. Use
   *     `1e-6` for precise offsets (matches brepjs default); `1e-3` is a
   *     coarser legacy value.
   * @param joinType - How faces meet where they move apart: `JoinType.Arc`
   *     (the default) rounds, `JoinType.Intersection` stays sharp. See
   *     {@link OcctKernel.shell}.
   */
  offset(solid, distance, tolerance, joinType = JoinType.Arc) {
    return wrap("offset", () => handle(joinType === JoinType.Arc ? this.#raw.offset(solid, distance, tolerance) : this.#raw.offsetWithJoin(solid, distance, tolerance, RAW_JOIN_CODE[joinType])));
  }
  /**
   * Tilt faces of a shape by a draft angle, all in one
   * BRepOffsetAPI_DraftAngle operation (planar, cylindrical and conical
   * faces only).
   *
   * @param faces - A face of `shape`, or several. Faces of an earlier result
   *     are rejected: draft them together in one call instead.
   * @param angleRad - One angle in radians, or one per face. A positive angle
   *     removes material on the side `direction` points to.
   * @param direction - The pull (demolding) direction.
   * @param neutralPlane - The plane where each face keeps its section.
   *     Defaults to the XY plane through the origin.
   * @throws OcctError naming a face that cannot be drafted
   */
  draft(shape, faces, angleRad, direction, neutralPlane = DEFAULT_NEUTRAL_PLANE) {
    return wrap("draft", () => {
      const faceList = Array.isArray(faces) ? [...faces] : [faces];
      const { origin, normal } = neutralPlane;
      return this.#withU32(faceList, (faceVec) => this.#withF64(perItem(faceList.length, angleRad), (angleVec) => handle(this.#raw.draftFaces(shape, faceVec, angleVec, direction.x, direction.y, direction.z, origin.x, origin.y, origin.z, normal.x, normal.y, normal.z))));
    });
  }
  // =======================================================================
  // Sweeps
  // =======================================================================
  pipe(profile, spine) {
    return wrap("pipe", () => handle(this.#raw.pipe(profile, spine)));
  }
  simplePipe(profile, spine) {
    return wrap("simplePipe", () => handle(this.#raw.simplePipe(profile, spine)));
  }
  /**
   * Loft a solid (or shell) through a sequence of wire profiles.
   *
   * @param ruled - When `true`, sections are joined by ruled (linear)
   *     surfaces; when `false`, by smooth B-spline surfaces. The two modes
   *     produce dramatically different topology for the same input.
   */
  loft(wires, isSolid, ruled) {
    return wrap("loft", () => {
      return this.#withU32(wires, (vec) => handle(this.#raw.loft(vec, isSolid, ruled)));
    });
  }
  loftWithVertices(wires, isSolid, ruled, startVertex, endVertex) {
    return wrap("loftWithVertices", () => {
      return this.#withU32(wires, (vec) => handle(this.#raw.loftWithVertices(vec, isSolid, ruled, startVertex, endVertex)));
    });
  }
  sweep(wire, spine, transitionMode = TransitionMode.Transformed) {
    return wrap("sweep", () => handle(this.#raw.sweep(wire, spine, transitionMode)));
  }
  sweepPipeShell(profile, spine, freenet = false, smooth = true) {
    return wrap("sweepPipeShell", () => handle(this.#raw.sweepPipeShell(profile, spine, freenet, smooth)));
  }
  /**
   * Sweep a profile wire along a spine wire with explicit profile-orientation
   * control. `up` is required for {@link SweepMode.FixedUp} (the constant
   * binormal direction); `auxSpine` is required for {@link SweepMode.Auxiliary}
   * (the guide wire). Both are ignored for the other modes.
   *
   * In `options`, `curvilinearEquivalence` and `contact` apply to
   * {@link SweepMode.Auxiliary} only; the tolerances apply to every mode and
   * are absolute, not relative to model size. See
   * {@link SweepOrientedOptions}.
   */
  sweepOriented(profile, spine, mode = SweepMode.Fixed, up = { x: 0, y: 0, z: 1 }, auxSpine, options = {}) {
    return wrap("sweepOriented", () => handle(this.#raw.sweepOriented(profile, spine, mode, up.x, up.y, up.z, auxSpine ?? 0, options.curvilinearEquivalence ?? false, options.contact ?? SweepContact.None, options.tol3d ?? 0, options.boundTol ?? 0, options.tolAngular ?? 0)));
  }
  /**
   * Sweep a profile along a spine with the full control surface: the
   * orientation modes of {@link OcctKernel.sweepOriented}, the corner
   * transitions of {@link OcctKernel.sweepPipeShell}, and the profile
   * placement neither of them exposes.
   *
   * Prefer this for new code. The other two remain for callers bound to
   * their existing raw arity.
   */
  sweepAdvanced(profile, spine, options = {}) {
    const up = options.up ?? { x: 0, y: 0, z: 1 };
    return wrap("sweepAdvanced", () => handle(this.#raw.sweepAdvanced(profile, spine, options.mode ?? SweepMode.Fixed, up.x, up.y, up.z, options.auxSpine ?? 0, options.curvilinearEquivalence ?? false, options.guideContact ?? SweepContact.None, options.transitionMode ?? TransitionMode.Transformed, options.withContact ?? false, options.withCorrection ?? false, options.tol3d ?? 0, options.boundTol ?? 0, options.tolAngular ?? 0)));
  }
  /**
   * Sweep with the complete control surface: everything
   * {@link OcctKernel.sweepAdvanced} accepts, plus a spine support surface,
   * the approximation budget, and a homothetic scaling law.
   *
   * Prefer this for new code. The narrower sweep entry points remain for
   * callers bound to their existing raw arity.
   */
  sweepFull(profile, spine, options = {}) {
    const up = options.up ?? { x: 0, y: 0, z: 1 };
    const law = options.law ?? SweepLaw.None;
    if (law !== SweepLaw.None && options.lawLength === void 0) {
      throw new Error("sweepFull: lawLength is required when a law is set");
    }
    return wrap("sweepFull", () => handle(this.#raw.sweepFull(profile, spine, options.mode ?? SweepMode.Fixed, up.x, up.y, up.z, options.auxSpine ?? 0, options.curvilinearEquivalence ?? false, options.guideContact ?? SweepContact.None, options.transitionMode ?? TransitionMode.Transformed, options.withContact ?? false, options.withCorrection ?? false, options.tol3d ?? 0, options.boundTol ?? 0, options.tolAngular ?? 0, options.support ?? 0, options.maxDegree ?? 0, options.maxSegments ?? 0, law, options.lawLength ?? 0, options.lawEndFactor ?? 1)));
  }
  draftPrism(shape, dx, dy, dz, angleDeg) {
    return wrap("draftPrism", () => handle(this.#raw.draftPrism(shape, dx, dy, dz, angleDeg)));
  }
  // =======================================================================
  // Construction
  // =======================================================================
  makeVertex(x, y, z) {
    return wrap("makeVertex", () => handle(this.#raw.makeVertex(x, y, z)));
  }
  makeEdge(v1, v2) {
    return wrap("makeEdge", () => handle(this.#raw.makeEdge(v1, v2)));
  }
  makeLineEdge(start, end) {
    return wrap("makeLineEdge", () => handle(this.#raw.makeLineEdge(start.x, start.y, start.z, end.x, end.y, end.z)));
  }
  makeCircleEdge(center, normal, radius) {
    return wrap("makeCircleEdge", () => handle(this.#raw.makeCircleEdge(center.x, center.y, center.z, normal.x, normal.y, normal.z, radius)));
  }
  makeCircleArc(center, normal, radius, startAngle, endAngle) {
    return wrap("makeCircleArc", () => handle(this.#raw.makeCircleArc(center.x, center.y, center.z, normal.x, normal.y, normal.z, radius, startAngle, endAngle)));
  }
  makeArcEdge(start, mid, end) {
    return wrap("makeArcEdge", () => handle(this.#raw.makeArcEdge(start.x, start.y, start.z, mid.x, mid.y, mid.z, end.x, end.y, end.z)));
  }
  makeEllipseEdge(center, normal, majorRadius, minorRadius) {
    return wrap("makeEllipseEdge", () => handle(this.#raw.makeEllipseEdge(center.x, center.y, center.z, normal.x, normal.y, normal.z, majorRadius, minorRadius)));
  }
  /**
   * Create an elliptical arc edge. The major axis runs along `xDir`, projected
   * into the plane normal to `normal`; without `xDir`, OCCT picks it from the
   * normal alone.
   * @throws OcctError if `xDir` is parallel to `normal`
   */
  makeEllipseArc(center, normal, majorRadius, minorRadius, startAngle, endAngle, xDir) {
    if (xDir) {
      return wrap("makeEllipseArc", () => handle(this.#raw.makeEllipseArcOriented(center.x, center.y, center.z, normal.x, normal.y, normal.z, xDir.x, xDir.y, xDir.z, majorRadius, minorRadius, startAngle, endAngle)));
    }
    return wrap("makeEllipseArc", () => handle(this.#raw.makeEllipseArc(center.x, center.y, center.z, normal.x, normal.y, normal.z, majorRadius, minorRadius, startAngle, endAngle)));
  }
  makeBezierEdge(controlPoints) {
    return wrap("makeBezierEdge", () => {
      const flat = this.#flattenPoints(controlPoints);
      try {
        return handle(this.#raw.makeBezierEdge(flat));
      } finally {
        flat.delete();
      }
    });
  }
  makeBSplineEdge(poles, weights, knots, multiplicities, degree, periodic = false) {
    return wrap("makeBSplineEdge", () => this.#withF64(poles, (polesVec) => this.#withF64(weights, (weightsVec) => this.#withF64(knots, (knotsVec) => this.#withI32(multiplicities, (multsVec) => handle(this.#raw.makeBSplineEdge(polesVec, weightsVec, knotsVec, multsVec, degree, periodic)))))));
  }
  makeTangentArc(start, tangent, end) {
    return wrap("makeTangentArc", () => handle(this.#raw.makeTangentArc(start.x, start.y, start.z, tangent.x, tangent.y, tangent.z, end.x, end.y, end.z)));
  }
  makeHelixWire(origin, axis, pitch, height, radius) {
    return wrap("makeHelixWire", () => handle(this.#raw.makeHelixWire(origin.x, origin.y, origin.z, axis.x, axis.y, axis.z, pitch, height, radius)));
  }
  /**
   * A helix with an explicit handedness: right-handed (the default) winds
   * counter-clockwise about `axis` as it climbs, left-handed clockwise. The
   * two are mirror images over the same pitch, height and radius.
   *
   * Prefer this for new code. {@link OcctKernel.makeHelixWire} remains for
   * callers bound to its existing raw arity, and is always right-handed.
   */
  makeHelixWireHanded(origin, axis, pitch, height, radius, leftHanded = false) {
    return wrap("makeHelixWireHanded", () => handle(this.#raw.makeHelixWireHanded(origin.x, origin.y, origin.z, axis.x, axis.y, axis.z, pitch, height, radius, leftHanded)));
  }
  /**
   * The solid a right-handed thread removes from a cylinder, built from its
   * known curves rather than swept, so cutting it needs no intersection to
   * be found. It runs `length` along `axis` from `origin`, and its cover
   * faces lie on the cylinder of `coverRadius` about that axis: a root
   * outside the cover is a tapped hole's groove, one inside a shaft's.
   * The ends are flat, level with `origin` and `length`.
   *
   * Faces come in order: cover, lower flank, root, upper flank, in patches
   * of under a turn, then the end at `origin` and the end at `length`.
   */
  threadGroove(origin, axis, groove) {
    return wrap("threadGroove", () => handle(this.#raw.threadGroove(origin.x, origin.y, origin.z, axis.x, axis.y, axis.z, groove.pitch, groove.length, groove.coverRadius, groove.rootRadius, groove.coverHalfWidth, groove.rootHalfWidth, groove.phase ?? 0)));
  }
  makeWire(edges) {
    return wrap("makeWire", () => {
      return this.#withU32(edges, (vec) => handle(this.#raw.makeWire(vec)));
    });
  }
  makeFace(wire) {
    return wrap("makeFace", () => handle(this.#raw.makeFace(wire)));
  }
  makeNonPlanarFace(wire) {
    return wrap("makeNonPlanarFace", () => handle(this.#raw.makeNonPlanarFace(wire)));
  }
  /**
   * Fill a closed boundary with a smooth face (OCCT's N-sided filling).
   * Bare edges are matched in position only; an edge given with a
   * `support` face is met tangentially (or with matching curvature), so the
   * filling blends into its neighbour. `options.points` and
   * `options.guides` pull the interior through given points and curves.
   */
  fillSurface(boundary, options = {}) {
    return wrap("fillSurface", () => {
      const free = [];
      const supported = [];
      const supports = [];
      const orders = [];
      for (const b of boundary) {
        if (typeof b === "number") {
          free.push(b);
        } else {
          supported.push(b.edge);
          supports.push(b.support);
          orders.push(b.continuity === "G2" ? 2 : 1);
        }
      }
      const o = options;
      const tuned = [
        o.degree,
        o.pointsOnCurve,
        o.iterations,
        o.anisotropy,
        o.tolerance2d,
        o.tolerance3d,
        o.toleranceAngular,
        o.toleranceCurvature,
        o.maxDegree,
        o.maxSegments
      ].some((v2) => v2 !== void 0);
      const params = tuned ? [
        o.degree ?? 3,
        o.pointsOnCurve ?? 15,
        o.iterations ?? 2,
        o.anisotropy ? 1 : 0,
        o.tolerance2d ?? 1e-5,
        o.tolerance3d ?? 1e-4,
        o.toleranceAngular ?? 0.01,
        o.toleranceCurvature ?? 0.1,
        o.maxDegree ?? 8,
        o.maxSegments ?? 9
      ] : [];
      const points = this.#flattenPoints(o.points ?? []);
      try {
        return this.#withU32(free, (freeVec) => this.#withU32(supported, (supportedVec) => this.#withU32(supports, (supportsVec) => this.#withI32(orders, (ordersVec) => this.#withU32(o.guides ?? [], (guidesVec) => this.#withF64(params, (paramsVec) => handle(this.#raw.fillSurface(freeVec, supportedVec, supportsVec, ordersVec, guidesVec, points, o.initSurface ?? 0, paramsVec))))))));
      } finally {
        points.delete();
      }
    });
  }
  /**
   * An edge lying on `face`'s surface through `points`, which are first
   * approximated by a curve within `tolerance`. Points off the surface are
   * projected onto it. `closed` joins the last point back to the first.
   */
  edgeOnSurface(face, points, tolerance = 1e-3, closed = false) {
    return wrap("edgeOnSurface", () => {
      const flat = this.#flattenPoints(points);
      try {
        return handle(this.#raw.edgeOnSurface(face, flat, tolerance, closed));
      } finally {
        flat.delete();
      }
    });
  }
  addHolesInFace(face, holeWires) {
    return wrap("addHolesInFace", () => {
      return this.#withU32(holeWires, (vec) => handle(this.#raw.addHolesInFace(face, vec)));
    });
  }
  removeHolesFromFace(face, holeIndices) {
    return wrap("removeHolesFromFace", () => {
      return this.#withI32(holeIndices, (vec) => handle(this.#raw.removeHolesFromFace(face, vec)));
    });
  }
  makeSolid(shell) {
    return wrap("makeSolid", () => handle(this.#raw.makeSolid(shell)));
  }
  sew(shapes, tolerance = 1e-6) {
    return wrap("sew", () => {
      return this.#withU32(shapes, (vec) => handle(this.#raw.sew(vec, tolerance)));
    });
  }
  sewAndSolidify(faces, tolerance = 1e-6) {
    return wrap("sewAndSolidify", () => {
      return this.#withU32(faces, (vec) => handle(this.#raw.sewAndSolidify(vec, tolerance)));
    });
  }
  buildSolidFromFaces(faces, tolerance = 1e-6) {
    return wrap("buildSolidFromFaces", () => {
      return this.#withU32(faces, (vec) => handle(this.#raw.buildSolidFromFaces(vec, tolerance)));
    });
  }
  makeCompound(shapes) {
    return wrap("makeCompound", () => {
      return this.#withU32(shapes, (vec) => handle(this.#raw.makeCompound(vec)));
    });
  }
  buildTriFace(a, b, c) {
    return wrap("buildTriFace", () => handle(this.#raw.buildTriFace(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)));
  }
  makeFaceOnSurface(face, wire) {
    return wrap("makeFaceOnSurface", () => handle(this.#raw.makeFaceOnSurface(face, wire)));
  }
  makeNullShape() {
    return wrap("makeNullShape", () => handle(this.#raw.makeNullShape()));
  }
  // =======================================================================
  // Transforms
  // =======================================================================
  translate(shape, dx, dy, dz) {
    return wrap("translate", () => handle(this.#raw.translate(shape, dx, dy, dz)));
  }
  /**
   * Translate along X so the chosen bounding-box anchor lands at `target`.
   * Returns a new shape; the input is left untouched.
   */
  alignX(shape, target = 0, anchor = "center") {
    return wrap("alignX", () => {
      const bb = this.getBoundingBox(shape);
      const cur = anchor === "min" ? bb.xmin : anchor === "max" ? bb.xmax : (bb.xmin + bb.xmax) / 2;
      return handle(this.#raw.translate(shape, target - cur, 0, 0));
    });
  }
  /** Translate along Y so the chosen bounding-box anchor lands at `target`. */
  alignY(shape, target = 0, anchor = "center") {
    return wrap("alignY", () => {
      const bb = this.getBoundingBox(shape);
      const cur = anchor === "min" ? bb.ymin : anchor === "max" ? bb.ymax : (bb.ymin + bb.ymax) / 2;
      return handle(this.#raw.translate(shape, 0, target - cur, 0));
    });
  }
  /** Translate along Z so the chosen bounding-box anchor lands at `target`. */
  alignZ(shape, target = 0, anchor = "center") {
    return wrap("alignZ", () => {
      const bb = this.getBoundingBox(shape);
      const cur = anchor === "min" ? bb.zmin : anchor === "max" ? bb.zmax : (bb.zmin + bb.zmax) / 2;
      return handle(this.#raw.translate(shape, 0, 0, target - cur));
    });
  }
  rotate(shape, axis, angleRad) {
    return wrap("rotate", () => handle(this.#raw.rotate(shape, axis.point.x, axis.point.y, axis.point.z, axis.direction.x, axis.direction.y, axis.direction.z, angleRad)));
  }
  scale(shape, center, factor) {
    return wrap("scale", () => handle(this.#raw.scale(shape, center.x, center.y, center.z, factor)));
  }
  mirror(shape, point, normal) {
    return wrap("mirror", () => handle(this.#raw.mirror(shape, point.x, point.y, point.z, normal.x, normal.y, normal.z)));
  }
  copy(shape) {
    return wrap("copy", () => handle(this.#raw.copy(shape)));
  }
  /** Apply a 3x4 row-major affine transformation matrix (12 doubles: [r00,r01,r02,tx, r10,r11,r12,ty, r20,r21,r22,tz]). */
  transform(shape, matrix) {
    return wrap("transform", () => {
      return this.#withF64(matrix, (vec) => handle(this.#raw.transform(shape, vec)));
    });
  }
  /**
   * Re-tag a shape with a `TopLoc_Location` from a 3x4 row-major affine matrix
   * (same 12-double layout as {@link transform}). Shares the underlying topology
   * instead of deep-copying it, so a pure move is O(1).
   */
  located(shape, matrix) {
    return wrap("located", () => {
      return this.#withF64(matrix, (vec) => handle(this.#raw.located(shape, vec)));
    });
  }
  /** Apply a general (possibly non-affine) 3x4 row-major transformation matrix (12 doubles). */
  generalTransform(shape, matrix) {
    return wrap("generalTransform", () => {
      return this.#withF64(matrix, (vec) => handle(this.#raw.generalTransform(shape, vec)));
    });
  }
  linearPattern(shape, direction, spacing, count) {
    return wrap("linearPattern", () => handle(this.#raw.linearPattern(shape, direction.x, direction.y, direction.z, spacing, count)));
  }
  circularPattern(shape, center, axis, angle, count) {
    return wrap("circularPattern", () => handle(this.#raw.circularPattern(shape, center.x, center.y, center.z, axis.x, axis.y, axis.z, angle, count)));
  }
  /** Compose two 3x4 row-major transformation matrices. Returns a 12-element array. */
  composeTransform(m1, m2) {
    return wrap("composeTransform", () => this.#withF64(m1, (v1) => this.#withF64(m2, (v2) => this.#drainVector(this.#raw.composeTransform(v1, v2), Float64Array))));
  }
  // =======================================================================
  // Batch Operations
  // =======================================================================
  /** Translate multiple shapes by their respective offsets in a single WASM call. */
  translateBatch(shapes, offsets) {
    return wrap("translateBatch", () => this.#withU32(shapes, (ids) => this.#withF64(offsets, (off) => this.#vecToHandles(this.#raw.translateBatch(ids, off)))));
  }
  /**
   * Fuse, cut or intersect any number of arguments with any number of tools in
   * one boolean, with OCCT's glue, fuzzy and simplification options and face
   * history for the hashes given. With no options this matches `fuseAll` /
   * `cutAll` and the two-shape booleans.
   * @throws OcctError
   */
  booleanOp(op, args, tools, options = {}) {
    const { glue = BooleanGlue.Off, fuzzyValue = 0, simplifyAngularTolerance = 0, inputFaceHashes = [], hashUpperBound = 0 } = options;
    return wrap("booleanOp", () => this.#withU32(args, (argIds) => this.#withU32(tools, (toolIds) => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.booleanOp(op, argIds, toolIds, glue, fuzzyValue, simplifyAngularTolerance, hashes, hashUpperBound))))));
  }
  /** Chain boolean operations in a single WASM call. */
  booleanPipeline(base, opCodes, tools) {
    return wrap("booleanPipeline", () => this.#withI32(opCodes, (ops) => this.#withU32(tools, (ids) => handle(this.#raw.booleanPipeline(base, ops, ids)))));
  }
  /** Query multiple shapes in a single WASM call: bbox, volume, area, center of mass, type, validity. */
  queryBatch(shapes) {
    return wrap("queryBatch", () => this.#withU32(shapes, (ids) => {
      const arr = this.#drainVector(this.#raw.queryBatch(ids), Float64Array);
      const STRIDE = 14;
      const results = [];
      for (let i = 0; i < shapes.length; i++) {
        const o = i * STRIDE;
        results.push({
          volume: arr[o],
          area: arr[o + 1],
          bbox: { xmin: arr[o + 2], ymin: arr[o + 3], zmin: arr[o + 4], xmax: arr[o + 5], ymax: arr[o + 6], zmax: arr[o + 7] },
          centerOfMass: { x: arr[o + 8], y: arr[o + 9], z: arr[o + 10] },
          shapeType: SHAPE_TYPES[arr[o + 11]] ?? "shape",
          isValid: arr[o + 12] === 1
        });
      }
      return results;
    }));
  }
  /** Fillet multiple solids in a single WASM call. */
  filletBatch(ops) {
    return wrap("filletBatch", () => this.#withU32(ops.map((op) => op.solid), (solids) => this.#withI32(ops.map((op) => op.edges.length), (edgeCounts) => this.#withU32(ops.flatMap((op) => op.edges), (flatEdges) => this.#withF64(ops.map((op) => op.radius), (radii) => this.#vecToHandles(this.#raw.filletBatch(solids, edgeCounts, flatEdges, radii)))))));
  }
  /** Apply 3x4 affine transforms to multiple shapes in a single WASM call. */
  transformBatch(shapes, matrices) {
    return wrap("transformBatch", () => this.#withU32(shapes, (ids) => this.#withF64(matrices, (mats) => this.#vecToHandles(this.#raw.transformBatch(ids, mats)))));
  }
  /** Rotate multiple shapes in a single WASM call. */
  rotateBatch(shapes, params) {
    return wrap("rotateBatch", () => this.#withU32(shapes, (ids) => this.#withF64(params, (p) => this.#vecToHandles(this.#raw.rotateBatch(ids, p)))));
  }
  /** Scale multiple shapes in a single WASM call. */
  scaleBatch(shapes, params) {
    return wrap("scaleBatch", () => this.#withU32(shapes, (ids) => this.#withF64(params, (p) => this.#vecToHandles(this.#raw.scaleBatch(ids, p)))));
  }
  /** Mirror multiple shapes in a single WASM call. */
  mirrorBatch(shapes, params) {
    return wrap("mirrorBatch", () => this.#withU32(shapes, (ids) => this.#withF64(params, (p) => this.#vecToHandles(this.#raw.mirrorBatch(ids, p)))));
  }
  // =======================================================================
  // Topology
  // =======================================================================
  getShapeType(shape) {
    return wrap("getShapeType", () => asEnum(this.#raw.getShapeType(shape), SHAPE_TYPE_VALUES, "shape type"));
  }
  /** True if the shape is a compound. */
  isCompound(shape) {
    return this.getShapeType(shape) === "compound";
  }
  /** True if the shape is a comp-solid. */
  isCompSolid(shape) {
    return this.getShapeType(shape) === "compsolid";
  }
  /** True if the shape is a solid. */
  isSolid(shape) {
    return this.getShapeType(shape) === "solid";
  }
  /** True if the shape is a shell. */
  isShell(shape) {
    return this.getShapeType(shape) === "shell";
  }
  /** True if the shape is a face. */
  isFace(shape) {
    return this.getShapeType(shape) === "face";
  }
  /** True if the shape is a wire. */
  isWire(shape) {
    return this.getShapeType(shape) === "wire";
  }
  /** True if the shape is an edge. */
  isEdge(shape) {
    return this.getShapeType(shape) === "edge";
  }
  /** True if the shape is a vertex. */
  isVertex(shape) {
    return this.getShapeType(shape) === "vertex";
  }
  getSubShapes(shape, type) {
    return wrap("getSubShapes", () => this.#vecToHandles(this.#raw.getSubShapes(shape, type)));
  }
  /** Count sub-shapes of a type without materialising a handle per sub-shape. */
  subShapeCount(shape, type) {
    return wrap("subShapeCount", () => this.#raw.subShapeCount(shape, type));
  }
  /**
   * Deduplicated hashes of a shape's sub-shapes, with no per-sub-shape handle
   * allocation. Use for hash-only paths (face-hash collection, tagging) that
   * would otherwise iterate {@link getSubShapes} handles just to release them.
   */
  subShapeHashes(shape, type, hashUpperBound) {
    return wrap("subShapeHashes", () => this.#drainVector(this.#raw.subShapeHashes(shape, type, hashUpperBound), Int32Array));
  }
  downcast(shape, targetType) {
    return wrap("downcast", () => handle(this.#raw.downcast(shape, targetType)));
  }
  distanceBetween(a, b) {
    return wrap("distanceBetween", () => this.#raw.distanceBetween(a, b));
  }
  isSame(a, b) {
    return wrap("isSame", () => this.#raw.isSame(a, b));
  }
  isEqual(a, b) {
    return wrap("isEqual", () => this.#raw.isEqual(a, b));
  }
  isNull(shape) {
    return wrap("isNull", () => this.#raw.isNull(shape));
  }
  hashCode(shape, upperBound) {
    return wrap("hashCode", () => this.#raw.hashCode(shape, upperBound));
  }
  shapeOrientation(shape) {
    return wrap("shapeOrientation", () => asEnum(this.#raw.shapeOrientation(shape), SHAPE_ORIENTATION_VALUES, "shape orientation"));
  }
  sharedEdges(faceA, faceB) {
    return wrap("sharedEdges", () => this.#vecToHandles(this.#raw.sharedEdges(faceA, faceB)));
  }
  adjacentFaces(shape, face) {
    return wrap("adjacentFaces", () => this.#vecToHandles(this.#raw.adjacentFaces(shape, face)));
  }
  iterShapes(shape) {
    return wrap("iterShapes", () => this.#vecToHandles(this.#raw.iterShapes(shape)));
  }
  /** Returns a flat array mapping edge hashes to face hashes. */
  edgeToFaceMap(shape, hashUpperBound) {
    return wrap("edgeToFaceMap", () => {
      const vec = this.#raw.edgeToFaceMap(shape, hashUpperBound);
      return this.#drainVector(vec, Int32Array);
    });
  }
  // =======================================================================
  // Tessellation
  // =======================================================================
  /** Tessellate a shape into a triangle mesh. Returns copied data (safe to keep). */
  tessellate(shape, options) {
    return wrap("tessellate", () => {
      const linDefl = options?.linearDeflection ?? 0.1;
      const angDefl = options?.angularDeflection ?? 0.5;
      const raw = options?.relative ? this.#raw.tessellateRelative(shape, linDefl, angDefl) : this.#raw.tessellate(shape, linDefl, angDefl);
      return this.#extractMesh(raw);
    });
  }
  /**
   * Sample edges as polylines for wireframe rendering.
   *
   * Degenerate edges (sphere poles, cone apexes) are skipped. Pass a number
   * for the chord deflection, or a `WireframeOptions` to source the points
   * from the stored mesh polygons instead (see `WireframeSource`).
   */
  wireframe(shape, options = 0.1) {
    return wrap("wireframe", () => {
      const opts = typeof options === "number" ? { deflection: options } : options;
      const deflection = opts.deflection ?? 0.1;
      const source = opts.source === "triangulation" ? 1 : 0;
      const raw = this.#raw.wireframe(shape, deflection, source);
      try {
        const points = new Float32Array(this.#module.HEAPF32.buffer.slice(raw.getPointsPtr(), raw.getPointsPtr() + raw.pointCount * 4));
        const edgeCount = raw.edgeGroupCount / 3;
        const edgeGroups = new Int32Array(this.#module.HEAP32.buffer.slice(raw.getEdgeGroupsPtr(), raw.getEdgeGroupsPtr() + raw.edgeGroupCount * 4));
        return { points, edgeGroups, pointCount: raw.pointCount, edgeCount };
      } finally {
        raw.delete();
      }
    });
  }
  hasTriangulation(shape) {
    return wrap("hasTriangulation", () => this.#raw.hasTriangulation(shape));
  }
  /** Tessellate with face group data (per-face triangle ranges + hashes). */
  meshShape(shape, options) {
    return wrap("meshShape", () => {
      const linDefl = options?.linearDeflection ?? 0.1;
      const angDefl = options?.angularDeflection ?? 0.5;
      return this.#extractMeshWithFaceGroups(this.#raw.meshShape(shape, linDefl, angDefl));
    });
  }
  /** Tessellate multiple shapes in a single WASM call. */
  meshBatch(shapes, options) {
    return wrap("meshBatch", () => this.#withU32(shapes, (ids) => {
      const linDefl = options?.linearDeflection ?? 0.1;
      const angDefl = options?.angularDeflection ?? 0.5;
      const raw = this.#raw.meshBatch(ids, linDefl, angDefl);
      try {
        const positions = new Float32Array(this.#module.HEAPF32.buffer.slice(raw.getPositionsPtr(), raw.getPositionsPtr() + raw.positionCount * 4));
        const normals = new Float32Array(this.#module.HEAPF32.buffer.slice(raw.getNormalsPtr(), raw.getNormalsPtr() + raw.normalCount * 4));
        const indices = new Uint32Array(this.#module.HEAPU32.buffer.slice(raw.getIndicesPtr(), raw.getIndicesPtr() + raw.indexCount * 4));
        const shapeOffsets = new Int32Array(this.#module.HEAP32.buffer.slice(raw.getShapeOffsetsPtr(), raw.getShapeOffsetsPtr() + raw.shapeCount * 4 * 4));
        return {
          positions,
          normals,
          indices,
          shapeOffsets,
          shapeCount: raw.shapeCount,
          vertexCount: raw.positionCount / 3,
          triangleCount: raw.indexCount / 3
        };
      } finally {
        raw.delete();
      }
    }));
  }
  // =======================================================================
  // I/O
  // =======================================================================
  importStep(data) {
    return wrap("importStep", () => {
      const str = typeof data === "string" ? data : new TextDecoder().decode(data);
      return handle(this.#raw.importStep(str));
    });
  }
  /**
   * Export a shape as STEP text.
   *
   * @param options - `unit` picks the length unit the file is written in
   *     (default millimeters); the geometry is scaled to match. `schema`
   *     picks the application protocol (default AP214).
   */
  exportStep(shape, options) {
    const unit = options?.unit;
    const schema = options?.schema;
    return wrap("exportStep", () => unit === void 0 && schema === void 0 ? this.#raw.exportStep(shape) : this.#raw.exportStepWithOptions(shape, unit ?? "", schema ?? ""));
  }
  /**
   * Import an STL mesh. A string is ASCII STL; bytes may be binary or ASCII
   * STL and are passed through untouched (no text decoding).
   */
  importStl(data) {
    return wrap("importStl", () => {
      if (typeof data === "string")
        return handle(this.#raw.importStl(data));
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      return handle(this.#raw.importStlBinary(bytes));
    });
  }
  exportStl(shape, linearDeflection = 0.1, ascii = false) {
    return wrap("exportStl", () => ascii ? this.#raw.exportStl(shape, linearDeflection, true) : this.#raw.exportStlBinary(shape, linearDeflection));
  }
  toBREP(shape) {
    return wrap("toBREP", () => this.#raw.toBREP(shape));
  }
  fromBREP(data) {
    return wrap("fromBREP", () => handle(this.#raw.fromBREP(data)));
  }
  /** Serialize a shape to binary BREP (smaller/faster than the text format). */
  toBREPBinary(shape) {
    return wrap("toBREPBinary", () => this.#raw.toBREPBinary(shape));
  }
  /** Load a shape from binary BREP produced by {@link toBREPBinary}. */
  fromBREPBinary(data) {
    return wrap("fromBREPBinary", () => handle(this.#raw.fromBREPBinary(data)));
  }
  cacheStep(stepData) {
    return wrap("cacheStep", () => {
      const shape = this.importStep(stepData);
      try {
        return this.toBREP(shape);
      } finally {
        this.release(shape);
      }
    });
  }
  loadCached(brep) {
    return wrap("loadCached", () => this.fromBREP(brep));
  }
  getBoundingBox(shape, options = {}) {
    const { precise = true, useTriangulation = false } = typeof options === "boolean" ? { useTriangulation: options } : options;
    return wrap("getBoundingBox", () => precise ? this.#raw.getBoundingBox(shape, useTriangulation) : this.#raw.getBoundingBoxLoose(shape, useTriangulation));
  }
  /**
   * Volume of a solid (or the signed volume a closed shell encloses).
   *
   * Planar and other elementary faces are integrated exactly; BSpline,
   * Bezier, swept and offset faces, and faces trimmed by BSpline curves,
   * adaptively to a relative error near 1e-7. {@link OcctKernel.getSurfaceArea},
   * {@link OcctKernel.getCenterOfMass} and {@link OcctKernel.getInertia}
   * integrate the same way.
   */
  getVolume(shape) {
    return wrap("getVolume", () => this.#raw.getVolume(shape));
  }
  getSurfaceArea(shape) {
    return wrap("getSurfaceArea", () => this.#raw.getSurfaceArea(shape));
  }
  getLength(shape) {
    return wrap("getLength", () => this.#raw.getLength(shape));
  }
  getCenterOfMass(shape) {
    return wrap("getCenterOfMass", () => {
      const v2 = this.#raw.getCenterOfMass(shape);
      return this.#vec3FromEmbind(v2);
    });
  }
  /**
   * Matrix of inertia about the center of mass, as a row-major 3×3 array
   * (length 9). Symmetric: `[1]==[3]`, `[2]==[6]`, `[5]==[7]`.
   */
  getInertia(shape) {
    return wrap("getInertia", () => Array.from(this.#drainVector(this.#raw.getInertia(shape), Float64Array)));
  }
  /** True if `point` lies inside (or on the boundary of) a solid. */
  containsPoint(shape, point, tolerance = 1e-7) {
    return wrap("containsPoint", () => this.#raw.containsPoint(shape, point.x, point.y, point.z, tolerance));
  }
  /**
   * Surface (area-weighted) center of mass for a face. Equivalent to
   * `BRepGProp::SurfaceProperties(face, props).CentreOfMass()`.
   *
   * Use this for face fingerprinting and finder predicates rather than a
   * tessellation-based centroid — for non-planar faces (cylinders, holed
   * planes) the two diverge.
   */
  getSurfaceCenterOfMass(face) {
    return wrap("getSurfaceCenterOfMass", () => {
      const v2 = this.#raw.getSurfaceCenterOfMass(face);
      return this.#vec3FromEmbind(v2);
    });
  }
  getLinearCenterOfMass(shape) {
    return wrap("getLinearCenterOfMass", () => {
      const v2 = this.#raw.getLinearCenterOfMass(shape);
      return this.#vec3FromEmbind(v2);
    });
  }
  surfaceCurvature(face, u, v2) {
    return wrap("surfaceCurvature", () => this.#curvatureDataFromEmbind(this.#raw.surfaceCurvature(face, u, v2)));
  }
  // =======================================================================
  // Surfaces
  // =======================================================================
  vertexPosition(vertex) {
    return wrap("vertexPosition", () => {
      const v2 = this.#raw.vertexPosition(vertex);
      return this.#vec3FromEmbind(v2);
    });
  }
  surfaceType(face) {
    return wrap("surfaceType", () => this.#raw.surfaceType(face));
  }
  /** Read the exact parameters of a face's surface. See {@link SurfaceData}. */
  surfaceData(face) {
    return wrap("surfaceData", () => {
      const raw = this.#raw.surfaceData(face);
      try {
        const p = this.#drainVector(raw.params, Float64Array);
        const vec3 = (i) => ({ x: p[i], y: p[i + 1], z: p[i + 2] });
        const frame = {
          location: vec3(0),
          axis: vec3(3),
          xDirection: vec3(6),
          isDirect: raw.isDirect
        };
        const bspline = raw.hasBSpline ? this.#extractNurbsSurface(raw.bspline) : void 0;
        switch (raw.kind) {
          case "plane": {
            const { axis: normal, ...rest } = frame;
            return { kind: "plane", normal, ...rest };
          }
          case "cylinder":
            return { kind: "cylinder", ...frame, radius: p[9] };
          case "cone":
            return { kind: "cone", ...frame, refRadius: p[9], semiAngle: p[10] };
          case "sphere":
            return { kind: "sphere", ...frame, radius: p[9] };
          case "torus":
            return { kind: "torus", ...frame, majorRadius: p[9], minorRadius: p[10] };
          case "bspline":
            return { kind: "bspline", bspline };
          default:
            return {
              kind: raw.kind,
              ...bspline === void 0 ? {} : { bspline }
            };
        }
      } finally {
        raw.delete();
      }
    });
  }
  surfaceNormal(face, u, v2) {
    return wrap("surfaceNormal", () => {
      const vec = this.#raw.surfaceNormal(face, u, v2);
      return this.#vec3FromEmbind(vec);
    });
  }
  pointOnSurface(face, u, v2) {
    return wrap("pointOnSurface", () => {
      const vec = this.#raw.pointOnSurface(face, u, v2);
      return this.#vec3FromEmbind(vec);
    });
  }
  outerWire(face) {
    return wrap("outerWire", () => handle(this.#raw.outerWire(face)));
  }
  /**
   * Reverse a surface's U parametric direction (OCCT `Geom_Surface::UReverse`),
   * returning a new face proxy whose surface is the U-reversed original.
   * `pointOnSurface(result, u, v)` then evaluates the original surface at
   * `origSurface.UReversedParameter(u)` — for a full-period cylinder that is
   * `uFirst + uLast - u`.
   */
  reverseSurfaceU(face) {
    return wrap("reverseSurfaceU", () => handle(this.#raw.reverseSurfaceU(face)));
  }
  uvBounds(face) {
    return wrap("uvBounds", () => this.#uvBoundsFromEmbind(this.#raw.uvBounds(face)));
  }
  /** Project a 3D point onto a face, returning [u, v]. */
  uvFromPoint(face, point) {
    return wrap("uvFromPoint", () => this.#vec2FromEmbind(this.#raw.uvFromPoint(face, point.x, point.y, point.z)));
  }
  /**
   * Extract cylinder data from a cylindrical face.
   *
   * Returns `null` when the face's underlying surface is not a cylinder,
   * otherwise `{ radius, isDirect }` where `isDirect` mirrors
   * `gp_Cylinder::Direct()` (i.e. whether U and V form a right-handed pair).
   */
  getFaceCylinderData(face) {
    return wrap("getFaceCylinderData", () => {
      const vec = this.#raw.getFaceCylinderData(face);
      try {
        if (vec.size() === 0)
          return null;
        return { radius: vec.get(0), isDirect: vec.get(1) !== 0 };
      } finally {
        vec.delete();
      }
    });
  }
  /** Project a 3D point onto a face, returning the closest point as Vec3. */
  projectPointOnFace(face, point) {
    return wrap("projectPointOnFace", () => {
      const vec = this.#raw.projectPointOnFace(face, point.x, point.y, point.z);
      return this.#vec3FromEmbind(vec);
    });
  }
  /** Classify a UV point relative to a face boundary. */
  classifyPointOnFace(face, u, v2) {
    return wrap("classifyPointOnFace", () => asEnum(this.#raw.classifyPointOnFace(face, u, v2), POINT_CLASSIFICATION_VALUES, "point classification"));
  }
  /** Create a BSpline surface from a grid of control points. */
  bsplineSurface(controlPoints, rows, cols) {
    return wrap("bsplineSurface", () => {
      const flat = this.#flattenPoints(controlPoints);
      try {
        return handle(this.#raw.bsplineSurface(flat, rows, cols));
      } finally {
        flat.delete();
      }
    });
  }
  /**
   * A face over a whole B-spline surface given exactly by its poles and
   * knots (rational when `weights` is given), where {@link bsplineSurface}
   * approximates a grid of points. `poles[i][j]` is the `i`-th pole along u
   * and the `j`-th along v.
   */
  nurbsSurface(data) {
    return wrap("nurbsSurface", () => {
      const nbU = data.poles.length;
      const nbV = data.poles[0]?.length ?? 0;
      if (data.poles.some((row) => row.length !== nbV)) {
        throw new Error("every row of poles must have the same length");
      }
      if (data.weights !== void 0 && (data.weights.length !== nbU || data.weights.some((row) => row.length !== nbV))) {
        throw new Error("weights must have one row per row of poles, each as long");
      }
      const layout = [
        data.degreeU,
        data.degreeV,
        nbU,
        nbV,
        data.periodicU ? 1 : 0,
        data.periodicV ? 1 : 0
      ];
      const poles = this.#flattenPoints(data.poles.flat());
      try {
        return this.#withF64(data.weights?.flat() ?? [], (weights) => this.#withF64(data.knotsU, (knotsU) => this.#withF64(data.knotsV, (knotsV) => this.#withI32(data.multiplicitiesU, (multsU) => this.#withI32(data.multiplicitiesV, (multsV) => this.#withI32(layout, (layoutVec) => handle(this.#raw.nurbsSurface(poles, weights, knotsU, knotsV, multsU, multsV, layoutVec))))))));
      } finally {
        poles.delete();
      }
    });
  }
  // =======================================================================
  // Curves
  // =======================================================================
  curveType(edge) {
    return wrap("curveType", () => this.#raw.curveType(edge));
  }
  curvePointAtParam(edge, param) {
    return wrap("curvePointAtParam", () => {
      const vec = this.#raw.curvePointAtParam(edge, param);
      return this.#vec3FromEmbind(vec);
    });
  }
  curveTangent(edge, param) {
    return wrap("curveTangent", () => {
      const vec = this.#raw.curveTangent(edge, param);
      return this.#vec3FromEmbind(vec);
    });
  }
  /** Returns [firstParam, lastParam]. */
  curveParameters(edge) {
    return wrap("curveParameters", () => {
      const { u: first, v: last } = this.#vec2FromEmbind(this.#raw.curveParameters(edge));
      return { first, last };
    });
  }
  curveIsClosed(edge) {
    return wrap("curveIsClosed", () => this.#raw.curveIsClosed(edge));
  }
  curveIsPeriodic(edge) {
    return wrap("curveIsPeriodic", () => this.#raw.curveIsPeriodic(edge));
  }
  curveLength(edge) {
    return wrap("curveLength", () => this.#raw.curveLength(edge));
  }
  interpolatePoints(points, periodic = false) {
    return wrap("interpolatePoints", () => {
      const flat = this.#flattenPoints(points);
      try {
        return handle(this.#raw.interpolatePoints(flat, periodic));
      } finally {
        flat.delete();
      }
    });
  }
  /**
   * Interpolate a cubic B-spline through the points with clamped start/end
   * tangent directions.
   */
  interpolatePointsWithTangents(points, startTangent, endTangent) {
    return wrap("interpolatePointsWithTangents", () => {
      const flat = this.#flattenPoints(points);
      try {
        return handle(this.#raw.interpolatePointsWithTangents(flat, startTangent.x, startTangent.y, startTangent.z, endTangent.x, endTangent.y, endTangent.z));
      } finally {
        flat.delete();
      }
    });
  }
  /** Closest point on an edge to `point`, with the curve tangent and parameter there. */
  projectPointOnEdge(edge, point) {
    return wrap("projectPointOnEdge", () => {
      const r = this.#drainVector(this.#raw.projectPointOnEdge(edge, point.x, point.y, point.z), Float64Array);
      return {
        point: { x: r[0], y: r[1], z: r[2] },
        tangent: { x: r[3], y: r[4], z: r[5] },
        parameter: r[6]
      };
    });
  }
  approximatePoints(points, tolerance = 1e-3) {
    return wrap("approximatePoints", () => {
      const flat = this.#flattenPoints(points);
      try {
        return handle(this.#raw.approximatePoints(flat, tolerance));
      } finally {
        flat.delete();
      }
    });
  }
  getNurbsCurveData(edge) {
    return wrap("getNurbsCurveData", () => this.#extractNurbsCurve(this.#raw.getNurbsCurveData(edge)));
  }
  /** Read the exact parameters of an edge's curve. See {@link CurveData}. */
  curveData(edge) {
    return wrap("curveData", () => {
      const raw = this.#raw.curveData(edge);
      try {
        const range = { first: raw.first, last: raw.last };
        const p = this.#drainVector(raw.params, Float64Array);
        const vec3 = (i) => ({ x: p[i], y: p[i + 1], z: p[i + 2] });
        const bspline = raw.hasBSpline ? this.#extractNurbsCurve(raw.bspline) : void 0;
        switch (raw.kind) {
          case "line":
            return { kind: "line", ...range, point: vec3(0), direction: vec3(3) };
          case "circle":
            return { kind: "circle", ...range, center: vec3(0), axis: vec3(3), xDirection: vec3(6), radius: p[9] };
          case "ellipse":
          case "hyperbola":
            return {
              kind: raw.kind,
              ...range,
              center: vec3(0),
              axis: vec3(3),
              majorDirection: vec3(6),
              majorRadius: p[9],
              minorRadius: p[10]
            };
          case "parabola":
            return { kind: "parabola", ...range, vertex: vec3(0), axis: vec3(3), xDirection: vec3(6), focal: p[9] };
          case "bspline":
            return { kind: "bspline", ...range, bspline };
          default:
            return {
              kind: raw.kind,
              ...range,
              ...bspline === void 0 ? {} : { bspline }
            };
        }
      } finally {
        raw.delete();
      }
    });
  }
  curveDegreeElevate(edge, elevateBy) {
    return wrap("curveDegreeElevate", () => handle(this.#raw.curveDegreeElevate(edge, elevateBy)));
  }
  curveKnotInsert(edge, knot, times) {
    return wrap("curveKnotInsert", () => handle(this.#raw.curveKnotInsert(edge, knot, times)));
  }
  curveKnotRemove(edge, knot, tolerance) {
    return wrap("curveKnotRemove", () => handle(this.#raw.curveKnotRemove(edge, knot, tolerance)));
  }
  curveSplit(edge, param) {
    return wrap("curveSplit", () => {
      const parts = this.#vecToHandles(this.#raw.curveSplit(edge, param));
      if (parts.length !== 2) {
        throw new Error(`curveSplit: expected 2 edges, got ${parts.length}`);
      }
      return [parts[0], parts[1]];
    });
  }
  liftCurve2dToPlane(points2d, planeOrigin, planeZ, planeX) {
    return wrap("liftCurve2dToPlane", () => {
      const flatArr = new Array(points2d.length * 2);
      let j = 0;
      for (const p of points2d) {
        flatArr[j++] = p.x;
        flatArr[j++] = p.y;
      }
      return this.#withF64(flatArr, (flat) => handle(this.#raw.liftCurve2dToPlane(flat, planeOrigin.x, planeOrigin.y, planeOrigin.z, planeZ.x, planeZ.y, planeZ.z, planeX.x, planeX.y, planeX.z)));
    });
  }
  // =======================================================================
  // Projection (HLR)
  // =======================================================================
  /**
   * Hidden-line removal (HLRBRep) of `shape` as seen by a camera on the
   * `viewDirection` side of `viewOrigin`: `viewDirection` is the view-plane
   * normal pointing from the scene toward the viewer, `xAxis` is screen-right
   * (OCCT picks one when omitted). The returned edges lie in that plane, with
   * x along `xAxis`, y along `viewDirection × xAxis` and z = 0. Edges the
   * shape occludes from that camera land in the `hidden*` compounds.
   * @throws OcctError */
  projectEdges(shape, viewOrigin, viewDirection, xAxis) {
    return wrap("projectEdges", () => {
      const hasXAxis = xAxis !== void 0;
      const xx = xAxis?.x ?? 0;
      const xy = xAxis?.y ?? 0;
      const xz = xAxis?.z ?? 0;
      const raw = this.#raw.projectEdges(shape, viewOrigin.x, viewOrigin.y, viewOrigin.z, viewDirection.x, viewDirection.y, viewDirection.z, xx, xy, xz, hasXAxis);
      return {
        visibleOutline: handle(raw.visibleOutline),
        visibleSmooth: handle(raw.visibleSmooth),
        visibleSharp: handle(raw.visibleSharp),
        hiddenOutline: handle(raw.hiddenOutline),
        hiddenSmooth: handle(raw.hiddenSmooth),
        hiddenSharp: handle(raw.hiddenSharp)
      };
    });
  }
  /**
   * Render a single named view of a shape to a standalone SVG string via
   * hidden-line removal. Visible edges are solid, hidden edges dashed.
   */
  toSVG(shape, view = "front", options = {}) {
    return wrap("toSVG", () => renderShapeSVG(this, shape, view, options));
  }
  /**
   * Render a multiview grid (default Front / Top / Right / Iso) of a shape to
   * a single SVG string, with per-view gnomons and an overall size annotation.
   * Aimed at giving an automated agent a readable picture of the geometry.
   */
  toMultiviewSVG(shape, options = {}) {
    return wrap("toMultiviewSVG", () => renderMultiviewSVG(this, shape, options));
  }
  /**
   * The same drawing as {@link toSVG}, rasterised to PNG bytes. Async
   * because the encoder compresses through the platform's
   * CompressionStream.
   */
  toPNG(shape, view = "front", options = {}) {
    return wrapAsync("toPNG", () => renderShapePNG(this, shape, view, options));
  }
  /**
   * The same drawing as {@link toMultiviewSVG}, rasterised to PNG bytes.
   * For consumers that cannot render SVG -- image viewers, READMEs, and
   * vision models that take raster input only.
   */
  toMultiviewPNG(shape, options = {}) {
    return wrapAsync("toMultiviewPNG", () => renderMultiviewPNG(this, shape, options));
  }
  // =======================================================================
  // Modifiers
  // =======================================================================
  /**
   * Thicken a face/shell into a solid (or grow a solid uniformly).
   *
   * @param tolerance - OCCT precision for the offset reconstruction. Use
   *     `1e-6` for precise thickening (matches brepjs default); `1e-3` is a
   *     coarser legacy value.
   */
  thicken(shape, thickness, tolerance) {
    return wrap("thicken", () => handle(this.#raw.thicken(shape, thickness, tolerance)));
  }
  /**
   * Remove complete features such as holes, bosses, chamfers, or fillets and
   * heal the surrounding faces. Arbitrary isolated faces are not guaranteed
   * to be removable.
   *
   * @param tolerance - Additional fuzzy tolerance used while reconstructing
   *     the surrounding geometry. Pass `0` to use OCCT's defaults.
   */
  defeature(shape, faces, tolerance) {
    return wrap("defeature", () => {
      return this.#withU32(faces, (vec) => handle(this.#raw.defeature(shape, vec, tolerance)));
    });
  }
  reverseShape(shape) {
    return wrap("reverseShape", () => handle(this.#raw.reverseShape(shape)));
  }
  simplify(shape) {
    return wrap("simplify", () => handle(this.#raw.simplify(shape)));
  }
  filletVariable(solid, edge, startRadius, endRadius) {
    return wrap("filletVariable", () => handle(this.#raw.filletVariable(solid, edge, startRadius, endRadius)));
  }
  /** Offset a 2D wire. */
  offsetWire2D(wire, offset, joinType = JoinType.Arc) {
    return wrap("offsetWire2D", () => handle(this.#raw.offsetWire2D(wire, offset, RAW_JOIN_CODE[joinType])));
  }
  // =======================================================================
  // Evolution (operations with shape history)
  // =======================================================================
  /** {@link OcctKernel.extrude}, reporting each profile edge's wall and the two caps. */
  extrudeWithHistory(shape, dx, dy, dz, inputFaceHashes, hashUpperBound) {
    return wrap("extrudeWithHistory", () => {
      return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.extrudeWithHistory(shape, dx, dy, dz, hashes, hashUpperBound)));
    });
  }
  /**
   * {@link OcctKernel.revolve}, reporting each profile edge's face and the two
   * caps. A full revolve has no caps.
   */
  revolveWithHistory(shape, axis, angleRad, inputFaceHashes, hashUpperBound) {
    return wrap("revolveWithHistory", () => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.revolveWithHistory(shape, axis.point.x, axis.point.y, axis.point.z, axis.direction.x, axis.direction.y, axis.direction.z, angleRad, hashes, hashUpperBound))));
  }
  /**
   * {@link OcctKernel.pipe}, reporting each profile edge's faces, the two caps
   * of a face profile on an open spine, and in `spineGenerated` the face for
   * each spine edge and profile edge.
   */
  pipeWithHistory(profile, spine, inputFaceHashes, hashUpperBound) {
    return wrap("pipeWithHistory", () => {
      return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.pipeWithHistory(profile, spine, hashes, hashUpperBound)));
    });
  }
  /**
   * {@link OcctKernel.sweepFull}, reporting each profile edge's faces, the two
   * caps, and in `spineGenerated` the faces for each spine edge and profile
   * edge. The options cover every other sweep too: mind that
   * {@link OcctKernel.sweepPipeShell} defaults to a round-corner transition,
   * where these default to {@link TransitionMode.Transformed}.
   */
  sweepWithHistory(profile, spine, inputFaceHashes, hashUpperBound, options = {}) {
    const up = options.up ?? { x: 0, y: 0, z: 1 };
    const law = options.law ?? SweepLaw.None;
    if (law !== SweepLaw.None && options.lawLength === void 0) {
      throw new Error("sweepWithHistory: lawLength is required when a law is set");
    }
    const packed = [
      options.mode ?? SweepMode.Fixed,
      up.x,
      up.y,
      up.z,
      options.curvilinearEquivalence ? 1 : 0,
      options.guideContact ?? SweepContact.None,
      options.transitionMode ?? TransitionMode.Transformed,
      options.withContact ? 1 : 0,
      options.withCorrection ? 1 : 0,
      options.tol3d ?? 0,
      options.boundTol ?? 0,
      options.tolAngular ?? 0,
      options.maxDegree ?? 0,
      options.maxSegments ?? 0,
      law,
      options.lawLength ?? 0,
      options.lawEndFactor ?? 1
    ];
    return wrap("sweepWithHistory", () => this.#withF64(packed, (packedVec) => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.sweepWithHistory(profile, spine, options.auxSpine ?? 0, options.support ?? 0, packedVec, hashes, hashUpperBound)))));
  }
  /**
   * {@link OcctKernel.loft}, reporting the faces of every section's edges and
   * the two caps. `vertices` starts or ends the loft at a point, as
   * {@link OcctKernel.loftWithVertices} does.
   */
  loftWithHistory(wires, isSolid, ruled, inputFaceHashes, hashUpperBound, vertices = {}) {
    return wrap("loftWithHistory", () => this.#withU32(wires, (wireVec) => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.loftWithHistory(wireVec, isSolid, ruled, vertices.start ?? 0, vertices.end ?? 0, hashes, hashUpperBound)))));
  }
  /** {@link OcctKernel.unifySameDomain}, reporting the merged face or edge each input became. */
  unifySameDomainWithHistory(shape, inputFaceHashes, hashUpperBound) {
    return wrap("unifySameDomainWithHistory", () => {
      return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.unifySameDomainWithHistory(shape, hashes, hashUpperBound)));
    });
  }
  /** {@link OcctKernel.transform}, reporting history as the other transforms do. */
  transformWithHistory(shape, matrix, inputFaceHashes, hashUpperBound) {
    return wrap("transformWithHistory", () => this.#withF64(matrix, (matrixVec) => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.transformWithHistory(shape, matrixVec, hashes, hashUpperBound)))));
  }
  translateWithHistory(shape, dx, dy, dz, inputFaceHashes, hashUpperBound) {
    return wrap("translateWithHistory", () => {
      return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.translateWithHistory(shape, dx, dy, dz, hashes, hashUpperBound)));
    });
  }
  fuseWithHistory(a, b, inputFaceHashes, hashUpperBound) {
    return wrap("fuseWithHistory", () => {
      return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.fuseWithHistory(a, b, hashes, hashUpperBound)));
    });
  }
  cutWithHistory(a, b, inputFaceHashes, hashUpperBound) {
    return wrap("cutWithHistory", () => {
      return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.cutWithHistory(a, b, hashes, hashUpperBound)));
    });
  }
  /** {@link OcctKernel.fillet} with face history. `radius` works as it does there. */
  filletWithHistory(solid, edges, radius, inputFaceHashes, hashUpperBound) {
    return wrap("filletWithHistory", () => this.#withU32(edges, (edgeVec) => this.#withI32(inputFaceHashes, (hashes) => {
      if (typeof radius === "number") {
        return this.#extractEvolution(this.#raw.filletWithHistory(solid, edgeVec, radius, hashes, hashUpperBound));
      }
      const { start, end } = filletRadiusArrays(edges.length, radius);
      return this.#withF64(start, (startVec) => this.#withF64(end, (endVec) => this.#extractEvolution(this.#raw.filletRadiiWithHistory(solid, edgeVec, startVec, endVec, hashes, hashUpperBound))));
    })));
  }
  rotateWithHistory(shape, axis, angleRad, inputFaceHashes, hashUpperBound) {
    return wrap("rotateWithHistory", () => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.rotateWithHistory(shape, axis.point.x, axis.point.y, axis.point.z, axis.direction.x, axis.direction.y, axis.direction.z, angleRad, hashes, hashUpperBound))));
  }
  mirrorWithHistory(shape, point, normal, inputFaceHashes, hashUpperBound) {
    return wrap("mirrorWithHistory", () => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.mirrorWithHistory(shape, point.x, point.y, point.z, normal.x, normal.y, normal.z, hashes, hashUpperBound))));
  }
  scaleWithHistory(shape, center, factor, inputFaceHashes, hashUpperBound) {
    return wrap("scaleWithHistory", () => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.scaleWithHistory(shape, center.x, center.y, center.z, factor, hashes, hashUpperBound))));
  }
  intersectWithHistory(a, b, inputFaceHashes, hashUpperBound) {
    return wrap("intersectWithHistory", () => {
      return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.intersectWithHistory(a, b, hashes, hashUpperBound)));
    });
  }
  /** {@link OcctKernel.chamfer} with face history. `distance` works as it does there. */
  chamferWithHistory(solid, edges, distance, inputFaceHashes, hashUpperBound) {
    return wrap("chamferWithHistory", () => this.#withU32(edges, (edgeVec) => this.#withI32(inputFaceHashes, (hashes) => {
      if (typeof distance === "number") {
        return this.#extractEvolution(this.#raw.chamferWithHistory(solid, edgeVec, distance, hashes, hashUpperBound));
      }
      const { distances1, distances2, faces } = chamferArrays(edges.length, distance);
      return this.#withF64(distances1, (d1) => this.#withF64(distances2, (d2) => this.#withU32(faces, (faceVec) => this.#extractEvolution(this.#raw.chamferDistancesWithHistory(solid, edgeVec, d1, d2, faceVec, hashes, hashUpperBound)))));
    })));
  }
  /**
   * {@link OcctKernel.chamferDistAngle} with face history. `distance`,
   * `angleDeg` and `referenceFaces` work as they do there.
   */
  chamferDistAngleWithHistory(solid, edges, distance, angleDeg, inputFaceHashes, hashUpperBound, referenceFaces) {
    return wrap("chamferDistAngleWithHistory", () => this.#withU32(edges, (edgeVec) => this.#withF64(perItem(edges.length, distance), (d) => this.#withF64(perItem(edges.length, angleDeg), (a) => this.#withU32(referenceFaces ? [...referenceFaces] : [], (faceVec) => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.chamferDistAnglesWithHistory(solid, edgeVec, d, a, faceVec, hashes, hashUpperBound))))))));
  }
  /** {@link OcctKernel.draft} with face history. */
  draftWithHistory(shape, faces, angleRad, direction, inputFaceHashes, hashUpperBound, neutralPlane = DEFAULT_NEUTRAL_PLANE) {
    return wrap("draftWithHistory", () => {
      const faceList = Array.isArray(faces) ? [...faces] : [faces];
      const { origin, normal } = neutralPlane;
      return this.#withU32(faceList, (faceVec) => this.#withF64(perItem(faceList.length, angleRad), (angleVec) => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.draftFacesWithHistory(shape, faceVec, angleVec, direction.x, direction.y, direction.z, origin.x, origin.y, origin.z, normal.x, normal.y, normal.z, hashes, hashUpperBound)))));
    });
  }
  /** {@link OcctKernel.shell} with face history. `joinType` behaves as it does there. */
  shellWithHistory(solid, faces, thickness, tolerance, inputFaceHashes, hashUpperBound, joinType = JoinType.Arc) {
    return wrap("shellWithHistory", () => this.#withU32(faces, (faceVec) => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(joinType === JoinType.Arc ? this.#raw.shellWithHistory(solid, faceVec, thickness, tolerance, hashes, hashUpperBound) : this.#raw.shellWithHistoryAndJoin(solid, faceVec, thickness, tolerance, hashes, hashUpperBound, RAW_JOIN_CODE[joinType])))));
  }
  /** {@link OcctKernel.offset} with face history. `joinType` behaves as it does there. */
  offsetWithHistory(solid, distance, tolerance, inputFaceHashes, hashUpperBound, joinType = JoinType.Arc) {
    return wrap("offsetWithHistory", () => {
      return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(joinType === JoinType.Arc ? this.#raw.offsetWithHistory(solid, distance, tolerance, hashes, hashUpperBound) : this.#raw.offsetWithHistoryAndJoin(solid, distance, tolerance, hashes, hashUpperBound, RAW_JOIN_CODE[joinType])));
    });
  }
  thickenWithHistory(shape, thickness, tolerance, inputFaceHashes, hashUpperBound) {
    return wrap("thickenWithHistory", () => {
      return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.thickenWithHistory(shape, thickness, tolerance, hashes, hashUpperBound)));
    });
  }
  // =======================================================================
  // Extrusion Law
  // =======================================================================
  buildExtrusionLaw(profile, length, endFactor) {
    return wrap("buildExtrusionLaw", () => handle(this.#raw.buildExtrusionLaw(profile, length, endFactor)));
  }
  trimLaw(law, first, last) {
    return wrap("trimLaw", () => handle(this.#raw.trimLaw(law, first, last)));
  }
  sweepWithLaw(profile, spine, law) {
    return wrap("sweepWithLaw", () => handle(this.#raw.sweepWithLaw(profile, spine, law)));
  }
  // =======================================================================
  // Healing / Repair
  // =======================================================================
  fixShape(shape) {
    return wrap("fixShape", () => handle(this.#raw.fixShape(shape)));
  }
  unifySameDomain(shape) {
    return wrap("unifySameDomain", () => handle(this.#raw.unifySameDomain(shape)));
  }
  isValid(shape) {
    return wrap("isValid", () => this.#raw.isValid(shape));
  }
  healSolid(shape, tolerance = 1e-6) {
    return wrap("healSolid", () => handle(this.#raw.healSolid(shape, tolerance)));
  }
  healFace(shape, tolerance = 1e-6) {
    return wrap("healFace", () => handle(this.#raw.healFace(shape, tolerance)));
  }
  healWire(shape, tolerance = 1e-6) {
    return wrap("healWire", () => handle(this.#raw.healWire(shape, tolerance)));
  }
  fixFaceOrientations(shape) {
    return wrap("fixFaceOrientations", () => handle(this.#raw.fixFaceOrientations(shape)));
  }
  removeDegenerateEdges(shape) {
    return wrap("removeDegenerateEdges", () => handle(this.#raw.removeDegenerateEdges(shape)));
  }
  buildCurves3d(wire) {
    wrap("buildCurves3d", () => this.#raw.buildCurves3d(wire));
  }
  fixWireOnFace(wire, face, tolerance = 1e-6) {
    return wrap("fixWireOnFace", () => handle(this.#raw.fixWireOnFace(wire, face, tolerance)));
  }
  // =======================================================================
  // XCAF Document Factories
  // =======================================================================
  /** Create a new empty XCAF document. */
  createXCAFDocument() {
    return XCAFDocument.create(this.#raw);
  }
  /**
   * Import a STEP file into a new XCAF document.
   * Preserves colors, names, and assembly structure from the STEP file.
   */
  importXCAFFromSTEP(stepData) {
    return XCAFDocument.fromSTEP(this.#raw, stepData);
  }
  // =======================================================================
  // Memory
  // =======================================================================
  release(shape) {
    this.#raw.release(shape);
  }
  releaseAll() {
    this.#raw.releaseAll();
  }
  /**
   * Mark the current arena high-water point. Every handle produced after this
   * call can be reclaimed in one step with {@link releaseSince}. Pair the two
   * around a logical operation to bulk-free intermediates instead of tracking
   * each id for individual {@link release}.
   */
  checkpoint() {
    return this.#raw.checkpoint();
  }
  /**
   * Release every handle allocated at or after `mark` (a value from a prior
   * {@link checkpoint}). Handles the caller wants to keep must be produced
   * before the checkpoint, or copied out; ids created after the mark become
   * invalid once this returns.
   */
  releaseSince(mark) {
    this.#raw.releaseSince(mark);
  }
  get shapeCount() {
    return this.#raw.getShapeCount();
  }
  // =======================================================================
  // Debugging
  // =======================================================================
  /** Return a human-readable summary of a shape for debugging. */
  describe(shape) {
    const type = this.getShapeType(shape);
    const bbox = this.getBoundingBox(shape, { useTriangulation: true });
    const dims = `[${(bbox.xmax - bbox.xmin).toFixed(2)} x ${(bbox.ymax - bbox.ymin).toFixed(2)} x ${(bbox.zmax - bbox.zmin).toFixed(2)}]`;
    const parts = [`${type} ${dims}`];
    if (type === "solid" || type === "compound" || type === "compsolid") {
      parts.push(`vol=${this.getVolume(shape).toFixed(3)}`);
      parts.push(`area=${this.getSurfaceArea(shape).toFixed(3)}`);
    }
    const faces = this.getSubShapes(shape, "face");
    const edges = this.getSubShapes(shape, "edge");
    const verts = this.getSubShapes(shape, "vertex");
    parts.push(`F:${faces.length} E:${edges.length} V:${verts.length}`);
    return parts.join(" | ");
  }
  [Symbol.dispose]() {
    kernelRegistry.unregister(this);
    try {
      this.#raw.releaseAll();
      this.#raw.delete();
    } catch {
    }
  }
  // =======================================================================
  // Raw module / kernel access (for third-party adapters)
  // =======================================================================
  /**
   * Return the underlying Emscripten module. Intended for integrators who
   * need to hand the raw module to a third-party adapter (e.g.
   * `brepjs.OcctWasmAdapter`) without bypassing {@link OcctKernel.init}.
   *
   * The module is owned by this `OcctKernel` instance — disposing the
   * kernel does not invalidate the module reference, but the raw kernel
   * obtained via {@link getRawKernel} *will* be deleted.
   */
  getRawModule() {
    return this.#module;
  }
  /**
   * Return the underlying raw Embind kernel. Intended for integrators who
   * need to hand the raw kernel to a third-party adapter (e.g.
   * `brepjs.OcctWasmAdapter`).
   *
   * Lifecycle: the raw kernel is owned by this `OcctKernel`. Calling
   * `kernel[Symbol.dispose]()` (or letting the FinalizationRegistry collect
   * the wrapper) will `releaseAll()` and `delete()` the raw kernel — so the
   * adapter must not outlive the `OcctKernel` it was constructed from.
   * Do not call `delete()` or `releaseAll()` on the raw kernel directly.
   */
  getRawKernel() {
    return this.#raw;
  }
  // =======================================================================
  // Private helpers
  // =======================================================================
  // Per-element push_back()/get() each cross the JS->WASM boundary. Below this
  // element count the per-element loop still beats the bulk HEAP-copy path (a
  // malloc round-trip on the way in, a typed-array view + copy on the way out);
  // above it, the single bulk copy wins (measured ~50% of cost on point methods).
  static #BULK_THRESHOLD = 64;
  #makeVector(ctor, values) {
    const vec = new ctor();
    for (const v2 of values) {
      vec.push_back(v2);
    }
    return vec;
  }
  // Copy an array into WASM memory in one shot, then build the vector C++-side.
  // allocBytes() may grow the heap, so the backing buffer is read after it; a
  // fresh typed-array view is layered over it at the malloc'd (aligned) offset.
  #bulkF64(values) {
    const ptr = this.#raw.allocBytes(values.length * 8);
    new Float64Array(this.#module.HEAPU32.buffer, ptr, values.length).set(values);
    try {
      return this.#raw.vectorF64FromHeap(ptr, values.length);
    } finally {
      this.#raw.freeBytes(ptr);
    }
  }
  #bulkU32(values) {
    const ptr = this.#raw.allocBytes(values.length * 4);
    new Uint32Array(this.#module.HEAPU32.buffer, ptr, values.length).set(values);
    try {
      return this.#raw.vectorU32FromHeap(ptr, values.length);
    } finally {
      this.#raw.freeBytes(ptr);
    }
  }
  #bulkI32(values) {
    const ptr = this.#raw.allocBytes(values.length * 4);
    new Int32Array(this.#module.HEAPU32.buffer, ptr, values.length).set(values);
    try {
      return this.#raw.vectorI32FromHeap(ptr, values.length);
    } finally {
      this.#raw.freeBytes(ptr);
    }
  }
  // Reverse of the #bulk* helpers: read a returned vector into a JS array.
  // Each get() is a JS->WASM crossing, so above the threshold we fetch the
  // vector's contiguous storage pointer once and copy the whole block in one
  // shot (2 crossings total, regardless of length). heap.slice() detaches a
  // copy of those WASM bytes before the typed-array view is built, so the
  // caller can free the vector afterward with no aliasing concern.
  #readVector(vec, HeapArray, count) {
    if (count < _a.#BULK_THRESHOLD) {
      const out = new Array(count);
      for (let i = 0; i < count; i++) {
        out[i] = vec.get(i);
      }
      return out;
    }
    const ptr = vec.dataPtr();
    const heap = this.#module.HEAPU32.buffer;
    const buffer = heap.slice(ptr, ptr + count * HeapArray.BYTES_PER_ELEMENT);
    return Array.from(new HeapArray(buffer));
  }
  // Read a vector to numbers, then delete it. Every call site reads-then-frees.
  #drainVector(vec, HeapArray) {
    try {
      return this.#readVector(vec, HeapArray, vec.size());
    } finally {
      vec.delete();
    }
  }
  #vecToHandles(vec) {
    try {
      return this.#readVector(vec, Uint32Array, vec.size()).map((id) => handle(id));
    } finally {
      vec.delete();
    }
  }
  #makeVectorU32(ids) {
    if (ids.length < _a.#BULK_THRESHOLD) {
      return this.#makeVector(this.#module.VectorUint32, ids);
    }
    return this.#bulkU32(ids);
  }
  #makeVectorF64(values) {
    if (values.length < _a.#BULK_THRESHOLD) {
      return this.#makeVector(this.#module.VectorDouble, values);
    }
    return this.#bulkF64(values);
  }
  #makeVectorI32(values) {
    if (values.length < _a.#BULK_THRESHOLD) {
      return this.#makeVector(this.#module.VectorInt, values);
    }
    return this.#bulkI32(values);
  }
  // Scope guards: build a vector, run `fn` with it, and always delete it.
  // Replaces the make/try/finally/delete boilerplate at every vector-arg call
  // site so the cleanup can't be forgotten or mis-copied.
  #withU32(ids, fn) {
    const vec = this.#makeVectorU32(ids);
    try {
      return fn(vec);
    } finally {
      vec.delete();
    }
  }
  #withF64(values, fn) {
    const vec = this.#makeVectorF64(values);
    try {
      return fn(vec);
    } finally {
      vec.delete();
    }
  }
  #withI32(values, fn) {
    const vec = this.#makeVectorI32(values);
    try {
      return fn(vec);
    } finally {
      vec.delete();
    }
  }
  #flattenPoints(points) {
    if (points.length * 3 < _a.#BULK_THRESHOLD) {
      const vec = new this.#module.VectorDouble();
      for (const p of points) {
        vec.push_back(p.x);
        vec.push_back(p.y);
        vec.push_back(p.z);
      }
      return vec;
    }
    const flat = new Float64Array(points.length * 3);
    let j = 0;
    for (const p of points) {
      flat[j++] = p.x;
      flat[j++] = p.y;
      flat[j++] = p.z;
    }
    return this.#bulkF64(flat);
  }
  #vec2FromEmbind(vec) {
    const u = vec.get(0);
    const v2 = vec.get(1);
    vec.delete();
    return { u, v: v2 };
  }
  #uvBoundsFromEmbind(vec) {
    const result = {
      uMin: vec.get(0),
      uMax: vec.get(1),
      vMin: vec.get(2),
      vMax: vec.get(3)
    };
    vec.delete();
    return result;
  }
  #curvatureDataFromEmbind(vec) {
    const result = {
      min: vec.get(0),
      max: vec.get(1),
      gaussian: vec.get(2),
      mean: vec.get(3)
    };
    vec.delete();
    return result;
  }
  #vec3FromEmbind(vec) {
    const x = vec.get(0);
    const y = vec.get(1);
    const z = vec.get(2);
    vec.delete();
    return { x, y, z };
  }
  #extractMesh(raw) {
    try {
      return this.#extractMeshFromRaw(raw);
    } finally {
      raw.delete();
    }
  }
  #extractMeshFromRaw(raw) {
    const vertexCount = raw.positionCount / 3;
    const triangleCount = raw.indexCount / 3;
    const positions = new Float32Array(this.#module.HEAPF32.buffer.slice(raw.getPositionsPtr(), raw.getPositionsPtr() + raw.positionCount * 4));
    const normals = new Float32Array(this.#module.HEAPF32.buffer.slice(raw.getNormalsPtr(), raw.getNormalsPtr() + raw.normalCount * 4));
    const indices = new Uint32Array(this.#module.HEAPU32.buffer.slice(raw.getIndicesPtr(), raw.getIndicesPtr() + raw.indexCount * 4));
    return { positions, normals, indices, vertexCount, triangleCount };
  }
  #extractMeshWithFaceGroups(raw) {
    try {
      const mesh = this.#extractMeshFromRaw(raw);
      if (raw.faceGroupCount > 0) {
        mesh.faceGroups = new Int32Array(this.#module.HEAP32.buffer.slice(raw.getFaceGroupsPtr(), raw.getFaceGroupsPtr() + raw.faceGroupCount * 4));
        mesh.faceCount = raw.faceGroupCount / 3;
      }
      return mesh;
    } finally {
      raw.delete();
    }
  }
  #extractNurbsCurve(raw) {
    try {
      return {
        degree: raw.degree,
        rational: raw.rational,
        periodic: raw.periodic,
        knots: this.#drainVector(raw.knots, Float64Array),
        multiplicities: this.#drainVector(raw.multiplicities, Int32Array),
        poles: this.#drainVector(raw.poles, Float64Array),
        weights: this.#drainVector(raw.weights, Float64Array)
      };
    } finally {
      raw.delete();
    }
  }
  #extractNurbsSurface(raw) {
    try {
      const nbV = raw.nbPolesV;
      const flat = this.#drainVector(raw.poles, Float64Array);
      const flatWeights = this.#drainVector(raw.weights, Float64Array);
      const rows = Array.from({ length: raw.nbPolesU }, (_, i) => i * nbV);
      return {
        degreeU: raw.degreeU,
        degreeV: raw.degreeV,
        poles: rows.map((start) => Array.from({ length: nbV }, (_, j) => {
          const k = 3 * (start + j);
          return { x: flat[k], y: flat[k + 1], z: flat[k + 2] };
        })),
        ...flatWeights.length === 0 ? {} : { weights: rows.map((start) => flatWeights.slice(start, start + nbV)) },
        knotsU: this.#drainVector(raw.knotsU, Float64Array),
        knotsV: this.#drainVector(raw.knotsV, Float64Array),
        multiplicitiesU: this.#drainVector(raw.multiplicitiesU, Int32Array),
        multiplicitiesV: this.#drainVector(raw.multiplicitiesV, Int32Array),
        periodicU: raw.periodicU,
        periodicV: raw.periodicV
      };
    } finally {
      raw.delete();
    }
  }
  #extractEvolution(raw) {
    const modified = this.#drainVector(raw.modified, Int32Array);
    const generated = this.#drainVector(raw.generated, Int32Array);
    const deleted = this.#drainVector(raw.deleted, Int32Array);
    const edgeModified = this.#drainVector(raw.edgeModified, Int32Array);
    const edgeGenerated = this.#drainVector(raw.edgeGenerated, Int32Array);
    const edgeDeleted = this.#drainVector(raw.edgeDeleted, Int32Array);
    const firstShape = this.#drainVector(raw.firstShape, Int32Array);
    const lastShape = this.#drainVector(raw.lastShape, Int32Array);
    const spineGenerated = this.#drainVector(raw.spineGenerated, Int32Array);
    return {
      result: handle(raw.resultId),
      modified,
      generated,
      deleted,
      edgeModified,
      edgeGenerated,
      edgeDeleted,
      firstShape,
      lastShape,
      spineGenerated
    };
  }
};
_a = OcctKernel;
export {
  BooleanGlue,
  BooleanOp,
  JoinType,
  OcctError,
  OcctErrorCode,
  OcctKernel,
  SweepContact,
  SweepLaw,
  SweepMode,
  TransitionMode,
  XCAFDocument,
  renderMultiviewPNG,
  renderMultiviewSVG,
  renderShapePNG,
  renderShapeSVG
};
