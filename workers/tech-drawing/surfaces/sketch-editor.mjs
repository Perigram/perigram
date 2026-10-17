// The tech-drawing plugin's sketch editor surface (surface contract 3 —
// the capability mount). The mounted module receives the record and the
// generic persistence callbacks (documents ride the payload channel) and,
// beside the editor-grade io, the `upload` capability: background images
// store through the host's file channel. The scene model lives in
// ./lib/sketch.js; `perfect-freehand` is a declared vendored dependency.
// The pre-plugin editor's origin-entity affordance never rendered under
// the instance persistence (no origin capability exists) and does not
// return here.
import { parseScene, strokeToSvgPath, strokesAtPoint, SKETCH_TOOLS, SKETCH_VIEWBOX } from './lib/sketch.js';

export default function createSurface({ vue, components, locale, upload }) {
  const { h, ref, computed, onMounted, onBeforeUnmount, defineComponent } = vue;
  const t = locale.t;
  const { Button, ColorPicker, InputText, Message, Popover, Select, SelectButton } = components;

  if (!upload) {
    throw new Error('sketch-editor requires the contract-3 mount context (upload capability)');
  }

  return defineComponent({
    name: 'SketchEditor',
    props: {
      record: { type: Object, default: null },
      persistence: { type: Object, default: null }
    },
    setup(props) {
      const loading = ref(true);
      const saving = ref(false);
      const dirty = ref(false);
      const scene = ref(parseScene(null));
      const tool = ref('pen');
      const color = ref('#c9144a');
      const size = ref(4);
      const liveStroke = ref(null);
      const svgRef = ref(null);
      const backgroundInputRef = ref(null);
      const renameMenuRef = ref(null);
      const renameDraft = ref('');
      const localTitle = ref('');

      const editorTitle = computed(() => localTitle.value || props.record?.name || props.persistence?.title || t('sketch.editorTitle'));
      const toolOptions = computed(() => SKETCH_TOOLS.map(value => ({ value, label: t(`sketch.tools.${value}`) })));
      const sizeOptions = computed(() => [
        { label: t('sketch.sizes.thin'), value: 2 },
        { label: t('sketch.sizes.medium'), value: 4 },
        { label: t('sketch.sizes.thick'), value: 8 }
      ]);
      const canSave = computed(() => dirty.value && !loading.value);

      // Undo history over serialized scene snapshots — the plugin-side
      // twin of the host's snapshot-history composable.
      const undoStack = ref([]);
      const redoStack = ref([]);
      const canUndo = computed(() => undoStack.value.length > 0);
      const canRedo = computed(() => redoStack.value.length > 0);
      function pushHistory() {
        undoStack.value.push(JSON.stringify({ background: scene.value.background, strokes: scene.value.strokes }));
        if (undoStack.value.length > 100) undoStack.value.shift();
        redoStack.value = [];
        dirty.value = true;
      }
      function applySnapshot(entry) {
        const restored = JSON.parse(entry);
        scene.value = { ...scene.value, background: restored.background, strokes: restored.strokes };
        dirty.value = true;
      }
      function undo() {
        if (!undoStack.value.length) return;
        redoStack.value.push(JSON.stringify({ background: scene.value.background, strokes: scene.value.strokes }));
        applySnapshot(undoStack.value.pop());
      }
      function redo() {
        if (!redoStack.value.length) return;
        undoStack.value.push(JSON.stringify({ background: scene.value.background, strokes: scene.value.strokes }));
        applySnapshot(redoStack.value.pop());
      }

      // Zoom: the viewBox narrows around the scene center.
      const viewZoom = ref(1);
      const viewBoxSize = computed(() => ({
        width: SKETCH_VIEWBOX.width * viewZoom.value,
        height: SKETCH_VIEWBOX.height * viewZoom.value
      }));
      const viewBoxStr = computed(() => {
        const { width, height } = viewBoxSize.value;
        return `${(SKETCH_VIEWBOX.width - width) / 2} ${(SKETCH_VIEWBOX.height - height) / 2} ${width} ${height}`;
      });
      const zoomIn = () => { viewZoom.value = Math.max(0.2, viewZoom.value / 1.25); };
      const zoomOut = () => { viewZoom.value = Math.min(8, viewZoom.value * 1.25); };
      const resetZoom = () => { viewZoom.value = 1; };

      function toViewBoxPoint(event) {
        const rect = svgRef.value?.getBoundingClientRect();
        if (!rect) return [0, 0];
        const scale = Math.min(rect.width / viewBoxSize.value.width, rect.height / viewBoxSize.value.height);
        const offsetX = (rect.width - viewBoxSize.value.width * scale) / 2;
        const offsetY = (rect.height - viewBoxSize.value.height * scale) / 2;
        const originX = (SKETCH_VIEWBOX.width - viewBoxSize.value.width) / 2;
        const originY = (SKETCH_VIEWBOX.height - viewBoxSize.value.height) / 2;
        return [
          (event.clientX - rect.left - offsetX) / scale + originX,
          (event.clientY - rect.top - offsetY) / scale + originY
        ];
      }

      function eraseAt(point) {
        const erased = new Set(strokesAtPoint(scene.value, point));
        if (!erased.size) return false;
        pushHistory();
        scene.value = { ...scene.value, strokes: scene.value.strokes.filter(stroke => !erased.has(stroke.id)) };
        return true;
      }

      function pointerDown(event) {
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        event.target.setPointerCapture?.(event.pointerId);
        const point = toViewBoxPoint(event);
        if (tool.value === 'eraser') {
          eraseAt(point);
          return;
        }
        liveStroke.value = {
          id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          tool: tool.value,
          points: [point],
          color: color.value,
          size: size.value
        };
      }

      function pointerMove(event) {
        if (!liveStroke.value) {
          if (tool.value !== 'eraser' || event.buttons !== 1) return;
          eraseAt(toViewBoxPoint(event));
          return;
        }
        const point = toViewBoxPoint(event);
        const points = liveStroke.value.points;
        if (liveStroke.value.tool === 'pen') {
          points.push(point);
        } else {
          points[1] = point;
        }
        liveStroke.value = { ...liveStroke.value, points: [...points] };
      }

      function pointerUp() {
        if (!liveStroke.value) return;
        const stroke = liveStroke.value;
        liveStroke.value = null;
        if (stroke.points.length < 2 && stroke.tool !== 'pen') return;
        pushHistory();
        scene.value = { ...scene.value, strokes: [...scene.value.strokes, stroke] };
      }

      async function selectBackground(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
          // The host-executed upload capability: the module never calls
          // the API itself (contract 3).
          const stored = await upload.file(file);
          pushHistory();
          scene.value = { ...scene.value, background: { fileId: stored.id, url: stored.url } };
        } catch (error) {
          console.error('Failed to upload sketch background:', error?.message || error);
        }
      }

      function removeBackground() {
        pushHistory();
        scene.value = { ...scene.value, background: null };
      }

      function clearScene() {
        if (!scene.value.strokes.length && !scene.value.background) return;
        pushHistory();
        scene.value = { ...scene.value, strokes: [], background: null };
      }

      function openRename() {
        renameDraft.value = editorTitle.value;
        renameMenuRef.value?.show?.();
      }

      async function applyRename() {
        const name = renameDraft.value.trim();
        renameMenuRef.value?.hide?.();
        if (!name || name === editorTitle.value) return;
        try {
          await props.persistence?.rename?.(props.record, name);
          localTitle.value = name;
        } catch (error) {
          console.error('Failed to rename sketch:', error?.message || error);
        }
      }

      async function save() {
        saving.value = true;
        try {
          const fileName = `${(props.record?.name || localTitle.value || 'sketch')}.json`;
          await props.persistence.saveDocument(props.record, { ...scene.value }, { fileName, mimeType: 'application/json' });
          dirty.value = false;
        } catch (error) {
          console.error('Failed to save sketch:', error?.message || error);
        } finally {
          saving.value = false;
        }
      }

      onMounted(async () => {
        try {
          const document = await props.persistence.loadDocument(props.record);
          const restored = document ? parseScene(document) : parseScene(null);
          scene.value = restored;
        } catch (error) {
          console.error('Failed to load sketch:', error?.message || error);
        } finally {
          loading.value = false;
        }
      });

      onBeforeUnmount(() => {
        if (dirty.value) console.warn('Sketch editor closed with unsaved changes');
      });

      const strokePath = stroke => h('path', {
        key: stroke.id,
        d: strokeToSvgPath(stroke),
        stroke: stroke.tool === 'pen' ? 'none' : stroke.color,
        fill: stroke.tool === 'pen' ? stroke.color : 'none',
        'stroke-width': stroke.size,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      });

      return () => h('div', { class: 'flex h-full min-h-0 flex-1 flex-col gap-3' }, [
        h('div', { class: 'flex flex-wrap items-center gap-2' }, [
          h(SelectButton, {
            modelValue: tool.value,
            options: toolOptions.value,
            optionValue: 'value',
            optionLabel: 'label',
            size: 'small',
            allowEmpty: false,
            'aria-label': t('sketch.tool'),
            'onUpdate:modelValue': value => { tool.value = value; }
          }),
          h(ColorPicker, {
            modelValue: color.value,
            'aria-label': t('sketch.color'),
            'onUpdate:modelValue': value => { color.value = value; }
          }),
          h(Select, {
            modelValue: size.value,
            options: sizeOptions.value,
            optionLabel: 'label',
            optionValue: 'value',
            size: 'small',
            class: 'w-24',
            'aria-label': t('sketch.strokeWidth'),
            'onUpdate:modelValue': value => { size.value = value; }
          }),
          h(Button, { icon: 'pi pi-pencil', severity: 'secondary', text: true, rounded: true, size: 'small', 'aria-label': t('common.rename'), onClick: openRename }),
          h(Button, { icon: 'pi pi-undo', severity: 'secondary', text: true, rounded: true, size: 'small', 'aria-label': t('sketch.undo'), disabled: !canUndo.value, onClick: undo }),
          h(Button, { icon: 'pi pi-refresh', severity: 'secondary', text: true, rounded: true, size: 'small', 'aria-label': t('sketch.redo'), disabled: !canRedo.value, onClick: redo }),
          h(Button, { icon: 'pi pi-search-minus', severity: 'secondary', text: true, rounded: true, size: 'small', 'aria-label': t('drawing.zoomOut'), onClick: zoomOut }),
          h(Button, { icon: 'pi pi-search-plus', severity: 'secondary', text: true, rounded: true, size: 'small', 'aria-label': t('drawing.zoomIn'), onClick: zoomIn }),
          h(Button, { icon: 'pi pi-times-circle', severity: 'secondary', text: true, rounded: true, size: 'small', 'aria-label': t('drawing.resetView'), onClick: resetZoom }),
          h(Button, {
            icon: 'pi pi-trash',
            severity: 'danger',
            text: true,
            rounded: true,
            size: 'small',
            'aria-label': t('sketch.clear'),
            disabled: !scene.value.strokes.length && !scene.value.background,
            onClick: clearScene
          }),
          h(Button, {
            label: t('common.save'),
            icon: 'pi pi-check',
            size: 'small',
            loading: saving.value,
            disabled: !canSave.value,
            onClick: save
          })
        ]),
        h('div', { class: 'flex flex-wrap items-center gap-2' }, [
          h('input', {
            ref: backgroundInputRef,
            class: 'hidden',
            type: 'file',
            accept: 'image/*',
            onChange: selectBackground
          }),
          h(Button, {
            label: scene.value.background ? t('sketch.replaceBackground') : t('sketch.setBackground'),
            icon: 'pi pi-image',
            size: 'small',
            severity: 'secondary',
            outlined: true,
            onClick: () => backgroundInputRef.value?.click?.()
          }),
          scene.value.background
            ? h(Button, {
              label: t('sketch.removeBackground'),
              icon: 'pi pi-times',
              size: 'small',
              severity: 'secondary',
              text: true,
              onClick: removeBackground
            })
            : null
        ]),
        h('div', { class: 'relative flex min-h-0 flex-1 items-stretch overflow-hidden cursor-crosshair' }, [
          h('svg', {
            ref: svgRef,
            class: 'h-full w-full touch-none select-none',
            viewBox: viewBoxStr.value,
            preserveAspectRatio: 'xMidYMid meet',
            onPointerdown: pointerDown,
            onPointermove: pointerMove,
            onPointerup: pointerUp,
            onPointercancel: pointerUp
          }, [
            scene.value.background
              ? h('image', {
                href: scene.value.background.url,
                x: 0,
                y: 0,
                width: SKETCH_VIEWBOX.width,
                height: SKETCH_VIEWBOX.height,
                preserveAspectRatio: 'xMidYMid slice'
              })
              : null,
            ...scene.value.strokes.map(strokePath),
            liveStroke.value ? strokePath(liveStroke.value) : null
          ]),
          loading.value
            ? h(Message, { severity: 'info', closable: false }, () => t('common.loading'))
            : null
        ]),
        h(Popover, { ref: renameMenuRef }, () => h('div', {
          class: 'flex min-w-72 flex-col gap-2',
          onMousedown: e => e.stopPropagation(),
          onClick: e => e.stopPropagation()
        }, [
          h(InputText, {
            modelValue: renameDraft.value,
            placeholder: t('common.rename'),
            class: 'w-full',
            'aria-label': t('common.rename'),
            'onUpdate:modelValue': value => { renameDraft.value = value; },
            onKeydown: event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                applyRename();
              }
            }
          }),
          h(Button, { icon: 'pi pi-check', label: t('common.save'), size: 'small', disabled: !renameDraft.value.trim(), onClick: applyRename })
        ]))
      ]);
    }
  });
}
