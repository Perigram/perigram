// The profile sketch editor as a plugin surface component: a CAD canvas
// (the vendored MLightCAD runtime, loaded lazily from the executor's
// static tree) over the OCCS profile sketch model. Drawing, snapping,
// grips, and undo/redo run in the engine; entity records and the sketch
// model normalize through occs/profiles.js.
import {
  evaluateOccsProfileSketch,
  normalizeOccsProfileSketch,
  occProfileEntitiesFromSketch,
  occProfileSketchFromEntities,
  occsProfileFromSketch,
  setOccsProfileSketchClosed
} from '../../../occs/profiles.js';
import { resolveOccsExpression } from '../../../occs/expressions.js';

const EXTRACT_DEBOUNCE_MS = 40;

// Header-only blank DXF: the open pipeline fills the layer, layout,
// and model-space defaults itself, so no template file (vendored or
// CDN) is needed to boot a drawable document.
const BLANK_DXF = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1027\n0\nENDSEC\n0\nEOF\n';

export default function createSketchEditor({ vue, components, locale }) {
  const { h, ref, shallowRef, watch, onMounted, onBeforeUnmount, nextTick, defineComponent } = vue;
  const t = locale.t;
  const { Button, InputText, Message } = components;

  // The engine singleton is destroyed and re-created per mount; a pending
  // destroy must finish first or its teardown would clobber the new instance.
  let engineChain = Promise.resolve();

  return defineComponent({
    name: 'ProfileSketchEditor',
    props: {
      modelValue: { type: Object, default: null }
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
      // settings-manager mask uses the standard OSMODE encoding.
      const OSNAP_TANGENT_MASK = 1 << 8;

      const toggleOrtho = () => {
        const database = manager?.curDocument?.database;
        if (!database) return;
        orthoMode.value = !orthoMode.value;
        database.orthomode = orthoMode.value ? 1 : 0;
      };

      const toggleTangentSnap = () => {
        const settings = runtime.value?.AcApSettingManager?.instance;
        if (!settings) return;
        const mask = Number(settings.osnapModes) || 0;
        tangentSnap.value = !tangentSnap.value;
        settings.osnapModes = tangentSnap.value
          ? mask | OSNAP_TANGENT_MASK
          : mask & ~OSNAP_TANGENT_MASK;
      };

      // Text labels until proper tool icons exist: the engine bundle ships
      // no extractable command-icon set (its SVGs are baked-in cursor and
      // marker closures), and ambiguous primeicons (minus=Line,
      // share-alt=Polyline, square=both Rectangle and Ortho) were worse
      // than words.
      const TOOL_GROUPS = [
        [
          { command: 'select', labelKey: 'cassette.v2.profileEditor.tools.select' },
          { command: 'line', labelKey: 'cassette.v2.profileEditor.tools.line' },
          { command: 'pline', labelKey: 'cassette.v2.profileEditor.tools.polyline' },
          { command: 'circle', labelKey: 'cassette.v2.profileEditor.tools.circle' },
          { command: 'arc', labelKey: 'cassette.v2.profileEditor.tools.arc' },
          { command: 'rectang', labelKey: 'cassette.v2.profileEditor.tools.rectangle' }
        ],
        [
          { command: 'erase', labelKey: 'cassette.v2.profileEditor.actions.erase' },
          { command: 'undo', labelKey: 'cassette.v2.profileEditor.actions.undo' },
          { command: 'redo', labelKey: 'cassette.v2.profileEditor.actions.redo' }
        ],
        [
          { labelKey: 'cassette.v2.profileEditor.actions.ortho', isOn: () => orthoMode.value, onActivate: toggleOrtho },
          { labelKey: 'cassette.v2.profileEditor.actions.tangentSnap', isOn: () => tangentSnap.value, onActivate: toggleTangentSnap },
          {
            labelKey: () => (normalizeOccsProfileSketch(props.modelValue || {}).closed
              ? 'cassette.v2.profileEditor.closedShape'
              : 'cassette.v2.profileEditor.openShape'),
            isOn: () => normalizeOccsProfileSketch(props.modelValue || {}).closed,
            onActivate: () => { toggleClosed(); }
          }
        ],
        [
          { labelKey: 'cassette.v2.profileEditor.actions.zoomFit', onActivate: () => manager?.curView?.zoomToFitDrawing?.() },
          { labelKey: 'cassette.v2.profileEditor.importDxf', onActivate: () => fileInputRef.value?.click() },
          { labelKey: 'cassette.v2.profileEditor.actions.clear', onActivate: () => clearDrawing() }
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

      const emitSketch = () => {
        if (!manager || disposed) return;
        const context = parametersOf(props.modelValue);
        const sketch = occProfileSketchFromEntities(entityRecords(), context);
        const fingerprint = JSON.stringify(sketch);
        if (fingerprint === lastEmitted) return;
        lastEmitted = fingerprint;
        emit('update:modelValue', sketch);
        emit('profile', occsProfileFromSketch(sketch, context));
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

      const clearDrawingEntities = () => {
        for (const entity of modelSpaceEntities()) {
          manager.curView?.removeEntity?.(entity);
          const modelSpace = manager?.curDocument?.database?.tables?.blockTable?.modelSpace;
          modelSpace?.removeEntity?.(entity.objectId);
        }
      };

      const clearDrawing = async () => {
        if (!manager) return;
        clearDrawingEntities();
        importedFileName.value = '';
        scheduleExtraction();
      };

      const reseedFromModel = () => {
        if (!manager || disposed) return;
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        if (JSON.stringify(normalized) === lastEmitted) return;
        const entities = normalized.points.length
          ? occProfileEntitiesFromSketch(normalized)
          : [];
        clearDrawingEntities();
        importedFileName.value = '';
        if (entities.length) {
          seedEntities({ entities });
          manager.curView?.zoomToFitDrawing?.();
        }
      };

      const runCommand = (tool) => {
        if (tool.command) {
          activeTool.value = tool.command;
          manager?.sendStringToExecute?.(tool.command);
        }
        tool.onActivate?.();
      };

      const filletRadiusOf = (sketch, vertexId) => (
        (sketch.modifiers || []).find(modifier => modifier.type === 'fillet' && modifier.vertexId === vertexId)?.radius ?? null
      );

      // Edits author the sketch model directly (expressions stay strings);
      // the canvas reseeds from evaluated geometry — unresolvable
      // expressions seed nothing and the chips keep the raw values for
      // editing. The extraction pass still re-derives points, holes, and
      // modifiers from drawn geometry, so a later draw/import overwrites
      // authored expressions and radii.
      const commitSketch = (next) => {
        if (!manager || disposed) return;
        const normalized = normalizeOccsProfileSketch(next);
        const fingerprint = JSON.stringify(normalized);
        if (fingerprint === lastEmitted) return;
        lastEmitted = fingerprint;
        emit('update:modelValue', normalized);
        let profile = null;
        try {
          profile = occsProfileFromSketch(normalized, { parameters: normalized.parameters });
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
          seedEntities({ entities: occProfileEntitiesFromSketch(normalized) });
        } catch {
          // Unresolvable expressions: no drawable geometry this pass.
        }
        bindDatabase({ schedule: false });
      };

      const applyFilletRadius = (vertexId, value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const numeric = Number(value);
        // Numbers clamp to non-negative; expression strings pass through
        // untouched like every other authoring field.
        const radius = value === '' || value === null || value === undefined
          ? 0
          : Number.isFinite(numeric) ? Math.max(0, numeric) : String(value).trim();
        const modifiers = normalized.modifiers.filter(modifier => !(
          modifier.type === 'fillet' && modifier.vertexId === vertexId
        ));
        if (radius !== 0) modifiers.push({ type: 'fillet', vertexId, radius });
        commitSketch({ ...normalized, modifiers });
      };

      const applyVertexField = (vertexId, field, value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        commitSketch({
          ...normalized,
          points: normalized.points.map(point => (
            point.id === vertexId ? { ...point, [field]: value } : point
          ))
        });
      };

      const applyHoleField = (holeId, index, value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        commitSketch({
          ...normalized,
          holes: normalized.holes.map(hole => (
            hole.id === holeId
              ? { ...hole, center: hole.center.map((entry, at) => (at === index ? value : entry)) }
              : hole
          ))
        });
      };

      const applyHoleDiameter = (holeId, value) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        commitSketch({
          ...normalized,
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

      const toggleClosed = () => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        commitSketch(setOccsProfileSketchClosed(normalized, !normalized.closed));
      };

      const setProfileAnchor = (vertexId) => {
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        if (!normalized.closed) return;
        const anchors = normalized.anchors?.vertexId === vertexId ? null : { vertexId };
        commitSketch({ ...normalized, anchors });
      };

      const resolvedHint = (sketch, value) => {
        if (typeof value !== 'string') return '';
        try {
          return ` = ${resolveOccsExpression(value, sketch.parameters)}`;
        } catch {
          return ' = ?';
        }
      };

      const expressionField = (value, hint, onInput, ariaLabel) => h(InputText, {
        modelValue: value === null || value === undefined ? '' : String(value),
        'onUpdate:modelValue': onInput,
        size: 'small',
        class: 'w-16 font-mono text-xs',
        title: hint,
        'aria-label': ariaLabel
      });

      // Dimension annotations for the authored shape: the corner outline
      // with a linear dimension per edge (offset line, ticks, measured
      // length) — drawn in a compact fit-view band, chord runs excluded.
      const renderDimensionBand = (sketch) => {
        let evaluated = null;
        try {
          evaluated = evaluateOccsProfileSketch(sketch);
        } catch {
          return null;
        }
        const corners = evaluated.points.filter(point => !point.chord);
        if (corners.length < 2) return null;
        const closed = evaluated.closed && corners.length >= 3;

        const width = 640;
        const height = 104;
        const margin = 30;
        const xs = corners.map(point => point.x);
        const ys = corners.map(point => point.y);
        const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
        const spanX = Math.max(bounds.maxX - bounds.minX, 1);
        const spanY = Math.max(bounds.maxY - bounds.minY, 1);
        const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY);
        const offsetX = (width - spanX * scale) / 2 - bounds.minX * scale;
        const offsetY = (height - spanY * scale) / 2 - bounds.minY * scale;
        const px = (point) => [point.x * scale + offsetX, height - (point.y * scale + offsetY)];

        const edges = [];
        const edgeCount = closed ? corners.length : corners.length - 1;
        for (let index = 0; index < edgeCount; index += 1) {
          const a = corners[index];
          const b = corners[(index + 1) % corners.length];
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          if (length < 1e-6) continue;
          edges.push({ a, b, length });
        }
        const centroid = corners.reduce((sum, point) => [sum[0] + point.x, sum[1] + point.y], [0, 0])
          .map(value => value / corners.length);

        const outline = corners.map(point => px(point).map(value => value.toFixed(1)).join(',')).join(' ');
        return h('svg', {
          viewBox: `0 0 ${width} ${height}`,
          class: 'w-full max-h-26 text-muted-color',
          role: 'img',
          'aria-label': t('cassette.v2.profileEditor.dimensions')
        }, [
          h(closed ? 'polygon' : 'polyline', {
            points: outline,
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 1,
            'stroke-opacity': 0.5
          }),
          ...edges.map((edge, index) => {
            // Dimension line offset outward from the shape's centroid.
            const dx = edge.b.x - edge.a.x;
            const dy = edge.b.y - edge.a.y;
            const normal = [dy, -dx];
            const normalLength = Math.hypot(normal[0], normal[1]);
            const outward = [
              (centroid[0] - (edge.a.x + edge.b.x) / 2) * normal[0],
              (centroid[1] - (edge.a.y + edge.b.y) / 2) * normal[1]
            ].reduce((sum, value) => sum + value, 0) < 0 ? normal : [-normal[0], -normal[1]];
            const unit = [outward[0] / normalLength, outward[1] / normalLength];
            const offset = 12 / scale;
            const a1 = px({ x: edge.a.x + unit[0] * offset, y: edge.a.y + unit[1] * offset });
            const b1 = px({ x: edge.b.x + unit[0] * offset, y: edge.b.y + unit[1] * offset });
            const tickA = px({ x: edge.a.x + unit[0] * (offset - 2 / scale), y: edge.a.y + unit[1] * (offset - 2 / scale) });
            const tickA2 = px({ x: edge.a.x + unit[0] * (offset + 2 / scale), y: edge.a.y + unit[1] * (offset + 2 / scale) });
            const tickB = px({ x: edge.b.x + unit[0] * (offset - 2 / scale), y: edge.b.y + unit[1] * (offset - 2 / scale) });
            const tickB2 = px({ x: edge.b.x + unit[0] * (offset + 2 / scale), y: edge.b.y + unit[1] * (offset + 2 / scale) });
            const label = px({
              x: (edge.a.x + edge.b.x) / 2 + unit[0] * (offset + 6 / scale),
              y: (edge.a.y + edge.b.y) / 2 + unit[1] * (offset + 6 / scale)
            });
            return h('g', { key: index }, [
              h('line', { x1: a1[0], y1: a1[1], x2: b1[0], y2: b1[1], stroke: 'currentColor', 'stroke-width': 1 }),
              h('line', { x1: tickA[0], y1: tickA[1], x2: tickA2[0], y2: tickA2[1], stroke: 'currentColor', 'stroke-width': 1 }),
              h('line', { x1: tickB[0], y1: tickB[1], x2: tickB2[0], y2: tickB2[1], stroke: 'currentColor', 'stroke-width': 1 }),
              h('text', {
                x: label[0], y: label[1],
                'font-size': 10,
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                fill: 'currentColor'
              }, edge.length.toFixed(1))
            ]);
          })
        ]);
      };

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
            h('span', { class: 'font-mono text-xs text-muted-color' }, key),
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
        if (sketch.points.length >= 2) {
          const last = sketch.points.length - 1;
          const anchored = sketch.anchors?.vertexId || null;
          const vertexChips = sketch.points.map((point, index) => {
            // Chord runs (an extracted arc's flattened interior) collapse
            // into one read-only chip — real geometry, not authored
            // corners.
            if (point.chord) {
              if (index > 0 && sketch.points[index - 1].chord) return null;
              let run = 1;
              while (index + run < sketch.points.length && sketch.points[index + run].chord) run += 1;
              return h('div', {
                key: point.id,
                class: 'flex items-center gap-1 rounded-ui border border-dashed border-content-border px-1.5 py-0.5 text-xs text-muted-color',
                title: sketch.points.slice(index, index + run).map(p => `${p.x}, ${p.y}`).join('\n')
              }, `⌒ ${run}`);
            }
            const openEnd = !sketch.closed && (index === 0 || index === last);
            return h('div', {
              key: point.id,
              class: 'flex items-center gap-1 rounded-ui border border-content-border px-1.5 py-0.5',
              title: `${point.x}, ${point.y}`
            }, [
              sketch.closed
                ? h(Button, {
                    label: '⌖',
                    severity: anchored === point.id ? 'primary' : 'secondary',
                    text: true,
                    size: 'small',
                    'aria-label': `${t('cassette.v2.profileEditor.anchor')} ${point.id}`,
                    title: `${t('cassette.v2.profileEditor.anchor')} ${point.id}`,
                    onClick: () => { setProfileAnchor(point.id); }
                  })
                : null,
              h('span', { class: 'font-mono text-xs text-muted-color' }, point.id),
              expressionField(point.x, `x${resolvedHint(sketch, point.x)}`, next => { applyVertexField(point.id, 'x', next); }, `x ${point.id}`),
              expressionField(point.y, `y${resolvedHint(sketch, point.y)}`, next => { applyVertexField(point.id, 'y', next); }, `y ${point.id}`),
              h(InputText, {
                modelValue: filletRadiusOf(sketch, point.id) === null ? '' : String(filletRadiusOf(sketch, point.id)),
                'onUpdate:modelValue': next => {
                  const numeric = Number(next);
                  applyFilletRadius(point.id, next === '' ? 0 : (Number.isFinite(numeric) ? numeric : next));
                },
                size: 'small',
                class: 'w-14 font-mono text-xs',
                disabled: openEnd,
                title: `r${resolvedHint(sketch, filletRadiusOf(sketch, point.id))}`,
                'aria-label': `${t('cassette.v2.profileEditor.filletRadius')} ${point.id}`
              }),
              openEnd
                ? h('span', { class: 'text-xs text-primary' }, t(index === 0 ? 'cassette.v2.profileEditor.start' : 'cassette.v2.profileEditor.end'))
                : null
            ]);
          }).filter(Boolean);
          // An open shape's references are the sketch origin (zero — the
          // placement basis) and the chain's end point; both displayed.
          if (!sketch.closed) {
            vertexChips.unshift(h('div', {
              key: 'origin',
              class: 'flex items-center gap-1 rounded-ui border border-dashed border-primary px-1.5 py-0.5 text-xs text-primary',
              title: t('cassette.v2.profileEditor.anchor')
            }, '⌖ 0,0'));
          }
          rows.push(h('div', { class: 'flex flex-wrap items-center gap-1' }, vertexChips));
        }
        if (sketch.points.length >= 2) {
          rows.push(renderDimensionBand(sketch));
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
        return h('div', { class: 'flex flex-col gap-1' }, rows);
      };


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

      const handleKeydown = (event) => {
        if (!manager) return;
        const key = event.key?.toLowerCase();
        const isUndo = (event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey;
        const isRedo = (event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey));
        if (isUndo || isRedo) {
          event.preventDefault();
          event.stopPropagation();
          manager.sendStringToExecute?.(isUndo ? 'undo' : 'redo');
          return;
        }
        if (key === 'delete' || key === 'backspace') {
          event.preventDefault();
          event.stopPropagation();
          manager.sendStringToExecute?.('erase');
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
          // undo/erase ride the host toolbar. The dark UI theme matches
          // the engine's model-space canvas.
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
          manager.events.documentActivated.addEventListener(bindDatabase);
          manager.events.documentCreated.addEventListener(bindDatabase);
          containerRef.value?.addEventListener('keydown', handleKeydown, true);
          bindDatabase();
          orthoMode.value = Number(manager.curDocument?.database?.orthomode) === 1;
          const osnapMask = Number(loaded.AcApSettingManager.instance.osnapModes) || 0;
          tangentSnap.value = (osnapMask & OSNAP_TANGENT_MASK) !== 0;
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
        containerRef.value?.removeEventListener?.('keydown', handleKeydown, true);
        unbindDatabase();
        const dying = manager;
        manager = null;
        engineChain = engineChain.then(async () => {
          await dying?.destroy?.();
        });
      });

      return () => h('div', {
        class: 'flex min-h-0 flex-1 flex-col gap-2',
        'data-keyboard-scope': 'cad'
      }, [
        h('div', { class: 'flex flex-wrap items-center gap-1' }, [
          ...TOOL_GROUPS.flatMap((group, groupIndex) => [
            ...(groupIndex > 0 ? [h('span', { class: 'mx-1 h-4 w-px shrink-0 bg-content-border' })] : []),
            ...group.map(tool => {
              const labelKey = typeof tool.labelKey === 'function' ? tool.labelKey() : tool.labelKey;
              return h(Button, {
                key: labelKey,
                label: t(labelKey),
                severity: (tool.command && activeTool.value === tool.command) || tool.isOn?.() ? 'primary' : 'secondary',
                size: 'small',
                'aria-label': t(labelKey),
                onClick: () => runCommand(tool)
              });
            })
          ]),
          h('input', {
            ref: fileInputRef,
            type: 'file',
            accept: '.dxf',
            class: 'hidden',
            onChange: handleDxfUpload
          })
        ]),
        h('div', {
          ref: containerRef,
          class: 'relative min-h-[18rem] w-full flex-1 overflow-hidden rounded-ui border border-content-border bg-subtle',
          role: 'application',
          'aria-label': t('cassette.v2.profileEditor.preview'),
          onPointerup: scheduleExtraction,
          onKeyup: scheduleExtraction
        }, [
          engineError.value
            ? h('div', { class: 'flex h-full items-center justify-center p-4' }, [
                h(Message, { severity: 'error', closable: false }, () => t('cassette.v2.profileEditor.loadFailed'))
              ])
            : null
        ]),
        importError.value
          ? h(Message, { severity: 'error', size: 'small', closable: false }, () => importError.value)
          : null,
        renderSketchRows()
      ]);
    }
  });
}
