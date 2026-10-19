// The profile sketch editor as a plugin surface component: a CAD canvas
// (the vendored MLightCAD runtime, loaded lazily from the executor's
// static tree) over the OCCS profile shape model. Drawing, snapping,
// grips, and undo/redo run in the engine; entity records and the sketch
// model normalize through occs/profiles.js.
import {
  OCCS_PROFILE_SHAPE_OPS,
  adoptOccsProfileBindingParameter,
  createEmptyOccsProfileSketch,
  evaluateOccsProfileSketch,
  isOccsProfileSketchSavable,
  mergeOccsProfileSketchGeometry,
  normalizeOccsProfileSketch,
  occProfileEntitiesFromSketch,
  occProfileRectCornerVertices,
  occProfileSketchFromEntities,
  occsProfileFromSketch,
  renameOccsProfileSketchParameter,
  resolveOccsProfileSectionOperations
} from '../../../occs/profiles.js';
import { resolveOccsExpression } from '../../../occs/expressions.js';
import { foldCassetteV2Region } from '../cassetteV2Clipper.js';
import { toolIcon } from './toolIcons.mjs';
import createFieldDraft from './fieldDraft.mjs';

const EXTRACT_DEBOUNCE_MS = 40;

// The engine's glyph-redraw timer runs 50 ms after its font preload
// resolves; teardown settles at least that long before destroying the
// manager singleton the timer reads.
const GLYPH_REDRAW_SETTLE_MS = 80;

// Header-only blank DXF: the open pipeline fills the layer, layout,
// and model-space defaults itself, so no template file (vendored or
// CDN) is needed to boot a drawable document.
const BLANK_DXF = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1027\n0\nENDSEC\n0\nEOF\n';

const SHAPE_KIND_ICON = { circle: 'circle', rect: 'rectang', chain: 'polyline' };
const SHAPE_KIND_LABEL = {
  circle: 'cassette.v2.profileEditor.tools.circle',
  rect: 'cassette.v2.profileEditor.tools.rectangle',
  chain: 'cassette.v2.profileEditor.tools.polyline'
};

export default function createSketchEditor({ vue, components, locale }) {
  const { h, ref, shallowRef, computed, watch, onMounted, onBeforeUnmount, nextTick, defineComponent } = vue;
  const t = locale.t;
  const { Button, InputText, Message, Toolbar, SelectButton } = components;

  // The engine singleton is destroyed and re-created per mount; a pending
  // destroy must finish first or its teardown would clobber the new instance.
  let engineChain = Promise.resolve();

  return defineComponent({
    name: 'ProfileSketchEditor',
    props: {
      modelValue: { type: Object, default: null },
      // The surrounding scope's parameters (the cassette's globals): a
      // field expression naming one of them reads it — evaluation joins
      // the scope, adopt-on-bind never mints it (occs/README.md).
      externalParameters: { type: Object, default: () => ({}) }
    },
    emits: ['update:modelValue', 'profile'],
    setup(props, { emit }) {
      const containerRef = ref(null);
      const fileInputRef = ref(null);
      const runtime = shallowRef(null);
      const engineError = ref('');
      const importError = ref('');
      const activeTool = ref('select');
      const importedFileName = ref('');
      const orthoMode = ref(false);
      const tangentSnap = ref(false);
      const commandLine = ref(false);
      const selectedCorner = ref(null);
      const selectedShape = ref(null);
      const lastPointerAt = ref(null);
      const overlayRef = ref(null);

      let manager = null;
      let dbListeners = [];
      let extractTimer = null;
      let lastEmitted = '';
      let disposed = false;
      let zoomObserver = null;
      // Authored shapes dropped by a merge (an erase): offered back as
      // adoption candidates so an engine undo/redo that restores canvas
      // geometry revives their expressions. Session state — never
      // stored, cleared with the canvas.
      let droppedShapes = [];
      // The construction document opens in Write mode; the blank and any
      // imported document must keep it — Read-mode documents silently
      // refuse the mode-gated draw commands. The bundle exports no mode
      // enum, so the value is read off the fresh document, never hardcoded.
      let writeMode;
      // DXF osnap bit for Tangent (mode 9 → bit 1<<8): the engine's
      // settings-manager mask uses the standard OSMODE encoding, where
      // bit = osnap mode value − 1 (endpoint 1<<0 … centroid 1<<10).
      const OSNAP_MODE_BITS = {
        endpoint: 1 << 0,
        midpoint: 1 << 1,
        center: 1 << 2,
        quadrant: 1 << 4,
        intersection: 1 << 5,
        tangent: 1 << 8,
        nearest: 1 << 9
      };
      // The settings manager persists osnapModes to localStorage per
      // origin and a stored value permanently overrides the engine's
      // shipped defaults — a stale mask silently kills every snap. The
      // editor owns its drafting set: assert the default mask on mount;
      // the Tangent toggle rides on top.
      const OSNAP_DEFAULT_MASK = OSNAP_MODE_BITS.endpoint | OSNAP_MODE_BITS.midpoint
        | OSNAP_MODE_BITS.center | OSNAP_MODE_BITS.quadrant
        | OSNAP_MODE_BITS.intersection | OSNAP_MODE_BITS.nearest;

      const toggleOrtho = () => {
        const database = manager?.curDocument?.database;
        if (!database) return;
        orthoMode.value = !orthoMode.value;
        database.orthomode = orthoMode.value ? 1 : 0;
      };

      const toggleTangentSnap = () => {
        const settings = runtime.value?.AcApSettingManager?.instance;
        if (!settings) return;
        tangentSnap.value = !tangentSnap.value;
        settings.osnapModes = OSNAP_DEFAULT_MASK
          | (tangentSnap.value ? OSNAP_MODE_BITS.tangent : 0);
      };

      // The engine CLI is the only desktop surface for typed prompt entry
      // (bare length, dist<angle, @x,y — vendor README); the toggle reveals
      // it on demand, the mount asserts it back off (clean-chrome law).
      const toggleCommandLine = () => {
        const settings = runtime.value?.AcApSettingManager?.instance;
        if (!settings) return;
        commandLine.value = !commandLine.value;
        settings.isShowCommandLine = commandLine.value;
      };

      // The material half of the zero axis is the boolean body — the
      // toggle flips which side of the axis hatches and clips.
      const toggleMaterialSide = () => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        commitSketch({ ...normalized, material: normalized.material === 'positive' ? 'negative' : 'positive' });
      };

      // The resolved face after the profile's operations (outer rings
      // and holes, world coordinates) — recomputed debounced from the
      // authored model. The hatch IS the face: the material half united
      // with the adds, minus the subtracts. The authored primitives
      // stay plain engine lines beneath it — hatch and strong outline
      // are what goes to the cassette, bare lines are what is drawn.
      const resolvedFace = shallowRef(null);
      const outlineError = ref('');
      let outlineTimer = null;
      const resolveOutline = async () => {
        outlineTimer = null;
        if (disposed) return;
        outlineError.value = '';
        try {
          const normalized = normalizeOccsProfileSketch(props.modelValue || {});
          const { section } = occsProfileFromSketch(normalized, { parameters: externalScope() });
          if (section?.type !== 'shapes') {
            resolvedFace.value = null;
            return;
          }
          const span = 1e5;
          const half = normalized.material === 'negative'
            ? [[0, -span], [-span, -span], [-span, span], [0, span]]
            : [[0, -span], [span, -span], [span, span], [0, span]];
          const resolved = await foldCassetteV2Region(
            { polygons: [half], holes: [] },
            resolveOccsProfileSectionOperations(section)
          );
          resolvedFace.value = resolved;
          const participates = section.shapes.some(shape => shape.op !== 'construction');
          if (participates && ![...(resolved?.polygons || []), ...(resolved?.holes || [])].length) {
            outlineError.value = t('cassette.v2.profileEditor.resultClipped');
          }
        } catch (error) {
          resolvedFace.value = null;
          outlineError.value = error?.message || String(error);
        }
      };
      const scheduleOutlineResolve = () => {
        if (outlineTimer) clearTimeout(outlineTimer);
        outlineTimer = setTimeout(resolveOutline, 120);
      };

      // Canvas annotations are a derived overlay — extraction never
      // reads them back. The computed re-runs on a tick bumped from the
      // view's render frame, so pan/zoom redraw it.
      const viewTick = ref(0);
      const bumpViewTick = () => { viewTick.value += 1; };

      // Dimension stacking: dims on the same side of the same baseline
      // chain outward (18px, then 40, 62…). Bands key on the WORLD
      // midpoint, so pan/zoom keeps every dim in its slot — screen-space
      // banding reshuffled same-label inputs onto each other mid-edit.
      const createDimStack = () => {
        const slots = new Map();
        return (worldMid, horizontal, side) => {
          const along = horizontal ? worldMid[1] : worldMid[0];
          const slotKey = `${side}:${Math.round(along / 12)}`;
          const slot = slots.get(slotKey) || 0;
          slots.set(slotKey, slot + 1);
          return 18 + slot * 22;
        };
      };

      // One linear dimension between world points a and b, drawn on the
      // side away from `inward` (the side the geometry occupies) —
      // drafting law: dimensions sit outside the figure, the label on
      // the dimension line. Editable dims carry their field binding —
      // the label shows the parameter expression where one is bound,
      // the measured number otherwise; the input's background breaks
      // the line. Short spans keep their line and label; only the
      // arrowheads are dropped.
      const linearDim = (key, a, b, inward, label, editable, toScreen, stack) => {
        const [ax, ay] = toScreen(a[0], a[1]);
        const [bx, by] = toScreen(b[0], b[1]);
        const nx = b[1] - a[1];
        const ny = a[0] - b[0];
        const outward = (inward[0] - (a[0] + b[0]) / 2) * nx + (inward[1] - (a[1] + b[1]) / 2) * ny > 0
          ? [-nx, -ny]
          : [nx, ny];
        const nl = Math.hypot(outward[0], outward[1]) || 1;
        const [dx, dy] = toScreen(a[0] + outward[0] / nl, a[1] + outward[1] / nl);
        let ux = dx - ax;
        let uy = dy - ay;
        const ul = Math.hypot(ux, uy) || 1;
        ux /= ul;
        uy /= ul;
        const a0 = [ax + ux * 2, ay + uy * 2];
        const b0 = [bx + ux * 2, by + uy * 2];
        const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);
        const side = horizontal ? (uy > 0 ? 'below' : 'above') : (ux > 0 ? 'right' : 'left');
        const off = stack
          ? stack([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], horizontal, side)
          : 18;
        const a1 = [ax + ux * off, ay + uy * off];
        const b1 = [bx + ux * off, by + uy * off];
        return {
          key,
          extensionA: [...a0, a1[0] + ux * 4, a1[1] + uy * 4],
          extensionB: [...b0, b1[0] + ux * 4, b1[1] + uy * 4],
          line: [...a1, ...b1],
          labelAt: [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2],
          arrows: Math.hypot(b1[0] - a1[0], b1[1] - a1[1]) >= 36,
          text: label,
          editable
        };
      };

      const chainDimensions = (shape, toScreen, stack) => {
        const corners = shape.points.filter(point => !point.chord);
        const closed = shape.closed && corners.length >= 3;
        const centroid = corners.length
          ? corners
            .reduce((sum, point) => [sum[0] + point.x, sum[1] + point.y], [0, 0])
            .map(value => value / corners.length)
          : [0, 0];
        const dimensions = [];
        const edgeCount = corners.length >= 2 ? (closed ? corners.length : corners.length - 1) : 0;
        for (let index = 0; index < edgeCount; index += 1) {
          const a = corners[index];
          const b = corners[(index + 1) % corners.length];
          const worldLength = Math.hypot(b.x - a.x, b.y - a.y);
          if (worldLength < 1e-6) continue;
          const dim = linearDim(`${shape.id}-${a.id}-${b.id}`, [a.x, a.y], [b.x, b.y], centroid, worldLength.toFixed(1), null, toScreen, stack);
          if (dim) dimensions.push(dim);
        }
        return dimensions;
      };

      const fieldLabel = (value, evaluatedValue) => (
        typeof value === 'string' ? value : (Number.isFinite(evaluatedValue) ? evaluatedValue.toFixed(1) : '?')
      );

      // Primitive dimensions: rect (width, height, distance from the
      // axis, height from the origin) and circle (diameter, distance
      // from the axis, height from the origin) — each bound to its field,
      // editable in place.
      const primitiveDimensions = (authoredShape, shape, toScreen, stack) => {
        const dims = [];
        const editable = (fieldKey, value, readEvaluated, apply) => ({
          shapeId: shape.id,
          fieldKey,
          value,
          ariaLabel: `${fieldKey} ${shape.id}`,
          readEvaluated,
          apply
        });
        const push = (fieldKey, a, b, side, value, readEvaluated, apply) => {
          const dim = linearDim(
            `${shape.id}:${fieldKey}`, a, b, side,
            fieldLabel(value, typeof value === 'number' ? value : null),
            editable(fieldKey, value, readEvaluated, apply),
            toScreen,
            stack
          );
          if (dim) dims.push(dim);
        };
        if (shape.type === 'rect') {
          const corners = occProfileRectCornerVertices(shape);
          const centroid = [
            (corners[0][0] + corners[2][0]) / 2,
            (corners[0][1] + corners[2][1]) / 2
          ];
          const xs = corners.map(corner => corner[0]);
          const ys = corners.map(corner => corner[1]);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          push('width', corners[0], corners[1], centroid, authoredShape?.width ?? shape.width,
            s => s?.width, (s, next) => ({ ...s, width: next }));
          push('height', corners[1], corners[2], centroid, authoredShape?.height ?? shape.height,
            s => s?.height, (s, next) => ({ ...s, height: next }));
          push('center-x', [0, minY], [centroid[0], minY], centroid, authoredShape?.center?.[0] ?? shape.center[0],
            s => s?.center?.[0], (s, next) => ({ ...s, center: [next, s.center[1]] }));
          push('center-y', [minX, 0], [minX, centroid[1]], centroid, authoredShape?.center?.[1] ?? shape.center[1],
            s => s?.center?.[1], (s, next) => ({ ...s, center: [s.center[0], next] }));
        }
        if (shape.type === 'circle') {
          const radius = shape.diameter / 2;
          const [cx, cy] = shape.center;
          push('diameter', [cx - radius, cy], [cx + radius, cy], [cx, cy], authoredShape?.diameter ?? shape.diameter,
            s => s?.diameter, (s, next) => ({ ...s, diameter: next }));
          push('center-x', [0, cy - radius], [cx, cy - radius], [cx, cy], authoredShape?.center?.[0] ?? shape.center[0],
            s => s?.center?.[0], (s, next) => ({ ...s, center: [next, s.center[1]] }));
          push('center-y', [cx - radius, 0], [cx - radius, cy], [cx, cy], authoredShape?.center?.[1] ?? shape.center[1],
            s => s?.center?.[1], (s, next) => ({ ...s, center: [s.center[0], next] }));
        }
        return dims;
      };

      const buildCanvasAnnotations = (evaluated, authored, view) => {
        const toScreen = (x, y) => {
          const point = view.worldToScreen({ x, y });
          return [point.x, point.y];
        };
        const stack = createDimStack();
        const chains = evaluated.shapes.filter(shape => shape.type === 'chain');
        const authoredById = new Map((authored?.shapes || []).map(shape => [shape.id, shape]));
        const allDimensions = [
          ...chains.flatMap(shape => chainDimensions(shape, toScreen, stack)),
          ...evaluated.shapes.flatMap(shape => (
            shape.type === 'rect' || shape.type === 'circle'
              ? primitiveDimensions(authoredById.get(shape.id), shape, toScreen, stack)
              : []
          ))
        ];
        // Position dims measure the parameter they carry: concentric
        // primitives bound to the same expression render one dim for it
        // (both fields keep their binding; the value edits through the
        // one dim). Divergent expressions each keep their own dim.
        const seenPosition = new Set();
        const dimensions = allDimensions.filter(dimension => {
          const fieldKey = dimension.editable?.fieldKey;
          if (fieldKey !== 'center-x' && fieldKey !== 'center-y') return true;
          const dedupeKey = `${fieldKey}:${dimension.text}`;
          if (seenPosition.has(dedupeKey)) return false;
          seenPosition.add(dedupeKey);
          return true;
        });
        const outline = resolvedFace.value
          ? [...resolvedFace.value.polygons, ...resolvedFace.value.holes]
              .filter(ring => ring.length >= 3)
              .map(ring => ring.map(vertex => toScreen(Number(vertex[0]), Number(vertex[1]))))
          : [];
        // The selected primitive's own footprint, stroked dashed over
        // the canvas — selection reads on the drawing plane, not only
        // in the strip.
        const selected = evaluated.shapes.find(shape => shape.id === selectedShape.value?.shapeId)
          || evaluated.shapes.find(shape => shape.id === selectedCorner.value?.shapeId);
        let selection = null;
        if (selected) {
          const points = selected.type === 'circle'
            ? Array.from({ length: 33 }, (_, index) => {
              const angle = (index / 32) * Math.PI * 2;
              return toScreen(
                selected.center[0] + Math.cos(angle) * selected.diameter / 2,
                selected.center[1] + Math.sin(angle) * selected.diameter / 2
              );
            })
            : selected.type === 'rect'
              ? occProfileRectCornerVertices(selected).map(vertex => toScreen(vertex[0], vertex[1]))
              : selected.points.filter(point => !point.chord).map(point => toScreen(point.x, point.y));
          if (points.length >= 2) {
            selection = {
              points,
              closed: selected.type !== 'chain' || Boolean(selected.closed)
            };
          }
        }
        // The axis spans the viewport in world Y.
        const span = 1e5;
        const axisTop = toScreen(0, span);
        const axisBottom = toScreen(0, -span);
        return {
          dimensions,
          outline,
          selection,
          origin: toScreen(0, 0),
          openEnds: [],
          axis: { top: axisTop, bottom: axisBottom }
        };
      };

      const canvasAnnotations = computed(() => {
        viewTick.value;
        const view = manager?.curView;
        if (!view) return null;
        let evaluated = null;
        try {
          evaluated = evaluateOccsProfileSketch(props.modelValue || {}, externalScope());
        } catch {
          return null;
        }
        return buildCanvasAnnotations(evaluated, normalizeOccsProfileSketch(props.modelValue || {}), view);
      });

      const findShape = (sketch, shapeId) => sketch.shapes.find(shape => shape.id === shapeId) || null;

      // The selected corner's editing popup — x/y expressions and the
      // fillet radius authored at that vertex of its chain shape, keyed
      // on the same render-frame tick as the annotations so it tracks
      // pan and zoom.
      const selectedVertexPopup = computed(() => {
        viewTick.value;
        const view = manager?.curView;
        const selection = selectedCorner.value;
        if (!view || !selection) return null;
        const sketch = normalizeOccsProfileSketch(props.modelValue || {});
        const shape = findShape(sketch, selection.shapeId);
        const authored = shape?.points.find(item => item.id === selection.vertexId && !item.chord);
        if (!shape || !authored) return null;
        let evaluated = null;
        try {
          evaluated = evaluateOccsProfileSketch(sketch, externalScope());
        } catch {
          return null;
        }
        const evaluatedShape = findShape(evaluated, selection.shapeId);
        const corner = evaluatedShape?.points.find(item => item.id === selection.vertexId);
        if (!corner) return null;
        const corners = evaluatedShape.points.filter(item => !item.chord);
        const isStart = corners[0]?.id === selection.vertexId;
        const isEnd = corners[corners.length - 1]?.id === selection.vertexId;
        const screen = view.worldToScreen({ x: corner.x, y: corner.y });
        const width = containerRef.value?.clientWidth || 0;
        const height = containerRef.value?.clientHeight || 0;
        return {
          shapeId: shape.id,
          id: authored.id,
          sketch,
          x: authored.x,
          y: authored.y,
          fillet: filletRadiusOf(shape, authored.id),
          openEnd: !shape.closed && (isStart || isEnd),
          isStart,
          isEnd,
          left: Math.min(screen.x + 14, Math.max(0, width - 240)),
          top: Math.min(Math.max(screen.y - 16, 0), Math.max(0, height - 44))
        };
      });

      // Nearest authored corner within `radius` px of a client point —
      // vertex selection searches every chain shape.
      const cornerAt = (clientX, clientY, radius) => {
        const view = manager?.curView;
        const rect = overlayRef.value?.getBoundingClientRect();
        if (!view || !rect) return null;
        let evaluated = null;
        try {
          evaluated = evaluateOccsProfileSketch(props.modelValue || {}, externalScope());
        } catch {
          return null;
        }
        let best = null;
        for (const shape of evaluated.shapes) {
          if (shape.type !== 'chain') continue;
          for (const point of shape.points.filter(item => !item.chord)) {
            const screen = view.worldToScreen({ x: point.x, y: point.y });
            const distance = Math.hypot(rect.x + screen.x - clientX, rect.y + screen.y - clientY);
            if (distance <= radius && (!best || distance < best.distance)) {
              best = { shapeId: shape.id, point, distance };
            }
          }
        }
        return best || null;
      };

      // Shape hit-testing for the selection popup: every shape under
      // the click — inside a rect, within a circle, or near a chain's
      // segments (screen-space tolerance) — topmost first. Repeated
      // clicks on the same point cycle the stack (selection cycling).
      let pickCycle = null;
      const shapesAt = (clientX, clientY) => {
        const view = manager?.curView;
        const bounds = overlayRef.value?.getBoundingClientRect();
        if (!view || !bounds) return null;
        let evaluated = null;
        try {
          evaluated = evaluateOccsProfileSketch(props.modelValue || {}, externalScope());
        } catch {
          return null;
        }
        const authored = normalizeOccsProfileSketch(props.modelValue || {});
        const byId = new Map(evaluated.shapes.map(shape => [shape.id, shape]));
        const ordered = authored.shapes
          .map(shape => byId.get(shape.id))
          .filter(Boolean)
          .reverse();
        const px = clientX - bounds.x;
        const py = clientY - bounds.y;
        const hits = [];
        const screenOf = (x, y) => view.worldToScreen({ x, y });
        const distanceToSegment = (ax, ay, bx, by) => {
          const dx = bx - ax;
          const dy = by - ay;
          const lengthSq = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
          return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        };
        for (const shape of ordered) {
          if (shape.type === 'circle') {
            const center = screenOf(shape.center[0], shape.center[1]);
            const edge = screenOf(shape.center[0] + shape.diameter / 2, shape.center[1]);
            const radius = Math.max(Math.abs(edge.x - center.x), 10);
            if (Math.hypot(px - center.x, py - center.y) <= radius) hits.push(shape);
            continue;
          }
          if (shape.type === 'rect') {
            const corners = occProfileRectCornerVertices(shape).map(([x, y]) => screenOf(x, y));
            let inside = false;
            for (let index = 0, previous = corners.length - 1; index < corners.length; previous = index, index += 1) {
              const a = corners[previous];
              const b = corners[index];
              if ((b.y > py) !== (a.y > py)
                && px < ((a.x - b.x) * (py - b.y)) / ((a.y - b.y) || 1) + b.x) {
                inside = !inside;
              }
            }
            if (inside) { hits.push(shape); continue; }
            for (let index = 0; index < corners.length; index += 1) {
              const a = corners[index];
              const b = corners[(index + 1) % corners.length];
              if (distanceToSegment(a.x, a.y, b.x, b.y) <= 6) { hits.push(shape); break; }
            }
            continue;
          }
          const points = shape.points.map(point => screenOf(point.x, point.y));
          for (let index = 0; index + 1 < points.length; index += 1) {
            if (distanceToSegment(points[index].x, points[index].y, points[index + 1].x, points[index + 1].y) <= 6) {
              hits.push(shape);
              break;
            }
          }
        }
        return hits;
      };

      // Seeded entities carry their shape's id — the engine's selection
      // maps back onto the authored shape for the popup.
      let entityShapeByObjectId = new Map();
      let unbindSelectionEvents = null;

      const syncShapeSelection = () => {
        const ids = manager?.curView?.selectionSet?.ids;
        if (!ids) return;
        const shapeIds = [...new Set([...ids]
          .map(id => entityShapeByObjectId.get(String(id)))
          .filter(Boolean))];
        // An empty engine pick carries no command — the surface's own
        // pointerdown owns clearing on empty space.
        if (!shapeIds.length) return;
        if (shapeIds.length !== 1) {
          selectedShape.value = null;
          return;
        }
        if (selectedCorner.value) return;
        const bounds = overlayRef.value?.getBoundingClientRect();
        const anchor = lastPointerAt.value;
        selectedShape.value = {
          shapeId: shapeIds[0],
          at: anchor && bounds
            ? [Math.min(Math.max(anchor[0] - bounds.x, 0), bounds.width), Math.min(Math.max(anchor[1] - bounds.y, 0), bounds.height)]
            : [24, 24]
        };
      };

      const bindSelectionEvents = () => {
        const events = manager?.curView?.selectionSet?.events;
        if (!events?.selectionAdded || !events?.selectionRemoved) return;
        events.selectionAdded.addEventListener(syncShapeSelection);
        events.selectionRemoved.addEventListener(syncShapeSelection);
        unbindSelectionEvents = () => {
          events.selectionAdded.removeEventListener(syncShapeSelection);
          events.selectionRemoved.removeEventListener(syncShapeSelection);
        };
      };

      const handleVertexSelectPointerDown = (event) => {
        if (event.target?.closest?.('.profile-vertex-popup')
          || event.target?.closest?.('.profile-dim')
          || event.target?.closest?.('.profile-shape-popup')) return;
        lastPointerAt.value = [event.clientX, event.clientY];
        if (activeTool.value !== 'select') {
          selectedCorner.value = null;
          selectedShape.value = null;
          return;
        }
        const found = cornerAt(event.clientX, event.clientY, 10);
        if (found) {
          selectedCorner.value = { shapeId: found.shapeId, vertexId: found.point.id };
          selectedShape.value = null;
          pickCycle = null;
          clearEngineSelection();
          return;
        }
        // The engine picks entities on their edges; face clicks fall
        // through to the surface's hit test. A repeat click on the same
        // point cycles to the next shape beneath (covered shapes stay
        // reachable); a click elsewhere picks the topmost again.
        selectedCorner.value = null;
        const bounds = overlayRef.value?.getBoundingClientRect();
        const hits = shapesAt(event.clientX, event.clientY);
        if (!hits.length || !bounds) {
          pickCycle = null;
          selectedShape.value = null;
          return;
        }
        const sameSpot = pickCycle
          && Math.hypot(pickCycle.at[0] - event.clientX, pickCycle.at[1] - event.clientY) <= 6;
        const index = sameSpot ? (pickCycle.index + 1) % hits.length : 0;
        pickCycle = { at: [event.clientX, event.clientY], index };
        const shape = hits[index];
        selectedShape.value = { shapeId: shape.id, at: [event.clientX - bounds.x, event.clientY - bounds.y] };
      };

      // The surface owns Escape routing: the engine's own handling needs
      // focus inside its container, and toolbar clicks or a focused
      // authoring field move it outside it. Escape closes the popups,
      // cancels the engine's active command, and clears its
      // selection — in that order, from any focus.
      const handleWindowKeydown = (event) => {
        if (event.key !== 'Escape') return;
        if (selectedCorner.value) selectedCorner.value = null;
        if (selectedShape.value) selectedShape.value = null;
        manager?.commandManager?.cancelActive?.();
        clearEngineSelection();
      };

      // Editor operations ride icon-only buttons (Tabler glyphs,
      // toolIcons.mjs) with localized tooltips — the engine bundle ships
      // no icon set, and PrimeIcons had no unambiguous draw-tool glyphs.
      const TOOL_GROUPS = [
        [
          { command: 'select', icon: 'select', labelKey: 'cassette.v2.profileEditor.tools.select' },
          { command: 'line', icon: 'line', labelKey: 'cassette.v2.profileEditor.tools.line' },
          { command: 'pline', icon: 'polyline', labelKey: 'cassette.v2.profileEditor.tools.polyline' },
          { command: 'circle', icon: 'circle', labelKey: 'cassette.v2.profileEditor.tools.circle' },
          { command: 'arc', icon: 'arc', labelKey: 'cassette.v2.profileEditor.tools.arc' },
          { command: 'rectang', icon: 'rectang', labelKey: 'cassette.v2.profileEditor.tools.rectangle' }
        ],
        [
          { command: 'erase', icon: 'erase', labelKey: 'cassette.v2.profileEditor.actions.erase' },
          { command: 'undo', icon: 'undo', labelKey: 'cassette.v2.profileEditor.actions.undo' },
          { command: 'redo', icon: 'redo', labelKey: 'cassette.v2.profileEditor.actions.redo' }
        ],
        [
          { icon: 'materialSide', labelKey: 'cassette.v2.profileEditor.actions.material', isOn: () => normalizeOccsProfileSketch(props.modelValue || {}).material === 'negative', onActivate: toggleMaterialSide },
          { icon: 'ortho', labelKey: 'cassette.v2.profileEditor.actions.ortho', isOn: () => orthoMode.value, onActivate: toggleOrtho },
          { icon: 'tangentSnap', labelKey: 'cassette.v2.profileEditor.actions.tangentSnap', isOn: () => tangentSnap.value, onActivate: toggleTangentSnap },
          { icon: 'commandLine', labelKey: 'cassette.v2.profileEditor.actions.commandLine', isOn: () => commandLine.value, onActivate: toggleCommandLine }
        ],
        [
          { icon: 'zoomFit', labelKey: 'cassette.v2.profileEditor.actions.zoomFit', onActivate: () => manager?.curView?.zoomToFitDrawing?.() },
          { icon: 'importDxf', labelKey: 'cassette.v2.profileEditor.importDxf', onActivate: () => fileInputRef.value?.click() },
          { icon: 'clear', labelKey: 'cassette.v2.profileEditor.actions.clear', onActivate: () => clearDrawing() }
        ]
      ];

      const parametersOf = (sketch) => {
        const normalized = normalizeOccsProfileSketch(sketch || {});
        return { parameters: normalized.parameters, units: normalized.units };
      };

      const modelSpaceEntities = () => {
        const modelSpace = manager?.curDocument?.database?.tables?.blockTable?.modelSpace;
        if (!modelSpace?.newIterator) return [];
        const entities = [];
        for (const entity of modelSpace.newIterator()) entities.push(entity);
        return entities;
      };

      const entityRecords = () => {
        const records = [];
        for (const entity of modelSpaceEntities()) {
          const type = entity?.dxfTypeName;
          if (type === 'LINE') {
            records.push({
              type: 'LINE',
              start: { x: entity.startPoint.x, y: entity.startPoint.y },
              end: { x: entity.endPoint.x, y: entity.endPoint.y }
            });
          } else if (type === 'CIRCLE') {
            records.push({ type: 'CIRCLE', center: { x: entity.center.x, y: entity.center.y }, radius: entity.radius });
          } else if (type === 'ARC') {
            records.push({
              type: 'ARC',
              center: { x: entity.center.x, y: entity.center.y },
              radius: entity.radius,
              startAngle: entity.startAngle,
              endAngle: entity.endAngle
            });
          } else if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
            const vertices = [];
            const count = Number(entity.numberOfVertices) || 0;
            for (let index = 0; index < count; index += 1) {
              const point = entity.getPoint2dAt(index);
              vertices.push({ x: point.x, y: point.y });
            }
            if (vertices.length >= 2) records.push({ type: 'POLYLINE', vertices, closed: Boolean(entity.closed) });
          }
        }
        return records;
      };

      const externalScope = () => props.externalParameters || {};

      const emitSketch = ({ reference = false } = {}) => {
        if (!manager || disposed) return;
        const context = parametersOf(props.modelValue);
        const extracted = occProfileSketchFromEntities(entityRecords(), { ...context, reference });
        // Extraction merges into the authored sketch — unchanged shapes
        // keep their authored expressions, ids, ops, and fillet radii;
        // only moved or new geometry goes numeric. The external scope
        // joins the merge's evaluation so global-bound fields resolve;
        // the stored sketch keeps the clean table.
        const merged = mergeOccsProfileSketchGeometry(extracted, props.modelValue || {}, externalScope(), droppedShapes);
        const keptIds = new Set(merged.shapes.map(shape => shape.id));
        droppedShapes = [
          ...(props.modelValue?.shapes || []),
          ...droppedShapes
        ].filter(shape => !keptIds.has(shape.id)).slice(-20);
        const sketch = normalizeOccsProfileSketch(merged, context.parameters);
        const fingerprint = JSON.stringify(sketch);
        if (fingerprint === lastEmitted) return;
        lastEmitted = fingerprint;
        emit('update:modelValue', sketch);
        // A merged sketch can keep authored expressions the evaluator
        // rejects — the profile stays null then; the save gate reports.
        let profile = null;
        try {
          profile = occsProfileFromSketch(sketch, context);
        } catch {
          // Unresolvable expressions: nothing to emit while invalid.
        }
        emit('profile', profile);
      };

      const scheduleExtraction = () => {
        if (extractTimer || disposed) return;
        extractTimer = setTimeout(() => {
          extractTimer = null;
          emitSketch();
        }, EXTRACT_DEBOUNCE_MS);
      };

      // The manager's blank documents start with an empty database (no
      // layer '0'); every entity defaults to that layer, so the default
      // tables must exist before anything draws. Parsed DXF documents
      // carry their own tables and are left untouched.
      const ensureDefaultTables = () => {
        const database = manager?.curDocument?.database;
        if (!database?.createDefaultData) return;
        try {
          if (!database.tables?.layerTable?.getAt?.('0')) database.createDefaultData();
        } catch {
          // A document that cannot take default data reports on draw; the
          // boot document always accepts it.
        }
      };

      // The construction document never runs the open pipeline, so its
      // scene never draws committed geometry (only cursor overlays show).
      // Opening the minimal blank first builds the scene; on failure the
      // default-tables fallback below keeps the previous behavior.
      const openBlankDocument = async () => {
        if (!manager || disposed) return;
        try {
          const opened = await manager.openDocument(
            'blank.dxf',
            new TextEncoder().encode(BLANK_DXF).buffer,
            { mode: writeMode }
          );
          if (!opened) ensureDefaultTables();
        } catch {
          ensureDefaultTables();
        }
      };

      const bindDatabase = ({ schedule = true } = {}) => {
        unbindDatabase();
        ensureDefaultTables();
        const database = manager?.curDocument?.database;
        if (!database?.events) return;
        const handler = () => scheduleExtraction();
        for (const name of ['entityAppended', 'entityModified', 'entityErased']) {
          const event = database.events[name];
          if (!event?.addEventListener) continue;
          event.addEventListener(handler);
          dbListeners.push({ event, handler });
        }
        if (schedule) scheduleExtraction();
      };

      const unbindDatabase = () => {
        for (const { event, handler } of dbListeners) {
          event.removeEventListener?.(handler);
        }
        dbListeners = [];
      };

      const seedEntities = ({ entities }) => {
        const modelSpace = manager?.curDocument?.database?.tables?.blockTable?.modelSpace;
        if (!modelSpace || !entities.length) return;
        const { AcDbArc, AcDbCircle, AcDbLine } = runtime.value;
        const created = [];
        for (const record of entities) {
          if (record.type === 'LINE') {
            created.push(new AcDbLine(
              { x: record.start.x, y: record.start.y, z: 0 },
              { x: record.end.x, y: record.end.y, z: 0 }
            ));
          } else if (record.type === 'ARC') {
            created.push(new AcDbArc(
              { x: record.center.x, y: record.center.y, z: 0 },
              record.radius,
              record.startAngle,
              record.endAngle
            ));
          } else if (record.type === 'CIRCLE') {
            created.push(new AcDbCircle(
              { x: record.center.x, y: record.center.y, z: 0 },
              record.radius
            ));
          }
        }
        for (const entity of created) modelSpace.appendEntity(entity);
        manager.curView?.addEntity?.(created);
        // Seeded entities carry their shape's id — the engine's
        // selection maps back onto the authored shape for the popup.
        entityShapeByObjectId = new Map([
          ...(entityShapeByObjectId.entries?.() || []),
          ...created.map((entity, index) => [String(entity.objectId), entities[index]?.shapeId]).filter(([, id]) => id)
        ]);
      };

      // The engine's selection set holds object ids. Every reseed
      // (authoring edits, imports, clears) removes entities behind its
      // back — a selection left standing references dead ids, and the
      // next erase over them fails inside the engine
      // (`lookupObject not found`). Selection dies with the entities.
      const clearEngineSelection = () => {
        const view = manager?.curView;
        if (!view?.selectionSet) return;
        view.selectionSet.clear();
        view.htmlTransientManager?.deselectAll?.();
        view.isHtmlDirty = true;
      };

      const clearDrawingEntities = () => {
        clearEngineSelection();
        for (const entity of modelSpaceEntities()) {
          manager.curView?.removeEntity?.(entity);
          const modelSpace = manager?.curDocument?.database?.tables?.blockTable?.modelSpace;
          modelSpace?.removeEntity?.(entity.objectId);
        }
        entityShapeByObjectId = new Map();
      };

      // Entities emitted per shape, each record tagged with its shape's
      // id — the seed builds the selection map from the tags.
      const entitiesPerShape = (normalized) => normalized.shapes.flatMap(shape => (
        occProfileEntitiesFromSketch({ ...normalized, shapes: [shape] })
          .map(record => ({ ...record, shapeId: shape.id }))
      ));

      const clearDrawing = async () => {
        if (!manager) return;
        // The entity deletions never schedule an extraction: one racing
        // the parent's model update read the OLD sketch's table and
        // rebuilt it onto the blank session.
        unbindDatabase();
        clearDrawingEntities();
        importedFileName.value = '';
        droppedShapes = [];
        // Clearing starts the blank authoring session: the parameter
        // table empties with the canvas (occs/README.md owns the
        // blank-session law), so a cleared session's parameters never
        // ride the next hand-drawn profile.
        const sketch = createEmptyOccsProfileSketch();
        lastEmitted = JSON.stringify(normalizeOccsProfileSketch(sketch));
        emit('update:modelValue', sketch);
        emit('profile', null);
        bindDatabase({ schedule: false });
      };

      const reseedFromModel = () => {
        if (!manager || disposed) return;
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        if (JSON.stringify(normalized) === lastEmitted) return;
        // The seed evaluates a render copy with the external scope
        // joined — global-bound coordinates render; the stored sketch
        // keeps the clean table.
        let entities = [];
        try {
          entities = entitiesPerShape(normalizeOccsProfileSketch(normalized, externalScope()));
        } catch {
          // Unresolvable expressions: no drawable geometry this pass.
        }
        clearDrawingEntities();
        importedFileName.value = '';
        if (entities.length) {
          seedEntities({ entities });
          manager.curView?.zoomToFitDrawing?.();
        }
      };

      // The engine owns the active-tool state: commands started from the
      // toolbar, the queue, or the canvas all announce themselves through
      // the editor's lifecycle events, and the toolbar only reflects
      // them. Draw commands stick while running; everything else returns
      // to Select when the command ends.
      const DRAW_COMMANDS = new Set(['line', 'pline', 'circle', 'arc', 'rectang']);
      let unbindCommandEvents = null;
      const bindCommandEvents = () => {
        const events = manager?.editor?.events;
        if (!events?.commandWillStart || !events?.commandEnded) return;
        const onWillStart = ({ command }) => {
          const name = String(command?.globalName || command?.localName || '').toLowerCase();
          activeTool.value = DRAW_COMMANDS.has(name) ? name : 'select';
        };
        const onEnded = () => { activeTool.value = 'select'; };
        events.commandWillStart.addEventListener(onWillStart);
        events.commandEnded.addEventListener(onEnded);
        unbindCommandEvents = () => {
          events.commandWillStart.removeEventListener(onWillStart);
          events.commandEnded.removeEventListener(onEnded);
        };
      };

      const runCommand = (tool) => {
        if (tool.command) {
          // An active command is cancelled first — the queue would
          // otherwise stack prompts behind it.
          if (activeTool.value !== 'select') {
            manager?.commandManager?.cancelActive?.();
          }
          manager?.sendStringToExecute?.(tool.command);
        }
        tool.onActivate?.();
      };

      const filletRadiusOf = (shape, vertexId) => (
        (shape?.modifiers || []).find(modifier => modifier.type === 'fillet' && modifier.vertexId === vertexId)?.radius ?? null
      );

      // Edits author the sketch model directly (expressions stay strings);
      // the canvas reseeds from evaluated geometry — unresolvable
      // expressions seed nothing and the rows keep the raw values for
      // editing. Later draws merge back through
      // mergeOccsProfileSketchGeometry, which keeps authored expressions
      // on unchanged shapes.
      const commitSketch = (next) => {
        if (!manager || disposed) return;
        const normalized = normalizeOccsProfileSketch(next);
        const fingerprint = JSON.stringify(normalized);
        if (fingerprint === lastEmitted) return;
        lastEmitted = fingerprint;
        emit('update:modelValue', normalized);
        let profile = null;
        try {
          profile = occsProfileFromSketch(normalized, { parameters: externalScope() });
        } catch {
          // Save gates on the savable check; nothing to emit while invalid.
        }
        emit('profile', profile);
        // The reseed writes to the database; extraction would immediately
        // re-emit numeric geometry and clobber the authored expressions, so
        // the listeners rebind without scheduling.
        unbindDatabase();
        clearDrawingEntities();
        try {
          seedEntities({ entities: entitiesPerShape(normalizeOccsProfileSketch(normalized, externalScope())) });
        } catch {
          // Unresolvable expressions: no drawable geometry this pass.
        }
        bindDatabase({ schedule: false });
      };

      const updateShape = (shapeId, mutate) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        commitSketch({
          ...normalized,
          shapes: normalized.shapes.map(shape => (shape.id === shapeId ? mutate(shape) : shape))
        });
      };

      // The field's current evaluated number feeds adopt-on-bind; an
      // unresolvable model adopts nothing (the save gate reports).
      const evaluatedFieldValue = (read) => {
        try {
          return read(evaluateOccsProfileSketch(normalizeOccsProfileSketch(props.modelValue || {}), externalScope()));
        } catch {
          return null;
        }
      };

      // Shape field commit with the parameter lifecycle: a typed number
      // into a field bound to a bare sketch parameter commits to that
      // parameter (the dim is the parameter's editor — everything bound
      // to it follows); every other value keeps the adopt-on-bind path
      // onto the field.
      const BARE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
      const applyShapeField = (shapeId, readEvaluated, apply, authoredValue) => (value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : null;
        const binding = typeof authoredValue === 'string' ? authoredValue.trim() : '';
        if (Number.isFinite(numeric)
          && BARE_IDENTIFIER.test(binding)
          && Object.prototype.hasOwnProperty.call(normalized.parameters, binding)) {
          commitSketch({ ...normalized, parameters: { ...normalized.parameters, [binding]: numeric } });
          return;
        }
        const parameters = adoptOccsProfileBindingParameter(
          normalized,
          value,
          evaluatedFieldValue(evaluated => readEvaluated(findShape(evaluated, shapeId))),
          externalScope()
        );
        commitSketch({
          ...normalized,
          parameters,
          shapes: normalized.shapes.map(shape => (shape.id === shapeId ? apply(shape, value) : shape))
        });
      };

      const applyFilletRadius = (shapeId, vertexId, value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const shape = findShape(normalized, shapeId);
        const numeric = Number(value);
        // Numbers clamp to non-negative; expression strings pass through
        // untouched like every other authoring field. Binding a single
        // unknown identifier adopts the field's current value.
        const radius = value === '' || value === null || value === undefined
          ? 0
          : Number.isFinite(numeric) ? Math.max(0, numeric) : String(value).trim();
        const parameters = adoptOccsProfileBindingParameter(normalized, radius, filletRadiusOf(shape, vertexId) ?? 0, externalScope());
        const modifiers = (shape?.modifiers || []).filter(modifier => !(
          modifier.type === 'fillet' && modifier.vertexId === vertexId
        ));
        if (radius !== 0) modifiers.push({ type: 'fillet', vertexId, radius });
        const next = {
          ...normalized,
          parameters,
          shapes: normalized.shapes.map(item => (item.id === shapeId ? { ...item, modifiers } : item))
        };
        commitSketch(next);
      };

      const applyVertexField = (shapeId, vertexId, field, value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const parameters = adoptOccsProfileBindingParameter(
          normalized,
          value,
          evaluatedFieldValue(evaluated => findShape(evaluated, shapeId)?.points.find(point => point.id === vertexId)?.[field]),
          externalScope()
        );
        commitSketch({
          ...normalized,
          parameters,
          shapes: normalized.shapes.map(shape => (
            shape.id === shapeId
              ? { ...shape, points: shape.points.map(point => (
                  point.id === vertexId ? { ...point, [field]: value } : point
                )) }
              : shape
          ))
        });
      };

      const applyParameterValue = (key, value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        commitSketch({
          ...normalized,
          parameters: { ...normalized.parameters, [key]: value }
        });
      };

      const addParameter = () => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const used = new Set(Object.keys(normalized.parameters));
        let key = 'A';
        while (used.has(key)) {
          key = String.fromCharCode(key.charCodeAt(0) + 1);
          if (key > 'Z') key = `P${used.size + 1}`;
        }
        commitSketch({
          ...normalized,
          parameters: { ...normalized.parameters, [key]: 0 }
        });
      };

      const removeParameter = (key) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const parameters = { ...normalized.parameters };
        delete parameters[key];
        commitSketch({ ...normalized, parameters });
      };

      // Renaming refuses invalid and colliding names — the row
      // re-renders with the old name (the draft dies on commit).
      const renameParameter = (from, to) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        commitSketch(renameOccsProfileSketchParameter(normalized, from, to));
      };

      const resolvedHint = (sketch, value) => {
        if (typeof value !== 'string') return '';
        try {
          return ` = ${resolveOccsExpression(value, sketch.parameters)}`;
        } catch {
          return ' = ?';
        }
      };

      // Authoring fields hold their typed text while focused and commit
      // on blur/Enter. The draft dies with the corner selection that
      // owns it — Escape included.
      const fieldDraft = createFieldDraft({ vue });
      watch(selectedCorner, () => { fieldDraft.clear(); });
      watch(selectedShape, () => { fieldDraft.clear(); });

      // Authoring inputs size to their content in `ch` so the whole
      // value stays readable, growing while typing.
      const inputSizeStyle = (text, min = 6, max = 22) => ({
        width: `${Math.min(Math.max(String(text ?? '').length + 2, min), max)}ch`
      });

      const expressionField = (value, hint, onInput, ariaLabel) => {
        const shown = fieldDraft.text(ariaLabel, value);
        return h(InputText, {
          modelValue: shown,
          ...fieldDraft.handlers(ariaLabel, value, onInput),
          size: 'small',
          class: 'font-mono text-xs',
          style: inputSizeStyle(shown),
          title: hint,
          'aria-label': ariaLabel
        });
      };

      // The boolean operations apply to the FACE — each option's tooltip
      // states it.
      const OP_TOOLTIPS = {
        add: 'cassette.v2.profileEditor.opsHints.add',
        subtract: 'cassette.v2.profileEditor.opsHints.subtract',
        construction: 'cassette.v2.profileEditor.opsHints.construction'
      };
      const opToggle = (shape) => h(SelectButton, {
        modelValue: shape.op,
        options: OCCS_PROFILE_SHAPE_OPS.map(value => ({
          value,
          label: t(`cassette.v2.profileEditor.ops.${value}`)
        })),
        optionValue: 'value',
        optionLabel: 'label',
        allowEmpty: false,
        size: 'small',
        'aria-label': `${t(`cassette.v2.profileEditor.ops.${shape.op}`)} ${shape.id}`,
        'onUpdate:modelValue': value => {
          updateShape(shape.id, subject => ({ ...subject, op: value }));
        }
      }, {
        option: slotProps => h('span', {
          title: t(OP_TOOLTIPS[slotProps.option.value] || OP_TOOLTIPS[slotProps.option])
        }, slotProps.option.label)
      });

      // The selected primitive's parameter popup — the one home for a
      // shape's non-dimensional settings: its boolean op,
      // rotation and fillet radii on rects, fillet chips on chains.
      // Geometry (position, sizes) authors through the on-canvas
      // dimensions.
      const shapePopup = computed(() => {
        const selection = selectedShape.value;
        if (!selection) return null;
        const sketch = normalizeOccsProfileSketch(props.modelValue || {});
        const shape = findShape(sketch, selection.shapeId);
        if (!shape) return null;
        const width = containerRef.value?.clientWidth || 0;
        const height = containerRef.value?.clientHeight || 0;
        return {
          shape,
          sketch,
          left: Math.min(selection.at[0] + 14, Math.max(0, width - 440)),
          top: Math.min(Math.max(selection.at[1] - 16, 0), Math.max(0, height - 120))
        };
      });

      const renderShapePopup = () => {
        const popup = shapePopup.value;
        if (!popup) return null;
        const { shape, sketch } = popup;
        const rows = [];
        const labeledField = (label, value, readEvaluated, apply) => h('div', { class: 'flex items-center gap-1' }, [
          h('span', { class: 'w-5 shrink-0 text-right font-mono text-xs text-muted' }, label),
          expressionField(
            value,
            `${label}${resolvedHint(sketch, value)}`,
            applyShapeField(shape.id, readEvaluated, apply, value),
            `${label} ${shape.id}`
          )
        ]);
        if (shape.type === 'rect') {
          rows.push(h('div', { class: 'flex items-center gap-1' }, [
            labeledField('∠', shape.rotation, s => s?.rotation, (s, next) => ({ ...s, rotation: next })),
            h('span', { class: 'mx-0.5 h-4 w-px shrink-0 bg-content-border' }),
            ...[0, 1, 2, 3].map(corner => {
              const filletByCorner = new Map(shape.fillets.map(fillet => [fillet.corner, fillet.radius]));
              return labeledField(
                `r${corner}`,
                filletByCorner.get(corner) ?? 0,
                s => (s?.fillets || []).find(fillet => fillet.corner === corner)?.radius ?? 0,
                (s, next) => {
                  const others = s.fillets.filter(fillet => fillet.corner !== corner);
                  return Number(next) === 0
                    ? { ...s, fillets: others }
                    : { ...s, fillets: [...others, { corner, radius: next }] };
                }
              );
            })
          ]));
        }
        if (shape.type === 'chain') {
          const fillets = shape.modifiers.filter(item => item.type === 'fillet');
          for (let index = 0; index < fillets.length; index += 4) {
            rows.push(h('div', { class: 'flex items-center gap-1' }, fillets.slice(index, index + 4).map(modifier => (
              labeledField(
                modifier.vertexId.replace(/^p/, 'r'),
                modifier.radius,
                s => (s?.modifiers || []).find(item => item.type === 'fillet' && item.vertexId === modifier.vertexId)?.radius ?? 0,
                (s, next) => {
                  const radius = next === '' || next === null ? 0 : next;
                  const modifiers = (s.modifiers || []).filter(item => !(
                    item.type === 'fillet' && item.vertexId === modifier.vertexId
                  ));
                  if (Number(radius) !== 0) modifiers.push({ type: 'fillet', vertexId: modifier.vertexId, radius });
                  return { ...s, modifiers };
                }
              )
            ))));
          }
        }
        return h('div', {
          class: 'profile-shape-popup absolute z-20 flex flex-col gap-1.5 rounded-ui border border-content-border bg-content px-2 py-1.5 shadow-md',
          style: { left: `${popup.left}px`, top: `${popup.top}px` },
          onPointerdown: event => { event.stopPropagation(); }
        }, [
          h('div', { class: 'flex items-center gap-2 border-b border-content-border pb-1' }, [
            h('span', {
              class: 'text-muted',
              title: t(SHAPE_KIND_LABEL[shape.type])
            }, () => [toolIcon(h, SHAPE_KIND_ICON[shape.type])]),
            opToggle(shape)
          ]),
          ...rows
        ]);
      };

      // The shape strip: one chip per shape — its kind, its op state at
      // a glance (glyph + color), selection highlighted. Clicking the
      // chip selects the shape and opens its popup at a fixed anchor;
      // clicking the op glyph cycles add → subtract → construction.
      const OP_GLYPH = { add: '+', subtract: '−', construction: '·' };
      const OP_COLOR = {
        add: 'var(--p-primary-color)',
        subtract: 'var(--p-red-400)',
        construction: 'var(--p-text-muted-color)'
      };
      const cycleOp = op => (
        op === 'add' ? 'subtract' : op === 'subtract' ? 'construction' : 'add'
      );
      const renderShapeStrip = () => {
        const sketch = normalizeOccsProfileSketch(props.modelValue || {});
        if (!sketch.shapes.length) return null;
        return h('div', {
          class: 'flex shrink-0 flex-wrap items-center gap-1',
          'aria-label': t('cassette.v2.profileEditor.shapes')
        }, sketch.shapes.map(shape => {
          const selected = selectedShape.value?.shapeId === shape.id
            || selectedCorner.value?.shapeId === shape.id;
          return h('div', {
            key: shape.id,
            class: selected
              ? 'flex items-center gap-0.5 rounded-ui border border-primary bg-content px-1 py-0.5'
              : 'flex items-center gap-0.5 rounded-ui border border-content-border px-1 py-0.5'
          }, [
            h(Button, {
              text: true,
              rounded: true,
              size: 'small',
              severity: 'secondary',
              class: 'h-6 w-6 !p-0 text-muted',
              title: t(SHAPE_KIND_LABEL[shape.type]),
              'aria-label': `${t(SHAPE_KIND_LABEL[shape.type])} ${shape.id}`,
              onClick: () => {
                selectedCorner.value = null;
                selectedShape.value = { shapeId: shape.id, at: [16, 16] };
              }
            }, () => [toolIcon(h, SHAPE_KIND_ICON[shape.type])]),
            h(Button, {
              text: true,
              rounded: true,
              size: 'small',
              class: 'h-6 w-6 !p-0 font-mono text-xs font-bold',
              style: { color: OP_COLOR[shape.op] },
              title: t(`cassette.v2.profileEditor.ops.${shape.op}`),
              'aria-label': `${t(`cassette.v2.profileEditor.ops.${shape.op}`)} ${shape.id}`,
              onClick: () => updateShape(shape.id, subject => ({ ...subject, op: cycleOp(subject.op) }))
            }, () => [OP_GLYPH[shape.op]])
          ]);
        }));
      };

      // The parameter strip above the canvas — the one home of the
      // sketch's expression table (owner direction 2026-10-18).
      const renderParameterStrip = () => {
        const sketch = normalizeOccsProfileSketch(props.modelValue || {});
        return h('div', { class: 'flex shrink-0 flex-wrap items-center gap-1' }, [
          h('span', { class: 'font-mono text-xs text-muted' }, 'fx'),
          ...Object.entries(sketch.parameters).map(([key, value]) => h('div', {
            key,
            class: 'flex items-center gap-1 rounded-ui border border-content-border px-1.5 py-0.5'
          }, [
            h(InputText, {
              modelValue: fieldDraft.text(`name ${key}`, key),
              ...fieldDraft.handlers(`name ${key}`, key, next => { renameParameter(key, next); }),
              size: 'small',
              class: 'font-mono text-xs',
              style: inputSizeStyle(fieldDraft.text(`name ${key}`, key), 5, 12),
              'aria-label': `${t('cassette.v2.profileEditor.parameterName')} ${key}`
            }),
            expressionField(value, `${key}${resolvedHint(sketch, value)}`, next => { applyParameterValue(key, next); }, key),
            h(Button, {
              icon: 'pi pi-times',
              severity: 'secondary',
              text: true,
              rounded: true,
              size: 'small',
              'aria-label': `${t('common.delete')} ${key}`,
              onClick: () => { removeParameter(key); }
            })
          ])),
          h(Button, {
            icon: 'pi pi-plus',
            severity: 'secondary',
            text: true,
            rounded: true,
            size: 'small',
            'aria-label': t('cassette.v2.profileEditor.addParameter'),
            title: t('cassette.v2.profileEditor.addParameter'),
            onClick: addParameter
          })
        ]);
      };


      const DIM_STROKE = 'var(--p-text-muted-color)';
      const DIM_HALO = 'var(--p-content-background)';
      const PRIMARY = 'var(--p-primary-color)';
      const HATCH_STROKE = 'var(--p-primary-color)';

      const renderCanvasAnnotations = () => {
        const annotations = canvasAnnotations.value;
        if (!annotations) return null;
        const line = (key, coords, stroke = DIM_STROKE, width = 1, extra = {}) => h('line', {
          key,
          x1: coords[0], y1: coords[1], x2: coords[2], y2: coords[3],
          stroke, 'stroke-width': width, 'stroke-opacity': 0.9, ...extra
        });
        const datum = (key, [x, y]) => [
          h('circle', { key: `${key}-c`, cx: x, cy: y, r: 6, fill: 'none', stroke: PRIMARY, 'stroke-width': 1.5 }),
          h('line', { key: `${key}-h`, x1: x - 8, y1: y, x2: x + 8, y2: y, stroke: PRIMARY, 'stroke-width': 1 }),
          h('line', { key: `${key}-v`, x1: x, y1: y - 8, x2: x, y2: y + 8, stroke: PRIMARY, 'stroke-width': 1 })
        ];
        const { axis, selection } = annotations;
        // Two figures on the plane: the hatched FACE (the material half
        // after the profile's ops — what goes to the cassette) and the
        // bare engine lines of the drawn primitives beneath it. Holes
        // carve empty; a subtract-only sketch punches through the hatch.
        const ringPaths = annotations.outline
          .filter(ring => ring.length >= 3)
          .map(ring => `${ring.map((point, index) => `${index ? 'L' : 'M'} ${point[0]} ${point[1]}`).join(' ')} Z`);
        const outlinePath = ringPaths.length
          ? h('path', {
              key: 'result-outline',
              d: ringPaths.join(' '),
              fill: 'none',
              stroke: PRIMARY,
              'stroke-width': 2.5,
              'stroke-linejoin': 'round'
            })
          : null;
        const faceHatchPath = resolvedFace.value?.polygons?.length
          ? h('path', {
              key: 'face-hatch',
              d: ringPaths.join(' '),
              'fill-rule': 'evenodd',
              fill: 'url(#profile-face-hatch)'
            })
          : null;
        const selectionPath = selection
          ? h('path', {
              key: 'selection-outline',
              d: `M ${selection.points.map(point => `${point[0]} ${point[1]}`).join(' L ')}${selection.closed ? ' Z' : ''}`,
              fill: 'none',
              stroke: PRIMARY,
              'stroke-width': 1.75,
              'stroke-dasharray': '6 4',
              'stroke-linejoin': 'round'
            })
          : null;
        return [
          h('defs', { key: 'hatch-defs' }, [
            h('pattern', {
              key: 'face-hatch-pattern',
              id: 'profile-face-hatch',
              width: 14,
              height: 14,
              patternTransform: 'rotate(45)',
              patternUnits: 'userSpaceOnUse'
            }, [
              h('line', { x1: 0, y1: 0, x2: 0, y2: 14, stroke: HATCH_STROKE, 'stroke-width': 1, 'stroke-opacity': 0.22 })
            ]),
            h('marker', {
              key: 'dim-arrow',
              id: 'profile-dim-arrow',
              viewBox: '0 0 10 10',
              refX: 9,
              refY: 5,
              markerWidth: 7,
              markerHeight: 7,
              orient: 'auto-start-reverse',
              markerUnits: 'userSpaceOnUse'
            }, [
              h('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: DIM_STROKE })
            ])
          ]),
          faceHatchPath,
          outlinePath,
          selectionPath,
          // The zero axis is the solid basis line every field measures
          // from (SPEC law).
          line('axis', [axis.top[0], axis.top[1], axis.bottom[0], axis.bottom[1]], PRIMARY, 1.25),
          ...annotations.dimensions.flatMap(dimension => [
            line(`${dimension.key}-ea`, dimension.extensionA, DIM_STROKE, 0.75),
            line(`${dimension.key}-eb`, dimension.extensionB, DIM_STROKE, 0.75),
            line(`${dimension.key}-d`, dimension.line, DIM_STROKE, 1, dimension.arrows ? {
              'marker-start': 'url(#profile-dim-arrow)',
              'marker-end': 'url(#profile-dim-arrow)'
            } : {}),
            dimension.editable ? null : h('text', {
              key: `${dimension.key}-t`,
              x: dimension.labelAt[0], y: dimension.labelAt[1],
              'font-size': 10,
              'text-anchor': 'middle',
              'dominant-baseline': 'middle',
              fill: DIM_STROKE,
              stroke: DIM_HALO,
              'stroke-width': 3,
              'paint-order': 'stroke'
            }, dimension.text)
          ]),
          ...datum('origin', annotations.origin)
        ];
      };

      // The editable parameter dimensions: one small input per bound
      // field, centered on its dimension line (the input's background
      // breaks the line — drafting law) and clamped inside the canvas so
      // the whole field stays visible. Width follows the value.
      const renderDimensionInputs = () => {
        const annotations = canvasAnnotations.value;
        if (!annotations) return [];
        const width = containerRef.value?.clientWidth || 0;
        const height = containerRef.value?.clientHeight || 0;
        const CH_PX = 8.5;
        return annotations.dimensions
          .filter(dimension => dimension.editable)
          .map(dimension => {
            const { editable } = dimension;
            const shown = fieldDraft.text(editable.ariaLabel, editable.value);
            const boxWidth = Math.min(Math.max(String(shown ?? '').length + 2, 6), 12) * CH_PX;
            const left = Math.min(Math.max(dimension.labelAt[0] - boxWidth / 2, 2), Math.max(2, width - boxWidth - 2));
            const top = Math.min(Math.max(dimension.labelAt[1] - 13, 2), Math.max(2, height - 28));
            return h(InputText, {
              key: dimension.key,
              class: 'profile-dim absolute z-20 bg-content text-center font-mono text-xs shadow-sm',
              style: { left: `${left}px`, top: `${top}px`, width: `${boxWidth}px` },
              modelValue: shown,
              ...fieldDraft.handlers(editable.ariaLabel, editable.value, next => {
                applyShapeField(editable.shapeId, editable.readEvaluated, editable.apply, editable.value)(next);
              }),
              size: 'small',
              'aria-label': editable.ariaLabel,
              title: editable.ariaLabel,
              onPointerdown: event => { event.stopPropagation(); }
            });
          });
      };

      // The selected corner's popup edits the authored model through the
      // same commit path as the shape rows (expressions stay strings).
      const renderVertexPopup = () => {
        const popup = selectedVertexPopup.value;
        if (!popup) return null;
        const { shapeId, id, sketch } = popup;
        return h('div', {
          class: 'profile-vertex-popup absolute z-20 flex items-center gap-1.5 rounded-ui border border-content-border bg-content px-2 py-1.5 shadow-md',
          style: { left: `${popup.left}px`, top: `${popup.top}px` },
          onPointerdown: event => { event.stopPropagation(); }
        }, [
          h('span', { class: 'font-mono text-xs text-muted' }, id),
          expressionField(popup.x, `x${resolvedHint(sketch, popup.x)}`, next => { applyVertexField(shapeId, id, 'x', next); }, `x ${id}`),
          expressionField(popup.y, `y${resolvedHint(sketch, popup.y)}`, next => { applyVertexField(shapeId, id, 'y', next); }, `y ${id}`),
          h(InputText, {
            modelValue: fieldDraft.text(`r ${id}`, popup.fillet),
            ...fieldDraft.handlers(`r ${id}`, popup.fillet, next => { applyFilletRadius(shapeId, id, next); }),
            size: 'small',
            class: 'font-mono text-xs',
            style: inputSizeStyle(fieldDraft.text(`r ${id}`, popup.fillet), 4, 14),
            disabled: popup.openEnd,
            title: `r${resolvedHint(sketch, popup.fillet)}`,
            'aria-label': `${t('cassette.v2.profileEditor.filletRadius')} ${id}`
          }),
        ]);
      };

      // Icon-only toolbar buttons: the active tool or an armed toggle reads
      // primary; tooltips and aria-labels carry the localized names.
      const renderToolGroupButtons = (fromGroup, toGroup) => TOOL_GROUPS.slice(fromGroup, toGroup).flatMap((group, groupIndex) => [
        ...(groupIndex > 0 ? [h('span', { class: 'mx-0.5 h-4 w-px shrink-0 bg-content-border' })] : []),
        ...group.map(tool => h(Button, {
          key: tool.labelKey,
          severity: (tool.command && activeTool.value === tool.command) || tool.isOn?.() ? 'primary' : 'secondary',
          text: true,
          rounded: true,
          disabled: tool.isDisabled?.() || false,
          'aria-label': t(tool.labelKey),
          title: t(tool.labelKey),
          onClick: () => runCommand(tool)
        }, () => [toolIcon(h, tool.icon)]))
      ]);

      const handleDxfUpload = async (event) => {
        const [file] = Array.from(event.target.files || []);
        event.target.value = '';
        if (!file || !manager) return;
        importError.value = '';
        try {
          const opened = await manager.openDocument(
            file.name,
            await file.arrayBuffer(),
            { mode: writeMode }
          );
          if (!opened) throw new Error(t('cassette.v2.profileEditor.importFailed'));
          importedFileName.value = file.name;
          droppedShapes = [];
          manager.curView?.zoomToFitDrawing?.();
          // An import is reference geometry: every extracted shape lands
          // with op none until the author assigns its ops.
          emitSketch({ reference: true });
          const emitted = JSON.parse(lastEmitted || '{"shapes":[]}');
          if (!isOccsProfileSketchSavable(emitted)) {
            importError.value = t('cassette.v2.profileEditor.importFailed');
          }
        } catch (error) {
          importError.value = error?.message || t('cassette.v2.profileEditor.importFailed');
        }
      };

      const mountEngine = async () => {
        if (typeof window === 'undefined' || runtime.value) return;
        engineError.value = '';
        try {
          const loaded = await import('../../../assets/vendor/cad-viewer/cad-viewer.mjs');
          if (disposed) return;
          runtime.value = loaded;
          await engineChain;
          if (disposed) return;
          // The dialog owns the chrome: the engine's standalone-viewer
          // widgets (command line, top-right undo/erase shortcut bar) stay
          // off — prompts and keywords ride the cursor dynamic input, and
          // undo/erase ride the host toolbar. The toolbar's Command line
          // toggle reveals the CLI for typed prompt entry (asserted back
          // off here, so every session starts clean). The dark UI theme
          // matches the engine's model-space canvas.
          const settings = loaded.AcApSettingManager.instance;
          settings.isShowCommandLine = false;
          settings.isShowShortCutToolbar = false;
          loaded.acedApplyUiTheme?.('dark', containerRef.value);
          manager = loaded.AcApDocManager.createInstance({
            container: containerRef.value,
            autoResize: true,
            useMainThreadDraw: true,
            builtinOpenFileDialog: false,
            notificationCenter: false,
            disableExport: true
          });
          writeMode = manager.curDocument?.openMode;
          await openBlankDocument();
          if (disposed) return;
          manager.events.documentActivated.addEventListener(() => bindDatabase({ schedule: false }));
          manager.events.documentCreated.addEventListener(() => bindDatabase({ schedule: false }));
          bindCommandEvents();
          bindSelectionEvents();
          window.addEventListener('keydown', handleWindowKeydown, true);
          manager.curView?.events?.renderFrame?.addEventListener?.(bumpViewTick);
          bindDatabase();
          orthoMode.value = Number(manager.curDocument?.database?.orthomode) === 1;
          const storedMask = Number(loaded.AcApSettingManager.instance.osnapModes) || 0;
          tangentSnap.value = (storedMask & OSNAP_MODE_BITS.tangent) !== 0;
          loaded.AcApSettingManager.instance.osnapModes = OSNAP_DEFAULT_MASK
            | (tangentSnap.value ? OSNAP_MODE_BITS.tangent : 0);
          lastEmitted = '';
          reseedFromModel();
          emitSketch();
          // A dialog mount can race the container's real size (open
          // animation, late flex layout); the first time the canvas
          // reaches working size, re-fit the view so the seed is framed.
          if (containerRef.value && (containerRef.value.clientHeight < 120)) {
            zoomObserver = new ResizeObserver(() => {
              if (!manager || containerRef.value?.clientHeight < 120) return;
              zoomObserver.disconnect();
              zoomObserver = null;
              manager.curView?.zoomToFitDrawing?.();
            });
            zoomObserver.observe(containerRef.value);
          }
        } catch (error) {
          engineError.value = error?.message || String(error);
        }
      };

      onMounted(async () => {
        await nextTick();
        mountEngine();
        scheduleOutlineResolve();
      });

      watch(() => props.modelValue, () => {
        if (manager) reseedFromModel();
        scheduleOutlineResolve();
      }, { deep: true });

      watch(() => props.externalParameters, () => { scheduleOutlineResolve(); }, { deep: true });

      onBeforeUnmount(() => {
        disposed = true;
        if (extractTimer) clearTimeout(extractTimer);
        extractTimer = null;
        if (outlineTimer) clearTimeout(outlineTimer);
        outlineTimer = null;
        zoomObserver?.disconnect?.();
        zoomObserver = null;
        unbindCommandEvents?.();
        unbindCommandEvents = null;
        unbindSelectionEvents?.();
        unbindSelectionEvents = null;
        window.removeEventListener('keydown', handleWindowKeydown, true);
        manager?.curView?.events?.renderFrame?.removeEventListener?.(bumpViewTick);
        unbindDatabase();
        const dying = manager;
        manager = null;
        engineChain = engineChain.then(async () => {
          // The engine schedules a glyph-redraw timer when its font
          // preload resolves, and that timer reads the manager
          // singleton — one firing after destroy() clears the singleton
          // is an uncaught page error. Let fonts settle (plus the
          // engine's redraw delay) while the instance is alive.
          try { await dying?.curView?.awaitTextStyleFontsReady?.(); } catch { /* bounded by the engine's own timeout */ }
          await new Promise(resolve => setTimeout(resolve, GLYPH_REDRAW_SETTLE_MS));
          await dying?.destroy?.();
        });
      });

      return () => h('div', {
        class: 'flex min-h-0 flex-1 flex-col gap-2',
        'data-keyboard-scope': 'cad'
      }, [
        importError.value
          ? h(Message, { severity: 'error', size: 'small', closable: false }, () => importError.value)
          : null,
        outlineError.value
          ? h(Message, { severity: 'error', size: 'small', closable: false }, () => outlineError.value)
          : null,
        renderParameterStrip(),
        renderShapeStrip(),
        h('input', {
          ref: fileInputRef,
          type: 'file',
          accept: '.dxf',
          class: 'hidden',
          onChange: handleDxfUpload
        }),
        h('div', {
          ref: containerRef,
          class: 'relative min-h-[18rem] w-full flex-1 overflow-hidden rounded-ui border border-content-border bg-subtle',
          role: 'application',
          'aria-label': t('cassette.v2.profileEditor.preview'),
          onPointerdownCapture: [handleVertexSelectPointerDown],
          onPointerup: scheduleExtraction,
          onKeyup: scheduleExtraction
        }, [
          // The tool toolbar floats inside the canvas (the
          // DesignerWorkspace overlay pattern) — no row of its own.
          h(Toolbar, {
            class: 'absolute left-2 top-2 z-20 max-w-[calc(100%-1rem)] gap-1 overflow-x-auto p-1 shadow-card',
            'aria-label': t('cassette.v2.profileEditor.preview')
          }, {
            start: () => renderToolGroupButtons(0, 2),
            end: () => renderToolGroupButtons(2, 4)
          }),
          h('svg', {
            ref: overlayRef,
            class: 'pointer-events-none absolute inset-0 z-10 h-full w-full',
            'aria-hidden': 'true'
          }, renderCanvasAnnotations()),
          ...renderDimensionInputs(),
          renderVertexPopup(),
          renderShapePopup(),
          engineError.value
            ? h('div', { class: 'flex h-full items-center justify-center p-4' }, [
                h(Message, { severity: 'error', closable: false }, () => t('cassette.v2.profileEditor.loadFailed'))
              ])
            : null
        ])
      ]);
    }
  });
}
