// The facade plugin's sheet-design editor surface (surface contract 4).
// The mounted module receives the opened record and the generic
// persistence callbacks — never stores, routing, or auth; cross-type
// reads (layer standards, pen templates, cassette designs, sibling
// sheet designs) ride the host's query transport, opening a placed
// design rides the host's workspace-open channel.
// One canvas carries the working set: the opened record beside sheets
// the user adds from the picker or as all siblings (the facade SPEC's
// multi-sheet law). Every edited record commits its own patch on save.
import { recomputeSheetLayout } from './lib/sheetLayout.js';
import {
  designSheetItems,
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

const SHEET_GAP = 150;
const LABEL_HEIGHT = 70;
const VIEW_PADDING = 0.08;
const ZOOM_MIN = 0.02;
const ZOOM_MAX = 4;

export default function createSurface({ vue, components, locale, queries, notify, access, open }) {
  const { h, ref, computed, watch, onMounted, onBeforeUnmount, defineComponent } = vue;
  const t = locale.t;

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
      const sheets = ref([]);
      const activeSheetId = ref('');
      const selection = ref(null);
      const dragState = ref(null);
      const panState = ref(null);
      const saving = ref(false);
      const designs = ref([]);
      const sheetDesigns = ref([]);
      const selectedDesignId = ref('');
      const selectedSheetId = ref('');
      const view = ref({ cx: 610, cy: 1220, k: 0.25 });
      const svgSize = ref({ w: 800, h: 600 });
      const localNames = ref({});
      const renameDraft = ref('');
      const standards = ref([]);
      const pens = ref([]);
      const margin = ref(0);
      const visibleLayerCodes = ref([]);
      const dockMenu = ref(null);

      const sheetOptions = computed(() => sheetDesigns.value
        .filter(row => !sheets.value.some(entry => entry.id === String(row._id)))
        .map(row => ({ label: row.name || row._id, value: String(row._id), entity: row })));
      const activeSheetEntry = computed(() =>
        sheets.value.find(entry => entry.id === activeSheetId.value) || sheets.value[0] || null);
      const selectedEntry = computed(() => {
        const selectionValue = selection.value;
        if (!selectionValue) return null;
        return sheets.value.find(entry => entry.id === selectionValue.sheet) || null;
      });
      const selectedPlacement = computed(() => {
        const selectionValue = selection.value;
        if (!selectionValue || selectionValue.type !== 'placement') return null;
        const entry = sheets.value.find(row => row.id === selectionValue.sheet);
        return entry ? (entry.placedItems[selectionValue.placement] || null) : null;
      });
      const selectedSource = computed(() => {
        const selectionValue = selection.value;
        if (!selectionValue || selectionValue.type !== 'placement') return null;
        const entry = sheets.value.find(row => row.id === selectionValue.sheet);
        return entry ? sheetPlacementSource(entry.items, entry.placedItems[selectionValue.placement] || {}) : null;
      });
      const selectedDesignRecord = computed(() => {
        const designId = selectedSource.value?.design_id;
        if (!designId) return null;
        return designs.value.find(row => String(row._id) === String(designId)) || null;
      });
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
      const dirtyCount = computed(() => sheets.value.filter(entry => entry.dirty).length);
      const displayName = computed(() => {
        const entry = activeSheetEntry.value;
        if (!entry) return t('sheetDesign.editor');
        return localNames.value[entry.id] || entry.record?.fields?.name || t('sheetDesign.sheet');
      });

      const designOptions = computed(() => designs.value.map(design => ({
        label: design.name || design._id,
        value: design._id?.toString(),
        entity: design
      })));

      onMounted(() => {
        queries.list('layer-standard').then(rows => { standards.value = rows || []; }).catch(() => {});
        queries.list('pen-template').then(rows => { pens.value = rows || []; }).catch(() => {});
        queries.list('cassette-design').then(rows => { designs.value = rows || []; }).catch(() => {});
        queries.list('sheet-design').then(rows => { sheetDesigns.value = rows || []; }).catch(() => {});
        const svg = svgRef.value;
        if (svg && typeof ResizeObserver !== 'undefined') {
          let viewInitialized = false;
          const observer = new ResizeObserver(entries => {
            const rect = entries[0]?.contentRect;
            if (rect?.width && rect?.height) {
              svgSize.value = { w: rect.width, h: rect.height };
              if (!viewInitialized) {
                viewInitialized = true;
                fitView();
              }
            }
          });
          observer.observe(svg);
          onBeforeUnmount(() => observer.disconnect());
        }
      });

      function sheetPolygonOf(record) {
        return normalizeSheetPolygon(
          record?.fields?.geometry?.data?.sheetPolygon ||
          record?.fields?.geometry?.data?.sheet_polygon ||
          record?.fields?.geometry?.data?.polygon ||
          null
        );
      }

      function polygonBounds(polygon) {
        const outer = polygon?.outer || [];
        if (outer.length < 2) return {};
        const xs = outer.map(point => Number(point[0]) || 0);
        const ys = outer.map(point => Number(point[1]) || 0);
        return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      }

      function sheetEntry(record) {
        const polygon = sheetPolygonOf(record);
        const bounds = polygonBounds(polygon);
        const state = sheetLayoutState(record);
        return {
          id: String(record?._id || ''),
          record,
          polygon,
          width: Math.max(bounds.width || 1220, 1),
          height: Math.max(bounds.height || 2440, 1),
          items: state.items,
          placedItems: state.placedItems,
          writable: Boolean(record?._id) && access.canWrite(record),
          dirty: false
        };
      }

      function resetCanvas() {
        selection.value = null;
        activeSheetId.value = props.record?._id ? String(props.record._id) : '';
        sheets.value = props.record?._id ? [sheetEntry(props.record)] : [];
        history.reset();
        fitView();
      }

      // The workspace opens editor tabs from an id stub; the record body
      // hydrates afterwards under the same id.
      watch(
        () => [props.record?._id, Boolean(props.record?.fields?.geometry)],
        resetCanvas,
        { immediate: true }
      );

      // ---- canvas geometry -------------------------------------------------

      const sheetFrames = computed(() => {
        let x = 0;
        return sheets.value.map(entry => {
          const frame = { entry, x, y: 0, width: entry.width, height: entry.height };
          x += entry.width + SHEET_GAP;
          return frame;
        });
      });

      const canvasBounds = computed(() => {
        const frames = sheetFrames.value;
        if (!frames.length) return { minX: 0, minY: 0, maxX: 2440, maxY: 1220 };
        const maxX = Math.max(...frames.map(frame => frame.x + frame.width));
        const maxY = LABEL_HEIGHT + Math.max(...frames.map(frame => frame.height));
        return { minX: 0, minY: 0, maxX, maxY };
      });

      const viewBox = computed(() => {
        const { w, h } = svgSize.value;
        const width = Math.max(w / view.value.k, 1);
        const height = Math.max(h / view.value.k, 1);
        return [
          view.value.cx - width / 2,
          view.value.cy - height / 2,
          width,
          height
        ].join(' ');
      });

      const majorGridSize = computed(() => {
        const span = Math.max(canvasBounds.value.maxX, canvasBounds.value.maxY);
        const target = span / 28;
        const scale = 10 ** Math.floor(Math.log10(Math.max(target, 1)));
        return Math.ceil(target / scale) * scale;
      });

      function fitView() {
        const { minX, minY, maxX, maxY } = canvasBounds.value;
        const padX = (maxX - minX) * VIEW_PADDING + 1;
        const padY = (maxY - minY) * VIEW_PADDING + 1;
        const kx = svgSize.value.w / (maxX - minX + padX * 2);
        const ky = svgSize.value.h / (maxY - minY + padY * 2);
        view.value = {
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2,
          k: Math.min(Math.min(kx, ky), ZOOM_MAX)
        };
      }

      // Element-relative pointer zoom.
      function zoomAt(px, py, factor) {
        const { cx, cy, k } = view.value;
        const originX = cx - svgSize.value.w / (2 * k);
        const originY = cy - svgSize.value.h / (2 * k);
        const pointX = originX + px / k;
        const pointY = originY + py / k;
        const nextK = Math.min(Math.max(k * factor, ZOOM_MIN), ZOOM_MAX);
        if (nextK === k) return;
        view.value = {
          k: nextK,
          cx: pointX - (px - svgSize.value.w / 2) / nextK,
          cy: pointY - (py - svgSize.value.h / 2) / nextK
        };
      }

      function onWheel(event) {
        event.preventDefault();
        const rect = svgRef.value?.getBoundingClientRect?.();
        zoomAt(
          event.clientX - (rect?.left || 0),
          event.clientY - (rect?.top || 0),
          event.deltaY < 0 ? 1.15 : 1 / 1.15
        );
      }

      // Canvas coordinates of a pointer event.
      function canvasPoint(event) {
        const svg = svgRef.value;
        const matrix = svg?.getScreenCTM?.();
        if (!matrix) return { x: 0, y: 0 };
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        return { x: point.x, y: point.y };
      }

      function frameAt(point) {
        return sheetFrames.value.find(frame => (
          point.x >= frame.x && point.x <= frame.x + frame.width &&
          point.y >= frame.y && point.y <= frame.y + frame.height
        )) || null;
      }

      function entryOf(id) {
        return sheets.value.find(entry => entry.id === id) || null;
      }

      // ---- working set ------------------------------------------------------

      function addSheetRecord(record) {
        const id = String(record?._id || '');
        if (!id || sheets.value.some(entry => entry.id === id)) return false;
        sheets.value.push(sheetEntry(record));
        activeSheetId.value = id;
        selection.value = { type: 'sheet', sheet: id };
        fitView();
        return true;
      }

      function addSelectedSheet() {
        const record = sheetDesigns.value.find(row => String(row._id) === String(selectedSheetId.value));
        if (record && addSheetRecord(record)) selectedSheetId.value = '';
      }

      function addAllSheets() {
        let added = false;
        for (const row of sheetDesigns.value) added = addSheetRecord(row) || added;
        if (added) selection.value = null;
      }

      function removeSheetFromCanvas(entry) {
        if (!entry || entry.dirty) return;
        const index = sheets.value.findIndex(row => row.id === entry.id);
        if (index < 0) return;
        sheets.value.splice(index, 1);
        if (activeSheetId.value === entry.id) {
          const next = sheets.value[Math.min(index, sheets.value.length - 1)];
          activeSheetId.value = next ? next.id : '';
        }
        if (selection.value?.sheet === entry.id) selection.value = null;
        fitView();
      }

      // ---- layers and pens --------------------------------------------------

      function sourceLayerCode(layer = {}) {
        return layer.standardCode || layer.code || layer.layer || layer.name || 'contour.cassette_face';
      }

      function layerCodesOf(entry) {
        if (!entry) return [];
        return Array.from(new Set([
          'contour.material_sheet',
          'contour.cassette_face',
          ...entry.items.flatMap(item => (item.sourceLayers || []).map(sourceLayerCode))
        ].filter(Boolean)));
      }

      const layerCodes = computed(() => layerCodesOf(activeSheetEntry.value));
      // Layers that appear with later edits join the visible set; codes
      // that disappear leave it.
      watch(layerCodes, (codes, previous) => {
        const known = new Set(previous || []);
        visibleLayerCodes.value = codes.filter(code => !known.has(code) || layerVisible(code));
      });

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

      function resolvedStyle(code) {
        return resolvedLayerStyles.value.get(code) || {
          color: 'currentColor',
          weight: 1,
          dasharray: 'none'
        };
      }

      const sheetBoundaryStyle = computed(() => resolvedStyle('contour.material_sheet'));
      const fallbackPlacementStyle = computed(() => resolvedStyle('contour.cassette_face'));

      function layerVisible(code) {
        return visibleLayerCodes.value.includes(code);
      }

      function updateVisibleLayerCodes(codes) {
        visibleLayerCodes.value = Array.isArray(codes) ? codes.filter(Boolean) : [];
      }

      // ---- history ------------------------------------------------------------

      // Layout history: snapshots are the working set's serialized
      // placements, keyed by record id.
      const history = snapshotHistory({
        ref,
        snapshot: () => JSON.stringify(sheets.value.map(entry => ({ id: entry.id, placedItems: entry.placedItems }))),
        apply: (entry) => {
          const restored = new Map(JSON.parse(entry).map(row => [row.id, row.placedItems]));
          for (const sheet of sheets.value) {
            if (restored.has(sheet.id)) {
              sheet.placedItems = restored.get(sheet.id);
              sheet.dirty = true;
            }
          }
          selection.value = null;
        }
      });

      // ---- chrome actions -----------------------------------------------------

      function applyRename() {
        const entry = activeSheetEntry.value;
        const name = renameDraft.value.trim();
        dockMenu.value?.hide?.();
        if (!entry || !name || name === displayName.value) return;
        props.persistence.rename(entry.record, name)
          .then(() => { localNames.value = { ...localNames.value, [entry.id]: name }; })
          .catch(error => {
            notify({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '' });
          });
      }

      function sheetNameOf(entry) {
        return localNames.value[entry.id] || entry.record?.fields?.name || t('sheetDesign.sheet');
      }

      // ---- placements -----------------------------------------------------------

      function placementKey(placement, index) {
        return placement.id || `${placement.item_id ?? placement.itemId ?? 'item'}-${index}`;
      }

      function placementPoints(entry, placement) {
        return sheetItemPoints(sheetPlacementSource(entry.items, placement)).map(point => point.join(',')).join(' ');
      }

      function placementLayers(entry, placement) {
        return (sheetPlacementSource(entry.items, placement)?.sourceLayers || [])
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

      function layerText(layer = {}) {
        if (layer.geometry?.type !== 'text') return null;
        const point = layer.geometry.point || layer.geometry.position || layer.geometry.origin;
        const text = layer.geometry.text || layer.value?.value;
        if (!Array.isArray(point) || !text) return null;
        return { x: Number(point[0]) || 0, y: Number(point[1]) || 0, text, fontSize: Number(layer.geometry.fontSize) || 12 };
      }

      function placementHasContour(entry, placement) {
        return placementLayers(entry, placement).some(layer => (
          /^(cut|contour)(\.|$)/.test(sourceLayerCode(layer)) && layerPoints(layer).length >= 3
        ));
      }

      function layerStyle(layer) {
        return resolvedStyle(sourceLayerCode(layer));
      }

      // Pen weights render at a fixed px-per-pen-unit scale, bounded for
      // visibility — relative weights survive.
      function displayStrokeWidth(weight, fallback = 1.5) {
        const numeric = Number(weight);
        if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
        return Math.max(0.5, Math.min(numeric * 2, 4));
      }

      function localPoint(frame, event) {
        const point = canvasPoint(event);
        return { x: point.x - frame.x, y: point.y - frame.y };
      }

      function selectPlacement(sheetId, index) {
        selection.value = { type: 'placement', sheet: sheetId, placement: index };
        activeSheetId.value = sheetId;
      }

      function selectSheet(sheetId) {
        selection.value = { type: 'sheet', sheet: sheetId };
        activeSheetId.value = sheetId;
      }

      function clearSelection() {
        selection.value = null;
      }

      function removePlacement(sheetId, index) {
        const entry = entryOf(sheetId);
        if (!entry || !entry.writable || index < 0) return;
        entry.placedItems.splice(index, 1);
        entry.dirty = true;
        selection.value = { type: 'sheet', sheet: sheetId };
        history.commit();
      }

      function removeSelected() {
        const selectionValue = selection.value;
        if (selectionValue?.type !== 'placement') return;
        removePlacement(selectionValue.sheet, selectionValue.placement);
      }

      function rotateSelected() {
        const selectionValue = selection.value;
        const entry = selectionValue ? entryOf(selectionValue.sheet) : null;
        if (selectionValue?.type !== 'placement' || !entry?.writable || selectionValue.placement < 0) return;
        const rotated = rotateSheetPlacementQuarterTurn({
          items: entry.items,
          placements: entry.placedItems,
          index: selectionValue.placement,
          sheetWidth: entry.width,
          sheetHeight: entry.height,
          sheetPolygon: entry.polygon,
          boundaryOffset: margin.value,
          clearance: margin.value
        });
        if (rotated) {
          entry.placedItems[selectionValue.placement] = rotated;
          entry.dirty = true;
          history.commit();
        }
      }

      function openSelectedDesign() {
        const designId = selectedSource.value?.design_id;
        if (!designId) return;
        open.instance({ typeId: 'cassette-design', instanceId: String(designId) });
      }

      function addSelectedDesign() {
        const entry = activeSheetEntry.value;
        const design = designs.value.find(item => String(item._id) === String(selectedDesignId.value));
        if (!entry?.writable || !design) return;
        const prefix = `manual-${design._id}-${Date.now()}`;
        const added = designSheetItems(design, prefix);
        if (!added.length) {
          notify({ severity: 'error', summary: t('common.error'), detail: t('sheetDesign.designNoGeometry') });
          return;
        }
        for (const item of added) {
          entry.items.push(item);
          const start = freeSheetPlacement({
            item,
            items: entry.items,
            placements: entry.placedItems,
            sheetWidth: entry.width,
            sheetHeight: entry.height,
            sheetPolygon: entry.polygon,
            boundaryOffset: margin.value,
            clearance: margin.value
          });
          entry.placedItems.push({
            item_id: item.id,
            transformation: { rotation: 0, translation: [start.x, start.y] }
          });
          selectPlacement(entry.id, entry.placedItems.length - 1);
        }
        entry.dirty = true;
        history.commit();
      }

      // ---- drag and pan ---------------------------------------------------------

      let dragFrame = 0;
      let pendingEvent = null;

      function startDrag(event, sheetId, index) {
        const entry = entryOf(sheetId);
        if (!entry?.writable) return;
        const frame = sheetFrames.value.find(row => row.entry.id === sheetId);
        if (!frame) return;
        const pointer = localPoint(frame, event);
        const transform = sheetPlacementTransform(entry.placedItems[index]);
        selectPlacement(sheetId, index);
        dragState.value = {
          sheetId,
          index,
          start: JSON.stringify(entry.placedItems[index]),
          pointerId: event.pointerId,
          dx: pointer.x - transform.x,
          dy: pointer.y - transform.y
        };
        svgRef.value?.setPointerCapture?.(event.pointerId);
      }

      // Snap resolution costs a polygon sweep per candidate, so drags
      // compute once per animation frame — pointermove fires far more often.
      function dragPlacement(event) {
        if (!dragState.value) return;
        pendingEvent = event;
        if (!dragFrame) dragFrame = requestAnimationFrame(applyDragFrame);
      }

      function applyDragFrame() {
        dragFrame = 0;
        const event = pendingEvent;
        pendingEvent = null;
        const drag = dragState.value;
        if (!event || !drag || drag.pointerId !== event.pointerId) return;
        const entry = entryOf(drag.sheetId);
        const frame = sheetFrames.value.find(row => row.entry.id === drag.sheetId);
        if (!entry || !frame) return;
        const point = canvasPoint(event);
        const target = frameAt(point);
        if (target && target.entry.id === drag.sheetId) {
          // Magnetic sweep inside the origin sheet.
          const bounded = magneticSheetPlacement({
            items: entry.items,
            placements: entry.placedItems,
            index: drag.index,
            x: point.x - frame.x - drag.dx,
            y: point.y - frame.y - drag.dy,
            sheetWidth: entry.width,
            sheetHeight: entry.height,
            sheetPolygon: entry.polygon,
            boundaryOffset: margin.value,
            clearance: margin.value
          });
          if (bounded) {
            entry.placedItems[drag.index] = placementWithTranslation(entry.placedItems[drag.index], bounded.x, bounded.y);
          }
        } else {
          // Over another sheet or open canvas the placement free-follows
          // the pointer; the drop decides its record.
          entry.placedItems[drag.index] = placementWithTranslation(
            entry.placedItems[drag.index],
            point.x - frame.x - drag.dx,
            point.y - frame.y - drag.dy
          );
        }
      }

      function finishDrag(event) {
        const drag = dragState.value;
        if (drag?.pointerId !== event.pointerId) return;
        dragState.value = null;
        pendingEvent = null;
        if (dragFrame) {
          cancelAnimationFrame(dragFrame);
          dragFrame = 0;
        }
        const entry = entryOf(drag.sheetId);
        if (!entry) return;
        const target = frameAt(canvasPoint(event));
        const moved = JSON.stringify(entry.placedItems[drag.index]) !== drag.start;
        if (!moved) return;
        if (target && target.entry.id !== drag.sheetId && entry.writable && target.entry.writable) {
          movePlacementToSheet(entry, target.entry, drag.index);
          return;
        }
        if (!target) {
          entry.placedItems[drag.index] = JSON.parse(drag.start);
          return;
        }
        entry.dirty = true;
        history.commit();
      }

      // A drop over another sheet moves the placement between records:
      // the source item travels with it and the target sheet's free
      // sweep places it — both records commit on the next save.
      function movePlacementToSheet(source, target, index) {
        const placement = source.placedItems[index];
        const item = sheetPlacementSource(source.items, placement);
        if (!placement) return;
        const carriedItems = target.items.some(entry => String(entry.id) === String(placement.item_id))
          ? target.items
          : [...target.items, item];
        const start = freeSheetPlacement({
          item,
          items: carriedItems,
          placements: target.placedItems,
          sheetWidth: target.width,
          sheetHeight: target.height,
          sheetPolygon: target.polygon,
          boundaryOffset: margin.value,
          clearance: margin.value
        });
        source.placedItems.splice(index, 1);
        target.items = carriedItems;
        target.placedItems.push({
          ...placement,
          transformation: {
            ...(placement.transformation || {}),
            translation: [start.x, start.y]
          }
        });
        source.dirty = true;
        target.dirty = true;
        activeSheetId.value = target.id;
        selection.value = { type: 'placement', sheet: target.id, placement: target.placedItems.length - 1 };
        history.commit();
      }

      function startPan(event) {
        if (event.button !== 0 && event.button !== 1) return;
        if (event.button === 1) event.preventDefault();
        panState.value = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          cx: view.value.cx,
          cy: view.value.cy,
          moved: false
        };
        svgRef.value?.setPointerCapture?.(event.pointerId);
      }

      function movePan(event) {
        const pan = panState.value;
        if (!pan || pan.pointerId !== event.pointerId) return;
        const dx = event.clientX - pan.startX;
        const dy = event.clientY - pan.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) pan.moved = true;
        view.value = { ...view.value, cx: pan.cx - dx / view.value.k, cy: pan.cy - dy / view.value.k };
      }

      function finishPan(event) {
        const pan = panState.value;
        if (pan?.pointerId !== event.pointerId) return;
        panState.value = null;
        return pan.moved;
      }

      // ---- save -------------------------------------------------------------------

      async function save() {
        const dirty = sheets.value.filter(entry => entry.dirty);
        if (!dirty.length) return;
        saving.value = true;
        try {
          for (const entry of dirty) {
            const { geometry, relations } = recomputeSheetLayout(entry.record, {
              items: entry.items,
              placedItems: entry.placedItems
            });
            await props.persistence.patch(entry.record, { fields: { geometry }, relations });
            entry.record = { ...entry.record, fields: { ...entry.record.fields, geometry } };
            entry.dirty = false;
          }
          notify({ severity: 'success', summary: t('common.success'), detail: t('sheetDesign.layoutSaved'), life: 2500 });
        } catch (error) {
          notify({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || t('sheetDesign.layoutSaveFailed') });
        } finally {
          saving.value = false;
        }
      }

      // ---- chrome -------------------------------------------------------------------

      const documentDockItems = computed(() => [
        {
          icon: 'pi pi-pencil',
          label: t('common.rename'),
          hasPopup: true,
          disabled: !activeSheetEntry.value?.writable,
          onClick: openRenameDock
        },
        { separator: true },
        {
          icon: 'pi pi-save',
          label: t('common.save'),
          disabled: saving.value || !dirtyCount.value,
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
          onClick: () => zoomAt(svgSize.value.w / 2, svgSize.value.h / 2, 1 / 1.25)
        },
        {
          icon: 'pi pi-search-plus',
          label: t('drawing.zoomIn'),
          onClick: () => zoomAt(svgSize.value.w / 2, svgSize.value.h / 2, 1.25)
        },
        {
          icon: 'pi pi-times-circle',
          label: t('drawing.resetView'),
          onClick: fitView
        }
      ]);

      const layerRows = computed(() => layerCodes.value.map(code => ({
        key: code,
        code,
        label: occsLayerExportName(code) || code,
        color: resolvedStyle(code).color
      })));

      const speedDialItems = computed(() => {
        const designId = selectedSource.value?.design_id;
        return [
          designId
            ? {
              icon: 'pi pi-external-link',
              label: t('common.open'),
              command: openSelectedDesign
            }
            : null,
          {
            icon: 'pi pi-refresh',
            label: t('common.rotate'),
            disabled: !selectedEntry.value?.writable,
            command: rotateSelected
          },
          {
            icon: 'pi pi-trash',
            label: t('common.delete'),
            disabled: !selectedEntry.value?.writable,
            command: removeSelected
          }
        ].filter(Boolean);
      });

      // The selection's action dial anchors at the placement's top-right
      // corner in screen space; SVG geometry changes (drag, zoom) recompute
      // it through the render pass.
      function speedDialAnchor() {
        const svg = svgRef.value;
        const matrix = svg?.getScreenCTM?.();
        const selectionValue = selection.value;
        const frame = selectionValue ? sheetFrames.value.find(row => row.entry.id === selectionValue.sheet) : null;
        if (!matrix || !svg || !frame || !selectedTransform.value || !selectedBounds.value) return null;
        const canvas = svg.getBoundingClientRect();
        const point = new DOMPoint(
          frame.x + selectedTransform.value.x + selectedBounds.value.maxX,
          frame.y + LABEL_HEIGHT + selectedTransform.value.y + selectedBounds.value.minY
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

      // ---- sheet rendering -----------------------------------------------------------

      function normalizeSheetRing(points = []) {
        const normalized = (Array.isArray(points) ? points : [])
          .map(point => Array.isArray(point) && point.length >= 2 ? [Number(point[0]), Number(point[1])] : null)
          .filter(point => point && Number.isFinite(point[0]) && Number.isFinite(point[1]));
        return normalized.length < 3 ? null : normalized;
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

      function placementSvgTransform(placement) {
        const transform = sheetPlacementTransform(placement);
        return `translate(${transform.x} ${transform.y}) rotate(${transform.rotation})`;
      }

      function renderPlacement(entry, placement, index) {
        const selected = selection.value?.type === 'placement' &&
          selection.value.sheet === entry.id && selection.value.placement === index;
        const layers = placementLayers(entry, placement)
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
          key: `${entry.id}:${placementKey(placement, index)}`,
          transform: placementSvgTransform(placement),
          class: 'cursor-move',
          tabindex: 0,
          onPointerdown: event => {
            event.stopPropagation();
            startDrag(event, entry.id, index);
          },
          onFocus: () => { selectPlacement(entry.id, index); },
          onKeydown: event => {
            if (event.key !== 'Delete' && event.key !== 'Backspace') return;
            event.stopPropagation();
            event.preventDefault();
            removePlacement(entry.id, index);
          }
        }, [
          // The face grab target — pointer-events: fill hit-tests the
          // unpainted interior.
          h('polygon', {
            points: placementPoints(entry, placement),
            fill: 'none',
            stroke: 'none',
            'pointer-events': 'fill'
          }),
          ...layers,
          !placementHasContour(entry, placement) && layerVisible('contour.cassette_face') ? h('polygon', {
            points: placementPoints(entry, placement),
            fill: 'none',
            stroke: fallbackPlacementStyle.value.color,
            'stroke-width': displayStrokeWidth(fallbackPlacementStyle.value.weight),
            'stroke-dasharray': fallbackPlacementStyle.value.dasharray,
            'vector-effect': 'non-scaling-stroke'
          }) : null,
          selected ? h('polygon', {
            points: placementPoints(entry, placement),
            fill: 'var(--p-primary-color)',
            'fill-opacity': 0.1,
            stroke: 'var(--p-primary-color)',
            'stroke-width': 2,
            'vector-effect': 'non-scaling-stroke'
          }) : null
        ]);
      }

      function sheetPolygonPoints(entry) {
        return entry.polygon?.outer?.map(point => point.join(',')).join(' ') || '';
      }

      function renderSheetShape(entry, filled) {
        const stroke = sheetBoundaryStyle.value;
        const common = filled ? { fill: filled } : {
          fill: 'none',
          stroke: stroke.color,
          'stroke-width': displayStrokeWidth(stroke.weight, 2),
          'stroke-dasharray': stroke.dasharray,
          'vector-effect': 'non-scaling-stroke'
        };
        return sheetPolygonPoints(entry)
          ? h('polygon', { points: sheetPolygonPoints(entry), ...common })
          : h('rect', { x: 0, y: 0, width: entry.width, height: entry.height, ...common });
      }

      function renderSheet(frame) {
        const entry = frame.entry;
        const selected = selection.value?.type === 'sheet' && selection.value.sheet === entry.id;
        const active = activeSheetId.value === entry.id;
        const labelColor = active ? 'var(--p-primary-color)' : 'var(--p-text-muted-color)';
        const drag = dragState.value;
        const dragHere = drag?.sheetId === entry.id;
        return h('g', {
          key: entry.id,
          transform: `translate(${frame.x} ${frame.y})`,
          class: 'touch-none'
        }, [
          h('text', {
            x: 0,
            y: LABEL_HEIGHT * 0.55,
            fill: labelColor,
            'font-size': LABEL_HEIGHT * 0.45,
            class: 'select-none',
            'pointer-events': 'none'
          }, `${sheetNameOf(entry)}${entry.dirty ? ' •' : ''}`),
          h('g', { transform: `translate(0 ${LABEL_HEIGHT})` }, [
            h('rect', {
              x: 0,
              y: 0,
              width: entry.width,
              height: entry.height,
              fill: 'var(--p-content-background)',
              class: 'cursor-grab',
              onPointerdown: event => {
                event.stopPropagation();
                selectSheet(entry.id);
                startPan(event);
              }
            }),
            h('rect', {
              x: 0,
              y: 0,
              width: entry.width,
              height: entry.height,
              fill: `url(#sheet-layout-grid)`,
              'pointer-events': 'none'
            }),
            layerVisible('contour.material_sheet') ? renderSheetShape(entry, null) : null,
            selected ? h('rect', {
              x: 0,
              y: 0,
              width: entry.width,
              height: entry.height,
              fill: 'none',
              stroke: 'var(--p-primary-color)',
              'stroke-width': 2,
              'stroke-dasharray': '10 6',
              'vector-effect': 'non-scaling-stroke',
              'pointer-events': 'none'
            }) : null,
            dragHere && selectedSnapPoint.value ? h('g', { 'pointer-events': 'none' }, [
              h('line', {
                x1: selectedSnapPoint.value.x, y1: 0,
                x2: selectedSnapPoint.value.x, y2: entry.height,
                stroke: 'var(--p-primary-color)', 'stroke-dasharray': '4 4', 'vector-effect': 'non-scaling-stroke'
              }),
              h('line', {
                x1: 0, y1: selectedSnapPoint.value.y,
                x2: entry.width, y2: selectedSnapPoint.value.y,
                stroke: 'var(--p-primary-color)', 'stroke-dasharray': '4 4', 'vector-effect': 'non-scaling-stroke'
              })
            ]) : null,
            ...entry.placedItems.map((placement, index) => renderPlacement(entry, placement, index))
          ])
        ]);
      }

      // Snap guides follow the dragged placement while it stays inside its
      // origin sheet.
      const selectedSnapPoint = computed(() => {
        const drag = dragState.value;
        if (!drag) return null;
        const entry = entryOf(drag.sheetId);
        const placement = entry?.placedItems[drag.index];
        return placement ? sheetPlacementTransform(placement) : null;
      });

      function renderCanvas() {
        return h('svg', {
          ref: svgRef,
          class: 'h-full w-full touch-none',
          viewBox: viewBox.value,
          role: 'application',
          'aria-label': t('sheetDesign.editor'),
          onWheel,
          onPointerdown: event => {
            clearSelection();
            startPan(event);
          },
          onPointermove: event => {
            dragPlacement(event);
            movePan(event);
          },
          onPointerup: event => {
            finishDrag(event);
            finishPan(event);
          },
          onPointercancel: event => {
            finishDrag(event);
            finishPan(event);
          },
          onKeydown: event => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              event.preventDefault();
              dragState.value = null;
              clearSelection();
            }
            if (event.key === 'Delete' || event.key === 'Backspace') {
              if (selection.value?.type !== 'placement') return;
              event.stopPropagation();
              event.preventDefault();
              removePlacement(selection.value.sheet, selection.value.placement);
            }
          }
        }, [
          h('defs', [
            h('pattern', {
              id: 'sheet-layout-grid',
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
          ...sheetFrames.value.map(renderSheet)
        ]);
      }

      // ---- panels ------------------------------------------------------------------

      const factRow = (label, value) => h('div', { class: 'flex items-baseline justify-between gap-3' }, [
        h('span', { class: 'shrink-0 text-muted' }, label),
        h('span', { class: 'min-w-0 truncate font-medium', title: String(value) }, String(value))
      ]);
      const rounded = value => Math.round(Number(value) * 10) / 10;

      const renderPalette = () => h('aside', { class: 'flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3' }, [
        h('div', { class: 'flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto' }, [
          h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
            h('small', { class: 'text-muted text-supporting' }, t('sheetDesign.sheetDesigns')),
            h('div', { class: 'flex min-w-0 items-start gap-2' }, [
              h(components.InstanceSelect, {
                modelValue: selectedSheetId.value,
                'onUpdate:modelValue': value => { selectedSheetId.value = value; },
                options: sheetOptions.value,
                optionLabel: 'label',
                optionValue: 'value',
                typeId: 'sheet-design',
                filter: true,
                class: 'min-w-0 flex-1',
                placeholder: t('sheetDesign.selectSheet')
              }),
              h(components.Button, {
                icon: 'pi pi-plus',
                severity: 'secondary',
                outlined: true,
                rounded: true,
                size: 'small',
                'aria-label': t('sheetDesign.addSheet'),
                disabled: !selectedSheetId.value,
                onClick: addSelectedSheet
              }),
              h(components.Button, {
                icon: 'pi pi-th-large',
                severity: 'secondary',
                outlined: true,
                rounded: true,
                size: 'small',
                'aria-label': t('sheetDesign.addAllSheets'),
                disabled: !sheetOptions.value.length,
                onClick: addAllSheets
              })
            ])
          ]),
          h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
            h('small', { class: 'text-muted text-supporting' }, t('sheetDesign.designs')),
            h('div', { class: 'flex min-w-0 items-start gap-2' }, [
              h(components.InstanceSelect, {
                modelValue: selectedDesignId.value,
                'onUpdate:modelValue': value => { selectedDesignId.value = value; },
                options: designOptions.value,
                optionLabel: 'label',
                optionValue: 'value',
                typeId: 'cassette-design',
                filter: true,
                class: 'min-w-0 flex-1',
                placeholder: t('sheetDesign.selectDesign')
              }),
              h(components.Button, {
                icon: 'pi pi-plus',
                severity: 'secondary',
                outlined: true,
                rounded: true,
                size: 'small',
                'aria-label': t('sheetDesign.addDesign'),
                disabled: !activeSheetEntry.value?.writable || !selectedDesignId.value,
                onClick: addSelectedDesign
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
              disabled: !activeSheetEntry.value?.writable,
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
          selectedPlacement.value && selectedEntry.value
            ? [
              h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
                h('small', { class: 'text-muted text-supporting' }, t('sheetDesign.design')),
                h('div', { class: 'flex min-w-0 items-center gap-2' }, [
                  h('span', {
                    class: 'min-w-0 flex-1 truncate font-medium',
                    title: selectedDesignRecord.value?.name || selectedSource.value?.name || ''
                  }, selectedDesignRecord.value?.name || selectedSource.value?.name || ''),
                  selectedDesignRecord.value
                    ? h(components.Button, {
                      icon: 'pi pi-external-link',
                      severity: 'secondary',
                      text: true,
                      rounded: true,
                      size: 'small',
                      'aria-label': t('common.open'),
                      onClick: openSelectedDesign
                    })
                    : null
                ])
              ]),
              h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
                ...selectedBounds.value ? [
                  factRow(t('sheetDesign.size'), `${rounded(selectedBounds.value.width)}×${rounded(selectedBounds.value.height)} mm`)
                ] : [],
                ...selectedTransform.value ? [
                  factRow(t('sheetDesign.position'), `${rounded(selectedTransform.value.x)}, ${rounded(selectedTransform.value.y)} mm`),
                  factRow(t('sheetDesign.rotation'), `${Math.round(((selectedTransform.value.rotation % 360) + 360) % 360)}°`)
                ] : [],
                factRow(t('sheetDesign.sheet'), sheetNameOf(selectedEntry.value))
              ])
            ]
            : selection.value?.type === 'sheet' && selectedEntry.value
              ? [
                h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
                  h('small', { class: 'text-muted text-supporting' }, t('sheetDesign.sheet')),
                  h('span', {
                    class: 'min-w-0 truncate font-medium',
                    title: sheetNameOf(selectedEntry.value)
                  }, sheetNameOf(selectedEntry.value)),
                  factRow(t('sheetDesign.size'), `${rounded(selectedEntry.value.width)}×${rounded(selectedEntry.value.height)} mm`),
                  factRow(t('sheetDesign.placements'), selectedEntry.value.placedItems.length),
                  factRow(t('sheetDesign.designs'),
                    new Set(selectedEntry.value.placedItems
                      .map(placement => sheetPlacementSource(selectedEntry.value.items, placement)?.design_id)
                      .filter(Boolean)).size)
                ]),
                h(components.Button, {
                  icon: 'pi pi-times',
                  severity: 'secondary',
                  outlined: true,
                  size: 'small',
                  label: t('sheetDesign.removeSheet'),
                  disabled: selectedEntry.value.dirty || sheets.value.length <= 1,
                  onClick: () => removeSheetFromCanvas(selectedEntry.value)
                })
              ]
              : activeSheetEntry.value
                ? [
                  h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
                    h('small', { class: 'text-muted text-supporting' }, t('sheetDesign.sheet')),
                    factRow(t('sheetDesign.size'), `${rounded(activeSheetEntry.value.width)}×${rounded(activeSheetEntry.value.height)} mm`),
                    factRow(t('sheetDesign.placements'), activeSheetEntry.value.placedItems.length),
                    factRow(t('sheetDesign.designs'),
                      new Set(activeSheetEntry.value.placedItems
                        .map(placement => sheetPlacementSource(activeSheetEntry.value.items, placement)?.design_id)
                        .filter(Boolean)).size)
                  ])
                ]
                : [])
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
            h('div', { class: 'relative h-full w-full p-3' }, [
              renderCanvas(),
              renderSpeedDial(),
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
// past stack and the mutated state becomes the next baseline.
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
