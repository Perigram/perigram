// The profile sketch editor as a plugin surface component: a CAD canvas
// (the vendored MLightCAD runtime, loaded lazily from the executor's
// static tree) over the OCCS profile sketch model. Drawing, snapping,
// grips, and undo/redo run in the engine; entity records and the sketch
// model normalize through occs/profiles.js.
import {
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

      const TOOL_GROUPS = [
        [
          { command: 'select', icon: 'pi pi-arrow-up-left', labelKey: 'cassette.v2.profileEditor.tools.select' },
          { command: 'line', icon: 'pi pi-minus', labelKey: 'cassette.v2.profileEditor.tools.line' },
          { command: 'pline', icon: 'pi pi-share-alt', labelKey: 'cassette.v2.profileEditor.tools.polyline' },
          { command: 'circle', icon: 'pi pi-circle', labelKey: 'cassette.v2.profileEditor.tools.circle' },
          { command: 'arc', icon: 'pi pi-wave-pulse', labelKey: 'cassette.v2.profileEditor.tools.arc' },
          { command: 'rectang', icon: 'pi pi-square', labelKey: 'cassette.v2.profileEditor.tools.rectangle' }
        ],
        [
          { command: 'erase', icon: 'pi pi-trash', labelKey: 'cassette.v2.profileEditor.actions.erase' },
          { command: 'undo', icon: 'pi pi-undo', labelKey: 'cassette.v2.profileEditor.actions.undo' },
          { command: 'redo', icon: 'pi pi-replay', labelKey: 'cassette.v2.profileEditor.actions.redo' }
        ],
        [
          { icon: 'pi pi-square', labelKey: 'cassette.v2.profileEditor.actions.ortho', isOn: () => orthoMode.value, onActivate: toggleOrtho },
          { icon: 'pi pi-compass', labelKey: 'cassette.v2.profileEditor.actions.tangentSnap', isOn: () => tangentSnap.value, onActivate: toggleTangentSnap },
          {
            icon: 'pi pi-stop-circle',
            labelKey: () => (normalizeOccsProfileSketch(props.modelValue || {}).closed
              ? 'cassette.v2.profileEditor.closedShape'
              : 'cassette.v2.profileEditor.openShape'),
            isOn: () => normalizeOccsProfileSketch(props.modelValue || {}).closed,
            onActivate: () => { toggleClosed(); }
          }
        ],
        [
          { icon: 'pi pi-expand', labelKey: 'cassette.v2.profileEditor.actions.zoomFit', onActivate: () => manager?.curView?.zoomToFitDrawing?.() },
          { icon: 'pi pi-upload', labelKey: 'cassette.v2.profileEditor.importDxf', onActivate: () => fileInputRef.value?.click() },
          { icon: 'pi pi-times-circle', labelKey: 'cassette.v2.profileEditor.actions.clear', onActivate: () => clearDrawing() }
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
        const radius = Math.max(0, Number(value) || 0);
        const modifiers = normalized.modifiers.filter(modifier => !(
          modifier.type === 'fillet' && modifier.vertexId === vertexId
        ));
        if (radius > 0) modifiers.push({ type: 'fillet', vertexId, radius });
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
          rows.push(h('div', { class: 'flex flex-wrap items-center gap-1' },
            sketch.points.map((point, index) => {
              const openEnd = !sketch.closed && (index === 0 || index === last);
              return h('div', {
                key: point.id,
                class: 'flex items-center gap-1 rounded-ui border border-content-border px-1.5 py-0.5',
                title: `${point.x}, ${point.y}${openEnd ? ` — ${t(openEnd && index === 0 ? 'cassette.v2.profileEditor.start' : 'cassette.v2.profileEditor.end')}` : ''}`
              }, [
                openEnd
                  ? h('span', { class: 'h-1.5 w-1.5 rounded-full bg-primary', 'aria-hidden': 'true' })
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
                })
              ]);
            })
          ));
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
            ...group.map(tool => h(Button, {
              key: typeof tool.labelKey === 'function' ? tool.icon : tool.labelKey,
              icon: tool.icon,
              severity: (tool.command && activeTool.value === tool.command) || tool.isOn?.() ? 'primary' : 'secondary',
              size: 'small',
              rounded: true,
              'aria-label': t(typeof tool.labelKey === 'function' ? tool.labelKey() : tool.labelKey),
              title: t(typeof tool.labelKey === 'function' ? tool.labelKey() : tool.labelKey),
              onClick: () => runCommand(tool)
            }))
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
