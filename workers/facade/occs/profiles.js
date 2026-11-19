import { collectOccsExpressionIdentifiers, resolveOccsExpression, rewriteOccsExpressionIdentifiers } from './expressions.js';
import { foldCassetteV2Region } from '../surfaces/lib/cassetteV2Clipper.js';

export const OCCS_PROFILE_KINDS = Object.freeze([
  'hanger',
  'extruded_profile',
  'generic_profile'
]);

export const OCCS_PROFILE_PROCESSES = Object.freeze([
  'extruded',
  'roll_formed',
  'brake_formed',
  'machined'
]);

export const DEFAULT_OCCS_PROFILE_PARAMETERS = Object.freeze({
  W: 42,
  H: 28,
  R: 3,
  D: 6,
  L: 120
});

// The per-shape boolean operation applies to the FACE: add unites the
// shape's footprint into the face, subtract cuts it out, construction
// is excluded geometry.
export const OCCS_PROFILE_SHAPE_OPS = Object.freeze(['add', 'subtract', 'construction']);
const normalizeOp = (op, fallback = 'add') => (
  OCCS_PROFILE_SHAPE_OPS.includes(op) ? op : fallback
);

// Each authored sketch carries its material side; 'positive' means X>0.
// The axis placement maps +X onto the host edge's inward normal, toward
// the host face.
export const normalizeOccsProfileMaterial = (material) => (
  material === 'negative' ? 'negative' : 'positive'
);

const RECT_TEMPLATE_FILLET_CORNERS = [0, 1, 2, 3];

// Parametric by law: the template's geometry binds to its table (W/H the
// rectangle, R the corner fillets, D the hole; L resolves the sweep at
// evaluation), so cassette instance parameters drive it.
export const createDefaultOccsProfileSketch = (parameters = {}) => ({
  version: '0.2',
  units: 'mm',
  parameters: {
    ...DEFAULT_OCCS_PROFILE_PARAMETERS,
    ...parameters
  },
  material: 'positive',
  shapes: [
    {
      id: 's0',
      type: 'rect',
      center: ['W/2', 'H/2'],
      width: 'W',
      height: 'H',
      rotation: 0,
      fillets: RECT_TEMPLATE_FILLET_CORNERS.map(corner => ({ corner, radius: 'R' }))
    },
    {
      id: 's1',
      type: 'circle',
      center: ['W/2', 'H/2'],
      diameter: 'D'
    }
  ]
});

export const createEmptyOccsProfileSketch = (parameters = {}) => ({
  version: '0.2',
  units: 'mm',
  parameters: { ...parameters },
  material: 'positive',
  shapes: []
});

export const createDefaultOccsProfileTemplateData = (overrides = {}) => ({
  kind: overrides.kind || 'hanger',
  process: overrides.process || 'extruded',
  parameters: { ...(overrides.parameters || {}) },
  sketch: overrides.sketch || createDefaultOccsProfileSketch(overrides.parameters),
  occsProfile: null
});

const numericValue = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

// Authoring fields carry numbers or expression strings ("W/2", "H-2*R").
// Numeric strings collapse to numbers; anything else stays a string for
// the evaluator. Resolution failures surface at evaluation, never here —
// normalize must accept half-authored sketches.
const sketchValue = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : value.trim();
  }
  return fallback;
};

const normalizeCenter = (center = []) => [
  sketchValue(Array.isArray(center) ? center[0] : 0, 0),
  sketchValue(Array.isArray(center) ? center[1] : 0, 0)
];

const normalizeCircleShape = (shape = {}, index = 0) => ({
  id: shape.id || `s${index}`,
  type: 'circle',
  op: normalizeOp(shape.op, 'subtract'),
  center: normalizeCenter(shape.center),
  diameter: sketchValue(shape.diameter, 0)
});

const normalizeRectFillets = (fillets = [], width = 0, height = 0) => {
  const byCorner = new Map();
  for (const fillet of Array.isArray(fillets) ? fillets : []) {
    const corner = Number(fillet?.corner);
    if (!Number.isInteger(corner) || corner < 0 || corner > 3) continue;
    byCorner.set(corner, sketchValue(fillet.radius, 0));
  }
  return [...byCorner.entries()]
    .filter(([, radius]) => radius !== 0)
    .map(([corner, radius]) => ({ corner, radius }));
};

const normalizeRectShape = (shape = {}, index = 0) => ({
  id: shape.id || `s${index}`,
  type: 'rect',
  op: normalizeOp(shape.op, 'add'),
  center: normalizeCenter(shape.center),
  width: sketchValue(shape.width, 0),
  height: sketchValue(shape.height, 0),
  rotation: sketchValue(shape.rotation, 0),
  fillets: normalizeRectFillets(shape.fillets)
});

const normalizePoint = (point = {}, index = 0) => ({
  id: point.id || `p${index}`,
  x: sketchValue(point.x),
  y: sketchValue(point.y),
  // Chord points are the flattened interior of an extracted arc — real
  // geometry, but not authored corners; the editor collapses their runs.
  ...(point.chord ? { chord: true } : {})
});

const normalizeLineEdge = (edge = {}, index = 0) => ({
  id: edge.id || `e${index}`,
  type: 'line',
  from: edge.from,
  to: edge.to
});

const normalizeFilletModifiers = (modifiers = [], pointIds = new Set()) => {
  const filletsByVertex = new Map();
  for (const modifier of modifiers) {
    if (modifier?.type !== 'fillet') continue;
    const radius = sketchValue(modifier.radius, 0);
    const vertices = modifier.vertexId
      ? [modifier.vertexId]
      : Array.isArray(modifier.vertices)
        ? modifier.vertices
        : [];
    for (const vertexId of vertices) {
      if (!pointIds.has(vertexId)) continue;
      filletsByVertex.set(vertexId, { type: 'fillet', vertexId, radius });
    }
  }
  return [...filletsByVertex.values()];
};

const normalizeChainShape = (shape = {}, index = 0) => {
  const points = (Array.isArray(shape.points) ? shape.points : [])
    .map(normalizePoint);
  const pointIds = new Set(points.map(point => point.id));
  const edgeSource = Array.isArray(shape.edges)
    ? shape.edges
    : points.length > 1
      ? points.map((point, at) => ({ from: point.id, to: points[(at + 1) % points.length].id }))
      : [];
  const edges = edgeSource
    .filter(edge => pointIds.has(edge.from) && pointIds.has(edge.to))
    .map(normalizeLineEdge);
  const closed = typeof shape.closed === 'boolean'
    ? shape.closed && points.length >= 3
    : false;
  return {
    id: shape.id || `s${index}`,
    type: 'chain',
    op: normalizeOp(shape.op, shape.closed ? 'add' : 'construction'),
    closed,
    points,
    edges,
    modifiers: normalizeFilletModifiers(shape.modifiers, pointIds)
  };
};

const normalizeShape = (shape = {}, index = 0) => {
  if (shape?.type === 'circle') return normalizeCircleShape(shape, index);
  if (shape?.type === 'rect') return normalizeRectShape(shape, index);
  if (shape?.type === 'chain') return normalizeChainShape(shape, index);
  return null;
};

// Legacy chain sketches (points/edges/holes/closed/anchors) upgrade into
// the shape model on read and through the one-shot migration script: the
// chain becomes one chain shape, holes become subtract circles, and a
// closed sketch's basis anchor becomes the axis — the chain translates so
// the anchor vertex sits on X=0 (coordinates go numeric; translation is
// arithmetic the expression layer has no form for).
export const upgradeLegacyOccsProfileSketch = (sketch = {}) => {
  const hasLegacyGeometry = Array.isArray(sketch.points) || Array.isArray(sketch.holes)
    || typeof sketch.closed === 'boolean';
  if (!hasLegacyGeometry) return null;
  const parameters = Object.fromEntries(
    Object.entries(sketch.parameters || {}).map(([key, value]) => [key, sketchValue(value, 0)])
  );
  const points = (Array.isArray(sketch.points) ? sketch.points : []).map(normalizePoint);
  const pointIds = new Set(points.map(point => point.id));
  const edges = (Array.isArray(sketch.edges) ? sketch.edges : [])
    .filter(edge => pointIds.has(edge.from) && pointIds.has(edge.to))
    .map(normalizeLineEdge);
  const closed = Boolean(sketch.closed) && points.length >= 3;
  const modifiers = normalizeFilletModifiers(sketch.modifiers, pointIds);

  let chainPoints = points;
  if (closed && sketch.anchors?.vertexId && pointIds.has(sketch.anchors.vertexId)) {
    const anchor = points.find(point => point.id === sketch.anchors.vertexId);
    let anchorX = 0;
    let anchorY = 0;
    try {
      anchorX = resolveOccsExpression(anchor.x, parameters);
      anchorY = resolveOccsExpression(anchor.y, parameters);
    } catch {
      anchorX = numericValue(anchor.x, 0);
      anchorY = numericValue(anchor.y, 0);
    }
    chainPoints = points.map(point => {
      let x = numericValue(point.x, 0);
      let y = numericValue(point.y, 0);
      try {
        x = resolveOccsExpression(point.x, parameters);
        y = resolveOccsExpression(point.y, parameters);
      } catch { /* unresolvable fields fall back to their numeric value */ }
      return { ...point, x: x - anchorX, y: y - anchorY };
    });
  }

  const shapes = [];
  if (points.length >= 2) {
    const chainPointIds = new Set(chainPoints.map(point => point.id));
    shapes.push({
      id: 's0',
      type: 'chain',
      op: closed ? 'add' : 'construction',
      closed,
      points: chainPoints,
      edges: edges.filter(edge => chainPointIds.has(edge.from) && chainPointIds.has(edge.to)),
      modifiers
    });
  }
  (Array.isArray(sketch.holes) ? sketch.holes : [])
    .filter(hole => hole?.type === 'circle')
    .forEach((hole, index) => {
      shapes.push({
        id: `s${shapes.length}`,
        type: 'circle',

        center: normalizeCenter(hole.center),
        diameter: sketchValue(hole.diameter, 0)
      });
    });

  return {
    version: '0.2',
    units: sketch.units || 'mm',
    parameters,
    material: normalizeOccsProfileMaterial(sketch.material),
    shapes
  };
};

export const normalizeOccsProfileSketch = (sketch = {}, fallbackParameters = {}) => {
  if (Array.isArray(sketch?.shapes)) {
    const rawParameters = {
      ...(fallbackParameters || {}),
      ...(sketch.parameters || {})
    };
    return {
      version: sketch.version || '0.2',
      units: sketch.units || 'mm',
      parameters: Object.fromEntries(
        Object.entries(rawParameters).map(([key, value]) => [key, sketchValue(value, 0)])
      ),
      material: normalizeOccsProfileMaterial(sketch.material),
      shapes: sketch.shapes
        .map((shape, index) => normalizeShape(shape, index))
        .filter(Boolean)
    };
  }

  const upgraded = upgradeLegacyOccsProfileSketch(sketch);
  if (upgraded) {
    return normalizeOccsProfileSketch({
      ...upgraded,
      parameters: { ...(fallbackParameters || {}), ...(sketch.parameters || {}) }
    });
  }

  // A sketch with neither shapes nor legacy geometry is sketch-less: the
  // numeric seed stands in (the parametric template is the dialog and
  // fallback path, whose table always carries W/H/R/D/L).
  return normalizeOccsProfileSketch({
    ...createDefaultOccsProfileSketch({ ...DEFAULT_OCCS_PROFILE_PARAMETERS, ...fallbackParameters }),
    parameters: { ...DEFAULT_OCCS_PROFILE_PARAMETERS, ...fallbackParameters }
  });
};

// A sketch participates when at least one closed shape carries a
// boolean op — the profile is a closed operand set on the face.
const sketchParticipates = (evaluated = {}) => evaluated.shapes.some(shape => (
  shape.op !== 'construction'
    && (shape.type === 'chain'
      ? shape.closed && shape.points.length >= 3
      : true)
));

// One evaluation for the save gate's two answers: the resolved sketch and
// the error that refused it.
export const inspectOccsProfileSketch = (sketch = {}, fallbackParameters = {}) => {
  try {
    const evaluated = evaluateOccsProfileSketch(sketch, fallbackParameters);
    return { evaluated, error: '', savable: sketchParticipates(evaluated) };
  } catch (error) {
    return { evaluated: null, error: error?.message || String(error), savable: false };
  }
};

export const isOccsProfileSketchSavable = (sketch = {}, fallbackParameters = {}) => (
  inspectOccsProfileSketch(sketch, fallbackParameters).savable
);

// Resolves every authored expression against the parameter table
// (parameters may reference each other; the engine rejects cycles and
// unknown identifiers). Throws on any unresolvable value — the savable
// check and the editors' save gates turn that into authoring feedback,
// never silent zeros.
export const evaluateOccsProfileSketch = (sketch = {}, fallbackParameters = {}) => {
  const normalized = normalizeOccsProfileSketch(sketch, fallbackParameters);
  const parameters = {};
  for (const [key, value] of Object.entries(normalized.parameters)) {
    parameters[key] = resolveOccsExpression(value, normalized.parameters);
  }
  const resolveField = (value, what) => {
    const resolved = resolveOccsExpression(value, parameters);
    if (!Number.isFinite(resolved)) throw new Error(`Invalid OCCS profile ${what}`);
    return Math.round((resolved + Number.EPSILON) * 1000) / 1000;
  };
  return {
    ...normalized,
    parameters,
    shapes: normalized.shapes.map(shape => {
      if (shape.type === 'circle') {
        return {
          ...shape,
          center: [
            resolveField(shape.center[0], `shape ${shape.id} x`),
            resolveField(shape.center[1], `shape ${shape.id} y`)
          ],
          diameter: resolveField(shape.diameter, `shape ${shape.id} diameter`)
        };
      }
      if (shape.type === 'rect') {
        return {
          ...shape,
          center: [
            resolveField(shape.center[0], `shape ${shape.id} x`),
            resolveField(shape.center[1], `shape ${shape.id} y`)
          ],
          width: resolveField(shape.width, `shape ${shape.id} width`),
          height: resolveField(shape.height, `shape ${shape.id} height`),
          rotation: resolveField(shape.rotation, `shape ${shape.id} rotation`),
          fillets: shape.fillets.map(fillet => ({
            corner: fillet.corner,
            radius: resolveField(fillet.radius, `shape ${shape.id} fillet ${fillet.corner}`)
          }))
        };
      }
      return {
        ...shape,
        points: shape.points.map(point => ({
          ...point,
          x: resolveField(point.x, `point ${point.id} x`),
          y: resolveField(point.y, `point ${point.id} y`)
        })),
        modifiers: shape.modifiers.map(modifier => ({
          ...modifier,
          radius: resolveField(modifier.radius, `fillet ${modifier.vertexId}`)
        }))
      };
    })
  };
};

// Closed chain shapes close their boundary on save; open chains keep
// their ends — the first and last vertices are the break points.
export const closeOccsProfileSketchBoundary = (sketch = {}, fallbackParameters = {}) => {
  const normalized = normalizeOccsProfileSketch(sketch, fallbackParameters);
  return {
    ...normalized,
    shapes: normalized.shapes.map(shape => {
      if (shape.type !== 'chain' || !shape.closed || shape.points.length < 3) return shape;
      const pointIds = new Set(shape.points.map(point => point.id));
      const edges = shape.points.map((point, index) => {
        const to = shape.points[(index + 1) % shape.points.length]?.id || point.id;
        const existing = shape.edges.find(edge => edge.from === point.id && edge.to === to);
        return existing || { id: `e${index}`, type: 'line', from: point.id, to };
      }).filter(edge => edge.from !== edge.to);
      return { ...shape, edges: edges.filter(edge => pointIds.has(edge.from) && pointIds.has(edge.to)) };
    })
  };
};

// A single open chain with no boolean shapes keeps the polyline section:
// the cut-path construct the edge embedding splices into the host contour.
const openChainSection = (evaluated = {}) => {
  if (evaluated.shapes.length !== 1) return null;
  const shape = evaluated.shapes[0];
  if (shape.type !== 'chain' || shape.closed) return null;
  const vertices = shape.points.map(point => [String(point.x), String(point.y)]);
  if (vertices.length < 2) return null;
  return {
    type: 'polyline',
    open: true,
    vertices,
    edges: Array.from({ length: vertices.length - 1 }, () => ({ type: 'line' })),
    modifiers: shape.modifiers.map(modifier => ({
      ...modifier,
      vertexIndex: shape.points.findIndex(point => point.id === modifier.vertexId)
    })).filter(modifier => modifier.vertexIndex >= 0),
    breakPoints: [vertices[0], vertices[vertices.length - 1]]
  };
};

// The evaluated rect's world corners, canonical order: counter-clockwise
// from the local (-w/2, -h/2) corner.
export const occProfileRectCornerVertices = (shape = {}) => {
  const halfWidth = shape.width / 2;
  const halfHeight = shape.height / 2;
  const angle = (shape.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const local = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight]
  ];
  return local.map(([x, y]) => [
    shape.center[0] + x * cos - y * sin,
    shape.center[1] + x * sin + y * cos
  ]);
};

const circlePolygon = (center = [], diameter = 0, segments = 48) => {
  const radius = diameter / 2;
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
  });
};

const chainSectionShape = (shape = {}) => {
  const vertices = shape.points.map(point => [point.x, point.y]);
  const section = {
    open: !shape.closed,
    type: shape.closed ? 'polygon' : 'polyline',
    vertices,
    modifiers: shape.modifiers.map(modifier => ({
      type: 'fillet',
      radius: modifier.radius,
      vertexIndex: shape.points.findIndex(point => point.id === modifier.vertexId)
    })).filter(modifier => modifier.vertexIndex >= 0)
  };
  return {
    shapeId: shape.id,
    kind: 'chain',
    op: shape.op,
    closed: shape.closed,
    vertices: occProfileSectionChainedVertices(section)
  };
};

export const buildOccsProfileFromEvaluatedSketch = (normalized = {}, options = {}) => {
  const polyline = openChainSection(normalized);
  const section = polyline || {
    type: 'shapes',
    open: false,
    shapes: normalized.shapes.map(shape => {
      if (shape.type === 'circle') {
        return {
          shapeId: shape.id,
          kind: 'circle',
          op: shape.op,
          closed: true,
          vertices: circlePolygon(shape.center, shape.diameter)
        };
      }
      if (shape.type === 'rect') {
        const corners = occProfileRectCornerVertices(shape);
        const radiusByIndex = new Map(shape.fillets.map(fillet => [fillet.corner, fillet.radius]));
        return {
          shapeId: shape.id,
          kind: 'rect',
          op: shape.op,
          closed: true,
          vertices: occProfileSectionChainedVertices({
            open: false,
            type: 'polygon',
            vertices: corners,
            modifiers: [...radiusByIndex.entries()].map(([vertexIndex, radius]) => ({
              type: 'fillet',
              radius,
              vertexIndex
            }))
          })
        };
      }
      return chainSectionShape(shape);
    }).filter(sectionShape => sectionShape.vertices.length >= 2)
  };

  return {
    section,
    sweep: {
      type: 'linear',
      length: String(resolveOccsExpression(options.length ?? normalized.parameters.L ?? 120, normalized.parameters))
    },
    sketch: normalized
  };
};

export const occsProfileFromSketch = (sketch = {}, options = {}) => (
  buildOccsProfileFromEvaluatedSketch(evaluateOccsProfileSketch(sketch, options.parameters), options)
);

// The section's boolean steps as an ordered CSG sequence: each
// participating shape applies to the face in authored list order — a
// later add refills an earlier cut. Construction geometry never joins
// a step. Polyline sections have no boolean meaning (null).
export const resolveOccsProfileSectionOperations = (section = {}) => {
  if (section.type !== 'shapes') return null;
  return section.shapes
    .filter(shape => (shape.op === 'add' || shape.op === 'subtract') && shape.vertices.length >= 3)
    .map(shape => ({ op: shape.op, polygons: [shape.vertices] }));
};

// The section as a standalone figure (the editor's preview, thumbnails):
// the steps folded from an empty base. A sketch that only cuts carries
// its cut rings as holes so the preview still shows them.
export const resolveOccsProfileSectionPolygons = async (section = {}) => {
  const operations = resolveOccsProfileSectionOperations(section);
  if (!operations) return null;
  const folded = await foldCassetteV2Region({ polygons: [], holes: [] }, operations);
  if (folded.polygons.length) return folded;
  const subtracts = operations.filter(operation => operation.op === 'subtract')
    .flatMap(operation => operation.polygons);
  return subtracts.length ? { polygons: [], holes: subtracts } : folded;
};

// Preview projection: a sketch's evaluated section as drawing layerData
// (the drawing-preview normalizer's channel) — the boolean outline on
// cut.outer, an open chain on cut.inner (a cut path), resolved holes on
// cut.inner. Unresolvable sketches return null: previews render a quiet
// blank, never an error state.
export const resolveOccsProfileSketchLayerData = async (sketch = {}) => {
  try {
    // The preview draws authored geometry alone; the default-hanger
    // fallback serves the designer's sketch-less workpieces.
    if (!Array.isArray(sketch?.shapes) && !upgradeLegacyOccsProfileSketch(sketch)) return null;
    const { section } = occsProfileFromSketch(sketch, {});
    if (section.type === 'polyline') {
      const vertices = (section.vertices || [])
        .filter(vertex => Array.isArray(vertex) && vertex.length >= 2)
        .map(([x, y]) => [Number(x), Number(y)])
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      return vertices.length >= 2
        ? [{ layer: 'cut.inner', coordinates: vertices }]
        : null;
    }
    const resolved = await resolveOccsProfileSectionPolygons(section);
    if (!resolved) return null;
    const layers = resolved.polygons
      .filter(polygon => polygon.length >= 3)
      .map(polygon => ({ layer: 'cut.outer', coordinates: polygon }));
    for (const hole of resolved.holes) {
      if (hole.length >= 3) layers.push({ layer: 'cut.inner', coordinates: hole });
    }
    return layers.length ? layers : null;
  } catch {
    return null;
  }
};

// Rewrites every expression referencing the given names — shape fields,
// fillet radii, parameter values — as whole identifiers. Parameter keys
// stay put.
export const rewriteOccsProfileSketchExpressions = (sketch = {}, renames = {}) => {
  const names = Object.keys(renames || {}).filter(name => name !== renames[name]);
  if (!names.length) return sketch;
  const rewrite = (value) => rewriteOccsExpressionIdentifiers(value, renames);
  return {
    ...sketch,
    parameters: Object.fromEntries(
      Object.entries(sketch.parameters || {}).map(([key, value]) => [key, rewrite(value)])
    ),
    shapes: (sketch.shapes || []).map(shape => {
      if (shape.type === 'circle' || shape.type === 'rect') {
        return {
          ...shape,
          center: (shape.center || []).map(rewrite),
          ...(shape.type === 'circle'
            ? { diameter: rewrite(shape.diameter) }
            : {
                width: rewrite(shape.width),
                height: rewrite(shape.height),
                rotation: rewrite(shape.rotation),
                fillets: (shape.fillets || []).map(fillet => ({ ...fillet, radius: rewrite(fillet.radius) }))
              })
        };
      }
      return {
        ...shape,
        points: (shape.points || []).map(point => ({ ...point, x: rewrite(point.x), y: rewrite(point.y) })),
        modifiers: (shape.modifiers || []).map(modifier => ({ ...modifier, radius: rewrite(modifier.radius) }))
      };
    })
  };
};

// Renames a sketch parameter in place: the key moves (order preserved)
// and every expression referencing it is rewritten as whole
// identifiers. Invalid or colliding names refuse (the caller's row
// re-renders with the old name).
export const renameOccsProfileSketchParameter = (sketch = {}, from = '', to = '') => {
  const source = String(from || '').trim();
  const next = String(to || '').trim();
  if (!source || !next || source === next) return sketch;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(next)) return sketch;
  if (!Object.prototype.hasOwnProperty.call(sketch.parameters || {}, source)) return sketch;
  if (Object.prototype.hasOwnProperty.call(sketch.parameters, next)) return sketch;
  const rewritten = rewriteOccsProfileSketchExpressions(sketch, { [source]: to });
  return {
    ...rewritten,
    parameters: Object.fromEntries(
      Object.entries(rewritten.parameters).map(([key, value]) => [key === source ? next : key, value])
    )
  };
};

export const adoptOccsProfileBindingParameter = (sketch = {}, value, currentValue, externalParameters = {}) => {  if (typeof value !== 'string') return sketch.parameters || {};
  const identifier = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) return sketch.parameters || {};
  const parameters = sketch.parameters || {};
  if (Object.prototype.hasOwnProperty.call(parameters, identifier)) return parameters;
  // An identifier the surrounding scope defines (the cassette's globals)
  // reads that scope — never minted here.
  if (Object.prototype.hasOwnProperty.call(externalParameters, identifier)) return parameters;
  if (currentValue === null || currentValue === undefined || currentValue === '') return parameters;
  const numeric = Number(currentValue);
  if (!Number.isFinite(numeric)) return parameters;
  return { ...parameters, [identifier]: numeric };
};

// Scope-named rows without a shape or parameter reference are stale copy
// (occs/README.md).
export const pruneScopeBoundParameters = (parameters = {}, shapes = [], externalParameters = {}) => {
  const scopeNames = new Set(Object.keys(externalParameters || {}));
  const keys = Object.keys(parameters);
  if (!keys.some(key => scopeNames.has(key))) return parameters;
  const identifiersOf = (value) => {
    if (typeof value !== 'string') return [];
    try {
      return collectOccsExpressionIdentifiers(value);
    } catch {
      return [];
    }
  };
  const referenced = new Set();
  const reference = (value) => identifiersOf(value).forEach(name => referenced.add(name));
  for (const shape of shapes || []) {
    [
      shape.width, shape.height, shape.rotation, shape.diameter,
      ...(shape.center || []),
      ...(shape.points || []).flatMap(point => [point.x, point.y]),
      ...(shape.fillets || []).map(fillet => fillet.radius),
      ...(shape.modifiers || []).map(modifier => modifier.radius)
    ].forEach(reference);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, value] of Object.entries(parameters)) {
      if (!referenced.has(key)) continue;
      for (const name of identifiersOf(value)) {
        if (referenced.has(name)) continue;
        referenced.add(name);
        changed = true;
      }
    }
  }
  return Object.fromEntries(
    Object.entries(parameters).filter(([key]) => !scopeNames.has(key) || referenced.has(key))
  );
};

// The sketch every render consumer evaluates: the authored model with the
// instance overrides on top. Neither stored table absorbs the other
// (occs/README.md — two parameter tables).
export const deriveOccsProfileSketch = (sketch = {}, instance = {}) => {
  const normalized = normalizeOccsProfileSketch(sketch);
  return normalizeOccsProfileSketch({
    ...normalized,
    parameters: { ...normalized.parameters, ...(instance || {}) }
  });
};

// Renames a row of a profile parameter table in place: the key moves and
// every value expression follows as whole identifiers.
export const renameOccsProfileTableParameter = (parameters = {}, from = '', to = '') => {
  const source = String(from || '').trim();
  const next = String(to || '').trim();
  if (!source || !next || source === next) return parameters;
  const renames = { [source]: next };
  return Object.fromEntries(
    Object.entries(parameters || {}).map(([key, value]) => [
      key === source ? next : key,
      rewriteOccsExpressionIdentifiers(value, renames)
    ])
  );
};


const pointFromDxf = (point = {}) => ({
  x: numericValue(point.x ?? point[0]),
  y: numericValue(point.y ?? point[1])
});

// ── CAD entity records ↔ OCCS profile sketch ─────────────────────────────
//
// The shared normalization between the cassette designer's CAD sketch
// canvas (the tech-drawing CadCraft edition) and the OCCS profile sketch model.
// Records are plain data so the same path serves the browser canvas
// (live database entities mapped to records) and DXF imports:
//   { type: 'LINE',  start: {x,y}, end: {x,y} }
//   { type: 'ARC',   center: {x,y}, radius, startAngle, endAngle }  (radians, CCW)
//   { type: 'CIRCLE', center: {x,y}, radius }
//   { type: 'POLYLINE', vertices: [{x,y}], closed }
// A tangent corner arc between two line segments maps to the shape's
// fillet modifier (the polygon keeps the theoretical sharp corner);
// every other arc flattens to chords within `chordTolerance` mm. Every
// chainable piece becomes its own shape — nothing is dropped. With
// `reference: true` (a DXF import used as a visual guide) every shape
// lands as construction geometry.

const CHORD_TOLERANCE_MM = 0.05;
// Drawing-scale identity: engine reconstruction carries µm-level noise
// (rounded entity endpoints, tangent-arc reintersections), so two points
// are one point below 0.05 mm — the extraction junction law and the
// merge's unchanged-field law share this epsilon.
const DRAWING_EPSILON_MM = 0.05;
// Tangency tolerance in normalized units: rounding at 1e-3 mm on few-mm
// arcs lands near 1e-3, so recognition needs headroom.
const TANGENT_EPSILON = 1e-2;

const samePoint = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < DRAWING_EPSILON_MM;

const roundPoint = (point) => ({
  x: Math.round((point.x + Number.EPSILON) * 1000) / 1000,
  y: Math.round((point.y + Number.EPSILON) * 1000) / 1000
});

const arcAnglesTraversed = (arc) => {
  let sweep = (arc.endAngle - arc.startAngle) % (Math.PI * 2);
  if (arc.ccw === false) {
    while (sweep >= 0) sweep -= Math.PI * 2;
    if (sweep <= -Math.PI * 2) sweep += Math.PI * 2;
    return Math.abs(sweep);
  }
  if (sweep < 0) sweep += Math.PI * 2;
  return sweep;
};

const arcPointAt = (arc, angle) => ({
  x: arc.center.x + arc.radius * Math.cos(angle),
  y: arc.center.y + arc.radius * Math.sin(angle)
});

const flattenArcToPoints = (arc, chordTolerance) => {
  const sweep = arcAnglesTraversed(arc);
  const tolerance = Math.min(chordTolerance, arc.radius * 0.5);
  const step = tolerance > 0 && arc.radius > tolerance
    ? 2 * Math.acos(1 - tolerance / arc.radius)
    : Math.PI / 2;
  const count = Math.max(2, Math.ceil(sweep / Math.max(step, 1e-6)));
  const direction = arc.ccw === false ? -1 : 1;
  const points = [];
  for (let index = 0; index <= count; index += 1) {
    points.push(arcPointAt(arc, arc.startAngle + direction * sweep * (index / count)));
  }
  return points;
};

// The section walk every cassette consumer draws: the stored geometry
// keeps the theoretical sharp corners and its fillet modifiers; this
// pass resolves each authored corner to its tangent arc points (the
// same trim/bisector math and chord tolerance the editor's entity
// seeding uses, radius clamped to the largest arc that fits). Open
// chain ends keep their vertices — fillets need both neighbours.
export const occProfileSectionChainedVertices = (section = {}, chordTolerance = 0.05) => {
  const raw = Array.isArray(section.vertices) ? section.vertices : [];
  const vertices = raw.map(vertex => [Number(vertex?.[0]), Number(vertex?.[1])]);
  if (vertices.length < 2) return vertices;
  const closed = !section.open && section.type !== 'polyline' && vertices.length >= 3;
  const radiusByIndex = new Map();
  for (const modifier of Array.isArray(section.modifiers) ? section.modifiers : []) {
    if (modifier?.type !== 'fillet') continue;
    const index = Number.isInteger(modifier.vertexIndex)
      ? modifier.vertexIndex
      : Number(String(modifier.vertexId ?? '').slice(1));
    const radius = Number(modifier.radius);
    if (Number.isInteger(index) && index >= 0 && index < vertices.length && Number.isFinite(radius) && radius > 0) {
      radiusByIndex.set(index, radius);
    }
  }
  if (!radiusByIndex.size) return vertices;

  const chain = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const vertex = vertices[index];
    const radius = radiusByIndex.get(index) || 0;
    const previous = closed ? vertices[(index - 1 + vertices.length) % vertices.length] : vertices[index - 1];
    const next = closed ? vertices[(index + 1) % vertices.length] : vertices[index + 1];
    if (!previous || !next || radius <= 0) {
      chain.push(vertex);
      continue;
    }
    const toPrevious = [previous[0] - vertex[0], previous[1] - vertex[1]];
    const toNext = [next[0] - vertex[0], next[1] - vertex[1]];
    const lengthPrevious = Math.hypot(toPrevious[0], toPrevious[1]);
    const lengthNext = Math.hypot(toNext[0], toNext[1]);
    if (!lengthPrevious || !lengthNext) {
      chain.push(vertex);
      continue;
    }
    const unitPrevious = [toPrevious[0] / lengthPrevious, toPrevious[1] / lengthPrevious];
    const unitNext = [toNext[0] / lengthNext, toNext[1] / lengthNext];
    const cosine = unitPrevious[0] * unitNext[0] + unitPrevious[1] * unitNext[1];
    const interiorAngle = Math.acos(Math.max(-1, Math.min(1, cosine)));
    if (interiorAngle >= Math.PI - 1e-9 || interiorAngle <= 1e-9) {
      chain.push(vertex);
      continue;
    }
    const trim = Math.min(
      radius / Math.tan(interiorAngle / 2),
      lengthPrevious * 0.49,
      lengthNext * 0.49
    );
    const fittedRadius = trim * Math.tan(interiorAngle / 2);
    const start = [vertex[0] + unitPrevious[0] * trim, vertex[1] + unitPrevious[1] * trim];
    const end = [vertex[0] + unitNext[0] * trim, vertex[1] + unitNext[1] * trim];
    const bisector = [unitPrevious[0] + unitNext[0], unitPrevious[1] + unitNext[1]];
    const bisectorLength = Math.hypot(bisector[0], bisector[1]);
    const centerDistance = fittedRadius / Math.sin(interiorAngle / 2);
    const center = [
      vertex[0] + (bisector[0] / bisectorLength) * centerDistance,
      vertex[1] + (bisector[1] / bisectorLength) * centerDistance
    ];
    const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
    const endAngle = Math.atan2(end[1] - center[1], end[0] - center[0]);
    let sweep = endAngle - startAngle;
    while (sweep <= -Math.PI) sweep += Math.PI * 2;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    const tolerance = Math.min(chordTolerance, fittedRadius * 0.5);
    const step = tolerance > 0 && fittedRadius > tolerance
      ? 2 * Math.acos(1 - tolerance / fittedRadius)
      : Math.PI / 2;
    const count = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(step, 1e-6)));
    chain.push(start);
    for (let step2 = 1; step2 < count; step2 += 1) {
      const angle = startAngle + sweep * (step2 / count);
      chain.push([center[0] + fittedRadius * Math.cos(angle), center[1] + fittedRadius * Math.sin(angle)]);
    }
    chain.push(end);
  }
  return chain;
};

const tangentToFillet = (segment, incoming, outgoing) => {
  // The arc is a fillet modifier only when it runs tangent to the line
  // segment on both ends; the vertex is where the untrimmed lines meet.
  const center = segment.arc.center;
  const startRadial = { x: segment.a.x - center.x, y: segment.a.y - center.y };
  const endRadial = { x: segment.b.x - center.x, y: segment.b.y - center.y };
  // Tangency at an arc endpoint is radial ⟂ travel direction (dot = 0);
  // a radial parallel to the line would mean the line aims at the center.
  const dotWith = (radial, direction) => (
    radial.x * direction.x + radial.y * direction.y
  );
  const incomingDir = {
    x: incoming.b.x - incoming.a.x,
    y: incoming.b.y - incoming.a.y
  };
  const outgoingDir = {
    x: outgoing.b.x - outgoing.a.x,
    y: outgoing.b.y - outgoing.a.y
  };
  if (Math.abs(dotWith(startRadial, incomingDir)) > TANGENT_EPSILON * Math.hypot(incomingDir.x, incomingDir.y) * segment.arc.radius) return null;
  if (Math.abs(dotWith(endRadial, outgoingDir)) > TANGENT_EPSILON * Math.hypot(outgoingDir.x, outgoingDir.y) * segment.arc.radius) return null;
  const denominator = incomingDir.x * outgoingDir.y - incomingDir.y * outgoingDir.x;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((outgoing.a.x - incoming.a.x) * outgoingDir.y - (outgoing.a.y - incoming.a.y) * outgoingDir.x) / denominator;
  const vertex = {
    x: incoming.a.x + incomingDir.x * t,
    y: incoming.a.y + incomingDir.y * t
  };
  return { vertex: roundPoint(vertex), radius: segment.arc.radius };
};

const reverseSegment = (segment) => {
  if (segment.type === 'line') return { type: 'line', a: segment.b, b: segment.a };
  return {
    type: 'arc',
    arc: {
      ...segment.arc,
      startAngle: segment.arc.endAngle,
      endAngle: segment.arc.startAngle,
      ccw: segment.arc.ccw === false
    },
    a: segment.b,
    b: segment.a
  };
};

// Chains free segments (line/arc records) by endpoint connectivity into
// the longest closed loop growable from the seed, or the longest open
// trail when nothing closes.
const chainSegments = (segments) => {
  if (!segments.length) return { chain: [], closed: false };
  const best = { chain: [], closed: false };
  for (let seedIndex = 0; seedIndex < segments.length; seedIndex += 1) {
    const used = new Set([seedIndex]);
    const seed = segments[seedIndex];
    let chain = [seed];
    let head = seed.b;
    let tail = seed.a;
    let closed = false;
    const extendOnce = (point, wanted) => {
      for (let index = 0; index < segments.length; index += 1) {
        if (used.has(index)) continue;
        const candidate = segments[index];
        if (samePoint(point, candidate.a)) {
          used.add(index);
          chain.push(wanted === 'head' ? candidate : reverseSegment(candidate));
          return wanted === 'head' ? candidate.b : candidate.a;
        }
        if (samePoint(point, candidate.b)) {
          used.add(index);
          chain.push(wanted === 'head' ? reverseSegment(candidate) : candidate);
          return wanted === 'head' ? candidate.a : candidate.b;
        }
      }
      return null;
    };
    for (;;) {
      if (samePoint(head, tail) && chain.length >= 2) {
        closed = true;
        break;
      }
      const nextHead = extendOnce(head, 'head');
      if (nextHead) {
        head = nextHead;
        continue;
      }
      const nextTail = extendOnce(tail, 'tail');
      if (nextTail) {
        tail = nextTail;
        continue;
      }
      break;
    }
    if (chain.length > best.chain.length || (closed && !best.closed)) {
      best.chain = chain;
      best.closed = closed;
    }
    if (best.closed && best.chain.length === segments.length) break;
  }
  return best;
};

// Every chainable piece becomes a shape: segments are consumed chain by
// chain until none remain — extraction keeps all drawn geometry, a lone
// arc included as its own one-segment chain.
const chainAllSegments = (segments) => {
  const remaining = [...segments];
  const chains = [];
  while (remaining.length) {
    const { chain, closed } = chainSegments(remaining);
    if (chain.length >= 1) {
      chains.push({ chain, closed });
      for (const segment of chain) {
        const at = remaining.indexOf(segment);
        if (at >= 0) remaining.splice(at, 1);
      }
      continue;
    }
    break;
  }
  return { chains, leftover: remaining };
};

// A DXF polyline carries its arc segments as bulges on the vertex that
// starts the segment: the tangent of a quarter of the included angle,
// positive counter-clockwise.
const bulgeSegment = (a, b, bulge) => {
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (!chord || !bulge) return null;
  const theta = 4 * Math.atan(bulge);
  const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const left = { x: -(b.y - a.y) / chord, y: (b.x - a.x) / chord };
  const offset = chord / (2 * Math.tan(theta / 2));
  const center = { x: mid.x + left.x * offset, y: mid.y + left.y * offset };
  return {
    type: 'arc',
    arc: {
      center: roundPoint(center),
      radius,
      startAngle: Math.atan2(a.y - center.y, a.x - center.x),
      endAngle: Math.atan2(b.y - center.y, b.x - center.x),
      ccw: bulge > 0
    },
    a: roundPoint(a),
    b: roundPoint(b)
  };
};

const polylineRecordSegments = (record) => {
  const vertices = record.vertices.map(roundPoint);
  const count = record.closed ? vertices.length : vertices.length - 1;
  const segments = [];
  for (let index = 0; index < count; index += 1) {
    const a = vertices[index];
    const b = vertices[(index + 1) % vertices.length];
    if (samePoint(a, b)) continue;
    segments.push(bulgeSegment(a, b, Number(record.bulges?.[index]) || 0) || { type: 'line', a, b });
  }
  return segments;
};

const arcRecordToSegment = (record) => {
  const arc = {
    center: roundPoint(record.center),
    radius: numericValue(record.radius),
    startAngle: numericValue(record.startAngle),
    endAngle: numericValue(record.endAngle),
    ccw: true
  };
  return {
    type: 'arc',
    arc,
    a: roundPoint(arcPointAt(arc, arc.startAngle)),
    b: roundPoint(arcPointAt(arc, arc.endAngle))
  };
};

const recordToSegment = (record) => {
  if (record.type === 'LINE') {
    const a = roundPoint(record.start);
    const b = roundPoint(record.end);
    return samePoint(a, b) ? null : { type: 'line', a, b };
  }
  if (record.type === 'ARC') {
    const segment = arcRecordToSegment(record);
    return samePoint(segment.a, segment.b) ? null : segment;
  }
  return null;
};

const chainToSketchGeometry = (chain, closed, chordTolerance) => {
  const total = chain.length;
  const points = [];
  const modifiers = [];

  const emitPoint = (point, chord = false) => {
    if (!points.length || !samePoint(points[points.length - 1], point)) {
      points.push(chord ? { ...point, chord: true } : point);
    }
  };

  // A fillet-eligible arc sits between two line segments and runs tangent
  // to both; it contributes the virtual corner where the untrimmed lines
  // meet, and its smooth tangent points never become polygon vertices.
  const filletAt = new Array(total).fill(null);
  for (let index = 0; index < total; index += 1) {
    const segment = chain[index];
    if (segment.type !== 'arc') continue;
    const hasBothNeighbors = closed || (index > 0 && index < total - 1);
    if (!hasBothNeighbors) continue;
    const previous = chain[(index - 1 + total) % total];
    const next = chain[(index + 1) % total];
    if (previous.type !== 'line' || next.type !== 'line') continue;
    const fillet = tangentToFillet(segment, previous, next);
    if (fillet) filletAt[index] = fillet;
  }

  // chain[0].a is the wraparound junction between the last and first
  // segment; it is a tangent point (not a vertex) when the first segment
  // is itself a fillet arc.
  if (!filletAt[0]) emitPoint(chain[0].a);
  for (let index = 0; index < total; index += 1) {
    const segment = chain[index];
    if (filletAt[index]) {
      emitPoint(filletAt[index].vertex);
      modifiers.push(filletAt[index]);
      continue;
    }
    if (segment.type === 'arc') {
      // Interior chord points only: both endpoints are junction points
      // emitted (or skipped) by the junction rules below.
      const flattened = flattenArcToPoints(segment.arc, chordTolerance).map(roundPoint);
      flattened.slice(0, -1).forEach(point => emitPoint(point, true));
    }
    const isLastSegment = !closed && index === total - 1;
    if (isLastSegment || !filletAt[(index + 1) % total]) {
      emitPoint(segment.b);
    }
  }
  if (closed && points.length > 1 && samePoint(points[0], points[points.length - 1])) points.pop();
  return { points, modifiers };
};

const roundNumeric = (value) => Math.round((value + Number.EPSILON) * 1000) / 1000;

// Canonical extracted rect: rotation kept in [−45°, 45°) by swapping
// width and height past the quarter-turn — one geometry, one
// representation, whichever corner the ring starts from.
const canonicalRectSettings = ({ center, width, height, rotation }) => {
  let nextWidth = width;
  let nextHeight = height;
  let nextRotation = rotation;
  while (nextRotation >= 135 || nextRotation < -135) {
    nextRotation -= Math.sign(nextRotation) * 180;
  }
  while (nextRotation >= 45 || nextRotation < -45) {
    nextRotation -= Math.sign(nextRotation) * 90;
    [nextWidth, nextHeight] = [nextHeight, nextWidth];
  }
  return {
    center: [roundNumeric(center[0]), roundNumeric(center[1])],
    width: roundNumeric(nextWidth),
    height: roundNumeric(nextHeight),
    rotation: roundNumeric(nextRotation)
  };
};

// A closed four-vertex chain with right angles and equal opposite sides
// is a rectangle primitive (any rotation): parametric width, height,
// rotation, and per-corner fillets author it from then on.
const RIGHT_ANGLE_EPSILON = 1e-3;

const chainAsRect = (points = []) => {
  if (points.length !== 4) return null;
  for (let index = 0; index < 4; index += 1) {
    const previous = points[(index + 3) % 4];
    const current = points[index];
    const next = points[(index + 1) % 4];
    const toPrevious = [previous.x - current.x, previous.y - current.y];
    const toNext = [next.x - current.x, next.y - current.y];
    const dot = toPrevious[0] * toNext[0] + toPrevious[1] * toNext[1];
    const lengths = [Math.hypot(...toPrevious), Math.hypot(...toNext)];
    if (!lengths[0] || !lengths[1]) return null;
    if (Math.abs(dot / (lengths[0] * lengths[1])) > RIGHT_ANGLE_EPSILON) return null;
  }
  const side = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const widths = [side(points[0], points[1]), side(points[2], points[3])];
  const heights = [side(points[1], points[2]), side(points[3], points[0])];
  if (Math.abs(widths[0] - widths[1]) > DRAWING_EPSILON_MM || Math.abs(heights[0] - heights[1]) > DRAWING_EPSILON_MM) {
    return null;
  }
  const width = (widths[0] + widths[1]) / 2;
  const height = (heights[0] + heights[1]) / 2;
  const angle = (Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x) * 180) / Math.PI;
  return canonicalRectSettings({
    center: [
      (points[0].x + points[2].x) / 2,
      (points[0].y + points[2].y) / 2
    ],
    width,
    height,
    rotation: angle
  });
};

// Canonical closed-polygon order: counter-clockwise from the leftmost
// corner (ties on lowest y) — the same rectangle extracts to the same
// settings from any draw direction.
const canonicalPolygonPoints = (points = []) => {
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + (point.x * next.y - next.x * point.y);
  }, 0) / 2;
  const ordered = area < 0 ? [...points].reverse() : [...points];
  let start = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].x < ordered[start].x
      || (ordered[index].x === ordered[start].x && ordered[index].y < ordered[start].y)) {
      start = index;
    }
  }
  return ordered.slice(start).concat(ordered.slice(0, start));
};

const chainShapeFromGeometry = (geometry, closed, op, index) => {
  const points = geometry.points;
  const pointIds = points.map((_, at) => `p${at}`);
  const shapeClosed = closed && points.length >= 3;
  const rectPoints = shapeClosed ? canonicalPolygonPoints(points) : points;
  const rect = shapeClosed ? chainAsRect(rectPoints) : null;
  if (rect) {
    // A fillet modifier references the polygon vertex nearest the recorded
    // theoretical corner (the corner itself is not a segment endpoint).
    const fillets = geometry.modifiers.map(fillet => {
      let nearest = 0;
      let nearestDistance = Infinity;
      rectPoints.forEach((point, at) => {
        const distance = Math.hypot(point.x - fillet.vertex.x, point.y - fillet.vertex.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = at;
        }
      });
      return { corner: nearest, radius: fillet.radius };
    });
    return {
      id: `s${index}`,
      type: 'rect',
      op,
      center: rect.center,
      width: rect.width,
      height: rect.height,
      rotation: rect.rotation,
      fillets
    };
  }
  const modifiers = geometry.modifiers.map(fillet => {
    let nearest = 0;
    let nearestDistance = Infinity;
    points.forEach((point, at) => {
      const distance = Math.hypot(point.x - fillet.vertex.x, point.y - fillet.vertex.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = at;
      }
    });
    return { type: 'fillet', vertexId: pointIds[nearest], radius: fillet.radius };
  });
  const edgeCount = shapeClosed ? points.length : Math.max(0, points.length - 1);
  const edges = [];
  for (let at = 0; at < edgeCount; at += 1) {
    const from = pointIds[at];
    const to = pointIds[(at + 1) % points.length];
    if (from !== to) edges.push({ id: `e${at}`, type: 'line', from, to });
  }
  return {
    id: `s${index}`,
    type: 'chain',
    op: shapeClosed ? op : 'construction',
    closed: shapeClosed,
    points: points.map((point, at) => ({
      id: pointIds[at],
      x: point.x,
      y: point.y,
      ...(point.chord ? { chord: true } : {})
    })),
    edges,
    modifiers
  };
};

const extractShapesFromEntities = (entities, parameters, chordTolerance, reference) => {
  const circles = [];
  const polylines = [];
  const freeSegments = [];

  for (const entity of entities) {
    if (!entity) continue;
    if (entity.type === 'CIRCLE') {
      const radius = numericValue(entity.radius);
      if (radius > 0) circles.push({ center: roundPoint(entity.center), diameter: roundNumeric(radius * 2) });
      continue;
    }
    if (entity.type === 'POLYLINE') {
      const vertices = (entity.vertices || []).map(pointFromDxf);
      if (vertices.length >= 2) polylines.push({ vertices, closed: Boolean(entity.closed) });
      continue;
    }
    const segment = recordToSegment(entity);
    if (segment) freeSegments.push(segment);
  }

  const shapes = [];
  for (const circle of circles) {
    shapes.push({
      id: `s${shapes.length}`,
      type: 'circle',
      op: reference ? 'construction' : 'subtract',
      center: [circle.center.x, circle.center.y],
      diameter: circle.diameter
    });
  }

  const chains = polylines
    .sort((left, right) => right.vertices.length - left.vertices.length)
    .map(record => ({ segments: polylineRecordSegments(record), closed: record.closed }));
  const { chains: freeChains } = chainAllSegments(freeSegments);
  chains.push(...freeChains.map(chained => ({ segments: chained.chain, closed: chained.closed })));

  for (const { segments, closed } of chains) {
    const geometry = chainToSketchGeometry(segments, closed, chordTolerance);
    if (geometry.points.length >= 2) {
      shapes.push(chainShapeFromGeometry(geometry, closed, reference ? 'construction' : 'add', shapes.length));
    }
  }
  return shapes;
};

// A tagged group is one authored shape. It rebuilds that shape's kind
// from its own entities: a circle from its CIRCLE, a rectangle from its
// corner lines and fillet arcs, a chain from its connected segments
// (occs/README.md — shape identity). The authored id, op, and expressions
// ride the merge, which never re-classifies by geometry.
const lineSegmentsOf = (group) => group
  .filter(entity => entity.type === 'LINE')
  .map(recordToSegment)
  .filter(segment => segment && segment.type === 'line');

const arcSegmentsOf = (group) => group
  .filter(entity => entity.type === 'ARC')
  .map(arcRecordToSegment)
  .filter(segment => segment && !samePoint(segment.a, segment.b));

// The authored corner two trimmed side lines share.
const linesCrossingPoint = (first, second) => {
  const firstDirection = { x: first.b.x - first.a.x, y: first.b.y - first.a.y };
  const secondDirection = { x: second.b.x - second.a.x, y: second.b.y - second.a.y };
  const denominator = firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((second.a.x - first.a.x) * secondDirection.y - (second.a.y - first.a.y) * secondDirection.x) / denominator;
  return { x: first.a.x + firstDirection.x * t, y: first.a.y + firstDirection.y * t };
};

const arcMidpoint = (arc) => arcPointAt(
  arc,
  arc.startAngle + (arc.ccw === false ? -1 : 1) * arcAnglesTraversed(arc) / 2
);

const taggedCircleShape = (group) => {
  const circle = group.find(entity => entity.type === 'CIRCLE');
  if (!circle) return null;
  const radius = numericValue(circle.radius);
  if (!(radius > 0)) return null;
  const center = roundPoint(circle.center);
  return {
    type: 'circle',
    center: [center.x, center.y],
    diameter: roundNumeric(radius * 2)
  };
};

// The four side lines split into two parallel pairs; their crossings are
// the rectangle's corners whatever the draw direction or fillet trim.
const taggedRectShape = (group) => {
  const lines = lineSegmentsOf(group);
  if (lines.length !== 4) return null;
  const angleOf = (line) => ((Math.atan2(line.b.y - line.a.y, line.b.x - line.a.x) * 180) / Math.PI + 180) % 180;
  const angles = lines.map(angleOf);
  const [first] = angles;
  const nearFirst = lines.filter((line, index) => Math.abs(((angles[index] - first + 90) % 180) - 90) <= 1);
  const acrossFirst = lines.filter(line => !nearFirst.includes(line));
  if (nearFirst.length !== 2 || acrossFirst.length !== 2) return null;
  const crossing = (line, across) => linesCrossingPoint(line, across);
  const [firstSide, secondSide] = nearFirst;
  const [firstAcross, secondAcross] = acrossFirst;
  const corners = [
    crossing(firstSide, firstAcross),
    crossing(firstSide, secondAcross),
    crossing(secondSide, secondAcross),
    crossing(secondSide, firstAcross)
  ];
  if (corners.some(point => !point)) return null;
  const rect = chainAsRect(canonicalPolygonPoints(corners));
  if (!rect) return null;
  const rectCorners = occProfileRectCornerVertices(rect).map(([x, y]) => ({ x, y }));
  const fillets = [];
  for (const segment of arcSegmentsOf(group)) {
    const corner = nearestIndex(rectCorners, arcMidpoint(segment.arc));
    if (corner < 0 || fillets.some(fillet => fillet.corner === corner)) continue;
    const radius = roundNumeric(segment.arc.radius);
    if (radius > 0) fillets.push({ corner, radius });
  }
  return { type: 'rect', ...rect, fillets: fillets.sort((left, right) => left.corner - right.corner) };
};

const taggedChainShape = (group, chordTolerance) => {
  const segments = group
    .filter(entity => entity.type === 'LINE' || entity.type === 'ARC')
    .map(recordToSegment)
    .filter(Boolean);
  if (!segments.length) return null;
  const { chain, closed } = chainSegments(segments);
  if (chain.length < 1) return null;
  const geometry = chainToSketchGeometry(chain, closed, chordTolerance);
  if (geometry.points.length < 2) return null;
  return chainShapeFromGeometry(geometry, closed, 'construction', 0);
};

const taggedShapeFromGroup = (group, authoredShape, chordTolerance) => {
  if (authoredShape.type === 'circle') return taggedCircleShape(group);
  if (authoredShape.type === 'rect') return taggedRectShape(group);
  return taggedChainShape(group, chordTolerance);
};

// A seeded entity carries its shape's id; that group extracts back under
// the same id, so identity survives a canvas pass. Untagged entities are
// the author's new geometry and take fresh ids.
export const occProfileSketchFromEntities = (entities = [], options = {}) => {
  const parameters = options.parameters || {};
  const chordTolerance = Number.isFinite(options.chordTolerance)
    ? options.chordTolerance
    : CHORD_TOLERANCE_MM;
  const reference = Boolean(options.reference);
  const authoredById = new Map((options.shapes || []).map(shape => [shape.id, shape]));

  const tagged = new Map();
  const untagged = [];
  for (const entity of entities) {
    if (!entity) continue;
    if (entity.shapeId) {
      if (!tagged.has(entity.shapeId)) tagged.set(entity.shapeId, []);
      tagged.get(entity.shapeId).push(entity);
    } else {
      untagged.push(entity);
    }
  }

  const shapes = [];
  for (const [shapeId, group] of tagged) {
    const authored = authoredById.get(shapeId) || null;
    const rebuilt = authored ? taggedShapeFromGroup(group, authored, chordTolerance) : null;
    // An unreadable group holds the authored shape whole; a group without
    // its authored counterpart is read by geometry.
    const shape = authored
      ? { ...authored, ...(rebuilt || {}) }
      : extractShapesFromEntities(group, parameters, chordTolerance, reference)[0];
    if (shape) shapes.push({ ...shape, id: shapeId });
  }
  const fresh = extractShapesFromEntities(untagged, parameters, chordTolerance, reference);
  fresh.forEach((shape, index) => {
    shapes.push({ ...shape, id: `n${index}` });
  });

  return normalizeOccsProfileSketch({
    version: '0.2',
    units: 'mm',
    parameters,
    material: 'positive',
    shapes
  }, parameters);
};

// Extraction merges into the authored sketch instead of replacing it: an
// extracted shape sitting on an authored shape's evaluated position
// (within a rounding epsilon) keeps the authored id, op, expressions,
// and fillets — drawing, importing, or undoing never destroys parametric
// authoring. Moved or new shapes carry the extracted numerics; authored
// shapes with no extracted counterpart were erased and drop. An authored
// sketch whose expressions do not resolve falls back to the plain
// extraction (the save gate reports it).
// Rect identity is the corner ring: the same four corners (as a set —
// ring start is draw-direction noise) are the same rect whatever
// width/height/rotation triple describes them.
const rectCornersMatch = (extracted = {}, authored = {}) => {
  const extractedCorners = occProfileRectCornerVertices(extracted);
  const authoredCorners = occProfileRectCornerVertices(authored);
  const used = new Set();
  return authoredCorners.every((corner) => {
    const match = extractedCorners.findIndex((candidate, index) => (
      !used.has(index) && Math.hypot(candidate[0] - corner[0], candidate[1] - corner[1]) <= DRAWING_EPSILON_MM
    ));
    if (match < 0) return false;
    used.add(match);
    return true;
  });
};

const shapesWithinEpsilon = (extracted = {}, authored = {}) => {
  if (extracted.type !== authored.type) return false;
  if (extracted.type === 'circle') {
    return Math.hypot(authored.center[0] - extracted.center[0], authored.center[1] - extracted.center[1]) <= DRAWING_EPSILON_MM
      && Math.abs(authored.diameter - extracted.diameter) <= DRAWING_EPSILON_MM;
  }
  if (extracted.type === 'rect') return rectCornersMatch(extracted, authored);
  if (Boolean(authored.closed) !== Boolean(extracted.closed)) return false;
  const authoredPoints = authored.points || [];
  const extractedPoints = extracted.points || [];
  if (authoredPoints.length !== extractedPoints.length) return false;
  return authoredPoints.every((point, index) => (
    Math.hypot(point.x - extractedPoints[index].x, point.y - extractedPoints[index].y) <= DRAWING_EPSILON_MM
  ));
};

const nearestIndex = (points = [], point = {}) => {
  let nearest = -1;
  let nearestDistance = Infinity;
  points.forEach((candidate, index) => {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = index;
    }
  });
  return nearest;
};

// A rect and a closed four-corner chain describe one polygon: extraction
// classifies by geometry, so a filleted chain can come back as a rect.
// The authored kind is identity — the corner ring is the match.
const rectFamilyCorners = (shape = {}) => {
  if (shape.type === 'rect') return occProfileRectCornerVertices(shape);
  if (shape.type === 'chain' && shape.closed && (shape.points || []).length === 4) {
    return shape.points.map(point => [point.x, point.y]);
  }
  return null;
};

const cornerRingsMatch = (left, right) => {
  if (!left || !right || left.length !== right.length) return false;
  const used = new Set();
  return left.every(([x, y]) => {
    const index = right.findIndex(([rx, ry], at) => (
      !used.has(at) && Math.hypot(rx - x, ry - y) <= DRAWING_EPSILON_MM
    ));
    if (index < 0) return false;
    used.add(index);
    return true;
  });
};

const sameShapeFamily = (extracted = {}, authored = {}) => {
  if (extracted.type === authored.type) return true;
  return cornerRingsMatch(rectFamilyCorners(extracted), rectFamilyCorners(authored))
    && cornerRingsMatch(rectFamilyCorners(authored), rectFamilyCorners(extracted));
};

// An extraction that carries no readable geometry (a tagged group held
// whole) leaves the authored fillets in place.
const holdsAuthoredGeometry = (points = []) => !points.length || points.some(point => (
  !Number.isFinite(point?.x) || !Number.isFinite(point?.y)
));

const authoredChainModifiers = (authoredShape) => (authoredShape?.modifiers || [])
  .filter(modifier => modifier?.type === 'fillet')
  .map(modifier => ({ type: 'fillet', vertexId: modifier.vertexId, radius: modifier.radius }));

// Fillets come from the extraction (an erased arc clears its radius); the
// authored radius expression rides along when the value still matches.
const chainFilletsFromExtraction = (extractedShape, authoredShape, evaluatedShape, mergeField) => {
  const authoredPoints = authoredShape?.points || [];
  const authoredFillet = new Map((authoredShape?.modifiers || [])
    .filter(modifier => modifier?.type === 'fillet')
    .map(modifier => [modifier.vertexId, modifier.radius]));
  const evaluatedFillet = new Map((evaluatedShape?.modifiers || [])
    .filter(modifier => modifier?.type === 'fillet')
    .map(modifier => [modifier.vertexId, modifier.radius]));
  const extractedPoints = extractedShape?.type === 'rect'
    ? occProfileRectCornerVertices(extractedShape).map(([x, y]) => ({ x, y }))
    : (extractedShape?.points || []);
  if (authoredPoints.length && holdsAuthoredGeometry(extractedPoints)) {
    return authoredChainModifiers(authoredShape);
  }
  // Matching runs on evaluated geometry; the authored model carries the
  // ids and the raw expressions.
  const evaluatedPoints = (evaluatedShape?.points || []).length
    ? evaluatedShape.points
    : authoredPoints;
  const extracted = [];
  if (extractedShape?.type === 'rect') {
    const corners = occProfileRectCornerVertices(extractedShape);
    for (const fillet of extractedShape.fillets || []) {
      const [x, y] = corners[fillet.corner] || [];
      if (Number.isFinite(x) && Number.isFinite(y)) extracted.push({ point: { x, y }, radius: fillet.radius });
    }
  } else {
    for (const modifier of extractedShape?.modifiers || []) {
      if (modifier?.type !== 'fillet') continue;
      const index = Number(String(modifier.vertexId ?? '').slice(1));
      const point = Number.isInteger(index) ? extractedPoints[index] : null;
      if (point) extracted.push({ point, radius: modifier.radius });
    }
  }
  const modifiers = [];
  for (const { point, radius } of extracted) {
    const nearest = nearestIndex(evaluatedPoints.length ? evaluatedPoints : extractedPoints, point);
    const vertexId = authoredPoints[nearest]?.id || evaluatedPoints[nearest]?.id || extractedPoints[nearest]?.id;
    if (!vertexId) continue;
    const merged = mergeField(
      authoredFillet.get(vertexId),
      evaluatedFillet.get(vertexId),
      Number(radius)
    );
    if (merged === 0 || merged === '0' || merged === undefined) continue;
    modifiers.push({ type: 'fillet', vertexId, radius: merged });
  }
  return modifiers;
};

const authoredRectFillets = (authoredShape) => (authoredShape?.fillets || [])
  .map(fillet => ({ corner: fillet.corner, radius: fillet.radius }));

const rectFilletsFromExtraction = (extractedShape, authoredShape, evaluatedShape, mergeField) => {
  const authoredFillets = new Map((authoredShape?.fillets || []).map(fillet => [fillet.corner, fillet.radius]));
  const evaluatedFillets = new Map((evaluatedShape?.fillets || []).map(fillet => [fillet.corner, fillet.radius]));
  const authoredCorners = occProfileRectCornerVertices(
    evaluatedShape?.type === 'rect' ? evaluatedShape : authoredShape
  );
  const extractedCorners = extractedShape.type === 'rect'
    ? occProfileRectCornerVertices(extractedShape)
    : (extractedShape.points || []).map(point => [point.x, point.y]);
  if (holdsAuthoredGeometry(extractedCorners.map(([x, y]) => ({ x, y })))) {
    return authoredRectFillets(authoredShape);
  }
  const fillets = [];
  const pushAt = (point, radius) => {
    if (!point) return;
    const corner = nearestIndex(authoredCorners.map(([x, y]) => ({ x, y })), point);
    if (corner < 0) return;
    const merged = mergeField(authoredFillets.get(corner), evaluatedFillets.get(corner), Number(radius));
    if (merged === 0 || merged === '0' || merged === undefined) return;
    fillets.push({ corner, radius: merged });
  };
  if (extractedShape.type === 'rect') {
    const corners = occProfileRectCornerVertices(extractedShape).map(([x, y]) => ({ x, y }));
    for (const fillet of extractedShape.fillets || []) pushAt(corners[fillet.corner], fillet.radius);
  } else {
    const points = extractedShape.points || [];
    for (const modifier of extractedShape.modifiers || []) {
      if (modifier?.type !== 'fillet') continue;
      const index = Number(String(modifier.vertexId ?? '').slice(1));
      pushAt(points[index], modifier.radius);
    }
  }
  return fillets.sort((left, right) => left.corner - right.corner);
};

const mergeRectShape = (extractedShape, authoredShape, evaluatedShape, mergeField) => {
  const field = (key, index) => mergeField(
    index === undefined ? authoredShape?.[key] : authoredShape?.[key]?.[index],
    index === undefined ? evaluatedShape?.[key] : evaluatedShape?.[key]?.[index],
    index === undefined ? extractedShape?.[key] : extractedShape?.[key]?.[index]
  );
  return {
    ...authoredShape,
    center: [field('center', 0), field('center', 1)],
    width: field('width'),
    height: field('height'),
    rotation: field('rotation'),
    fillets: rectFilletsFromExtraction(extractedShape, authoredShape, evaluatedShape, mergeField)
  };
};

// Chain merge: the per-point position law — an extracted point sitting
// on an authored point's evaluated position keeps the authored id and
// expression coordinates; a moved point keeps its authored expression
// when it names a parameter (the drag edits that parameter), otherwise
// it carries the extracted numerics. Fillet modifiers survive the same
// way: an authored fillet whose vertex survived stays, extracted
// fillets remap onto the merged ids of their slots.
const mergeChainShape = (extractedShape, authoredShape, evaluatedShape, mergeField) => {
  const evaluatedPoints = evaluatedShape?.points || [];
  const authoredPoints = authoredShape?.points || [];
  const used = new Set();
  const points = extractedShape.points.map((point, index) => {
    let best = null;
    for (const candidate of evaluatedPoints) {
      if (used.has(candidate.id) || Boolean(candidate.chord) !== Boolean(point.chord)) continue;
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance <= DRAWING_EPSILON_MM && (!best || distance < best.distance)) best = candidate;
    }
    if (best) {
      used.add(best.id);
      const original = authoredPoints.find(item => item.id === best.id);
      return original ? { id: original.id, x: original.x, y: original.y } : { ...point };
    }
    const original = authoredPoints[index];
    if (!original) return { ...point };
    return {
      id: original.id,
      x: mergeField(original.x, evaluatedPoints[index]?.x, point.x),
      y: mergeField(original.y, evaluatedPoints[index]?.y, point.y),
      ...(point.chord ? { chord: true } : {})
    };
  });
  const modifiers = chainFilletsFromExtraction(extractedShape, authoredShape, evaluatedShape, mergeField);
  return {
    ...authoredShape,
    closed: extractedShape.closed,
    points,
    modifiers
  };
};

export const mergeOccsProfileSketchGeometry = (extracted = {}, authored = {}, externalParameters = {}) => {
  let source = null;
  try {
    // The external scope joins the evaluation: a sketch whose fields
    // read the cassette's globals keeps its bindings through the merge.
    // The scope never stores.
    source = evaluateOccsProfileSketch(authored, externalParameters);
  } catch {
    // A refused merge returns the authored table (occs/README.md).
    return normalizeOccsProfileSketch(authored);
  }
  const usedAuthored = new Set();
  // A moved field keeps its authored expression when it names a
  // parameter — the drag edits that parameter (the dimension is that
  // parameter's editor); compound expressions and numerics carry the
  // extracted value.
  const parameterEdits = {};
  const bareParameter = (value) => (
    typeof value === 'string'
    && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
    && Object.prototype.hasOwnProperty.call(authored.parameters || {}, value)
    && Number.isFinite(Number(authored.parameters[value]))
  );
  const mergeField = (authoredValue, evaluatedValue, extractedValue) => {
    // Extraction noise never rewrites an authored number.
    if (Number.isFinite(authoredValue) && Number.isFinite(extractedValue)
      && Math.abs(authoredValue - extractedValue) <= DRAWING_EPSILON_MM) return authoredValue;
    // An authored expression that resolves is the author's truth: drift
    // never rewrites it into a number. A bare parameter follows the
    // dragged geometry through the parameter table.
    if (typeof authoredValue === 'string' && Number.isFinite(evaluatedValue)) {
      // A bare parameter absorbs an intentional move, never rounding
      // noise: the field is the parameter's editor.
      if (bareParameter(authoredValue) && Number.isFinite(extractedValue)
        && (!Number.isFinite(evaluatedValue) || Math.abs(evaluatedValue - extractedValue) > DRAWING_EPSILON_MM)) {
        parameterEdits[authoredValue] = extractedValue;
      }
      return authoredValue;
    }
    return Number.isFinite(extractedValue) ? extractedValue : authoredValue;
  };
  // A tagged extraction names its authored shape outright: identity is
  // the tag, so geometry never decides the kind.
  const authoredById = new Map(authored.shapes.map(shape => [shape.id, shape]));
  const shapes = extracted.shapes.map((shape) => {
    const tagged = authoredById.get(shape.id) || null;
    // The tagged shape's evaluated counterpart carries the numbers; the
    // authored one carries the expressions.
    let best = tagged
      ? source.shapes.find(candidate => candidate.id === tagged.id) || null
      : null;
    let bestMatches = 0;
    for (const candidate of tagged ? [] : source.shapes) {
      if (usedAuthored.has(candidate.id) || !sameShapeFamily(shape, candidate)) continue;
      if (shape.type === 'chain' && candidate.type === 'chain') {
        const matches = candidate.points.filter((candidatePoint, index) => (
          shape.points[index] && Math.hypot(
            candidatePoint.x - shape.points[index].x,
            candidatePoint.y - shape.points[index].y
          ) <= DRAWING_EPSILON_MM
        )).length;
        if (matches > bestMatches) {
          best = candidate;
          bestMatches = matches;
        }
        continue;
      }
      if (!best && (candidate.type !== shape.type || shapesWithinEpsilon(shape, candidate))) best = candidate;
    }
    if (!best && tagged) best = tagged;
    if (!best) return { ...shape, __fresh: true };
    usedAuthored.add(best.id);
    const pool = tagged
      || authored.shapes.find(authoredShape => authoredShape.id === best.id);
    const original = pool || best;
    if (shape.type === 'chain' && original.type === 'chain') {
      // Point ids are per-shape identity: the authored ids ride the kept
      // shape so its fillet modifiers stay referenced.
      return mergeChainShape(shape, original, best, mergeField);
    }
    if (original.type === 'chain') {
      // Extraction classified the polygon as a rect; the authored chain
      // keeps its kind, points, and expressions.
      return {
        ...original,
        closed: shape.closed ?? original.closed,
        modifiers: chainFilletsFromExtraction(shape, original, best, mergeField)
      };
    }
    if (shape.type === 'rect') return mergeRectShape(shape, original, best, mergeField);
    return { ...original, fillets: rectFilletsFromExtraction(shape, original, best, mergeField) };
  });
  // Field-wise revive: a leftover extracted shape pairs with a leftover
  // authored shape of the same kind and keeps the authored expression on
  // every field whose evaluated value still matches the extracted
  // geometry.
  const authoredPool = [...(authored.shapes || [])];
  const evaluatedById = new Map(source.shapes.map(shape => [shape.id, shape]));
  const paired = new Set();
  for (const shape of shapes) {
    if (!shape.__fresh || (shape.type !== 'rect' && shape.type !== 'circle')) continue;
    const authoredShape = authoredPool.find(candidate => (
      !usedAuthored.has(candidate.id) && !paired.has(candidate.id) && candidate.type === shape.type
    ));
    const evaluatedShape = authoredShape ? evaluatedById.get(authoredShape.id) : null;
    if (!authoredShape || !evaluatedShape) continue;
    paired.add(authoredShape.id);
    delete shape.__fresh;
    shape.id = authoredShape.id;
    shape.op = authoredShape.op;
    shape.center = [
      mergeField(authoredShape.center[0], evaluatedShape.center[0], shape.center[0]),
      mergeField(authoredShape.center[1], evaluatedShape.center[1], shape.center[1])
    ];
    if (shape.type === 'circle') {
      shape.diameter = mergeField(authoredShape.diameter, evaluatedShape.diameter, shape.diameter);
      continue;
    }
    shape.width = mergeField(authoredShape.width, evaluatedShape.width, shape.width);
    shape.height = mergeField(authoredShape.height, evaluatedShape.height, shape.height);
    shape.rotation = mergeField(authoredShape.rotation, evaluatedShape.rotation, shape.rotation);
    const authoredFillets = new Map((authoredShape.fillets || []).map(fillet => [fillet.corner, fillet.radius]));
    const evaluatedFillets = new Map((evaluatedShape.fillets || []).map(fillet => [fillet.corner, fillet.radius]));
    shape.fillets = (shape.fillets || [])
      .map(fillet => ({
        corner: fillet.corner,
        radius: mergeField(authoredFillets.get(fillet.corner), evaluatedFillets.get(fillet.corner), fillet.radius)
      }))
      .filter(fillet => fillet.radius !== 0);
  }
  // Fresh shapes renumber against every kept id — an extracted id that
  // happens to equal a kept id still renumbers (identity, not the id,
  // decides kept-ness).
  const taken = new Set(shapes.map(shape => shape.id));
  let nextId = 0;
  for (const shape of shapes) {
    if (!shape.__fresh) continue;
    delete shape.__fresh;
    while (taken.has(`s${nextId}`)) nextId += 1;
    const id = `s${nextId}`;
    taken.add(id);
    shape.id = id;
  }
  // The sequence is semantic (ordered CSG): kept shapes ride their
  // authored slots, fresh shapes append in drawing order.
  const mergedById = new Map(shapes.map(shape => [shape.id, shape]));
  const authoredOrder = authoredPool
    .map(shape => mergedById.get(shape.id))
    .filter(Boolean);
  const sequenced = [
    ...authoredOrder,
    ...shapes.filter(shape => !authoredOrder.includes(shape))
  ];
  return {
    ...extracted,
    material: authored.material || extracted.material,
    parameters: Object.keys(parameterEdits).length
      ? { ...(authored.parameters || extracted.parameters || {}), ...parameterEdits }
      : authored.parameters || extracted.parameters,
    shapes: sequenced
  };
};

// Rebuilds CAD entity records from a sketch so the canvas can seed with
// the exact geometry: circles become CIRCLE entities, rectangles and
// chains become discrete line segments with a tangent arc at every
// fillet corner. This is the deterministic inverse of
// `occProfileSketchFromEntities`' fillet path. Expression-bound fields
// evaluate against the parameter table first — an unresolvable
// expression throws (callers gate on savable).
export const occProfileEntitiesFromSketch = (sketch = {}, options = {}) => {
  const normalized = evaluateOccsProfileSketch(sketch, options.parameters);
  const entities = [];

  for (const shape of normalized.shapes) {
    if (shape.type === 'circle') {
      const diameter = numericValue(shape.diameter);
      if (diameter > 0) {
        entities.push({
          type: 'CIRCLE',
          center: roundPoint({ x: shape.center[0], y: shape.center[1] }),
          radius: diameter / 2
        });
      }
      continue;
    }

    const radiusById = new Map();
    if (shape.type === 'rect') {
      for (const fillet of shape.fillets) {
        radiusById.set(`r${fillet.corner}`, Math.max(0, fillet.radius));
      }
    } else {
      for (const modifier of shape.modifiers) {
        radiusById.set(modifier.vertexId, Math.max(0, modifier.radius));
      }
    }
    const vertices = shape.type === 'rect'
      ? occProfileRectCornerVertices(shape).map(([x, y]) => ({ x, y }))
      : shape.points.map(point => ({ x: point.x, y: point.y }));
    const corners = [];
    // Rectangles are closed by kind; chains carry their own closure.
    const closed = (shape.type === 'rect' || shape.closed) && vertices.length >= 3;

    for (let index = 0; index < vertices.length; index += 1) {
      const vertex = vertices[index];
      const previous = closed ? vertices[(index - 1 + vertices.length) % vertices.length] : vertices[index - 1];
      const next = closed ? vertices[(index + 1) % vertices.length] : vertices[index + 1];
      const isFirstOpenEnd = !closed && index === 0;
      const isLastOpenEnd = !closed && index === vertices.length - 1;
      const key = shape.type === 'rect' ? `r${index}` : shape.points[index].id;
      const radius = radiusById.get(key) || 0;
      if (!previous || !next || isFirstOpenEnd || isLastOpenEnd || radius <= 0) {
        corners.push({ vertex, radius: 0 });
        continue;
      }
      const toPrevious = { x: previous.x - vertex.x, y: previous.y - vertex.y };
      const toNext = { x: next.x - vertex.x, y: next.y - vertex.y };
      const lengthPrevious = Math.hypot(toPrevious.x, toPrevious.y);
      const lengthNext = Math.hypot(toNext.x, toNext.y);
      if (!lengthPrevious || !lengthNext) {
        corners.push({ vertex, radius: 0 });
        continue;
      }
      const unitPrevious = { x: toPrevious.x / lengthPrevious, y: toPrevious.y / lengthPrevious };
      const unitNext = { x: toNext.x / lengthNext, y: toNext.y / lengthNext };
      const cosine = unitPrevious.x * unitNext.x + unitPrevious.y * unitNext.y;
      const interiorAngle = Math.acos(Math.max(-1, Math.min(1, cosine)));
      if (interiorAngle >= Math.PI - TANGENT_EPSILON || interiorAngle <= TANGENT_EPSILON) {
        corners.push({ vertex, radius: 0 });
        continue;
      }
      const tangentDistance = radius / Math.tan(interiorAngle / 2);
      const trim = Math.min(
        tangentDistance,
        lengthPrevious * 0.49,
        lengthNext * 0.49
      );
      // A radius larger than the adjacent segments allow clamps to the
      // largest fillet that fits: the arc is derived from the trimmed
      // tangent points, so it stays tangent to both segments and
      // extraction maps it back to the fillet instead of flattening it
      // into chords.
      const fittedRadius = trim * Math.tan(interiorAngle / 2);
      const start = { x: vertex.x + unitPrevious.x * trim, y: vertex.y + unitPrevious.y * trim };
      const end = { x: vertex.x + unitNext.x * trim, y: vertex.y + unitNext.y * trim };
      const bisector = {
        x: unitPrevious.x + unitNext.x,
        y: unitPrevious.y + unitNext.y
      };
      const bisectorLength = Math.hypot(bisector.x, bisector.y);
      const centerDistance = fittedRadius / Math.sin(interiorAngle / 2);
      const center = {
        x: vertex.x + (bisector.x / bisectorLength) * centerDistance,
        y: vertex.y + (bisector.y / bisectorLength) * centerDistance
      };
      corners.push({
        vertex,
        radius: fittedRadius,
        trim,
        start,
        end,
        center
      });
    }

    const emitEdge = (from, to) => {
      if (!from || !to || samePoint(from, to)) return;
      entities.push({ type: 'LINE', start: roundPoint(from), end: roundPoint(to) });
    };
    const emitCorner = (corner) => {
      if (corner.radius > 0 && corner.center) {
        const startAngle = Math.atan2(corner.start.y - corner.center.y, corner.start.x - corner.center.x);
        const endAngle = Math.atan2(corner.end.y - corner.center.y, corner.end.x - corner.center.x);
        let sweep = endAngle - startAngle;
        while (sweep < 0) sweep += Math.PI * 2;
        while (sweep >= Math.PI * 2) sweep -= Math.PI * 2;
        // Fillets are minor arcs; a major sweep means the start/end pair is
        // wound the other way around the center.
        entities.push(sweep <= Math.PI
          ? { type: 'ARC', center: roundPoint(corner.center), radius: corner.radius, startAngle, endAngle, ccw: true }
          : { type: 'ARC', center: roundPoint(corner.center), radius: corner.radius, startAngle: endAngle, endAngle: startAngle, ccw: true });
      }
    };

    for (let index = 0; index < corners.length; index += 1) {
      const corner = corners[index];
      const nextCorner = closed ? corners[(index + 1) % corners.length] : corners[index + 1];
      emitCorner(corner);
      if (!nextCorner) break;
      const edgeStart = corner.radius > 0 && corner.end ? corner.end : corner.vertex;
      const edgeEnd = nextCorner.radius > 0 && nextCorner.start ? nextCorner.start : nextCorner.vertex;
      emitEdge(edgeStart, edgeEnd);
    }
  }

  return entities;
};
