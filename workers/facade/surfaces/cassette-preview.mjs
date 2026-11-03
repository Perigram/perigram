// The facade plugin's cassette preview surface (surface contract 1,
// kind preview — M7): a read-only native CadCraft mount over
// `{ record, payload }`. The host resolves the record and its payload
// document; this module renders the cassette through the plugin's own
// renderer: baked geometry rows when the record carries them, else the
// parametric OCCS document. The native canvas owns the layers and the
// dimensions; the layer button toggles them.
import { CadCraftHost } from 'cadcraft';
import { cassetteV2AssemblyEntitiesFromDrawing, renderCassetteV2TreeToDrawing } from './lib/cassetteV2Renderer.js';
import { normalizeGeometryDrawing } from './lib/drawingPreview.js';

const isOccsCassetteDocument = (document = null) => Boolean(
  document && typeof document === 'object'
  && document.occs && document.documentType
);

export default function createSurface({ vue, components, locale }) {
  const { h, ref, computed, watch, onMounted, onBeforeUnmount, nextTick } = vue;
  const { Button, Checkbox } = components;
  const t = locale.t;

  return {
    name: 'CassettePreview',
    props: {
      record: { type: Object, default: null },
      payload: { type: Object, default: null }
    },
    setup(props) {
      const drawing = ref(null);
      const loading = ref(false);
      const hostContainer = ref(null);
      const ready = ref(false);
      const error = ref('');
      const layersOpen = ref(false);
      const layerRows = ref([]);
      const visibleLayerNames = ref([]);
      let host = null;

      const syncHost = async () => {
        if (!host || !drawing.value) return;
        const context = cassetteV2AssemblyEntitiesFromDrawing(drawing.value);
        if (!context) {
          error.value = t('common.error');
          return;
        }
        error.value = '';
        host.seed(context.entities, {
          layers: context.layers,
          linetypes: context.linetypes,
          fit: true
        });
        host.lockLayers(true);
        layerRows.value = context.layers.map(layer => ({
          name: layer.name,
          color: layer.color
        }));
        visibleLayerNames.value = layerRows.value.map(row => row.name);
        host.setVisibleLayers(visibleLayerNames.value);
        ready.value = true;
        await nextTick();
        host.zoomFit?.();
      };

      async function resolveDrawing() {
        drawing.value = null;
        ready.value = false;
        error.value = '';
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

      const toggleLayer = (name, value) => {
        const names = new Set(visibleLayerNames.value);
        if (value) names.add(name);
        else names.delete(name);
        visibleLayerNames.value = [...names];
        host?.setVisibleLayers(visibleLayerNames.value);
      };

      const renderKey = computed(() => [
        props.record?._id,
        props.record?.updatedAt,
        props.payload?.documentType
      ].join('|'));

      watch(renderKey, resolveDrawing, { immediate: true });
      watch(drawing, syncHost);

      onMounted(async () => {
        if (!hostContainer.value) return;
        const instance = new CadCraftHost({
          container: hostContainer.value,
          title: props.record?.identity?.name || props.record?.name || ''
        });
        try {
          await instance.mount();
          if (!hostContainer.value) {
            instance.destroy();
            return;
          }
          host = instance;
          await syncHost();
        } catch {
          instance.destroy();
          error.value = t('common.error');
        }
      });

      onBeforeUnmount(() => {
        host?.destroy();
        host = null;
        ready.value = false;
      });

      return () => h('div', {
        class: 'relative h-full w-full overflow-hidden rounded-ui bg-subtle',
        'data-instance-card-interactive': 'true',
        'data-cassette-preview-root': 'true',
        onClick: event => event.stopPropagation()
      }, [
        h('div', {
          ref: hostContainer,
          class: 'pointer-events-none absolute inset-0',
          'data-cassette-preview': 'true',
          'data-cadcraft-ready': ready.value ? 'true' : undefined
        }),
        drawing.value
          ? h('div', { class: 'absolute right-3 top-3 z-20 flex flex-col items-end gap-1' }, [
              h(Button, {
                icon: 'pi pi-layers',
                severity: 'secondary',
                text: true,
                rounded: true,
                size: 'small',
                'aria-label': t('common.layers'),
                title: t('common.layers'),
                onClick: () => { layersOpen.value = !layersOpen.value; }
              }),
              layersOpen.value
                ? h('div', {
                    class: 'flex w-56 flex-col gap-1 rounded-ui border border-content-border bg-content p-2 shadow-overlay'
                  }, layerRows.value.map(row => h('label', {
                    key: row.name,
                    class: 'flex min-w-0 items-center gap-2'
                  }, [
                    h(Checkbox, {
                      modelValue: visibleLayerNames.value.includes(row.name),
                      binary: true,
                      size: 'small',
                      'onUpdate:modelValue': value => toggleLayer(row.name, value)
                    }),
                    h('span', {
                      class: 'block h-[3px] w-5 shrink-0 rounded-full',
                      style: { backgroundColor: row.color || 'currentColor' },
                      'aria-hidden': 'true'
                    }),
                    h('span', { class: 'truncate text-sm' }, row.name)
                  ])))
                : null
            ])
          : null,
        loading.value
          ? h('div', { class: 'absolute inset-0 flex items-center justify-center text-muted' }, [
              h('i', { class: 'pi pi-spin pi-spinner' })
            ])
          : null,
        !drawing.value && !loading.value && !error.value
          ? h('div', { class: 'absolute inset-0 flex items-center justify-center text-muted' }, [
              h('i', { class: 'pi pi-box' })
            ])
          : null,
        error.value
          ? h('div', { class: 'absolute inset-0 flex items-center justify-center text-muted' }, [
              h('span', { class: 'text-sm' }, error.value)
            ])
          : null
      ]);
    }
  };
}
