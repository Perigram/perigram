// The facade plugin's cassette preview surface (surface contract 1,
// kind preview — M7): a read-only SVG mount over `{ record, payload }`.
// The host resolves the record and its payload document; this module
// renders the cassette with the plugin's own tree renderer — the same
// lightweight in-place SVG path the designer's template-picker
// thumbnails use: baked geometry rows when the record carries them,
// else the parametric OCCS document. The preview layer law
// (`CASSETTE_PREVIEW_LAYERS` — outline and folds) lives in
// drawingPreview.js; org-authored standards override host-side.
import { renderCassetteV2TreeToDrawing } from './lib/cassetteV2Renderer.js';
import { cassettePreviewLayerSelection, normalizeGeometryDrawing } from './lib/drawingPreview.js';

const isOccsCassetteDocument = (document = null) => Boolean(
  document && typeof document === 'object'
  && document.occs && document.documentType
);

const OCCS_PAYLOAD_MIME = 'application/perigram+occs';

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

      // Pending spans the host's payload fetch; the mime bound keeps
      // DXF-payload records from spinning.
      const awaitingPayload = computed(() => Boolean(
        props.record?.payload?.fileId
        && String(props.record?.payload?.mime || '') === OCCS_PAYLOAD_MIME
        && !isOccsCassetteDocument(props.payload)
      ));

      async function resolveDrawing() {
        drawing.value = null;
        visibleLayerNames.value = null;
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
        if (drawing.value) return;
        const fields = props.record?.fields || {};
        drawing.value = normalizeGeometryDrawing({ data: { ...fields } });
      }

      function handleDrawingReady(rendered) {
        visibleLayerNames.value = cassettePreviewLayerSelection(rendered);
      }

      const renderKey = computed(() => [
        props.record?._id,
        props.record?.updatedAt,
        props.payload?.documentType
      ].join('|'));

      watch(renderKey, resolveDrawing, { immediate: true });

      return () => h('div', {
        class: 'relative h-full w-full overflow-hidden rounded-ui',
        'data-instance-card-interactive': 'true',
        'data-cassette-preview-root': 'true',
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
              h('i', {
                class: (loading.value || awaitingPayload.value)
                  ? 'pi pi-spin pi-spinner'
                  : 'pi pi-box'
              })
            ])
      ]);
    }
  };
}
