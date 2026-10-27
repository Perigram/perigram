// The facade plugin's sheet-design editor surface (surface contract 4).
// The mounted module receives the record and the generic persistence
// callbacks — never stores, routing, or auth; cross-type reads (layer
// standards, pen templates, cassettes) ride the host's query transport,
// and opening a placed cassette rides the host's workspace-open channel.
// The layout compute is the pure lib beside this file; saving patches
// the recomputed geometry through the generic update transport.
import { recomputeSheetLayout } from './lib/sheetLayout.js';
import {
  cassetteSheetItems,
  freeSheetPlacement,
  magneticSheetPlacement,
  placementWithTranslation,
  rotateSheetPlacementQuarterTurn,
  sheetItemBounds,
  sheetItemPoints,
  sheetLayoutState,
  sheetPlacementSource,
  sheetPlacementTransform
} from './lib/sheetLayoutEditor.js';
import { occsLayerExportName } from '../occs/layerStandards.js';
import { DEFAULT_DRAWING_PEN, applyLayerPens } from './lib/drawingPreview.js';

export default function createSurface({ vue, components, locale, queries, notify, access, open }) {
  const { h, ref, computed, watch, onMounted, defineComponent } = vue;
  const t = locale.t;

  // The navigation-grade io is required (contract 4); a host that cannot
  // provide it should have refused the install, not the mount.
  if (!queries || !notify || !access || !open) {
    throw new Error('sheet-design-editor requires the contract-4 mount context');
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
      const cassettes = ref([]);
      const selectedCassetteId = ref('');
      const viewZoom = ref(1);
      const localName = ref('');
      const renameDraft = ref('');
      const standards = ref([]);
      const pens = ref([]);
      const margin = ref(0);
      const visibleLayerCodes = ref([]);

      const editable = computed(() => access.canWrite(props.record));

      // Sheet dimensions derive from the stored sheet polygon's bounds —
      // the §3 record stores no specs block; the standard sheet fallback
      // stands when no polygon is stored.
      const sheetWidth = computed(() => Math.max(sheetPolygonBounds().width || 1220, 1));
      const sheetHeight = computed(() => Math.max(sheetPolygonBounds().height || 2440, 1));
      function sheetPolygonBounds() {
        const outer = sheetPolygon.value?.outer || [];
        if (outer.length < 2) return {};
        const xs = outer.map(point => Number(point[0]) || 0);
        const ys = outer.map(point => Number(point[1]) || 0);
        return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      }
      const sheetPolygon = computed(() => normalizeSheetPolygon(
        props.record?.fields?.geometry?.data?.sheetPolygon ||
        props.record?.fields?.geometry?.data?.sheet_polygon ||
        props.record?.fields?.geometry?.data?.polygon ||
        null
      ));
      const sheetPolygonPoints = computed(() => sheetPolygon.value?.outer?.map(point => point.join(',')).join(' ') || '');
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
          defaultPen: DEFAULT_DRAWING_PEN
        });
        return new Map((drawing.layers || []).map(layer => [layer.standardCode || layer.name, layer]));
      });
      const sheetBoundaryStyle = computed(() => resolvedStyle('contour.material_sheet'));
      const fallbackPlacementStyle = computed(() => resolvedStyle('contour.cassette_face'));
      const selectedSnapPoint = computed(() => selectedIndex.value >= 0
        ? sheetPlacementTransform(placedItems.value[selectedIndex.value])
        : null);
      const cassetteOptions = computed(() => cassettes.value.map(cassette => ({
        label: cassette.name || cassette._id,
        value: cassette._id?.toString(),
        entity: cassette
      })));
      const displayName = computed(() => localName.value || props.record?.fields?.title || t('sheetDesign.editor'));
      const selectedPlacement = computed(() => selectedIndex.value >= 0
        ? placedItems.value[selectedIndex.value] || null
        : null);
      const selectedSource = computed(() => selectedPlacement.value
        ? sheetPlacementSource(items.value, selectedPlacement.value)
        : null);
      const selectedTransform = computed(() => selectedPlacement.value
        ? sheetPlacementTransform(selectedPlacement.value)
        : null);
      const selectedBounds = computed(() => {
        if (!selectedPlacement.value || !selectedSource.value) return null;
        return sheetItemBounds(
          selectedSource.value,
          selectedPlacement.value.transformation?.rotation ?? selectedPlacement.value.rotation ?? 0
        );
      });

      onMounted(() => {
        queries.list('layer-standard').then(rows => { standards.value = rows || []; }).catch(() => {});
        queries.list('pen-template').then(rows => { pens.value = rows || []; }).catch(() => {});
        queries.list('cassette').then(rows => { cassettes.value = rows || []; }).catch(() => {});
      });

      // Layout history: snapshots are the serialized placements; a record
      // switch re-baselines instead of undoing across documents. Commits
      // follow mutations — undo restores the state before the last one.
      const history = snapshotHistory({
        ref,
        snapshot: () => JSON.stringify(placedItems.value),
        apply: (entry) => {
          placedItems.value = JSON.parse(entry);
          selectedIndex.value = -1;
        }
      });

      function resetLayout() {
        const state = sheetLayoutState(props.record);
        items.value = state.items;
        placedItems.value = state.placedItems;
        selectedIndex.value = -1;
        viewZoom.value = 1;
        localName.value = '';
        visibleLayerCodes.value = layerCodes.value;
        history.reset();
      }

      // The workspace opens editor tabs from an id stub; the record body
      // hydrates afterwards under the same id.
      watch(
        () => [props.record?._id, Boolean(props.record?.fields?.geometry)],
        resetLayout,
        { immediate: true }
      );

      // Layers that appear with later edits join the visible set; codes
      // that disappear leave it.
      watch(layerCodes, (codes, previous) => {
        const known = new Set(previous || []);
        visibleLayerCodes.value = codes.filter(code => !known.has(code) || layerVisible(code));
      });

      const dockMenu = ref(null);

      function applyRename() {
        const name = renameDraft.value.trim();
        dockMenu.value?.hide?.();
        if (!name || name === displayName.value) return;
        props.persistence.rename(props.record, name)
          .then(() => { localName.value = name; })
          .catch(error => {
            notify({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '' });
          });
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

      function layerVisible(code) {
        return visibleLayerCodes.value.includes(code);
      }

      function updateVisibleLayerCodes(codes) {
        visibleLayerCodes.value = Array.isArray(codes) ? codes.filter(Boolean) : [];
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

      // Layer standards' pen weights render at a fixed px-per-pen-unit
      // scale, bounded for visibility — relative weights survive.
      function displayStrokeWidth(weight, fallback = 1.5) {
        const numeric = Number(weight);
        if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
        return Math.max(0.5, Math.min(numeric * 2, 4));
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
        dragMoved = false;
        dragState.value = { index, pointerId: event.pointerId, dx: pointer.x - transform.x, dy: pointer.y - transform.y };
        svgRef.value?.setPointerCapture?.(event.pointerId);
      }

      // Snap resolution costs a polygon sweep per candidate, so drags
      // compute once per animation frame — pointermove fires far more often.
      // The margin row owns both gate distances — between parts and off
      // the sheet edge. The solver packs kerf-compensated shapes flush,
      // so margin 0 keeps a solved layout draggable exactly as solved.
      let dragFrame = 0;
      let pendingDragEvent = null;
      let dragMoved = false;

      function dragPlacement(event) {
        pendingDragEvent = event;
        if (!dragFrame) dragFrame = requestAnimationFrame(applyDragFrame);
      }

      function applyDragFrame() {
        dragFrame = 0;
        const event = pendingDragEvent;
        pendingDragEvent = null;
        const drag = dragState.value;
        if (!event || !drag || drag.pointerId !== event.pointerId) return;
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
          boundaryOffset: margin.value,
          clearance: margin.value
        });
        if (!bounded) return;
        const current = sheetPlacementTransform(placedItems.value[drag.index]);
        dragMoved = dragMoved || Math.abs(current.x - bounded.x) > 0.01 || Math.abs(current.y - bounded.y) > 0.01;
        placedItems.value[drag.index] = placementWithTranslation(placedItems.value[drag.index], bounded.x, bounded.y);
      }

      function finishDrag(event) {
        if (dragState.value?.pointerId === event.pointerId) endDrag();
      }

      function endDrag() {
        if (dragMoved) history.commit();
        dragMoved = false;
        dragState.value = null;
        pendingDragEvent = null;
        if (dragFrame) {
          cancelAnimationFrame(dragFrame);
          dragFrame = 0;
        }
      }

      function removePlacement(index) {
        if (!editable.value || index < 0) return;
        placedItems.value.splice(index, 1);
        selectedIndex.value = -1;
        history.commit();
      }

      function removeSelected() {
        removePlacement(selectedIndex.value);
      }

      function rotateSelected() {
        if (!editable.value || selectedIndex.value < 0) return;
        const rotated = rotateSheetPlacementQuarterTurn({
          items: items.value,
          placements: placedItems.value,
          index: selectedIndex.value,
          sheetWidth: sheetWidth.value,
          sheetHeight: sheetHeight.value,
          sheetPolygon: sheetPolygon.value,
          boundaryOffset: margin.value,
          clearance: margin.value
        });
        if (rotated) {
          placedItems.value[selectedIndex.value] = rotated;
          history.commit();
        }
      }

      function openSelectedCassette() {
        const cassetteId = selectedSource.value?.cassette_id;
        if (!cassetteId) return;
        open.instance({ typeId: 'cassette', instanceId: String(cassetteId) });
      }

      function addSelectedCassette() {
        const cassette = cassettes.value.find(item => String(item._id) === String(selectedCassetteId.value));
        const prefix = cassette ? `manual-${cassette._id}-${Date.now()}` : '';
        const added = cassette ? cassetteSheetItems(cassette, prefix) : [];
        if (!added.length) {
          notify({ severity: 'error', summary: t('common.error'), detail: t('sheetDesign.cassetteNoGeometry') });
          return;
        }
        for (const item of added) {
          items.value.push(item);
          const start = freeSheetPlacement({
            item,
            items: items.value,
            placements: placedItems.value,
            sheetWidth: sheetWidth.value,
            sheetHeight: sheetHeight.value,
            sheetPolygon: sheetPolygon.value,
            boundaryOffset: margin.value,
            clearance: margin.value
          });
          placedItems.value.push({
            item_id: item.id,
            transformation: { rotation: 0, translation: [start.x, start.y] }
          });
          selectedIndex.value = placedItems.value.length - 1;
        }
        history.commit();
      }

      async function save() {
        saving.value = true;
        try {
          const { geometry } = recomputeSheetLayout(props.record, {
            items: items.value,
            placedItems: placedItems.value
          });
          await props.persistence.patch(props.record, { geometry });
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

      function openRenameDock(event) {
        renameDraft.value = displayName.value;
        dockMenu.value?.show?.(event);
      }

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
        }
      ]);

      const layerRows = computed(() => layerCodes.value.map(code => ({
        key: code,
        code,
        label: occsLayerExportName(code) || code,
        color: resolvedStyle(code).color
      })));

      const speedDialItems = computed(() => {
        const cassetteId = selectedSource.value?.cassette_id;
        return [
          cassetteId
            ? {
                icon: 'pi pi-external-link',
                label: t('common.open'),
                command: openSelectedCassette
              }
            : null,
          {
            icon: 'pi pi-refresh',
            label: t('common.rotate'),
            disabled: !editable.value,
            command: rotateSelected
          },
          {
            icon: 'pi pi-trash',
            label: t('common.delete'),
            disabled: !editable.value,
            command: removeSelected
          }
        ].filter(Boolean);
      });

      // The selection's action dial anchors at the placement's top-right
      // corner in screen space; SVG geometry changes (drag, zoom) recompute
      // it through the render pass.
      function speedDialAnchor() {
        const matrix = svgRef.value?.getScreenCTM?.();
        if (!matrix || !selectedTransform.value || !selectedBounds.value || !svgRef.value) return null;
        const canvas = svgRef.value.getBoundingClientRect();
        const point = new DOMPoint(
          selectedTransform.value.x + selectedBounds.value.maxX,
          selectedTransform.value.y + selectedBounds.value.minY
        ).matrixTransform(matrix);
        return {
          left: Math.min(Math.max(point.x - canvas.left, 48), Math.max(canvas.width - 48, 48)),
          top: Math.min(Math.max(point.y - canvas.top, 8), Math.max(canvas.height - 8, 8)),
          expandUp: point.y - canvas.top > 180
        };
      }

      function renderSpeedDial() {
        const anchor = selectedPlacement.value ? speedDialAnchor() : null;
        if (!anchor) return null;
        return h('div', {
          style: {
            position: 'absolute',
            left: `${anchor.left}px`,
            top: `${anchor.top}px`,
            transform: 'translate(50%, -50%)',
            zIndex: 25
          }
        }, [
          h(components.SpeedDial, {
            model: speedDialItems.value,
            direction: anchor.expandUp ? 'up' : 'down',
            buttonProps: {
              rounded: true,
              severity: 'secondary',
              outlined: true,
              'aria-label': t('sheetDesign.actions')
            },
            tooltipOptions: { position: anchor.expandUp ? 'left' : 'right' }
          })
        ]);
      }

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
            const code = sourceLayerCode(layer);
            const points = layerPoints(layer);
            if (points.length >= 2) {
              if (!layerVisible(code)) return null;
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
              if (!layerVisible(code)) return null;
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
          // The face grab target — pointer-events: fill hit-tests the
          // unpainted interior.
          h('polygon', {
            points: placementPoints(placement),
            fill: 'none',
            stroke: 'none',
            'pointer-events': 'fill'
          }),
          ...layers,
          !placementHasContour(placement) && layerVisible('contour.cassette_face') ? h('polygon', {
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

      const factRow = (label, value) => h('div', { class: 'flex items-baseline justify-between gap-3' }, [
        h('span', { class: 'shrink-0 text-muted' }, label),
        h('span', { class: 'min-w-0 truncate font-medium', title: String(value) }, String(value))
      ]);
      const rounded = value => Math.round(Number(value) * 10) / 10;

      const renderPalette = () => h('aside', { class: 'flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3' }, [
        h('div', { class: 'flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto' }, [
          h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
            h('small', { class: 'text-muted text-supporting' }, t('sheetDesign.cassettes')),
            h('div', { class: 'flex min-w-0 items-start gap-2' }, [
              h(components.InstanceSelect, {
                modelValue: selectedCassetteId.value,
                'onUpdate:modelValue': value => { selectedCassetteId.value = value; },
                options: cassetteOptions.value,
                optionLabel: 'label',
                optionValue: 'value',
                typeId: 'cassette',
                filter: true,
                class: 'min-w-0 flex-1',
                placeholder: t('sheetDesign.selectCassette')
              }),
              h(components.Button, {
                icon: 'pi pi-plus',
                severity: 'secondary',
                outlined: true,
                rounded: true,
                size: 'small',
                'aria-label': t('sheetDesign.addCassette'),
                disabled: !editable.value || !selectedCassetteId.value,
                onClick: addSelectedCassette
              })
            ])
          ]),
          h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
            h('small', { class: 'text-muted text-supporting' }, t('sheetDesign.margin')),
            h(components.InputNumber, {
              modelValue: margin.value,
              'onUpdate:modelValue': value => { margin.value = Math.max(0, Number(value) || 0); },
              min: 0,
              max: 100,
              step: 1,
              suffix: ' mm',
              size: 'small',
              class: 'w-full',
              disabled: !editable.value,
              'aria-label': t('sheetDesign.margin')
            })
          ]),
          h('section', { class: 'flex min-w-0 flex-col gap-1' }, [
            h('small', { class: 'text-muted text-supporting' }, t('common.layers')),
            ...layerRows.value.map(row => h('div', {
              key: row.key,
              class: 'flex min-w-0 items-center gap-2 py-0.5'
            }, [
              h(components.Checkbox, {
                modelValue: visibleLayerCodes.value,
                value: row.code,
                inputId: `sheet-layer-${row.key.replace(/[^A-Za-z0-9_-]/g, '-')}`,
                size: 'small',
                'onUpdate:modelValue': updateVisibleLayerCodes
              }),
              h('label', {
                for: `sheet-layer-${row.key.replace(/[^A-Za-z0-9_-]/g, '-')}`,
                class: 'min-w-0 flex-1 truncate',
                title: row.label
              }, row.label),
              row.color && row.color !== 'currentColor'
                ? h('span', {
                    class: 'block h-[3px] w-8 shrink-0 rounded-full',
                    style: { backgroundColor: row.color },
                    'aria-hidden': 'true'
                  })
                : null
            ]))
          ])
        ])
      ]);

      const renderInspector = () => h('aside', { class: 'flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3' }, [
        h('div', { class: 'flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto' },
          selectedPlacement.value
            ? [
                h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
                  h('small', { class: 'text-muted text-supporting' }, t('common.name')),
                  h('span', { class: 'min-w-0 truncate font-medium', title: selectedSource.value?.name || '' },
                    selectedSource.value?.name || '')
                ]),
                h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
                  ...selectedBounds.value ? [
                    factRow(t('sheetDesign.size'), `${rounded(selectedBounds.value.width)}×${rounded(selectedBounds.value.height)} mm`)
                  ] : [],
                  ...selectedTransform.value ? [
                    factRow(t('sheetDesign.position'), `${rounded(selectedTransform.value.x)}, ${rounded(selectedTransform.value.y)} mm`),
                    factRow(t('sheetDesign.rotation'), `${Math.round(((selectedTransform.value.rotation % 360) + 360) % 360)}°`)
                  ] : []
                ])
              ]
            : [
                h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
                  h('small', { class: 'text-muted text-supporting' }, t('sheetDesign.sheet')),
                  factRow(t('sheetDesign.size'), `${rounded(sheetWidth.value)}×${rounded(sheetHeight.value)} mm`),
                  factRow(t('sheetDesign.placements'), placedItems.value.length),
                  factRow(t('sheetDesign.cassettes'),
                    new Set(placedItems.value
                      .map(placement => sheetPlacementSource(items.value, placement)?.cassette_id)
                      .filter(Boolean)).size)
                ])
              ])
      ]);

      return () => h(components.DesignerSurface, () => [
        h(components.DesignerWorkspace, {
          layout: 'lanes',
          class: 'h-full',
          documentItems: documentDockItems.value,
          canvasItems: canvasDockItems.value
        }, {
          palette: renderPalette,
          inspector: renderInspector,
          default: () => [
            h('div', { class: 'relative h-full w-full overflow-hidden' }, [
              h('svg', {
                ref: svgRef,
                class: 'h-full w-full touch-none',
                viewBox: editorViewBox.value,
                role: 'application',
                'aria-label': t('sheetDesign.editor'),
                onPointerdown: () => {
                  endDrag();
                  selectedIndex.value = -1;
                },
                onPointermove: dragPlacement,
                onPointerup: finishDrag,
                onPointercancel: finishDrag,
                onKeydown: event => {
                  if (event.key !== 'Escape') return;
                  event.stopPropagation();
                  event.preventDefault();
                  endDrag();
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
                layerVisible('contour.material_sheet') ? renderSheetShape(null) : null,
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
              ]),
              renderSpeedDial()
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
                  onClick: () => applyRename()
                })
              ])
            ])
          ]
        })
      ]);
    }
  });
}

// Snapshot undo/redo history (the editor-side contract of the host's
// shared composable, module-local so the surface owns its own stack).
// `commit` runs after a mutation: the pre-mutation baseline enters the
// past stack and the mutated state becomes the next baseline. The gate
// flags are real refs from the injected runtime — a plain getter would
// freeze the toolbar's disabled state.
function snapshotHistory({ ref, snapshot, apply, limit = 50 } = {}) {
  const canUndo = ref(false);
  const canRedo = ref(false);
  const state = { past: [], future: [], baseline: null };
  const gate = () => {
    canUndo.value = state.past.length > 0;
    canRedo.value = state.future.length > 0;
  };
  return {
    canUndo,
    canRedo,
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
