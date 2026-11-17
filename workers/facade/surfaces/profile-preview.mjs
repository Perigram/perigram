// The facade plugin's profile preview surface (surface contract 1,
// kind preview — M7): a library profile's evaluated sketch section
// through the shared drawing-preview normalizer — the same projection
// the cassette designer's library picker draws. Quiet blank for
// records whose sketch does not resolve.
import { resolveOccsProfileSketchLayerData } from '../occs/profiles.js';
import { normalizeGeometryDrawing } from './lib/drawingPreview.js';

export default function createSurface({ vue, components }) {
  const { h, ref, computed, watch } = vue;
  const DrawingCanvas = components.DrawingCanvas;

  return {
    name: 'ProfilePreview',
    props: {
      record: { type: Object, default: null },
      payload: { type: Object, default: null }
    },
    setup(props) {
      const drawing = ref(null);
      let requestId = 0;

      async function resolveDrawing() {
        const currentRequest = ++requestId;
        drawing.value = null;
        try {
          const layerData = await resolveOccsProfileSketchLayerData(props.record?.fields?.sketch);
          if (currentRequest !== requestId) return;
          drawing.value = layerData ? normalizeGeometryDrawing({ data: { layerData } }) : null;
        } catch {
          if (currentRequest === requestId) drawing.value = null;
        }
      }

      const renderKey = computed(() => [
        props.record?._id,
        props.record?.updatedAt
      ].join('|'));

      watch(renderKey, resolveDrawing, { immediate: true });

      return () => h('div', {
        class: 'relative h-full w-full overflow-hidden rounded-ui',
        'data-instance-card-interactive': 'true',
        onClick: event => event.stopPropagation()
      }, [
        drawing.value
          ? h(DrawingCanvas, {
              source: drawing.value,
              sourceType: 'geometry-preview',
              mode: 'card',
              fill: true
            })
          : h('div', {
              class: 'flex h-full w-full items-center justify-center rounded-ui bg-subtle text-muted'
            }, [
              h('i', { class: 'pi pi-box' })
            ])
      ]);
    }
  };
}
