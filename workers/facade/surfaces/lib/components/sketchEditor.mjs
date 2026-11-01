// The profile sketch editor as a plugin surface component: a CadCraft
// canvas (the browser edition homed in tech-drawing, loaded through the
// declared cadcraft dependency) over the OCCS profile shape model.
// Drawing and snapping run in CadCraft; entity records and the sketch
// model normalize through occs/profiles.js.
import { CadCraftHost } from 'cadcraft';
import {
  OCCS_PROFILE_SHAPE_OPS,
  adoptOccsProfileBindingParameter,
  createEmptyOccsProfileSketch,
  deriveOccsProfileSketch,
  evaluateOccsProfileSketch,
  isOccsProfileSketchSavable,
  mergeOccsProfileSketchGeometry,
  normalizeOccsProfileSketch,
  occProfileEntitiesFromSketch,
  occProfileRectCornerVertices,
  occProfileSketchFromEntities,
  occsProfileFromSketch,
  renameOccsProfileSketchParameter,
  renameOccsProfileTableParameter,
  resolveOccsProfileSectionOperations
} from '../../../occs/profiles.js';
import { resolveOccsExpression } from '../../../occs/expressions.js';
import { foldCassetteV2Region } from '../cassetteV2Clipper.js';
import { buildProfileAnnotations, profileDimensionField, PROFILE_ANNOTATION_LAYER, PROFILE_DIMENSION_LAYER } from '../profileAnnotations.js';
import { toolIcon } from './toolIcons.mjs';
import createFieldDraft from './fieldDraft.mjs';

const EXTRACT_DEBOUNCE_MS = 40;

const SHAPE_KIND_ICON = { circle: 'circle', rect: 'rectang', chain: 'polyline' };
const SHAPE_KIND_LABEL = {
  circle: 'cassette.v2.profileEditor.tools.circle',
  rect: 'cassette.v2.profileEditor.tools.rectangle',
  chain: 'cassette.v2.profileEditor.tools.polyline'
};

export default function createSketchEditor({ vue, components, locale }) {
  const { h, ref, shallowRef, computed, watch, onMounted, onBeforeUnmount, nextTick, defineComponent } = vue;
  const t = locale.t;
  const { Button, InputText, Message, Toolbar, SelectButton, Tag } = components;

  return defineComponent({
    name: 'ProfileSketchEditor',
    props: {
      modelValue: { type: Object, default: null },
      // The surrounding scope's parameters (the cassette's globals): a
      // field expression naming one of them reads it — evaluation joins
      // the scope, adopt-on-bind never mints it (occs/README.md).
      externalParameters: { type: Object, default: () => ({}) },
      // The workpiece's instance table: it overrides the authored rows
      // for every evaluation the canvas runs, and stays out of the model.
      instanceParameters: { type: Object, default: () => ({}) }
    },
    emits: ['update:modelValue', 'update:instance', 'outline-error'],
    setup(props, { emit }) {
      const containerRef = ref(null);
      const rootRef = ref(null);
      const fileInputRef = ref(null);
      const engineError = ref('');
      const canvasReady = ref(false);
      const importError = ref('');
      const activeTool = ref('select');
      const orthoMode = ref(false);
      const tangentSnap = ref(false);
      const commandLine = ref(false);
      const selectedCorner = ref(null);
      const selectedShape = ref(null);
      const dimensionDraft = ref(null);
      const dimensionInputRef = ref(null);

      let host = null;
      let extractTimer = null;
      let lastEmitted = '';
      let lastAnnotationFingerprint = '';
      let disposed = false;
      let zoomObserver = null;
      let seeding = false;
      let programmaticSelection = false;
      let pendingDimensionPick = null;
      let viewRaf = 0;
      let lastViewKey = '';

      // The transient popups read the frame's view directly: CadCraft's
      // canvas is same-origin, so world/screen conversion is a plain call.
      const canvasView = {
        worldToScreen: point => host?.worldToScreen(point) || { x: 0, y: 0 },
        screenToWorld: point => host?.screenToWorld(point) || { x: 0, y: 0 }
      };
      // The sketch model owns the author's history: the frame's drawing
      // is a projection every model change reseeds, so its undo stack
      // cannot back a step.
      let historyEntries = [];
      let historyAt = -1;
      const historyVersion = ref(0);
      // A toolbar command clicked before the engine finishes mounting
      // waits for the mount instead of dropping — the toolbar renders
      // with the dialog, the engine arrives asynchronously.
      let pendingCommand = null;
      // Authored shapes dropped by a merge (an erase): offered back as
      // adoption candidates so an engine undo/redo that restores canvas
      // geometry revives their expressions. Session state — never
      // stored, cleared with the canvas.
      let droppedShapes = [];
      // The canvas owns its snapping set; the tangent toggle rides on top.
      const OSNAP_KINDS = ['end', 'mid', 'cen', 'quad', 'int', 'near'];

      const toggleOrtho = () => {
        if (!host) return;
        orthoMode.value = !orthoMode.value;
        host.setOrtho(orthoMode.value);
      };

      const toggleTangentSnap = () => {
        if (!host) return;
        tangentSnap.value = !tangentSnap.value;
        host.setSnapKind('tan', tangentSnap.value);
      };

      const toggleCommandLine = () => {
        if (!host) return;
        commandLine.value = !commandLine.value;
        host.setCommandLine(commandLine.value);
      };

      // A blank canvas opens at drawing scale — a 200×150 mm window with
      // the zero axis in view — so freehand drawing lands in millimetres
      // (occs/README.md owns the law).
      const zoomToBlankWindow = (extra = []) => {
        host?.zoomWindow({ x: -50, y: -75 }, { x: 150, y: 75 });
        for (const command of extra) host?.run(command);
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
      let outlineTimer = null;

      // Owner law: nothing breaks the drawing. A mid-edit expression
      // keeps the canvas on the last good evaluation — geometry, dims,
      // and hatch render from it, the message states the error, and
      // the next resolved pass restores live evaluation.
      const lastGoodEvaluated = shallowRef(null);
      // The canvas renders the derived table: the instance values over
      // the authored rows (workers/facade/SPEC.md — two parameter
      // tables). The authored model stays what the editor emits.
      const derivedSketch = (sketch = {}) => deriveOccsProfileSketch(sketch, props.instanceParameters);
      // Hints resolve through the same derived table the canvas evaluates.
      const resolvedParameterTable = computed(() => {
        try {
          return evaluateOccsProfileSketch(
            derivedSketch(props.modelValue || {}),
            externalScope()
          ).parameters;
        } catch {
          return null;
        }
      });
      const evaluateForRender = () => {
        try {
          const evaluated = evaluateOccsProfileSketch(
            derivedSketch(props.modelValue || {}),
            externalScope()
          );
          lastGoodEvaluated.value = evaluated;
          return evaluated;
        } catch {
          return lastGoodEvaluated.value;
        }
      };

      const setOutlineError = (message) => emit('outline-error', message);

      let outlineGeneration = 0;
      const resolveOutline = async () => {
        outlineTimer = null;
        if (disposed) return;
        const generation = outlineGeneration + 1;
        outlineGeneration = generation;
        setOutlineError('');
        try {
          const normalized = derivedSketch(props.modelValue || {});
          const { section } = occsProfileFromSketch(normalized, { parameters: externalScope() });
          if (section?.type !== 'shapes') {
            resolvedFace.value = null;
            syncAnnotations();
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
          if (disposed || generation !== outlineGeneration) return;
          resolvedFace.value = resolved;
          syncAnnotations();
          const participates = section.shapes.some(shape => shape.op !== 'construction');
          if (participates && ![...(resolved?.polygons || []), ...(resolved?.holes || [])].length) {
            setOutlineError(t('cassette.v2.profileEditor.resultClipped'));
          }
        } catch (error) {
          if (disposed || generation !== outlineGeneration) return;
          // The last good face stays on the canvas; the error rides
          // the message alone.
          setOutlineError(error?.message || String(error));
        }
      };
      const scheduleOutlineResolve = () => {
        if (outlineTimer) clearTimeout(outlineTimer);
        outlineTimer = setTimeout(resolveOutline, 120);
      };

      // Canvas annotations are native CadCraft entities on their own
      // layer: extraction never reads them back, and pan/zoom redraws
      // them with the drawing instead of through a page overlay.
      const viewTick = ref(0);

      const annotationSource = (sketch = props.modelValue) => {
        const authored = normalizeOccsProfileSketch(sketch || {});
        try {
          const evaluated = evaluateOccsProfileSketch(derivedSketch(authored), externalScope());
          lastGoodEvaluated.value = evaluated;
          return { authored, evaluated };
        } catch {
          return { authored, evaluated: lastGoodEvaluated.value };
        }
      };

      const syncAnnotations = (sketch = props.modelValue) => {
        if (!host || disposed) return;
        const { authored, evaluated } = annotationSource(sketch);
        if (!evaluated) return;
        const { dimensions, decorations } = buildProfileAnnotations({
          evaluated,
          authored,
          resolvedFace: resolvedFace.value
        });
        const fingerprint = JSON.stringify({ dimensions, decorations });
        if (fingerprint === lastAnnotationFingerprint) return;
        lastAnnotationFingerprint = fingerprint;
        host.annotate(PROFILE_ANNOTATION_LAYER, decorations, { locked: true });
        host.annotate(PROFILE_DIMENSION_LAYER, dimensions);
      };

      const selectShapeInEngine = (shapeId) => {
        if (!host) return;
        const ids = shapeId
          ? [...entityShapeByEntityId.entries()]
            .filter(([, id]) => id === shapeId)
            .map(([entityId]) => entityId)
          : [];
        programmaticSelection = true;
        try {
          host.setSelection(ids);
        } finally {
          programmaticSelection = false;
        }
      };

      const findShape = (sketch, shapeId) => sketch.shapes.find(shape => shape.id === shapeId) || null;

      // The selected corner's editing popup — x/y expressions and the
      // fillet radius authored at that vertex of its chain shape, keyed
      // on the same render-frame tick as the annotations so it tracks
      // pan and zoom.
      const selectedVertexPopup = computed(() => {
        viewTick.value;
        const view = host ? canvasView : null;
        const selection = selectedCorner.value;
        if (!view || !selection) return null;
        const sketch = normalizeOccsProfileSketch(props.modelValue || {});
        const shape = findShape(sketch, selection.shapeId);
        const authored = shape?.points.find(item => item.id === selection.vertexId && !item.chord);
        if (!shape || !authored) return null;
        const evaluated = evaluateForRender();
        const evaluatedShape = evaluated ? findShape(evaluated, selection.shapeId) : null;
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
        const view = host ? canvasView : null;
        if (!view) return null;
        const evaluated = evaluateForRender();
        if (!evaluated) return null;
        let best = null;
        for (const shape of evaluated.shapes) {
          if (shape.type !== 'chain') continue;
          for (const point of shape.points.filter(item => !item.chord)) {
            const screen = view.worldToScreen({ x: point.x, y: point.y });
            const distance = Math.hypot(screen.x - clientX, screen.y - clientY);
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
        const view = host ? canvasView : null;
        if (!view) return null;
        const evaluated = evaluateForRender();
        if (!evaluated) return null;
        const authored = normalizeOccsProfileSketch(props.modelValue || {});
        const byId = new Map(evaluated.shapes.map(shape => [shape.id, shape]));
        const ordered = authored.shapes
          .map(shape => byId.get(shape.id))
          .filter(Boolean)
          .reverse();
        const px = clientX;
        const py = clientY;
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

      // Seeded entities carry their shape's id — the frame's selection
      // maps back onto the authored shape for the popup.
      let entityShapeByEntityId = new Map();

      const syncShapeSelection = (ids = host?.selection() || []) => {
        const shapeIds = [...new Set(ids
          .map(id => entityShapeByEntityId.get(id))
          .filter(Boolean))];
        if (!shapeIds.length) return;
        if (shapeIds.length !== 1) {
          selectedShape.value = null;
          return;
        }
        if (selectedCorner.value) return;
        selectedShape.value = { shapeId: shapeIds[0] };
      };

      const openDimensionEditor = (entity, event) => {
        const { shapeId, shapeIds, fieldKey } = entity.profile || {};
        const shape = findShape(normalizeOccsProfileSketch(props.modelValue || {}), shapeId);
        const field = profileDimensionField(shape, fieldKey);
        if (!field) return;
        selectedCorner.value = null;
        dimensionDraft.value = {
          shapeId,
          shapeIds,
          fieldKey,
          label: `${shapeId}:${fieldKey}`,
          value: field.value,
          read: field.read,
          apply: field.apply,
          left: event.clientX,
          top: event.clientY
        };
        nextTick(() => {
          const input = dimensionInputRef.value?.$el || dimensionInputRef.value;
          input?.focus?.();
          input?.select?.();
        });
      };

      const handleVertexSelectPointerDown = (event) => {
        if (isEditableTarget(event.target)) return;
        if (activeTool.value !== 'select') {
          pendingDimensionPick = null;
          dimensionDraft.value = null;
          selectedCorner.value = null;
          selectedShape.value = null;
          return;
        }
        const world = host?.screenToWorld({ x: event.clientX, y: event.clientY });
        const picked = world ? host?.pick(world, 8) : null;
        if (picked?.profile?.fieldKey) {
          pendingDimensionPick = picked;
          dimensionDraft.value = null;
          selectedCorner.value = null;
          return;
        }
        pendingDimensionPick = null;
        dimensionDraft.value = null;
        const found = cornerAt(event.clientX, event.clientY, 10);
        if (found) {
          selectedCorner.value = { shapeId: found.shapeId, vertexId: found.point.id };
          selectedShape.value = null;
          pickCycle = null;
          clearEngineSelection();
          return;
        }
        // The frame picks entities on their edges; face clicks fall
        // through to the surface's hit test. A repeat click on the same
        // point cycles to the next shape beneath (covered shapes stay
        // reachable); a click elsewhere picks the topmost again.
        selectedCorner.value = null;
        const hits = shapesAt(event.clientX, event.clientY);
        if (!hits?.length) {
          pickCycle = null;
          selectedShape.value = null;
          clearEngineSelection();
          return;
        }
        const sameSpot = pickCycle
          && Math.hypot(pickCycle.at[0] - event.clientX, pickCycle.at[1] - event.clientY) <= 6;
        const index = sameSpot ? (pickCycle.index + 1) % hits.length : 0;
        pickCycle = { at: [event.clientX, event.clientY], index };
        const shape = hits[index];
        selectedShape.value = { shapeId: shape.id };
        selectShapeInEngine(shape.id);
      };

      // Escape closes the popups, cancels the frame's active command and
      // clears its selection; undo/redo step the sketch snapshots (the
      // frame's projection is reseeded by the model).
      const isUndoKey = event => (event.ctrlKey || event.metaKey) && !event.altKey
        && ['z', 'y'].includes(String(event.key).toLowerCase());
      const isEditableTarget = (target) => {
        const tag = target?.tagName?.toLowerCase?.();
        return Boolean(target?.isContentEditable || ['input', 'textarea', 'select'].includes(tag));
      };
      const ownsKeyboardTarget = (target) => {
        const root = rootRef.value;
        if (!root || typeof document === 'undefined') return false;
        return target === document.body || root.contains(target);
      };

      const handleCanvasKeydown = (event) => {
        if (event.key === 'Escape') {
          const cancelling = Boolean(host?.running) || Boolean(dimensionDraft.value);
          if (!cancelling && !selectedCorner.value && !selectedShape.value) return;
          event.preventDefault();
          event.stopPropagation();
          pendingDimensionPick = null;
          if (dimensionDraft.value) dimensionDraft.value = null;
          if (selectedCorner.value) selectedCorner.value = null;
          if (selectedShape.value) selectedShape.value = null;
          host?.cancel();
          clearEngineSelection();
          return;
        }
        if (!isUndoKey(event) || isEditableTarget(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        if (String(event.key).toLowerCase() === 'y' || event.shiftKey) redoSketch();
        else undoSketch();
      };

      // Toolbar and field focus sits in the host page, outside the frame:
      // the same Escape/undo routing runs there for the dialog's scope.
      const handleParentKeydown = (event) => {
        if (!ownsKeyboardTarget(event.target) || isEditableTarget(event.target)) return;
        handleCanvasKeydown(event);
      };

      // Editor operations ride icon-only buttons (Tabler glyphs,
      // toolIcons.mjs) with localized tooltips — the engine bundle ships
      // no icon set, and PrimeIcons had no unambiguous draw-tool glyphs.
      const TOOL_GROUPS = [
        [
          { icon: 'select', labelKey: 'cassette.v2.profileEditor.tools.select', onActivate: () => { host?.cancel(); activeTool.value = 'select'; } },
          { command: 'line', icon: 'line', labelKey: 'cassette.v2.profileEditor.tools.line' },
          { command: 'pline', icon: 'polyline', labelKey: 'cassette.v2.profileEditor.tools.polyline' },
          { command: 'circle', icon: 'circle', labelKey: 'cassette.v2.profileEditor.tools.circle' },
          { command: 'arc', icon: 'arc', labelKey: 'cassette.v2.profileEditor.tools.arc' },
          { command: 'rectang', icon: 'rectang', labelKey: 'cassette.v2.profileEditor.tools.rectangle' }
        ],
        [
          { command: 'erase', icon: 'erase', labelKey: 'cassette.v2.profileEditor.actions.erase' },
          { icon: 'undo', labelKey: 'cassette.v2.profileEditor.actions.undo', onActivate: () => undoSketch(), isDisabled: () => !canUndoSketch() },
          { icon: 'redo', labelKey: 'cassette.v2.profileEditor.actions.redo', onActivate: () => redoSketch(), isDisabled: () => !canRedoSketch() }
        ],
        [
          { icon: 'materialSide', labelKey: 'cassette.v2.profileEditor.actions.material', isOn: () => normalizeOccsProfileSketch(props.modelValue || {}).material === 'negative', onActivate: toggleMaterialSide },
          { icon: 'ortho', labelKey: 'cassette.v2.profileEditor.actions.ortho', isOn: () => orthoMode.value, onActivate: toggleOrtho },
          { icon: 'tangentSnap', labelKey: 'cassette.v2.profileEditor.actions.tangentSnap', isOn: () => tangentSnap.value, onActivate: toggleTangentSnap },
          { icon: 'commandLine', labelKey: 'cassette.v2.profileEditor.actions.commandLine', isOn: () => commandLine.value, onActivate: toggleCommandLine }
        ],
        [
          { icon: 'zoomFit', labelKey: 'cassette.v2.profileEditor.actions.zoomFit', onActivate: () => host?.zoomFit(PROFILE_ANNOTATION_LAYER) },
          { icon: 'importDxf', labelKey: 'cassette.v2.profileEditor.importDxf', onActivate: () => fileInputRef.value?.click() },
          { icon: 'clear', labelKey: 'cassette.v2.profileEditor.actions.clear', onActivate: () => clearDrawing() }
        ]
      ];

      const parametersOf = (sketch) => {
        const normalized = normalizeOccsProfileSketch(sketch || {});
        return { parameters: normalized.parameters, units: normalized.units };
      };

      // Seeded entities carry their shape's id: extraction hands the tag
      // back so the model keeps authored identity instead of re-matching
      // geometry.
      const entityRecords = () => {
        const records = [];
        for (const entity of host?.entities() || []) {
          if (entity.layer === PROFILE_ANNOTATION_LAYER || entity.layer === PROFILE_DIMENSION_LAYER) continue;
          const shapeId = entityShapeByEntityId.get(entity.id);
          const tag = shapeId ? { shapeId } : {};
          if (entity.type === 'line') {
            records.push({
              type: 'LINE',
              start: { x: entity.x1, y: entity.y1 },
              end: { x: entity.x2, y: entity.y2 },
              ...tag
            });
          } else if (entity.type === 'circle') {
            records.push({ type: 'CIRCLE', center: { x: entity.cx, y: entity.cy }, radius: entity.r, ...tag });
          } else if (entity.type === 'arc') {
            records.push({
              type: 'ARC',
              center: { x: entity.cx, y: entity.cy },
              radius: entity.r,
              startAngle: entity.a0,
              endAngle: entity.a1,
              ...tag
            });
          } else if (entity.type === 'poly' && Array.isArray(entity.pts) && entity.pts.length >= 2) {
            records.push({
              type: 'POLYLINE',
              vertices: entity.pts.map(point => ({ x: point.x, y: point.y })),
              bulges: entity.pts.map(point => Number(point.bulge) || 0),
              closed: Boolean(entity.closed),
              ...tag
            });
          }
        }
        return records;
      };

      const externalScope = () => props.externalParameters || {};
      // The derived table's precedence: instance values over the authored
      // rows over the cassette's globals.
      const evaluationScope = () => ({
        ...externalScope(),
        ...normalizeOccsProfileSketch(props.modelValue || {}).parameters,
        ...(props.instanceParameters || {})
      });

      const sketchFingerprint = sketch => JSON.stringify(normalizeOccsProfileSketch(sketch || {}));

      const resetSketchHistory = (sketch = props.modelValue) => {
        historyEntries = [normalizeOccsProfileSketch(sketch || {})];
        historyAt = 0;
        historyVersion.value += 1;
      };

      // `sketch` is the state the author leaves behind; consecutive equal
      // states collapse, so a reseed or a repeated extraction never
      // swallows a step.
      const recordSketchHistory = (sketch) => {
        const entry = normalizeOccsProfileSketch(sketch || {});
        const fingerprint = sketchFingerprint(entry);
        if (historyAt >= 0 && sketchFingerprint(historyEntries[historyAt]) === fingerprint) return;
        historyEntries = historyEntries.slice(0, historyAt + 1);
        historyEntries.push(entry);
        if (historyEntries.length > 100) historyEntries.shift();
        historyAt = historyEntries.length - 1;
        historyVersion.value += 1;
      };

      const canUndoSketch = () => {
        historyVersion.value;
        return historyAt > 0;
      };
      const canRedoSketch = () => {
        historyVersion.value;
        return historyAt >= 0 && historyAt < historyEntries.length - 1;
      };
      const undoSketch = () => {
        if (historyAt <= 0) return;
        historyAt -= 1;
        historyVersion.value += 1;
        commitSketch(historyEntries[historyAt], { fromHistory: true });
      };
      const redoSketch = () => {
        if (!canRedoSketch()) return;
        historyAt += 1;
        historyVersion.value += 1;
        commitSketch(historyEntries[historyAt], { fromHistory: true });
      };

      // Extraction merges against the derived table so a seeded override
      // reads as the authored value; the stored sketch keeps the authored
      // rows and an intentional move over an override writes that row.
      const mergeAuthoredSketch = (extracted, authored, adoptShapes) => {
        const derived = deriveOccsProfileSketch(authored, props.instanceParameters);
        const merged = mergeOccsProfileSketchGeometry(extracted, derived, externalScope(), adoptShapes);
        const instance = props.instanceParameters || {};
        const instanceEdits = {};
        const parameters = { ...normalizeOccsProfileSketch(authored || {}).parameters };
        for (const [key, value] of Object.entries(merged.parameters || {})) {
          if (Object.prototype.hasOwnProperty.call(instance, key)) {
            if (value !== derived.parameters[key]) instanceEdits[key] = value;
            continue;
          }
          parameters[key] = value;
        }
        if (Object.keys(instanceEdits).length) {
          emit('update:instance', { ...instance, ...instanceEdits });
        }
        return { ...merged, parameters };
      };

      const emitSketch = ({ reference = false } = {}) => {
        if (!host || disposed) return;
        const context = parametersOf(props.modelValue);
        const extracted = occProfileSketchFromEntities(entityRecords(), {
          ...context,
          reference,
          // A tagged group rebuilds its authored shape's kind
          // (occs/README.md — shape identity).
          shapes: normalizeOccsProfileSketch(props.modelValue || {}).shapes
        });
        // Extraction merges into the authored sketch — unchanged shapes
        // keep their authored expressions, ids, ops, and fillet radii;
        // only moved or new geometry goes numeric. The external scope
        // joins the merge's evaluation so global-bound fields resolve;
        // the stored sketch keeps the clean table.
        const merged = mergeAuthoredSketch(extracted, props.modelValue || {}, droppedShapes);
        const keptIds = new Set(merged.shapes.map(shape => shape.id));
        droppedShapes = [
          ...(props.modelValue?.shapes || []),
          ...droppedShapes
        ].filter(shape => !keptIds.has(shape.id)).slice(-20);
        const sketch = normalizeOccsProfileSketch(merged, context.parameters);
        const fingerprint = JSON.stringify(sketch);
        if (fingerprint === lastEmitted) {
          syncAnnotations(sketch);
          return;
        }
        recordSketchHistory(sketch);
        lastEmitted = fingerprint;
        emit('update:modelValue', sketch);
        syncAnnotations(sketch);
      };

      const scheduleExtraction = () => {
        if (extractTimer || disposed) return;
        extractTimer = setTimeout(() => {
          extractTimer = null;
          emitSketch();
        }, EXTRACT_DEBOUNCE_MS);
      };

      const openBlankDocument = () => {
        if (!host || disposed) return;
        host.newDrawing('blank');
      };

      // Primitives are atomic: an erase that takes part of a rect or
      // circle deletes the whole shape (the model commit reseeds the
      // canvas, clearing the leftover entities) — a half-erased
      // primitive never degrades into loose lines. Chains keep their
      // per-segment nature.
      const eraseShapeAtomically = () => {
        const aliveCounts = new Map();
        for (const entity of host?.entities() || []) {
          const shapeId = entityShapeByEntityId.get(entity.id);
          if (shapeId) aliveCounts.set(shapeId, (aliveCounts.get(shapeId) || 0) + 1);
        }
        const taggedCounts = new Map();
        for (const shapeId of entityShapeByEntityId.values()) {
          taggedCounts.set(shapeId, (taggedCounts.get(shapeId) || 0) + 1);
        }
        const model = normalizeOccsProfileSketch(props.modelValue || {});
        for (const shape of model.shapes) {
          if (shape.type !== 'rect' && shape.type !== 'circle') continue;
          const tagged = taggedCounts.get(shape.id) || 0;
          const alive = aliveCounts.get(shape.id) || 0;
          if (tagged > alive && alive > 0) {
            deleteShape(shape.id);
            return true;
          }
        }
        return false;
      };

      const bindDocument = () => {
        if (!host) return;
        host.onChange = (kind) => {
          if (seeding) return;
          if (kind === 'change') lastAnnotationFingerprint = '';
          if (kind === 'change' && eraseShapeAtomically()) return;
          scheduleExtraction();
        };
      };

      const toCadEntity = record => {
        if (record.type === 'LINE') {
          return { type: 'line', x1: record.start.x, y1: record.start.y, x2: record.end.x, y2: record.end.y, layer: '0', shapeId: record.shapeId };
        }
        if (record.type === 'ARC') {
          return { type: 'arc', cx: record.center.x, cy: record.center.y, r: record.radius, a0: record.startAngle, a1: record.endAngle, layer: '0', shapeId: record.shapeId };
        }
        if (record.type === 'CIRCLE') {
          return { type: 'circle', cx: record.center.x, cy: record.center.y, r: record.radius, layer: '0', shapeId: record.shapeId };
        }
        return null;
      };

      const seedEntities = ({ entities }) => {
        if (!host) return;
        seeding = true;
        try {
          host.seed(entities.map(toCadEntity).filter(Boolean), { fit: false });
        } finally {
          seeding = false;
        }
        lastAnnotationFingerprint = '';
        // Seeded entities carry their shape's id — the frame's
        // selection maps back onto the authored shape for the popup.
        entityShapeByEntityId = new Map(
          host.entities()
            .filter(entity => entity.shapeId != null)
            .map(entity => [entity.id, entity.shapeId])
        );
      };

      const clearEngineSelection = () => {
        host?.setSelection([]);
      };

      const clearDrawingEntities = () => {
        clearEngineSelection();
        entityShapeByEntityId = new Map();
      };

      // Entities emitted per shape, each record tagged with its shape's
      // id — the seed builds the selection map from the tags.
      const entitiesPerShape = (normalized) => normalized.shapes.flatMap(shape => (
        occProfileEntitiesFromSketch(
          { ...normalized, shapes: [shape] },
          { parameters: externalScope() }
        ).map(record => ({ ...record, shapeId: shape.id }))
      ));

      const clearDrawing = () => {
        if (!host) return;
        host.cancel();
        pendingCommand = null;
        activeTool.value = 'select';
        seeding = true;
        try {
          host.newDrawing('blank');
        } finally {
          seeding = false;
        }
        lastAnnotationFingerprint = '';
        clearDrawingEntities();
        droppedShapes = [];
        pendingDimensionPick = null;
        dimensionDraft.value = null;
        selectedShape.value = null;
        selectedCorner.value = null;
        // Clearing starts the blank authoring session: the parameter
        // table empties with the canvas (occs/README.md owns the
        // blank-session law), so a cleared session's parameters never
        // ride the next hand-drawn profile.
        const sketch = createEmptyOccsProfileSketch();
        lastEmitted = JSON.stringify(normalizeOccsProfileSketch(sketch));
        emit('update:modelValue', sketch);
        emit('update:instance', {});
        resetSketchHistory(sketch);
        zoomToBlankWindow();
        syncAnnotations(sketch);
      };

      const reseedFromModel = ({ force = false, fit = true } = {}) => {
        if (!host || disposed) return;
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        if (!force && JSON.stringify(normalized) === lastEmitted) return;
        // The seed evaluates a render copy with the external scope
        // joined — global-bound coordinates render; the stored sketch
        // keeps the clean table.
        let entities = [];
        try {
          entities = entitiesPerShape(derivedSketch(normalized));
        } catch {
          // A mid-edit expression reseeds the last good geometry —
          // the canvas keeps the drawing.
          entities = lastGoodEvaluated.value
            ? entitiesPerShape(lastGoodEvaluated.value)
            : [];
        }
        seeding = true;
        try {
          if (entities.length) seedEntities({ entities });
          else {
            host.newDrawing('blank');
            lastAnnotationFingerprint = '';
            entityShapeByEntityId = new Map();
          }
        } finally {
          seeding = false;
        }
        pruneSelection(normalized);
        if (entities.length && fit) host.zoomFit(PROFILE_ANNOTATION_LAYER);
        selectShapeInEngine(selectedShape.value?.shapeId || selectedCorner.value?.shapeId || '');
        syncAnnotations(normalized);
      };

      // The frame owns the active-tool state: commands started from the
      // toolbar, the queue, or the canvas announce themselves through
      // its command hook, and the toolbar only reflects them.
      const DRAW_COMMANDS = new Set(['line', 'pline', 'circle', 'arc', 'rectang']);
      const bindCommandEvents = () => {
        if (!host) return;
        host.onCommand = (name) => {
          const command = String(name || '').toLowerCase();
          activeTool.value = DRAW_COMMANDS.has(command) ? command : 'select';
        };
      };

      const runCommand = (tool) => {
        pendingDimensionPick = null;
        dimensionDraft.value = null;
        if (tool.command) {
          if (activeTool.value !== 'select') host?.cancel();
          if (!host) {
            pendingCommand = tool.command;
            return;
          }
          host.run(tool.command);
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
      const pruneSelection = (sketch) => {
        const shapeIds = new Set(normalizeOccsProfileSketch(sketch || {}).shapes.map(shape => shape.id));
        if (selectedShape.value && !shapeIds.has(selectedShape.value.shapeId)) selectedShape.value = null;
        if (selectedCorner.value && !shapeIds.has(selectedCorner.value.shapeId)) selectedCorner.value = null;
        if (dimensionDraft.value && !shapeIds.has(dimensionDraft.value.shapeId)) dimensionDraft.value = null;
      };

      const commitSketch = (next, { fromHistory = false } = {}) => {
        if (!host || disposed) return;
        const normalized = normalizeOccsProfileSketch(next);
        const fingerprint = JSON.stringify(normalized);
        if (fingerprint === lastEmitted) return;
        if (!fromHistory) recordSketchHistory(normalized);
        lastEmitted = fingerprint;
        emit('update:modelValue', normalized);
        pruneSelection(normalized);
        // The reseed writes the projection; extraction would immediately
        // re-emit numeric geometry and clobber the authored expressions,
        // so the seed suppresses document events.
        seeding = true;
        try {
          seedEntities({ entities: entitiesPerShape(derivedSketch(normalized)) });
        } catch {
          if (lastGoodEvaluated.value) {
            seedEntities({ entities: entitiesPerShape(lastGoodEvaluated.value) });
          }
        } finally {
          seeding = false;
        }
        selectShapeInEngine(selectedShape.value?.shapeId || selectedCorner.value?.shapeId || '');
        syncAnnotations(normalized);
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
          return read(evaluateOccsProfileSketch(derivedSketch(props.modelValue || {}), externalScope()));
        } catch {
          return null;
        }
      };

      // A typed number into a field bound by a bare identifier commits to
      // that identifier in the table that drives the drawing: the instance
      // override when one exists, the authored row next, the surrounding
      // scope (a workpiece-local override) last.
      const BARE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
      const commitBoundParameter = (binding, numeric) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const instance = props.instanceParameters || {};
        if (Object.prototype.hasOwnProperty.call(instance, binding)) {
          emit('update:instance', { ...instance, [binding]: numeric });
          return true;
        }
        if (Object.prototype.hasOwnProperty.call(normalized.parameters, binding)) {
          commitSketch({ ...normalized, parameters: { ...normalized.parameters, [binding]: numeric } });
          return true;
        }
        if (Object.prototype.hasOwnProperty.call(externalScope(), binding)) {
          emit('update:instance', { ...instance, [binding]: numeric });
          return true;
        }
        return false;
      };

      // Shape field commit with the parameter lifecycle: a typed number
      // into a field bound to a bare identifier commits to the effective
      // table row (the dim is the parameter's editor — everything bound
      // to it follows); every other value keeps the adopt-on-bind path
      // onto the field.
      const applyShapeField = (shapeId, readEvaluated, apply, authoredValue, { shapeIds = null } = {}) => (value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : null;
        const binding = typeof authoredValue === 'string' ? authoredValue.trim() : '';
        if (Number.isFinite(numeric) && BARE_IDENTIFIER.test(binding) && commitBoundParameter(binding, numeric)) return;
        const parameters = adoptOccsProfileBindingParameter(
          normalized,
          value,
          evaluatedFieldValue(evaluated => readEvaluated(findShape(evaluated, shapeId))),
          evaluationScope()
        );
        const targets = new Set(shapeIds?.length ? shapeIds : [shapeId]);
        commitSketch({
          ...normalized,
          parameters,
          shapes: normalized.shapes.map(shape => (targets.has(shape.id) ? apply(shape, value) : shape))
        });
      };

      const applyFilletRadius = (shapeId, vertexId, value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const shape = findShape(normalized, shapeId);
        // Numbers clamp to non-negative; expression strings pass through
        // untouched like every other authoring field.
        applyShapeField(
          shapeId,
          evaluated => filletRadiusOf(findShape(evaluated, shapeId), vertexId) ?? 0,
          (subject, next) => {
            const nextRadius = next === '' || next === null || next === undefined
              ? 0
              : Number.isFinite(Number(next)) ? Math.max(0, Number(next)) : String(next).trim();
            const modifiers = (subject.modifiers || []).filter(modifier => !(
              modifier.type === 'fillet' && modifier.vertexId === vertexId
            ));
            if (nextRadius !== 0) modifiers.push({ type: 'fillet', vertexId, radius: nextRadius });
            return { ...subject, modifiers };
          },
          filletRadiusOf(shape, vertexId) ?? 0
        )(value);
      };

      const applyVertexField = (shapeId, vertexId, field, value) => {
        const shape = findShape(normalizeOccsProfileSketch(props.modelValue || {}), shapeId);
        applyShapeField(
          shapeId,
          evaluated => findShape(evaluated, shapeId)?.points.find(point => point.id === vertexId)?.[field],
          (subject, next) => ({
            ...subject,
            points: subject.points.map(point => (
              point.id === vertexId ? { ...point, [field]: next } : point
            ))
          }),
          shape?.points.find(point => point.id === vertexId)?.[field]
        )(value);
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
        const instance = { ...(props.instanceParameters || {}) };
        if (Object.prototype.hasOwnProperty.call(instance, key)) {
          delete instance[key];
          emit('update:instance', instance);
        }
        const parameters = { ...normalized.parameters };
        delete parameters[key];
        commitSketch({ ...normalized, parameters });
      };

      // Renaming refuses invalid and colliding names — the row
      // re-renders with the old name (the draft dies on commit). The
      // instance table moves with it.
      const renameParameter = (from, to) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const instance = props.instanceParameters || {};
        if (Object.prototype.hasOwnProperty.call(instance, String(to || '').trim())) return;
        const next = renameOccsProfileSketchParameter(normalized, from, to);
        if (next === normalized) return;
        const nextInstance = renameOccsProfileTableParameter(instance, from, to);
        if (JSON.stringify(nextInstance) !== JSON.stringify(instance)) {
          emit('update:instance', nextInstance);
        }
        commitSketch(next);
      };

      const resolvedHint = (sketch, value) => {
        if (typeof value !== 'string' || !resolvedParameterTable.value) return ' = ?';
        try {
          return ` = ${resolveOccsExpression(value, resolvedParameterTable.value)}`;
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

      // A shape's property fields — the panel's expanded row is their
      // one home (canvas dims mirror them as annotations).
      const shapePropertyRows = (shape, sketch) => {
        const rows = [];
        const labeledField = (label, value, readEvaluated, apply, ariaLabel = `${label} ${shape.id}`) => h('div', { class: 'flex items-center gap-1' }, [
          h('span', { class: 'w-5 shrink-0 text-right font-mono text-xs text-muted' }, label),
          expressionField(
            value,
            `${label}${resolvedHint(sketch, value)}`,
            applyShapeField(shape.id, readEvaluated, apply, value),
            ariaLabel
          )
        ]);
        if (shape.type === 'circle') {
          rows.push(h('div', { class: 'flex flex-wrap items-center gap-1' }, [
            labeledField('d', shape.diameter, s => s?.diameter, (s, next) => ({ ...s, diameter: next })),
            labeledField('x', shape.center[0], s => s?.center?.[0], (s, next) => ({ ...s, center: [next, s.center[1]] })),
            labeledField('y', shape.center[1], s => s?.center?.[1], (s, next) => ({ ...s, center: [s.center[0], next] }))
          ]));
        }
        if (shape.type === 'rect') {
          rows.push(h('div', { class: 'flex flex-wrap items-center gap-1' }, [
            labeledField('w', shape.width, s => s?.width, (s, next) => ({ ...s, width: next })),
            labeledField('h', shape.height, s => s?.height, (s, next) => ({ ...s, height: next })),
            labeledField('x', shape.center[0], s => s?.center?.[0], (s, next) => ({ ...s, center: [next, s.center[1]] })),
            labeledField('y', shape.center[1], s => s?.center?.[1], (s, next) => ({ ...s, center: [s.center[0], next] })),
            labeledField('∠', shape.rotation, s => s?.rotation, (s, next) => ({ ...s, rotation: next }))
          ]));
          rows.push(h('div', { class: 'flex flex-wrap items-center gap-1' }, [
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
          // A point-drawn shape carries its dimensions as vertex
          // coordinates: every authored point row is the same
          // adopt-on-bind field the rect and circle rows carry.
          for (const point of shape.points.filter(item => !item.chord)) {
            const readField = field => evaluated => (
              evaluated?.points?.find(item => item.id === point.id)?.[field]
            );
            const applyField = field => (subject, next) => ({
              ...subject,
              points: subject.points.map(item => (item.id === point.id ? { ...item, [field]: next } : item))
            });
            rows.push(h('div', { key: `${shape.id}-${point.id}`, class: 'flex items-center gap-1' }, [
              h('span', { class: 'w-5 shrink-0 text-right font-mono text-xs text-muted' }, point.id),
              labeledField('x', point.x, readField('x'), applyField('x'), `x ${point.id}`),
              labeledField('y', point.y, readField('y'), applyField('y'), `y ${point.id}`)
            ]));
          }
          const fillets = shape.modifiers.filter(item => item.type === 'fillet');
          for (let index = 0; index < fillets.length; index += 4) {
            rows.push(h('div', { class: 'flex flex-wrap items-center gap-1' }, fillets.slice(index, index + 4).map(modifier => (
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
        return rows;
      };

      const OP_TAG_SEVERITY = { add: 'success', subtract: 'danger', construction: 'secondary' };
      const deleteShape = (shapeId) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        commitSketch({
          ...normalized,
          shapes: normalized.shapes.filter(shape => shape.id !== shapeId)
        });
        if (selectedShape.value?.shapeId === shapeId) selectedShape.value = null;
        if (selectedCorner.value?.shapeId === shapeId) selectedCorner.value = null;
      };
      // The sequence is semantic: moving a shape reorders the CSG
      // steps (a later add refills an earlier cut).
      const moveShape = (shapeId, delta) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const at = normalized.shapes.findIndex(shape => shape.id === shapeId);
        const next = at + delta;
        if (at < 0 || next < 0 || next >= normalized.shapes.length) return;
        const shapes = [...normalized.shapes];
        const [moved] = shapes.splice(at, 1);
        shapes.splice(next, 0, moved);
        commitSketch({ ...normalized, shapes });
      };

      // The primitives panel — the authored CSG sequence, one row per
      // shape in evaluation order, riding the workpieces tree's row
      // anatomy. A collapsed row carries its op as a state tag; the
      // selected row replaces the tag with the op control, the
      // property table, and its actions.
      const renderShapesPanel = () => {
        const sketch = normalizeOccsProfileSketch(props.modelValue || {});
        if (!sketch.shapes.length) return null;
        const rows = sketch.shapes.map((shape, index) => {
          const selected = selectedShape.value?.shapeId === shape.id
            || selectedCorner.value?.shapeId === shape.id;
          return h('div', {
            key: shape.id,
            class: 'border-b border-content-border px-1 py-1.5 last:border-b-0'
          }, [
            h('div', { class: 'flex min-w-0 items-center gap-1' }, [
              h('button', {
                type: 'button',
                class: [
                  'flex min-w-0 flex-1 items-center gap-2 rounded-ui border px-2 py-1 text-left text-sm',
                  selected ? 'border-primary bg-subtle' : 'border-transparent'
                ].join(' '),
                title: t(SHAPE_KIND_LABEL[shape.type]),
                'aria-label': `${t(SHAPE_KIND_LABEL[shape.type])} ${shape.id}`,
                'aria-expanded': selected ? 'true' : 'false',
                onClick: () => {
                  dimensionDraft.value = null;
                  selectedCorner.value = null;
                  const wasSelected = selectedShape.value?.shapeId === shape.id;
                  selectedShape.value = wasSelected ? null : { shapeId: shape.id };
                  selectShapeInEngine(wasSelected ? '' : shape.id);
                }
              }, [
                h('span', { class: 'shrink-0 text-muted' }, () => [toolIcon(h, SHAPE_KIND_ICON[shape.type])]),
                h('span', { class: 'truncate' }, t(SHAPE_KIND_LABEL[shape.type])),
                selected
                  ? null
                  : h(Tag, {
                      value: t(`cassette.v2.profileEditor.ops.${shape.op}`),
                      severity: OP_TAG_SEVERITY[shape.op],
                      size: 'small',
                      class: 'ml-auto shrink-0'
                    })
              ]),
              ...(selected
                ? [
                    h(Button, {
                      icon: 'pi pi-chevron-up',
                      severity: 'secondary',
                      text: true,
                      rounded: true,
                      size: 'small',
                      class: 'shrink-0',
                      disabled: index === 0,
                      'aria-label': `${t('cassette.v2.profileEditor.moveUp')} ${shape.id}`,
                      title: t('cassette.v2.profileEditor.moveUp'),
                      onClick: () => { moveShape(shape.id, -1); }
                    }),
                    h(Button, {
                      icon: 'pi pi-chevron-down',
                      severity: 'secondary',
                      text: true,
                      rounded: true,
                      size: 'small',
                      class: 'shrink-0',
                      disabled: index === sketch.shapes.length - 1,
                      'aria-label': `${t('cassette.v2.profileEditor.moveDown')} ${shape.id}`,
                      title: t('cassette.v2.profileEditor.moveDown'),
                      onClick: () => { moveShape(shape.id, 1); }
                    }),
                    h(Button, {
                      icon: 'pi pi-trash',
                      severity: 'danger',
                      text: true,
                      rounded: true,
                      size: 'small',
                      class: 'shrink-0',
                      'aria-label': `${t('common.delete')} ${shape.id}`,
                      title: t('common.delete'),
                      onClick: () => { deleteShape(shape.id); }
                    })
                  ]
                : [])
            ]),
            ...(selected
              ? [h('div', {
                  key: `${shape.id}-properties`,
                  class: 'mt-1.5 flex flex-col gap-1.5 border-t border-content-border px-1 pt-1.5',
                  'aria-label': t('cassette.v2.profileEditor.parameters')
                }, [
                  opToggle(shape),
                  ...shapePropertyRows(shape, sketch)
                ])]
              : [])
          ]);
        });
        return h('div', {
          class: 'profile-shapes-panel absolute right-2 top-14 z-20 flex max-h-[calc(100%-4rem)] w-[19rem] flex-col overflow-y-auto rounded-ui border border-content-border bg-content py-0.5 shadow-card',
          'aria-label': t('cassette.v2.profileEditor.shapes')
        }, rows);
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


      // A dimension's native label opens its authored field in place;
      // the transient input overlays the label while it has focus.
      const renderDimensionEditor = () => {
        const draft = dimensionDraft.value;
        if (!draft) return null;
        const width = containerRef.value?.clientWidth || 0;
        const height = containerRef.value?.clientHeight || 0;
        const CH_PX = 8.5;
        const shown = fieldDraft.text(draft.label, draft.value);
        const boxWidth = Math.min(Math.max(String(shown ?? '').length + 2, 6), 12) * CH_PX;
        const left = Math.min(Math.max(draft.left - boxWidth / 2, 2), Math.max(2, width - boxWidth - 2));
        const top = Math.min(Math.max(draft.top - 13, 2), Math.max(2, height - 28));
        const close = () => { dimensionDraft.value = null; };
        const handlers = fieldDraft.handlers(draft.label, draft.value, next => {
          applyShapeField(draft.shapeId, draft.read, draft.apply, draft.value, { shapeIds: draft.shapeIds })(next);
          close();
        });
        return h(InputText, {
          ref: dimensionInputRef,
          key: draft.label,
          class: 'profile-dim absolute z-20 bg-content text-center font-mono text-xs shadow-sm',
          style: { left: `${left}px`, top: `${top}px`, width: `${boxWidth}px` },
          modelValue: shown,
          ...handlers,
          size: 'small',
          'aria-label': draft.label,
          title: draft.label,
          onKeydown: event => {
            handlers.onKeydown(event);
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          },
          onBlur: event => {
            handlers.onBlur(event);
            close();
          },
          onPointerdown: event => { event.stopPropagation(); }
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
        if (!file || !host) return;
        importError.value = '';
        try {
          seeding = true;
          try {
            await host.openText(file.name, await file.text());
          } finally {
            seeding = false;
          }
          droppedShapes = [];
          entityShapeByEntityId = new Map();
          lastAnnotationFingerprint = '';
          host.zoomFit(PROFILE_ANNOTATION_LAYER);
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

      const disposeHost = () => {
        if (viewRaf) {
          cancelAnimationFrame(viewRaf);
          viewRaf = 0;
        }
        host?.destroy();
        host = null;
      };

      const startViewWatcher = () => {
        const tick = () => {
          if (disposed || !host) return;
          const key = host.viewKey();
          if (key && key !== lastViewKey) {
            lastViewKey = key;
            viewTick.value += 1;
          }
          viewRaf = requestAnimationFrame(tick);
        };
        viewRaf = requestAnimationFrame(tick);
      };

      const mountEngine = async () => {
        if (typeof window === 'undefined' || host) return;
        engineError.value = '';
        try {
          host = new CadCraftHost({
            container: containerRef.value,
            title: t('cassette.v2.profileEditor.preview')
          });
          await host.mount();
          if (disposed) {
            host.destroy();
            host = null;
            return;
          }
          host.setCommandLine(false);
          host.setGrid(false);
          for (const kind of OSNAP_KINDS) host.setSnapKind(kind, true);
          host.setOsnap(true);
          orthoMode.value = Boolean(host.cad?.host?.settings?.ortho);
          tangentSnap.value = Boolean(host.cad?.host?.settings?.kinds?.has('tan'));
          host.setOrtho(orthoMode.value);
          bindDocument();
          bindCommandEvents();
          host.onSelection = ids => {
            syncShapeSelection(ids);
            if (!seeding && !programmaticSelection) scheduleExtraction();
          };
          host.onPointerDown = handleVertexSelectPointerDown;
          host.onPointerUp = (event) => {
            if (pendingDimensionPick) {
              const picked = pendingDimensionPick;
              pendingDimensionPick = null;
              openDimensionEditor(picked, event);
              return;
            }
            scheduleExtraction();
          };
          host.onKeyDown = handleCanvasKeydown;
          window.addEventListener('keydown', handleParentKeydown, true);
          startViewWatcher();
          openBlankDocument();
          lastEmitted = '';
          reseedFromModel();
          if (!host) return;
          emitSketch();
          resetSketchHistory();
          const queued = pendingCommand ? [pendingCommand] : [];
          pendingCommand = null;
          if (!normalizeOccsProfileSketch(props.modelValue || {}).shapes.length) {
            zoomToBlankWindow(queued);
          } else if (queued.length) {
            host.run(queued[0]);
          }
          canvasReady.value = true;
          // A dialog mount can race the container's real size (open
          // animation, late flex layout); the first time the canvas
          // reaches working size, re-fit the view so the seed is framed.
          if (containerRef.value && (containerRef.value.clientHeight < 120)) {
            zoomObserver = new ResizeObserver(() => {
              if (!host || containerRef.value?.clientHeight < 120) return;
              zoomObserver.disconnect();
              zoomObserver = null;
              host.zoomFit(PROFILE_ANNOTATION_LAYER);
            });
            zoomObserver.observe(containerRef.value);
          }
        } catch (error) {
          canvasReady.value = false;
          disposeHost();
          engineError.value = error?.message || String(error);
        }
      };

      onMounted(async () => {
        await nextTick();
        mountEngine();
        scheduleOutlineResolve();
      });

      watch(() => props.modelValue, () => {
        dimensionDraft.value = null;
        if (host) reseedFromModel();
        scheduleOutlineResolve();
      }, { deep: true });

      watch(() => props.externalParameters, () => {
        if (host) reseedFromModel({ force: true, fit: false });
        scheduleOutlineResolve();
        syncAnnotations();
      }, { deep: true });

      // Instance values repaint the derived geometry: the authored model
      // stays put, the canvas reseeds from the new derived table.
      watch(() => props.instanceParameters, () => {
        if (host) reseedFromModel({ force: true, fit: false });
        scheduleOutlineResolve();
        syncAnnotations();
      }, { deep: true });

      onBeforeUnmount(() => {
        disposed = true;
        canvasReady.value = false;
        window.removeEventListener('keydown', handleParentKeydown, true);
        if (extractTimer) clearTimeout(extractTimer);
        extractTimer = null;
        if (outlineTimer) clearTimeout(outlineTimer);
        outlineTimer = null;
        zoomObserver?.disconnect?.();
        zoomObserver = null;
        disposeHost();
      });

      return () => h('div', {
        ref: rootRef,
        class: 'flex min-h-0 flex-1 flex-col gap-2',
        'data-keyboard-scope': 'cad'
      }, [
        importError.value
          ? h(Message, { severity: 'error', size: 'small', closable: false }, () => importError.value)
          : null,
        renderParameterStrip(),
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
          'data-cadcraft-ready': canvasReady.value ? 'true' : undefined
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
          renderShapesPanel(),
          renderDimensionEditor(),
          renderVertexPopup(),
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
