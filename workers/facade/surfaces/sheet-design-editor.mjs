// The facade plugin's sheet-design editor surface (surface contract 2).
// The mounted module receives the record and the generic persistence
// callbacks — never stores, routing, or auth; cross-type reads (layer
// standards, pen templates, cassettes) ride the host's query transport.
// The layout compute is the pure lib beside this file; saving patches
// the recomputed geometry through the generic update transport.
import { recomputeSheetLayout } from './lib/sheetLayout.js';
import {
  cassetteSheetItem,
  clampSheetPlacement,
  magneticSheetPlacement,
  placementWithTranslation,
  rotateSheetPlacementQuarterTurn,
  sheetItemPoints,
  sheetLayoutState,
  sheetPlacementSource,
  sheetPlacementTransform
} from './lib/sheetLayoutEditor.js';
import { DEFAULT_DRAWING_PEN, applyLayerPens } from './lib/layerPens.js';

export default function createSurface({ vue, components, locale, queries, notify, access }) {
  const { h, ref, computed, watch, onMounted, defineComponent } = vue;
  const t = locale.t;

  // The editor-grade io is required (contract 2); a host that cannot
  // provide it should have refused the install, not the mount.
  if (!queries || !notify || !access) {
    throw new Error('sheet-design-editor requires the contract-2 mount context');
  }

  return defineComponent({
    name: 'SheetDesignEditor',
    props: {
      record: { type: Object, default: null },
      persistence: { type: Object, default: null }
    },
    setup(props) {
      const svgRef = ref(null);
      const items = ref([]);
      const placedItems = ref([]);
      const selectedIndex = ref(-1);
      const dragState = ref(null);
      const saving = ref(false);
      const addVisible = ref(false);
      const cassettes = ref([]);
      const selectedCassetteId = ref('');
      const viewZoom = ref(1);
      const localName = ref('');
      const renameDraft = ref('');
      const standards = ref([]);
      const pens = ref([]);

      const editable = computed(() => access.canWrite(props.record));

      const sheetWidth = computed(() => Math.max(Number(props.record?.specs?.width) || 1220, 1));
      const sheetHeight = computed(() => Math.max(Number(props.record?.specs?.length) || 2440, 1));
      const sheetPolygon = computed(() => normalizeSheetPolygon(
        props.record?.data?.geometry?.data?.sheetPolygon ||
        props.record?.data?.geometry?.data?.sheet_polygon ||
        props.record?.data?.geometry?.data?.polygon ||
        props.record?.data?.materialPool?.[0]?.sheetPolygon ||
        null
      ));
      const sheetPolygonPoints = computed(() => sheetPolygon.value?.outer?.map(point => point.join(',')).join(' ') || '');
      const solveEffective = computed(() => props.record?.provenance?.solve?.effective || {});
      const toolKerf = computed(() => Math.max(Number(solveEffective.value.tool?.kerf ?? 0) || 0, 0));
      const boundaryOffset = computed(() => Math.max(Number(solveEffective.value.machine?.boundaryOffset || 0), 0));
      const editorPadding = computed(() => Math.max(sheetWidth.value, sheetHeight.value) * 0.025);
      const editorViewBox = computed(() => {
        const width = (sheetWidth.value + editorPadding.value * 2) * viewZoom.value;
        const height = (sheetHeight.value + editorPadding.value * 2) * viewZoom.value;
        return [
          sheetWidth.value / 2 - width / 2,
          sheetHeight.value / 2 - height / 2,
          width,
          height
        ].join(' ');
      });
      const majorGridSize = computed(() => {
        const target = Math.max(sheetWidth.value, sheetHeight.value) / 28;
        const scale = 10 ** Math.floor(Math.log10(Math.max(target, 1)));
        return Math.ceil(target / scale) * scale;
      });
      const gridPatternId = computed(() => `sheet-layout-grid-${String(props.record?._id || 'sheet').replace(/[^A-Za-z0-9_-]/g, '-')}`);
      const layerCodes = computed(() => Array.from(new Set([
        'contour.material_sheet',
        'contour.cassette_face',
        ...items.value.flatMap(item => (item.sourceLayers || []).map(sourceLayerCode))
      ].filter(Boolean))));
      const resolvedLayerStyles = computed(() => {
        const drawing = applyLayerPens({
          layers: layerCodes.value.map(code => ({ name: code, standardCode: code, paths: [] }))
        }, {
          standards: standards.value,
          pens: pens.value,
          defaultPen: systemPens()[0] || DEFAULT_DRAWING_PEN
        });
        return new Map((drawing.layers || []).map(layer => [layer.standardCode || layer.name, layer]));
      });
      const sheetBoundaryStyle = computed(() => resolvedStyle('contour.material_sheet'));
      const fallbackPlacementStyle = computed(() => resolvedStyle('contour.cassette_face'));
      const selectedSnapPoint = computed(() => selectedIndex.value >= 0
        ? sheetPlacementTransform(placedItems.value[selectedIndex.value])
        : null);
      const cassetteOptions = computed(() => cassettes.value.map(cassette => ({
        label: cassette.identity?.name || cassette.identity?.slug || cassette._id,
        value: cassette._id?.toString(),
        entity: cassette
      })));
      const displayName = computed(() => localName.value || props.record?.identity?.name || t('sheetDesign.editor'));

      onMounted(() => {
        queries.list('layer-standard').then(rows => { standards.value = rows || []; }).catch(() => {});
        queries.list('pen-template').then(rows => { pens.value = rows || []; }).catch(() => {});
      });

      // Layout history: snapshots are the serialized placements; a record
      // switch re-baselines instead of undoing across documents.
      const history = snapshotHistory({
        snapshot: () => JSON.stringify(placedItems.value),
        apply: (entry) => {
          placedItems.value = JSON.parse(entry);
          selectedIndex.value = -1;
        }
      });

      function systemPens() {
        return pens.value.filter(pen => pen.lineage?.organizationId == null);
      }

      function resetLayout() {
        const state = sheetLayoutState(props.record);
        items.value = state.items;
        placedItems.value = state.placedItems;
        selectedIndex.value = -1;
        viewZoom.value = 1;
        localName.value = '';
        history.reset();
      }

      watch(() => props.record?._id, resetLayout, { immediate: true });

      const dockMenu = ref(null);
      const renamePanelOpen = ref(false);

      function openRenameDock(event) {
        renameDraft.value = displayName.value;
        dockMenu.value?.show?.(event);
      }

      async function applyRename() {
        const name = renameDraft.value.trim();
        dockMenu.value?.hide?.();
        if (!name || name === displayName.value) return;
        try {
          await props.persistence.rename(props.record, name);
          localName.value = name;
        } catch (error) {
          notify({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '' });
        }
      }

      function placementKey(placement, index) {
        return placement.id || `${placement.item_id ?? placement.itemId ?? 'item'}-${index}`;
      }

      function placementPoints(placement) {
        return sheetItemPoints(sheetPlacementSource(items.value, placement)).map(point => point.join(',')).join(' ');
      }

      function sourceLayerCode(layer = {}) {
        return layer.standardCode || layer.code || layer.layer || layer.name || 'contour.cassette_face';
      }

      function resolvedStyle(code) {
        return resolvedLayerStyles.value.get(code) || {
          color: 'currentColor',
          weight: 1,
          dasharray: 'none'
        };
      }

      function placementLayers(placement) {
        return (sheetPlacementSource(items.value, placement)?.sourceLayers || [])
          .filter(layer => layerPoints(layer).length >= 2 || layerText(layer));
      }

      function layerPoints(layer = {}) {
        if (Array.isArray(layer.coordinates)) return layer.coordinates
          .filter(point => Array.isArray(point) && point.length >= 2)
          .map(point => [Number(point[0]) || 0, Number(point[1]) || 0]);
        if (layer.geometry?.type === 'dimension') {
          return [layer.geometry.from, layer.geometry.to]
            .filter(point => Array.isArray(point) && point.length >= 2)
            .map(point => [Number(point[0]) || 0, Number(point[1]) || 0]);
        }
        return [];
      }

      function placementHasContour(placement) {
        return placementLayers(placement).some(layer => (
          /^(cut|contour)(\.|$)/.test(sourceLayerCode(layer)) && layerPoints(layer).length >= 3
        ));
      }

      function layerText(layer = {}) {
        if (layer.geometry?.type !== 'text') return null;
        const point = layer.geometry.point || layer.geometry.position || layer.geometry.origin;
        const text = layer.geometry.text || layer.value?.value;
        if (!Array.isArray(point) || !text) return null;
        return { x: Number(point[0]) || 0, y: Number(point[1]) || 0, text, fontSize: Number(layer.geometry.fontSize) || 12 };
      }

      function layerStyle(layer) {
        return resolvedStyle(sourceLayerCode(layer));
      }

      function displayStrokeWidth(weight, fallback = 1.5) {
        const numeric = Number(weight);
        if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
        return Math.max(1, Math.min(numeric * 2, 4));
      }

      function placementSvgTransform(placement) {
        const transform = sheetPlacementTransform(placement);
        return `translate(${transform.x} ${transform.y}) rotate(${transform.rotation})`;
      }

      function sheetPoint(event) {
        const matrix = svgRef.value?.getScreenCTM?.();
        if (!matrix) return { x: 0, y: 0 };
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        return { x: point.x, y: point.y };
      }

      function startDrag(event, index) {
        if (!editable.value) return;
        const pointer = sheetPoint(event);
        const transform = sheetPlacementTransform(placedItems.value[index]);
        selectedIndex.value = index;
        history.commit();
        dragState.value = { index, pointerId: event.pointerId, dx: pointer.x - transform.x, dy: pointer.y - transform.y };
        svgRef.value?.setPointerCapture?.(event.pointerId);
      }

      function dragPlacement(event) {
        const drag = dragState.value;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const pointer = sheetPoint(event);
        const bounded = magneticSheetPlacement({
          items: items.value,
          placements: placedItems.value,
          index: drag.index,
          x: pointer.x - drag.dx,
          y: pointer.y - drag.dy,
          sheetWidth: sheetWidth.value,
          sheetHeight: sheetHeight.value,
          sheetPolygon: sheetPolygon.value,
          boundaryOffset: boundaryOffset.value,
          clearance: toolKerf.value
        });
        if (!bounded) return;
        const { x, y } = bounded;
        placedItems.value[drag.index] = placementWithTranslation(placedItems.value[drag.index], x, y);
      }

      function finishDrag(event) {
        if (dragState.value?.pointerId === event.pointerId) dragState.value = null;
      }

      function removePlacement(index) {
        if (!editable.value || index < 0) return;
        history.commit();
        placedItems.value.splice(index, 1);
        selectedIndex.value = -1;
      }

      function removeSelected() {
        removePlacement(selectedIndex.value);
      }

      function rotateSelected() {
        if (!editable.value || selectedIndex.value < 0) return;
        history.commit();
        const rotated = rotateSheetPlacementQuarterTurn({
          items: items.value,
          placements: placedItems.value,
          index: selectedIndex.value,
          sheetWidth: sheetWidth.value,
          sheetHeight: sheetHeight.value,
          sheetPolygon: sheetPolygon.value,
          boundaryOffset: boundaryOffset.value,
          clearance: toolKerf.value
        });
        if (rotated) placedItems.value[selectedIndex.value] = rotated;
      }

      async function openAddDialog() {
        addVisible.value = true;
        if (!cassettes.value.length) {
          cassettes.value = await queries.list('cassette').catch(() => []);
        }
      }

      function addCassette(cassetteEntity) {
        if (!cassetteEntity?._id) return;
        const id = `manual-${cassetteEntity._id}-${Date.now()}-${items.value.length}`;
        const item = cassetteSheetItem(cassetteEntity, id);
        if (!item) return;
        history.commit();
        items.value.push(item);
        const start = clampSheetPlacement({
          x: boundaryOffset.value,
          y: boundaryOffset.value,
          item,
          sheetWidth: sheetWidth.value,
          sheetHeight: sheetHeight.value,
          sheetPolygon: sheetPolygon.value,
          boundaryOffset: boundaryOffset.value
        });
        placedItems.value.push({
          item_id: id,
          transformation: { rotation: 0, translation: [start.x, start.y] }
        });
        selectedIndex.value = placedItems.value.length - 1;
      }

      function addSelectedCassette() {
        const cassetteEntity = cassettes.value.find(item => String(item._id) === String(selectedCassetteId.value));
        addCassette(cassetteEntity);
        selectedCassetteId.value = '';
        addVisible.value = false;
      }

      async function save() {
        saving.value = true;
        try {
          const { data, summary } = recomputeSheetLayout(props.record, {
            items: items.value,
            placedItems: placedItems.value
          });
          await props.persistence.patch(props.record, { data, summary });
          notify({ severity: 'success', summary: t('common.success'), detail: t('sheetDesign.layoutSaved'), life: 2500 });
        } catch (error) {
          notify({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || t('sheetDesign.layoutSaveFailed') });
        } finally {
          saving.value = false;
        }
      }

      function normalizeSheetRing(points = []) {
        const normalized = (Array.isArray(points) ? points : [])
          .map(point => Array.isArray(point) && point.length >= 2 ? [Number(point[0]), Number(point[1])] : null)
          .filter(point => point && Number.isFinite(point[0]) && Number.isFinite(point[1]));
        if (normalized.length < 3) return null;
        return normalized;
      }

      function normalizeSheetPolygon(polygon = null) {
        if (!polygon) return null;
        if (Array.isArray(polygon)) {
          const outer = normalizeSheetRing(polygon);
          return outer ? { outer, inner: [] } : null;
        }
        const outer = normalizeSheetRing(polygon.outer || polygon.data?.outer || []);
        if (!outer) return null;
        return {
          outer,
          inner: (polygon.inner || polygon.data?.inner || []).map(normalizeSheetRing).filter(Boolean)
        };
      }

      const documentDockItems = computed(() => [
        {
          icon: 'pi pi-pencil',
          label: t('common.rename'),
          hasPopup: true,
          disabled: !editable.value,
          onClick: openRenameDock
        },
        { separator: true },
        {
          icon: 'pi pi-save',
          label: t('common.save'),
          disabled: !editable.value || saving.value,
          loading: saving.value,
          onClick: () => save()
        }
      ]);

      const canvasDockItems = computed(() => [
        {
          icon: 'pi pi-undo',
          label: t('common.undo'),
          disabled: !history.canUndo.value,
          onClick: () => history.undo()
        },
        {
          icon: 'pi pi-refresh',
          label: t('common.redo'),
          disabled: !history.canRedo.value,
          onClick: () => history.redo()
        },
        { separator: true },
        {
          icon: 'pi pi-search-minus',
          label: t('drawing.zoomOut'),
          onClick: () => { viewZoom.value = Math.min(8, viewZoom.value * 1.25); }
        },
        {
          icon: 'pi pi-search-plus',
          label: t('drawing.zoomIn'),
          onClick: () => { viewZoom.value = Math.max(0.2, viewZoom.value / 1.25); }
        },
        {
          icon: 'pi pi-times-circle',
          label: t('drawing.resetView'),
          onClick: () => { viewZoom.value = 1; }
        },
        { separator: true },
        {
          icon: 'pi pi-plus',
          label: t('sheetDesign.addCassette'),
          disabled: !editable.value,
          onClick: () => openAddDialog()
        },
        {
          icon: 'pi pi-refresh',
          label: t('common.rotate'),
          disabled: !editable.value || selectedIndex.value < 0,
          onClick: rotateSelected
        },
        {
          icon: 'pi pi-trash',
          label: t('common.delete'),
          disabled: !editable.value || selectedIndex.value < 0,
          onClick: removeSelected
        }
      ]);

      function renderSheetShape(filled) {
        const stroke = sheetBoundaryStyle.value;
        const shape = sheetPolygonPoints.value
          ? h('polygon', {
              points: sheetPolygonPoints.value,
              ...(filled ? { fill: filled } : {
                fill: 'none',
                stroke: stroke.color,
                'stroke-width': displayStrokeWidth(stroke.weight, 2),
                'stroke-dasharray': stroke.dasharray,
                'vector-effect': 'non-scaling-stroke'
              })
            })
          : h('rect', {
              x: 0,
              y: 0,
              width: sheetWidth.value,
              height: sheetHeight.value,
              ...(filled ? { fill: filled } : {
                fill: 'none',
                stroke: stroke.color,
                'stroke-width': displayStrokeWidth(stroke.weight, 2),
                'stroke-dasharray': stroke.dasharray,
                'vector-effect': 'non-scaling-stroke'
              })
            });
        return shape;
      }

      function renderPlacement(placement, index) {
        const selected = selectedIndex.value === index;
        const layers = placementLayers(placement)
          .map((layer, layerIndex) => {
            const points = layerPoints(layer);
            if (points.length >= 2) {
              return h('polyline', {
                key: `${placementKey(placement, index)}-layer-${layerIndex}`,
                points: points.map(point => point.join(',')).join(' '),
                fill: 'none',
                stroke: layerStyle(layer).color,
                'stroke-width': displayStrokeWidth(layerStyle(layer).weight),
                'stroke-dasharray': layerStyle(layer).dasharray,
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
                'vector-effect': 'non-scaling-stroke'
              });
            }
            const text = layerText(layer);
            if (text) {
              return h('text', {
                key: `${placementKey(placement, index)}-layer-${layerIndex}`,
                x: text.x,
                y: text.y,
                fill: layerStyle(layer).color,
                'font-size': text.fontSize,
                'dominant-baseline': 'hanging',
                'pointer-events': 'none'
              }, text.text);
            }
            return null;
          })
          .filter(Boolean);
        return h('g', {
          key: placementKey(placement, index),
          transform: placementSvgTransform(placement),
          class: 'cursor-move',
          tabindex: 0,
          onPointerdown: event => { event.stopPropagation(); startDrag(event, index); },
          onFocus: () => { selectedIndex.value = index; },
          onKeydown: event => {
            if (event.key !== 'Delete' && event.key !== 'Backspace') return;
            event.stopPropagation();
            event.preventDefault();
            removePlacement(index);
          }
        }, [
          ...layers,
          !placementHasContour(placement) ? h('polygon', {
            points: placementPoints(placement),
            fill: 'none',
            stroke: fallbackPlacementStyle.value.color,
            'stroke-width': displayStrokeWidth(fallbackPlacementStyle.value.weight),
            'stroke-dasharray': fallbackPlacementStyle.value.dasharray,
            'vector-effect': 'non-scaling-stroke'
          }) : null,
          selected ? h('polygon', {
            points: placementPoints(placement),
            fill: 'var(--p-primary-color)',
            'fill-opacity': 0.1,
            stroke: 'var(--p-primary-color)',
            'stroke-width': 2,
            'vector-effect': 'non-scaling-stroke'
          }) : null
        ]);
      }

      return () => h(components.DesignerSurface, () => [
        h(components.DesignerWorkspace, {
          layout: 'lanes',
          class: 'h-full',
          documentItems: documentDockItems.value,
          canvasItems: canvasDockItems.value
        }, () => [
          h('div', { class: 'relative h-full w-full overflow-hidden' }, [
            h('svg', {
              ref: svgRef,
              class: 'h-full w-full touch-none',
              viewBox: editorViewBox.value,
              role: 'application',
              'aria-label': t('sheetDesign.editor'),
              onPointermove: dragPlacement,
              onPointerup: finishDrag,
              onPointercancel: finishDrag,
              onKeydown: event => {
                if (event.key !== 'Escape') return;
                event.stopPropagation();
                event.preventDefault();
                selectedIndex.value = -1;
              }
            }, [
              h('defs', [
                h('pattern', {
                  id: gridPatternId.value,
                  width: majorGridSize.value,
                  height: majorGridSize.value,
                  patternUnits: 'userSpaceOnUse'
                }, [
                  h('path', {
                    d: `M ${majorGridSize.value} 0 L 0 0 0 ${majorGridSize.value}`,
                    fill: 'none',
                    stroke: 'var(--p-text-muted-color)',
                    'stroke-opacity': 0.28,
                    'stroke-width': Math.max(majorGridSize.value / 80, 0.4)
                  })
                ])
              ]),
              renderSheetShape('var(--p-content-background)'),
              renderSheetShape(`url(#${gridPatternId.value})`),
              renderSheetShape(null),
              selectedSnapPoint.value ? h('g', { 'pointer-events': 'none' }, [
                h('line', {
                  x1: selectedSnapPoint.value.x, y1: 0,
                  x2: selectedSnapPoint.value.x, y2: sheetHeight.value,
                  stroke: 'var(--p-primary-color)', 'stroke-dasharray': '4 4', 'vector-effect': 'non-scaling-stroke'
                }),
                h('line', {
                  x1: 0, y1: selectedSnapPoint.value.y,
                  x2: sheetWidth.value, y2: selectedSnapPoint.value.y,
                  stroke: 'var(--p-primary-color)', 'stroke-dasharray': '4 4', 'vector-effect': 'non-scaling-stroke'
                })
              ]) : null,
              ...placedItems.value.map(renderPlacement)
            ])
          ]),
          h(components.Popover, { ref: dockMenu }, () => [
            h('div', {
              class: 'flex min-w-72 flex-col gap-2',
              onMousedown: event => event.stopPropagation(),
              onClick: event => event.stopPropagation()
            }, [
              h(components.InputText, {
                modelValue: renameDraft.value,
                'onUpdate:modelValue': value => { renameDraft.value = value; },
                placeholder: t('sheetDesign.sheetDesigns'),
                class: 'w-full',
                'aria-label': t('common.rename'),
                onKeydown: event => {
                  if (event.key !== 'Enter') return;
                  event.stopPropagation();
                  event.preventDefault();
                  applyRename();
                }
              }),
              h(components.Button, {
                icon: 'pi pi-check',
                label: t('common.save'),
                size: 'small',
                disabled: !renameDraft.value.trim(),
                onClick: applyRename
              })
            ])
          ])
        ]),
        h(components.StandardDialog, {
          visible: addVisible.value,
          'onUpdate:visible': value => { addVisible.value = value; },
          header: t('sheetDesign.addCassette'),
          size: 'md'
        }, {
          default: () => h(components.InstanceSelect, {
            modelValue: selectedCassetteId.value,
            'onUpdate:modelValue': value => { selectedCassetteId.value = value; },
            options: cassetteOptions.value,
            optionLabel: 'label',
            optionValue: 'value',
            typeId: 'cassette',
            class: 'w-full',
            placeholder: t('sheetDesign.selectCassette')
          }),
          footer: () => [
            h(components.Button, {
              label: t('common.cancel'), severity: 'secondary', text: true, size: 'small',
              onClick: () => { addVisible.value = false; }
            }),
            h(components.Button, {
              label: t('common.add'), icon: 'pi pi-plus', size: 'small',
              disabled: !selectedCassetteId.value,
              onClick: addSelectedCassette
            })
          ]
        })
      ]);
    }
  });
}

// Snapshot undo/redo history (the editor-side contract of the host's
// shared composable, module-local so the surface owns its own stack).
function snapshotHistory({ snapshot, apply, limit = 50 } = {}) {
  const state = { past: [], future: [], baseline: null, canUndo: false, canRedo: false };
  const gate = () => {
    state.canUndo = state.past.length > 0;
    state.canRedo = state.future.length > 0;
  };
  return {
    canUndo: { get value() { return state.canUndo; } },
    canRedo: { get value() { return state.canRedo; } },
    reset() {
      state.past = [];
      state.future = [];
      state.baseline = snapshot();
      gate();
    },
    commit() {
      const current = snapshot();
      if (state.baseline === null || current === state.baseline) {
        state.baseline = current;
        return;
      }
      state.past = [...state.past, state.baseline].slice(-limit);
      state.future = [];
      state.baseline = current;
      gate();
    },
    undo() {
      if (!state.past.length) return;
      const current = snapshot();
      const previous = state.past[state.past.length - 1];
      state.past = state.past.slice(0, -1);
      state.future = [current, ...state.future].slice(0, limit);
      apply(previous);
      state.baseline = snapshot();
      gate();
    },
    redo() {
      if (!state.future.length) return;
      const current = snapshot();
      const next = state.future[0];
      state.future = state.future.slice(1);
      state.past = [...state.past, current].slice(0, limit);
      apply(next);
      state.baseline = snapshot();
      gate();
    }
  };
}
