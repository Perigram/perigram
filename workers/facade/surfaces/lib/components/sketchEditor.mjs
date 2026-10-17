// The profile sketch editor as a plugin surface component: a CAD canvas
// (the vendored MLightCAD runtime, loaded lazily from the executor's
// static tree) over the OCCS profile sketch model. Drawing, snapping,
// grips, and undo/redo run in the engine; entity records and the sketch
// model normalize through occs/profiles.js.
import {
  adoptOccsProfileBindingParameter,
  createEmptyOccsProfileSketch,
  evaluateOccsProfileSketch,
  mergeOccsProfileSketchGeometry,
  normalizeOccsProfileSketch,
  occProfileEntitiesFromSketch,
  occProfileSketchFromEntities,
  occsProfileFromSketch,
  renameOccsProfileSketchParameter,
  setOccsProfileSketchClosed
} from '../../../occs/profiles.js';
import { resolveOccsExpression } from '../../../occs/expressions.js';
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

export default function createSketchEditor({ vue, components, locale }) {
  const { h, ref, shallowRef, computed, watch, onMounted, onBeforeUnmount, nextTick, defineComponent } = vue;
  const t = locale.t;
  const { Button, InputText, Message, Toolbar } = components;

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
      const basisPick = ref(false);
      const selectedVertexId = ref(null);
      const overlayRef = ref(null);

      let manager = null;
      let dbListeners = [];
      let extractTimer = null;
      let lastEmitted = '';
      let disposed = false;
      let zoomObserver = null;
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

      const toggleBasisPick = () => {
        basisPick.value = !basisPick.value;
        if (basisPick.value) selectedVertexId.value = null;
      };

      // Canvas annotations: automatic per-edge dimensions for the
      // evaluated corners, datum marks for the sketch origin and the
      // profile's anchors, and basis-pick targets — a derived overlay
      // (never stored, never extracted). The pure descriptor builder
      // runs through a computed keyed on a tick bumped from the view's
      // render frame, so pan/zoom redraw it like any other reactive
      // render. The origin datum renders on an empty canvas too; an
      // open shape's anchors are its first and last corners.
      const viewTick = ref(0);
      const bumpViewTick = () => { viewTick.value += 1; };

      const buildCanvasAnnotations = (evaluated, view) => {
        const corners = evaluated.points.filter(point => !point.chord);
        const closed = evaluated.closed && corners.length >= 3;
        const toScreen = (x, y) => {
          const point = view.worldToScreen({ x, y });
          return [point.x, point.y];
        };
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
          const [ax, ay] = toScreen(a.x, a.y);
          const [bx, by] = toScreen(b.x, b.y);
          if (Math.hypot(bx - ax, by - ay) < 28) continue;
          const nx = b.y - a.y;
          const ny = a.x - b.x;
          const outward = (centroid[0] - (a.x + b.x) / 2) * nx + (centroid[1] - (a.y + b.y) / 2) * ny > 0
            ? [nx, ny]
            : [-nx, -ny];
          const nl = Math.hypot(outward[0], outward[1]) || 1;
          const [dx, dy] = toScreen(a.x + outward[0] / nl, a.y + outward[1] / nl);
          let ux = dx - ax;
          let uy = dy - ay;
          const ul = Math.hypot(ux, uy) || 1;
          ux /= ul;
          uy /= ul;
          const off = 16;
          const a1 = [ax + ux * off, ay + uy * off];
          const b1 = [bx + ux * off, by + uy * off];
          dimensions.push({
            key: `${a.id}-${b.id}`,
            extensionA: [ax + ux * 2, ay + uy * 2, a1[0] + ux * 3, a1[1] + uy * 3],
            extensionB: [bx + ux * 2, by + uy * 2, b1[0] + ux * 3, b1[1] + uy * 3],
            line: [...a1, ...b1],
            labelAt: [(a1[0] + b1[0]) / 2 + ux * 9, (a1[1] + b1[1]) / 2 + uy * 9],
            text: worldLength.toFixed(1)
          });
        }

        const anchor = closed
          ? corners.find(point => point.id === evaluated.anchors?.vertexId) || null
          : null;
        const anchors = closed
          ? (anchor ? [toScreen(anchor.x, anchor.y)] : [])
          : corners.length >= 2
            ? [toScreen(corners[0].x, corners[0].y), toScreen(corners[corners.length - 1].x, corners[corners.length - 1].y)]
            : corners.length === 1 ? [toScreen(corners[0].x, corners[0].y)] : [];
        return {
          dimensions,
          closed,
          origin: toScreen(0, 0),
          anchors,
          picks: closed && basisPick.value
            ? corners.map(point => toScreen(point.x, point.y))
            : []
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
        return buildCanvasAnnotations(evaluated, view);
      });

      // The selected corner's editing popup — x/y expressions and the
      // fillet radius authored at that vertex, keyed on the same
      // render-frame tick as the annotations so it tracks pan and zoom.
      const selectedVertexPopup = computed(() => {
        viewTick.value;
        const view = manager?.curView;
        const id = selectedVertexId.value;
        if (!view || !id) return null;
        const sketch = normalizeOccsProfileSketch(props.modelValue || {});
        const authored = sketch.points.find(item => item.id === id && !item.chord);
        if (!authored) return null;
        let evaluated = null;
        try {
          evaluated = evaluateOccsProfileSketch(sketch, externalScope());
        } catch {
          return null;
        }
        const corner = evaluated.points.find(item => item.id === id);
        if (!corner) return null;
        const corners = evaluated.points.filter(item => !item.chord);
        const isStart = corners[0]?.id === id;
        const isEnd = corners[corners.length - 1]?.id === id;
        const screen = view.worldToScreen({ x: corner.x, y: corner.y });
        const width = containerRef.value?.clientWidth || 0;
        const height = containerRef.value?.clientHeight || 0;
        return {
          id,
          sketch,
          x: authored.x,
          y: authored.y,
          fillet: filletRadiusOf(sketch, id),
          anchor: evaluated.anchors?.vertexId === id,
          openEnd: !evaluated.closed && (isStart || isEnd),
          isStart,
          isEnd,
          left: Math.min(screen.x + 14, Math.max(0, width - 240)),
          top: Math.min(Math.max(screen.y - 16, 0), Math.max(0, height - 44))
        };
      });

      // Disconnected drawn/imported geometry rides the model from
      // extraction; the save gate refuses while any piece is unchained.
      const unchainedCount = computed(() => normalizeOccsProfileSketch(props.modelValue || {}).unchained || 0);

      // Nearest authored corner within `radius` px of a client point —
      // shared by the modal basis pick and vertex selection.
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
        for (const point of evaluated.points.filter(item => !item.chord)) {
          const screen = view.worldToScreen({ x: point.x, y: point.y });
          const distance = Math.hypot(rect.x + screen.x - clientX, rect.y + screen.y - clientY);
          if (distance <= radius && (!best || distance < best.distance)) {
            best = { point, distance };
          }
        }
        return best ? best.point : null;
      };

      // Basis pick is modal: while active it intercepts canvas clicks
      // before the engine sees them; the nearest authored corner within
      // pick radius becomes the basis.
      const handleBasisPickPointerDown = (event) => {
        if (!basisPick.value) return;
        event.preventDefault();
        event.stopPropagation();
        basisPick.value = false;
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        if (!normalized.closed) return;
        const point = cornerAt(event.clientX, event.clientY, 14);
        if (point) commitSketch({ ...normalized, anchors: { vertexId: point.id } });
      };

      // Vertex selection feeds the canvas popup: with the Select tool a
      // click near an authored corner selects it; anything else clears.
      const handleVertexSelectPointerDown = (event) => {
        if (basisPick.value) return;
        if (event.target?.closest?.('.profile-vertex-popup')) return;
        if (activeTool.value !== 'select') {
          selectedVertexId.value = null;
          return;
        }
        const point = cornerAt(event.clientX, event.clientY, 14);
        selectedVertexId.value = point ? point.id : null;
      };

      // The surface owns Escape routing: the engine's own handling needs
      // focus inside its container, and toolbar clicks or a focused
      // authoring field move it outside it. Escape closes the vertex
      // popup, cancels the engine's active command, and clears its
      // selection — in that order, from any focus.
      const handleWindowKeydown = (event) => {
        if (event.key !== 'Escape') return;
        if (selectedVertexId.value) selectedVertexId.value = null;
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
          // The basis anchor is a closed-shape construct — on an open
          // sketch the toggle is disabled, never a silent no-op.
          { icon: 'basis', labelKey: 'cassette.v2.profileEditor.actions.basis', isOn: () => basisPick.value, onActivate: toggleBasisPick, isDisabled: () => !normalizeOccsProfileSketch(props.modelValue || {}).closed },
          { icon: 'ortho', labelKey: 'cassette.v2.profileEditor.actions.ortho', isOn: () => orthoMode.value, onActivate: toggleOrtho },
          { icon: 'tangentSnap', labelKey: 'cassette.v2.profileEditor.actions.tangentSnap', isOn: () => tangentSnap.value, onActivate: toggleTangentSnap },
          { icon: 'commandLine', labelKey: 'cassette.v2.profileEditor.actions.commandLine', isOn: () => commandLine.value, onActivate: toggleCommandLine },
          {
            icon: () => (normalizeOccsProfileSketch(props.modelValue || {}).closed ? 'closedShape' : 'openShape'),
            labelKey: () => (normalizeOccsProfileSketch(props.modelValue || {}).closed
              ? 'cassette.v2.profileEditor.closedShape'
              : 'cassette.v2.profileEditor.openShape'),
            isOn: () => normalizeOccsProfileSketch(props.modelValue || {}).closed,
            onActivate: () => { toggleClosed(); }
          }
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

      const emitSketch = () => {
        if (!manager || disposed) return;
        const context = parametersOf(props.modelValue);
        const extracted = occProfileSketchFromEntities(entityRecords(), context);
        // Extraction merges into the authored sketch — unchanged corners
        // keep their authored expressions, ids, and fillet radii; only
        // moved or new geometry goes numeric. Anchors are model state,
        // not derivable from geometry (normalize drops the anchor when
        // its vertex died). The external scope joins the merge's
        // evaluation so global-bound fields resolve; the stored sketch
        // keeps the clean table.
        const sketch = normalizeOccsProfileSketch({
          ...mergeOccsProfileSketchGeometry(extracted, props.modelValue || {}, externalScope()),
          anchors: props.modelValue?.anchors ?? null
        }, context.parameters);
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
      };

      const clearDrawing = async () => {
        if (!manager) return;
        // The entity deletions never schedule an extraction: one racing
        // the parent's model update read the OLD sketch's table and
        // rebuilt it onto the blank session.
        unbindDatabase();
        clearDrawingEntities();
        importedFileName.value = '';
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
        const entities = normalized.points.length
          ? occProfileEntitiesFromSketch(normalizeOccsProfileSketch(normalized, externalScope()))
          : [];
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

      const filletRadiusOf = (sketch, vertexId) => (
        (sketch.modifiers || []).find(modifier => modifier.type === 'fillet' && modifier.vertexId === vertexId)?.radius ?? null
      );

      // Edits author the sketch model directly (expressions stay strings);
      // the canvas reseeds from evaluated geometry — unresolvable
      // expressions seed nothing and the rows keep the raw values for
      // editing. Later draws merge back through
      // mergeOccsProfileSketchGeometry, which keeps authored expressions
      // on unchanged corners.
      const commitSketch = (next) => {
        if (!manager || disposed) return;
        // Authored edits rebuild the canvas from the model, dropping any
        // unconnected leftover geometry — the chain state resets with them.
        const normalized = { ...normalizeOccsProfileSketch(next), unchained: 0 };
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
          seedEntities({ entities: occProfileEntitiesFromSketch(normalizeOccsProfileSketch(normalized, externalScope())) });
        } catch {
          // Unresolvable expressions: no drawable geometry this pass.
        }
        bindDatabase({ schedule: false });
      };

      const applyFilletRadius = (vertexId, value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const numeric = Number(value);
        // Numbers clamp to non-negative; expression strings pass through
        // untouched like every other authoring field. Binding a single
        // unknown identifier adopts the field's current value.
        const radius = value === '' || value === null || value === undefined
          ? 0
          : Number.isFinite(numeric) ? Math.max(0, numeric) : String(value).trim();
        const parameters = adoptOccsProfileBindingParameter(normalized, radius, filletRadiusOf(normalized, vertexId) ?? 0, externalScope());
        const modifiers = normalized.modifiers.filter(modifier => !(
          modifier.type === 'fillet' && modifier.vertexId === vertexId
        ));
        if (radius !== 0) modifiers.push({ type: 'fillet', vertexId, radius });
        commitSketch({ ...normalized, parameters, modifiers });
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

      const applyVertexField = (vertexId, field, value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const parameters = adoptOccsProfileBindingParameter(
          normalized,
          value,
          evaluatedFieldValue(evaluated => evaluated.points.find(point => point.id === vertexId)?.[field]),
          externalScope()
        );
        commitSketch({
          ...normalized,
          parameters,
          points: normalized.points.map(point => (
            point.id === vertexId ? { ...point, [field]: value } : point
          ))
        });
      };

      const applyHoleField = (holeId, index, value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const parameters = adoptOccsProfileBindingParameter(
          normalized,
          value,
          evaluatedFieldValue(evaluated => evaluated.holes.find(hole => hole.id === holeId)?.center?.[index]),
          externalScope()
        );
        commitSketch({
          ...normalized,
          parameters,
          holes: normalized.holes.map(hole => (
            hole.id === holeId
              ? { ...hole, center: hole.center.map((entry, at) => (at === index ? value : entry)) }
              : hole
          ))
        });
      };

      const applyHoleDiameter = (holeId, value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const parameters = adoptOccsProfileBindingParameter(
          normalized,
          value,
          evaluatedFieldValue(evaluated => evaluated.holes.find(hole => hole.id === holeId)?.diameter),
          externalScope()
        );
        commitSketch({
          ...normalized,
          parameters,
          holes: normalized.holes.map(hole => (
            hole.id === holeId ? { ...hole, diameter: value } : hole
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

      const toggleClosed = () => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        commitSketch(setOccsProfileSketchClosed(normalized, !normalized.closed));
      };

      const resolvedHint = (sketch, value) => {
        if (typeof value !== 'string') return '';
        try {
          return ` = ${resolveOccsExpression(value, sketch.parameters)}`;
        } catch {
          return ' = ?';
        }
      };

      // Authoring fields (vertex x/y, hole centers and diameters,
      // parameter values, fillet radii) hold their typed text while
      // focused and commit it on blur/Enter. The draft dies with the
      // vertex selection that owns it — Escape included.
      const fieldDraft = createFieldDraft({ vue });
      watch(selectedVertexId, () => { fieldDraft.clear(); });

      const expressionField = (value, hint, onInput, ariaLabel) => h(InputText, {
        modelValue: fieldDraft.text(ariaLabel, value),
        ...fieldDraft.handlers(ariaLabel, value, onInput),
        size: 'small',
        class: 'w-16 font-mono text-xs',
        title: hint,
        'aria-label': ariaLabel
      });

      // Authoring rows: parameters, per-vertex coordinates + fillet radius,
      // per-hole center + diameter. Values are numbers or expressions; the
      // tooltip shows the resolved value. An open sketch's first and last
      // vertices are its break points (marked with a dot).
      const renderSketchRows = () => {
        const sketch = normalizeOccsProfileSketch(props.modelValue || {});
        const rows = [];
        rows.push(h('div', { class: 'flex flex-wrap items-center gap-1' }, [
          h('span', { class: 'font-mono text-xs text-muted-color' }, 'fx'),
          ...Object.entries(sketch.parameters).map(([key, value]) => h('div', {
            key,
            class: 'flex items-center gap-1 rounded-ui border border-content-border px-1.5 py-0.5'
          }, [
            h(InputText, {
              modelValue: fieldDraft.text(`name ${key}`, key),
              ...fieldDraft.handlers(`name ${key}`, key, next => { renameParameter(key, next); }),
              size: 'small',
              class: 'w-12 font-mono text-xs',
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
        ]));
        // Chord runs (an extracted arc's flattened interior) stay as
        // read-only legend chips — real geometry, not authored corners.
        // Authored vertices edit through the canvas popup instead.
        const chordChips = [];
        for (let index = 0; index < sketch.points.length; index += 1) {
          const point = sketch.points[index];
          if (!point.chord) continue;
          if (index > 0 && sketch.points[index - 1].chord) continue;
          let run = 1;
          while (index + run < sketch.points.length && sketch.points[index + run].chord) run += 1;
          chordChips.push(h('div', {
            key: point.id,
            class: 'flex items-center gap-1 rounded-ui border border-dashed border-content-border px-1.5 py-0.5 text-xs text-muted-color',
            title: sketch.points.slice(index, index + run).map(p => `${p.x}, ${p.y}`).join('\n')
          }, `⌒ ${run}`));
        }
        if (chordChips.length) {
          rows.push(h('div', { class: 'flex flex-wrap items-center gap-1' }, chordChips));
        }
        if (sketch.holes.length) {
          rows.push(h('div', { class: 'flex flex-wrap items-center gap-1' },
            sketch.holes.map(hole => h('div', {
              key: hole.id,
              class: 'flex items-center gap-1 rounded-ui border border-content-border px-1.5 py-0.5'
            }, [
              h('span', { class: 'font-mono text-xs text-muted-color' }, hole.id),
              expressionField(hole.center[0], `x${resolvedHint(sketch, hole.center[0])}`, next => { applyHoleField(hole.id, 0, next); }, `x ${hole.id}`),
              expressionField(hole.center[1], `y${resolvedHint(sketch, hole.center[1])}`, next => { applyHoleField(hole.id, 1, next); }, `y ${hole.id}`),
              expressionField(hole.diameter, `d${resolvedHint(sketch, hole.diameter)}`, next => { applyHoleDiameter(hole.id, next); }, `d ${hole.id}`)
            ]))
          ));
        }
        return h('div', { class: 'flex shrink-0 flex-col gap-1' }, rows);
      };


      const DIM_STROKE = 'var(--p-text-muted-color)';
      const DIM_HALO = 'var(--p-content-background)';
      const PRIMARY = 'var(--p-primary-color)';

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
        return [
          ...annotations.dimensions.flatMap(dimension => [
            line(`${dimension.key}-ea`, dimension.extensionA),
            line(`${dimension.key}-eb`, dimension.extensionB),
            line(`${dimension.key}-d`, dimension.line),
            h('text', {
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
          ...datum('origin', annotations.origin),
          ...annotations.anchors.flatMap((at, index) => datum(`anchor-${index}`, at)),
          ...annotations.picks.map((pick, index) => h('circle', {
            key: `pick-${index}`,
            cx: pick[0], cy: pick[1], r: 4, fill: 'none',
            stroke: PRIMARY, 'stroke-width': 1, 'stroke-dasharray': '2 2'
          }))
        ];
      };

      // The selected corner's popup edits the authored model through the
      // same commit path as the old chips row (expressions stay strings).
      const renderVertexPopup = () => {
        const popup = selectedVertexPopup.value;
        if (!popup) return null;
        const { id, sketch } = popup;
        return h('div', {
          class: 'profile-vertex-popup absolute z-20 flex items-center gap-1 rounded-ui border border-content-border bg-content-background px-1.5 py-1 shadow-md',
          style: { left: `${popup.left}px`, top: `${popup.top}px` },
          onPointerdown: event => { event.stopPropagation(); }
        }, [
          popup.anchor
            ? h('span', { class: 'text-xs text-primary', title: t('cassette.v2.profileEditor.anchor') }, '⌖')
            : null,
          h('span', { class: 'font-mono text-xs text-muted-color' }, id),
          expressionField(popup.x, `x${resolvedHint(sketch, popup.x)}`, next => { applyVertexField(id, 'x', next); }, `x ${id}`),
          expressionField(popup.y, `y${resolvedHint(sketch, popup.y)}`, next => { applyVertexField(id, 'y', next); }, `y ${id}`),
          h(InputText, {
            modelValue: fieldDraft.text(`r ${id}`, popup.fillet),
            ...fieldDraft.handlers(`r ${id}`, popup.fillet, next => { applyFilletRadius(id, next); }),
            size: 'small',
            class: 'w-14 font-mono text-xs',
            disabled: popup.openEnd,
            title: `r${resolvedHint(sketch, popup.fillet)}`,
            'aria-label': `${t('cassette.v2.profileEditor.filletRadius')} ${id}`
          }),
          popup.openEnd
            ? h('span', { class: 'text-xs text-primary' }, t(popup.isStart
              ? 'cassette.v2.profileEditor.start'
              : 'cassette.v2.profileEditor.end'))
            : null
        ]);
      };

      // Icon-only toolbar buttons: the active tool or an armed toggle reads
      // primary; tooltips and aria-labels carry the localized names.
      const renderToolGroupButtons = (fromGroup, toGroup) => TOOL_GROUPS.slice(fromGroup, toGroup).flatMap((group, groupIndex) => [
        ...(groupIndex > 0 ? [h('span', { class: 'mx-0.5 h-4 w-px shrink-0 bg-content-border' })] : []),
        ...group.map(tool => {
          const labelKey = typeof tool.labelKey === 'function' ? tool.labelKey() : tool.labelKey;
          const icon = typeof tool.icon === 'function' ? tool.icon() : tool.icon;
          return h(Button, {
            key: labelKey,
            severity: (tool.command && activeTool.value === tool.command) || tool.isOn?.() ? 'primary' : 'secondary',
            text: true,
            rounded: true,
            disabled: tool.isDisabled?.() || false,
            'aria-label': t(labelKey),
            title: t(labelKey),
            onClick: () => runCommand(tool)
          }, () => [toolIcon(h, icon)]);
        })
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
          manager.curView?.zoomToFitDrawing?.();
          emitSketch();
          const emitted = JSON.parse(lastEmitted || '{"points":[]}');
          if ((emitted.points || []).length < 3) {
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
      });

      watch(() => props.modelValue, () => {
        if (manager) reseedFromModel();
      }, { deep: true });

      onBeforeUnmount(() => {
        disposed = true;
        if (extractTimer) clearTimeout(extractTimer);
        extractTimer = null;
        zoomObserver?.disconnect?.();
        zoomObserver = null;
        unbindCommandEvents?.();
        unbindCommandEvents = null;
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
        // Authoring strip above the canvas: parameters, chord chips,
        // holes (owner decision 2026-10-17 — the canvas keeps every
        // remaining pixel of height).
        renderSketchRows(),
        importError.value
          ? h(Message, { severity: 'error', size: 'small', closable: false }, () => importError.value)
          : null,
        unchainedCount.value
          ? h(Message, { severity: 'error', size: 'small', closable: false },
              () => t('cassette.v2.profileEditor.unchained', { count: unchainedCount.value }))
          : null,
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
          onPointerdownCapture: [handleBasisPickPointerDown, handleVertexSelectPointerDown],
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
