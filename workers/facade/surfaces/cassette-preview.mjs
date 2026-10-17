// The facade plugin's cassette preview surface (surface contract 1,
// kind preview — M7): a read-only mount over `{ record, payload }`. The
// host resolves the record and its payload document; this module renders
// the cassette: baked geometry rows when the record carries them, else
// the parametric OCCS document through the plugin's own renderer. The
// layer standards and pens are the plugin's
// ([occs/layerStandards](../occs/layerStandards.js)) — every drawing the
// renderer emits is already styled; org-authored standards still
// override host-side. Blank records render the quiet blank band.
import { renderCassetteV2TreeToDrawing } from './lib/cassetteV2Renderer.js';
import { normalizeGeometryDrawing } from './lib/drawingPreview.js';

// Preview layer set (owner direction 2026-10-17): cassette previews show
// the shape — outline (cut.outer) and folds — never production detail or
// dimensions.
const PREVIEW_LAYER_PRIORITY = [
  'cut.outer',
  'fold.route'
];

const isOccsCassetteDocument = (document = null) => Boolean(
  document && typeof document === 'object'
  && document.occs && document.documentType
);

export default function createSurface({ vue, components }) {
  const { h, ref, computed, watch } = vue;
  const DrawingCanvas = components.DrawingCanvas;

  return {
    name: 'CassettePreview',
    props: {
      record: { type: Object, default: null },
      payload: { type: Object, default: null }
    },
    setup(props) {
      const drawing = ref(null);
      const loading = ref(false);
      const visibleLayerNames = ref(null);

      async function resolveDrawing() {
        drawing.value = null;
        visibleLayerNames.value = null;
        const fields = props.record?.fields || {};
        const baked = normalizeGeometryDrawing({ data: { ...fields } });
        if (baked) {
          drawing.value = baked;
          return;
        }
        if (isOccsCassetteDocument(props.payload)) {
          loading.value = true;
          try {
            const graphTree = props.payload?.extensions?.perigram?.graphTree
              || props.payload?.graphTree
              || null;
            drawing.value = graphTree
              ? await renderCassetteV2TreeToDrawing(graphTree)
              : null;
          } catch {
            drawing.value = null;
          } finally {
            loading.value = false;
          }
        }
      }

      function handleDrawingReady(rendered) {
        const layerNames = Array.isArray(rendered?.layers)
          ? rendered.layers.map(layer => layer.name).filter(Boolean)
          : [];
        const allowed = PREVIEW_LAYER_PRIORITY.filter(name => layerNames.includes(name));
        visibleLayerNames.value = allowed.length ? allowed : null;
      }

      const renderKey = computed(() => [
        props.record?._id,
        props.record?.updatedAt,
        props.payload?.documentType
      ].join('|'));

      watch(renderKey, resolveDrawing, { immediate: true });

      return () => h('div', {
        class: 'relative h-32 w-full overflow-hidden rounded-ui',
        'data-instance-card-interactive': 'true',
        onClick: event => event.stopPropagation()
      }, [
        drawing.value
          ? h(DrawingCanvas, {
              source: drawing.value,
              sourceType: 'geometry-preview',
              mode: 'card',
              fill: true,
              visibleLayerNames: visibleLayerNames.value,
              onReady: handleDrawingReady
            })
          : h('div', {
              class: 'flex h-full w-full items-center justify-center rounded-ui bg-subtle text-muted'
            }, [
              h('i', { class: loading.value ? 'pi pi-spin pi-spinner' : 'pi pi-box' })
            ])
      ]);
    }
  };
}
