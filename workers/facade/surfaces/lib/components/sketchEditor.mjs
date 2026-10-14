// The profile sketch editor as a plugin surface component: a CAD canvas
// (the vendored MLightCAD runtime, loaded lazily from the executor's
// static tree) over the OCCS profile sketch model. Drawing, snapping,
// grips, and undo/redo run in the engine; entity records and the sketch
// model normalize through occs/profiles.js.
import {
  normalizeOccsProfileSketch,
  occProfileEntitiesFromSketch,
  occProfileSketchFromEntities,
  occsProfileFromSketch
} from '../../../occs/profiles.js';

const EXTRACT_DEBOUNCE_MS = 40;

// Header-only blank DXF: the open pipeline fills the layer, layout,
// and model-space defaults itself, so no template file (vendored or
// CDN) is needed to boot a drawable document.
const BLANK_DXF = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1027\n0\nENDSEC\n0\nEOF\n';

export default function createSketchEditor({ vue, components, locale }) {
  const { h, ref, shallowRef, watch, onMounted, onBeforeUnmount, nextTick, defineComponent } = vue;
  const t = locale.t;
  const { Button, InputNumber, Message } = components;

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
          { icon: 'pi pi-compass', labelKey: 'cassette.v2.profileEditor.actions.tangentSnap', isOn: () => tangentSnap.value, onActivate: toggleTangentSnap }
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

      const bindDatabase = () => {
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
        scheduleExtraction();
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

      // One chip per sketch vertex: the id names it, the numeric input is
      // that vertex's fillet radius (empty = sharp corner). Open-chain end
      // vertices have no corner to round, so their inputs disable.
      const renderFilletRow = () => {
        const sketch = normalizeOccsProfileSketch(props.modelValue || {});
        if (sketch.points.length < 2) return null;
        const last = sketch.points.length - 1;
        return h('div', { class: 'flex flex-wrap items-center gap-1' },
          sketch.points.map((point, index) => h('div', {
            key: point.id,
            class: 'flex items-center gap-1 rounded-ui border border-content-border px-1.5 py-0.5',
            title: `${point.x}, ${point.y}`
          }, [
            h('span', { class: 'font-mono text-xs text-muted-color' }, point.id),
            h(InputNumber, {
              modelValue: filletRadiusOf(sketch, point.id),
              'onUpdate:modelValue': value => { applyFilletRadius(point.id, value); },
              size: 'small',
              min: 0,
              step: 0.5,
              maxFractionDigits: 2,
              disabled: !sketch.closed && (index === 0 || index === last),
              'aria-label': `${t('cassette.v2.profileEditor.filletRadius')} ${point.id}`,
              inputClass: 'w-16'
            })
          ]))
        );
      };

      // Radius edits author fillet modifiers directly on the sketch model;
      // the canvas reseeds from the sketch so the tangent arcs follow. The
      // extraction pass still re-derives modifiers from drawn geometry, so
      // a later draw/import overwrites manual radii.
      const applyFilletRadius = (vertexId, value) => {
        if (!manager || disposed) return;
        const normalized = normalizeOccsProfileSketch(props.modelValue || {});
        const radius = Math.max(0, Number(value) || 0);
        const modifiers = normalized.modifiers.filter(modifier => !(
          modifier.type === 'fillet' && modifier.vertexId === vertexId
        ));
        if (radius > 0) modifiers.push({ type: 'fillet', vertexId, radius });
        const next = { ...normalized, modifiers };
        const fingerprint = JSON.stringify(next);
        if (fingerprint === lastEmitted) return;
        lastEmitted = fingerprint;
        emit('update:modelValue', next);
        emit('profile', occsProfileFromSketch(next, { parameters: next.parameters }));
        clearDrawingEntities();
        seedEntities({ entities: occProfileEntitiesFromSketch(next) });
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
              key: tool.labelKey,
              icon: tool.icon,
              severity: (tool.command && activeTool.value === tool.command) || tool.isOn?.() ? 'primary' : 'secondary',
              size: 'small',
              rounded: true,
              'aria-label': t(tool.labelKey),
              title: t(tool.labelKey),
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
        renderFilletRow()
      ]);
    }
  });
}
