// The tech-drawing plugin's DXF template editor (surface contract 2 —
// the editor-grade mount). Marker-first (SPEC §24): the template payload
// opens on the MLightCAD canvas (the declared cad-viewer dependency) and
// the {spot:name} anchors — the part-matching vocabulary — are authored
// and renamed right where the drawing is drawn. Every edit re-opens the
// spliced DXF so the canvas always shows the saved truth; saves ride the
// revisioned payload channel. The DXF pair operations live in
// ../dxf-markers.js.
import { spotMarkersOf, addSpotMarker, renameSpotMarker, removeSpotMarker, defaultMarkerHeight } from '../dxf-markers.js';

const OPEN_OPTIONS = { readOnly: true };

export default function createSurface({ vue, components, locale, notify }) {
  const { h, ref, computed, onMounted, onBeforeUnmount, nextTick, defineComponent } = vue;
  const t = locale.t;
  const { Button, InputNumber, InputText, Message } = components;

  return defineComponent({
    name: 'DxfEditor',
    props: {
      record: { type: Object, default: null },
      persistence: { type: Object, default: null }
    },
    setup(props) {
      const loading = ref(true);
      const saving = ref(false);
      const dirty = ref(false);
      const engineError = ref('');
      const templateText = ref('');
      const containerRef = ref(null);
      const addName = ref('');
      const addX = ref(0);
      const addY = ref(0);
      let manager = null;
      let disposed = false;

      const markers = computed(() => spotMarkersOf(templateText.value));
      const canSave = computed(() => dirty.value && !loading.value);
      const editorTitle = computed(() => props.record?.name || props.persistence?.title || t('dxfEditor.editorTitle'));

      function fail(error) {
        engineError.value = error?.message || String(error);
      }

      async function reopen(skipFit = false) {
        if (!manager || disposed || !templateText.value) return;
        await manager.openDocument(
          `${props.record?.name || 'template'}.dxf`,
          new TextEncoder().encode(templateText.value).buffer,
          OPEN_OPTIONS
        );
        if (!skipFit) manager.curView?.zoomToFitDrawing?.();
      }

      function apply(next, note) {
        templateText.value = next;
        dirty.value = true;
        reopen().catch(fail);
        if (note) notify({ severity: 'success', summary: t('common.success'), detail: note, life: 2000 });
      }

      function addMarker() {
        const name = addName.value.trim();
        if (!name) return;
        try {
          apply(
            addSpotMarker(templateText.value, {
              name,
              x: Number(addX.value) || 0,
              y: Number(addY.value) || 0,
              height: defaultMarkerHeight(templateText.value)
            }),
            `{spot:${name}}`
          );
          addName.value = '';
        } catch (error) {
          notify({ severity: 'error', summary: t('common.error'), detail: error?.message || String(error), life: 4000 });
        }
      }

      function renameMarker(marker, event) {
        const next = String(event?.target?.value ?? '').trim();
        if (!next || next === marker.name) return;
        try {
          apply(renameSpotMarker(templateText.value, marker.name, next));
        } catch (error) {
          notify({ severity: 'error', summary: t('common.error'), detail: error?.message || String(error), life: 4000 });
        }
      }

      function dropMarker(marker) {
        try {
          apply(removeSpotMarker(templateText.value, marker.name));
        } catch (error) {
          notify({ severity: 'error', summary: t('common.error'), detail: error?.message || String(error), life: 4000 });
        }
      }

      async function save() {
        saving.value = true;
        try {
          const fileName = `${props.record?.name || editorTitle.value || 'template'}.dxf`;
          await props.persistence.saveDocument(props.record, templateText.value, { fileName, mimeType: 'application/dxf' });
          dirty.value = false;
        } catch (error) {
          notify({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || String(error), life: 5000 });
        } finally {
          saving.value = false;
        }
      }

      async function mountEngine() {
        await nextTick();
        if (disposed || !containerRef.value) return;
        const loaded = await import('cad-viewer');
        if (disposed) return;
        loaded.AcApSettingManager.instance.isShowCommandLine = false;
        loaded.AcApSettingManager.instance.isShowShortCutToolbar = false;
        loaded.acedApplyUiTheme?.('dark', containerRef.value);
        manager = loaded.AcApDocManager.createInstance({
          container: containerRef.value,
          autoResize: true,
          useMainThreadDraw: true,
          builtinOpenFileDialog: false,
          notificationCenter: false,
          disableExport: true
        });
        await reopen();
      }

      onMounted(async () => {
        try {
          const text = await props.persistence.loadDocument(props.record, { mimeType: 'application/dxf', raw: true });
          templateText.value = typeof text === 'string' && text ? text : '';
        } catch (error) {
          fail(error);
        } finally {
          loading.value = false;
        }
        if (!templateText.value) return;
        try {
          await mountEngine();
        } catch (error) {
          fail(error);
        }
      });

      onBeforeUnmount(() => {
        disposed = true;
        manager = null;
      });

      const markerRow = marker => h('div', { class: 'flex min-w-0 items-center gap-2' }, [
        h(InputText, {
          modelValue: marker.name,
          size: 'small',
          class: 'min-w-0 flex-1',
          'aria-label': t('dxfEditor.markerName'),
          onBlur: event => renameMarker(marker, event),
          onKeydown: event => {
            if (event.key === 'Enter') event.target.blur();
          }
        }),
        h('span', { class: 'text-supporting text-muted tabular-nums' }, `${Math.round(marker.x)}, ${Math.round(marker.y)}`),
        h(Button, {
          icon: 'pi pi-trash',
          severity: 'danger',
          text: true,
          rounded: true,
          size: 'small',
          'aria-label': t('common.delete'),
          onClick: () => dropMarker(marker)
        })
      ]);

      return () => h('div', { class: 'flex h-full min-h-0 flex-1 flex-col gap-3' }, [
        h('div', { class: 'flex flex-wrap items-center gap-2' }, [
          h('span', { class: 'text-supporting' }, editorTitle.value),
          h(Button, {
            icon: 'pi pi-times-circle',
            severity: 'secondary',
            text: true,
            rounded: true,
            size: 'small',
            'aria-label': t('drawing.resetView'),
            onClick: () => manager?.curView?.zoomToFitDrawing?.()
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
        engineError.value
          ? h(Message, { severity: 'error', closable: false }, { default: () => engineError.value })
          : null,
        h('div', { class: 'grid min-h-0 flex-1 grid-cols-[1fr_18rem] gap-3' }, [
            h('div', {
              ref: containerRef,
              class: 'min-h-0 rounded-panel border border-content-border bg-subtle'
            }),
            h('div', { class: 'flex min-h-0 flex-col gap-2 overflow-auto' }, [
              h('div', { class: 'text-label text-muted' }, `${t('dxfEditor.markers')} · ${markers.value.length}`),
              loading.value
                ? h('span', { class: 'text-supporting text-muted' }, t('common.loading'))
                : null,
              !loading.value && !markers.value.length
                ? h('span', { class: 'text-supporting text-muted' }, t('dxfEditor.noMarkers'))
                : null,
              ...markers.value.map(marker => h('div', { key: marker.name }, [markerRow(marker)])),
              h('div', { class: 'mt-auto flex flex-col gap-2 rounded-panel border border-content-border p-2' }, [
                h(InputText, {
                  modelValue: addName.value,
                  size: 'small',
                  placeholder: t('dxfEditor.markerName'),
                  'aria-label': t('dxfEditor.markerName'),
                  'onUpdate:modelValue': value => { addName.value = value; },
                  onKeydown: event => {
                    if (event.key === 'Enter') addMarker();
                  }
                }),
                h('div', { class: 'flex items-center gap-2' }, [
                  h(InputNumber, {
                    modelValue: addX.value,
                    size: 'small',
                    class: 'w-full',
                    inputId: 'dxf-marker-x',
                    'aria-label': 'X',
                    'onUpdate:modelValue': value => { addX.value = value; }
                  }),
                  h(InputNumber, {
                    modelValue: addY.value,
                    size: 'small',
                    class: 'w-full',
                    'aria-label': 'Y',
                    'onUpdate:modelValue': value => { addY.value = value; }
                  })
                ]),
                h(Button, {
                  label: t('dxfEditor.add'),
                  icon: 'pi pi-plus',
                  size: 'small',
                  severity: 'secondary',
                  outlined: true,
                  disabled: !addName.value.trim() || loading.value,
                  onClick: addMarker
                })
              ])
            ])
        ])
      ]);
    }
  });
}
