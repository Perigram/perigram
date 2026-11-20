// The facade plugin's sheet-design editor surface (surface contract 4).
// The mounted module receives the opened record and the generic
// persistence callbacks — never stores, routing, or auth; cross-type
// reads (layer standards, pen templates, cassette designs, lineage
// siblings) ride the host's query transport, opening a placed design
// rides the host's workspace-open channel.
// One canvas carries the working set: the opened record beside its
// lineage family — sheets sharing the opened record's parents, scoped
// by the declared containment's lineage keys (the facade SPEC's family
// law). Sheets sit on a wrapped rack and stay movable and rotatable;
// every edited record commits its own patch on save.
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
const QUARTER_TURN = 90;

const degToRad = degrees => degrees * Math.PI / 180;
const lineagValueId = value => (
  value == null ? '' : String(typeof value === 'object' ? (value.id ?? '') : value)
);

// Exact lineage equality: two records share their whole parent map.
export function sameLineage(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (lineagValueId(a[key]) !== lineagValueId(b[key])) return false;
  }
  return true;
}

// The opened record's family filter: every lineage entry it carries,
// handed to the list transport (declared keys filter server-side;
// undeclared keys drop as transport noise) and re-verified on the rows.
function familyFiltersOf(record) {
  const filters = {};
  for (const [key, value] of Object.entries(record?.lineage || {})) {
    const id = lineagValueId(value);
    if (id) filters[`lineage.${key}`] = id;
  }
  return filters;
}

// A row joins the family when it matches every lineage entry of the
// opened record — same parents, same family.
function sameFamily(row, record) {
  const lineage = record?.lineage || {};
  return Object.entries(lineage).every(([key, value]) =>
    lineagValueId(row?.lineage?.[key]) === lineagValueId(value));
}

export default function createSurface({ vue, components, locale, queries, records, notify, access, open }) {
  const { h, ref, reactive, computed, watch, onMounted, onBeforeUnmount, defineComponent } = vue;
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
      const sheetDragState = ref(null);
      const panState = ref(null);
      const saving = ref(false);
      const designs = ref([]);
      const cutPlans = ref([]);
      const sheetPool = ref([]);
      const familyRows = ref([]);
      const view = ref({ cx: 610, cy: 1220, k: 0.25 });
      const svgSize = ref({ w: 800, h: 600 });
      const localNames = ref({});
      const standards = ref([]);
      const pens = ref([]);
      const margin = ref(0);
      const visibleLayerCodes = ref([]);
      const frameState = ref({});

      // The picker's options: unplaced family members first, then the
      // org's sheets — picking is the explicit add channel, one at a
      // time.
      const sheetOptions = computed(() => {
        const onCanvas = new Set(sheets.value.map(entry => entry.id));
        const familyIds = new Set(familyRows.value.map(row => String(row._id)));
        const optionOf = row => ({ value: String(row._id), entity: row, typeId: 'sheet-design' });
        return [
          ...familyRows.value.filter(row => !onCanvas.has(String(row._id))).map(optionOf),
          ...sheetPool.value
            .filter(row => !onCanvas.has(String(row._id)) && !familyIds.has(String(row._id)))
            .map(optionOf)
        ];
      });
      const pendingFamilySheets = computed(() => familyRows.value
        .filter(row => !sheets.value.some(entry => entry.id === String(row._id))));
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
        value: design._id?.toString(),
        entity: design,
        typeId: 'cassette-design'
      })));

      onMounted(() => {
        queries.list('layer-standard').then(rows => { standards.value = rows || []; }).catch(() => {});
        queries.list('pen-template').then(rows => { pens.value = rows || []; }).catch(() => {});
        queries.list('cassette-design').then(rows => { designs.value = rows || []; }).catch(() => {});
        loadCutPlans();
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
        frameState.value = {};
        familyRows.value = [];
        loadFamily(props.record);
        loadSheetPool();
        history.reset();
        reflowSheets();
        fitView();
      }

      // The picker's pool: the org's sheets, offered beside unplaced
      // family members — picking is the explicit add channel.
      function loadSheetPool() {
        queries.list('sheet-design').then(rows => { sheetPool.value = rows || []; }).catch(() => {});
      }

      function loadCutPlans() {
        queries.list('sheet-cut-plan').then(rows => { cutPlans.value = rows || []; }).catch(() => {});
      }

      function cutsOf(sheetId) {
        return cutPlans.value.filter(plan => String(plan.fields?.design?.id ?? plan.fields?.design ?? '') === String(sheetId));
      }

      // The family joins the canvas beside the opened record: same
      // lineage parents, already on the rack. A record with no lineage
      // edits alone — the working set never falls back to the org pool.
      function loadFamily(record) {
        const filters = familyFiltersOf(record);
        if (!Object.keys(filters).length) return;
        queries.list('sheet-design', filters)
          .then(rows => {
            familyRows.value = (rows || []).filter(row =>
              String(row._id) !== String(record?._id || '') && sameFamily(row, record));
            for (const row of familyRows.value) {
              if (!sheets.value.some(entry => entry.id === String(row._id))) {
                sheets.value.push(sheetEntry(row));
              }
            }
            reflowSheets();
            fitView();
          })
          .catch(() => {});
      }

      // ---- canvas geometry -------------------------------------------------

      // The wrapped rack: sheets flow into a near-square grid of uniform
      // cells; a sheet the user moved or rotated keeps its frame, and a
      // sheet joining the set takes the first cell no kept frame
      // occupies. Frame coordinates are canvas space; rotation is
      // degrees about the sheet content's center.
      function reflowSheets() {
        const entries = sheets.value;
        const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(entries.length, 1))));
        const occupied = [];
        const framesById = {};
        const mark = (frame, entry) => {
          framesById[entry.id] = frame;
          occupied.push({ x: frame.x, y: frame.y, w: entry.width, h: LABEL_HEIGHT + entry.height });
        };
        for (const entry of entries) {
          const frame = frameState.value[entry.id];
          if (frame) mark({ ...frame }, entry);
        }
        const cellWidth = Math.max(...entries.map(entry => entry.width), 1) + SHEET_GAP;
        const cellHeight = Math.max(...entries.map(entry => LABEL_HEIGHT + entry.height), 1) + SHEET_GAP;
        for (const entry of entries) {
          if (framesById[entry.id]) continue;
          for (let slot = 0; ; slot++) {
            const x = (slot % columns) * cellWidth;
            const y = Math.floor(slot / columns) * cellHeight;
            const free = !occupied.some(area =>
              x < area.x + area.w && x + entry.width > area.x &&
              y < area.y + area.h && y + LABEL_HEIGHT + entry.height > area.y);
            if (free) {
              mark({ x, y, rotation: 0 }, entry);
              break;
            }
          }
        }
        frameState.value = framesById;
      }

      const sheetFrames = computed(() => sheets.value.map(entry => ({
        entry,
        width: entry.width,
        height: entry.height,
        ...(frameState.value[entry.id] || { x: 0, y: 0, rotation: 0 })
      })));

      // The frame's rotation pivot: the content rect's center in canvas
      // space (label band included in the frame, content below it).
      function frameCenter(frame) {
        return {
          x: frame.x + frame.width / 2,
          y: frame.y + LABEL_HEIGHT + frame.height / 2
        };
      }

      function rotatePoint(point, radians) {
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
      }

      // Frame-local coordinates (label band at the top, content under
      // it) of a canvas point, through the frame's inverse rotation.
      function frameLocalPoint(frame, point) {
        const center = frameCenter(frame);
        const rotated = rotatePoint(
          { x: point.x - center.x, y: point.y - center.y },
          -degToRad(frame.rotation || 0)
        );
        return { x: center.x + rotated.x - frame.x, y: center.y + rotated.y - frame.y };
      }

      // Canvas coordinates of a frame-local point, through the frame's
      // rotation — the render transform's forward direction.
      function frameCanvasPoint(frame, point) {
        const center = frameCenter(frame);
        const rotated = rotatePoint(
          { x: frame.x + point.x - center.x, y: frame.y + point.y - center.y },
          degToRad(frame.rotation || 0)
        );
        return { x: center.x + rotated.x, y: center.y + rotated.y };
      }

      function frameCorners(frame) {
        const width = frame.width;
        const height = LABEL_HEIGHT + frame.height;
        return [
          frameCanvasPoint(frame, { x: 0, y: 0 }),
          frameCanvasPoint(frame, { x: width, y: 0 }),
          frameCanvasPoint(frame, { x: width, y: height }),
          frameCanvasPoint(frame, { x: 0, y: height })
        ];
      }

      const canvasBounds = computed(() => {
        const frames = sheetFrames.value;
        if (!frames.length) return { minX: 0, minY: 0, maxX: 2440, maxY: 1220 };
        const corners = frames.flatMap(frameCorners);
        return {
          minX: Math.min(...corners.map(point => point.x)),
          minY: Math.min(...corners.map(point => point.y)),
          maxX: Math.max(...corners.map(point => point.x)),
          maxY: Math.max(...corners.map(point => point.y))
        };
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
          event.deltaY > 0 ? 1 / 1.1 : 1 / 0.9
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
        return sheetFrames.value.find(frame => {
          const local = frameLocalPoint(frame, point);
          return local.x >= 0 && local.x <= frame.width &&
            local.y >= 0 && local.y <= LABEL_HEIGHT + frame.height;
        }) || null;
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
        reflowSheets();
        fitView();
        return true;
      }

      function addSheetById(id) {
        const record = [...familyRows.value, ...sheetPool.value]
          .find(row => String(row._id) === String(id));
        if (record) addSheetRecord(record);
      }

      function addAllFamilySheets() {
        let added = false;
        for (const row of pendingFamilySheets.value) added = addSheetRecord(row) || added;
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
        reflowSheets();
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

      // The workspace opens editor tabs from an id stub; the record body
      // hydrates afterwards under the same id. The immediate run needs
      // the history and geometry declarations above it.
      watch(
        () => [props.record?._id, Boolean(props.record?.fields?.geometry)],
        resetCanvas,
        { immediate: true }
      );

      // ---- chrome actions -----------------------------------------------------

      function applyRename(name) {
        const entry = activeSheetEntry.value;
        const next = String(name ?? '').trim();
        if (!entry || !next || next === displayName.value) return;
        props.persistence.rename(entry.record, next)
          .then(() => { localNames.value = { ...localNames.value, [entry.id]: next }; })
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
        const local = frameLocalPoint(frame, canvasPoint(event));
        // Placement coordinates sit under the label band.
        return { x: local.x, y: local.y - LABEL_HEIGHT };
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

      function addDesignById(id) {
        const entry = activeSheetEntry.value;
        const design = designs.value.find(item => String(item._id) === String(id));
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

      // A sheet's frame moves by its label band — arrangement, not a
      // record mutation; read-only sheets stay movable.
      function startSheetDrag(event, entry) {
        event.stopPropagation();
        selectSheet(entry.id);
        const frame = sheetFrames.value.find(row => row.entry.id === entry.id);
        if (!frame) return;
        sheetDragState.value = {
          id: entry.id,
          pointerId: event.pointerId,
          origin: canvasPoint(event),
          frame: { ...frame }
        };
        svgRef.value?.setPointerCapture?.(event.pointerId);
      }

      function dragSheet(event) {
        const drag = sheetDragState.value;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const point = canvasPoint(event);
        frameState.value = {
          ...frameState.value,
          [drag.id]: {
            ...frameState.value[drag.id],
            x: drag.frame.x + point.x - drag.origin.x,
            y: drag.frame.y + point.y - drag.origin.y
          }
        };
      }

      function finishSheetDrag(event) {
        const drag = sheetDragState.value;
        if (drag?.pointerId !== event.pointerId) return false;
        sheetDragState.value = null;
        fitView();
        return true;
      }

      // A selected sheet rotates a quarter turn about its content center.
      function rotateSheet() {
        const selectionValue = selection.value;
        const entry = selectionValue?.type === 'sheet' ? entryOf(selectionValue.sheet) : null;
        if (!entry) return;
        const frame = frameState.value[entry.id];
        if (!frame) return;
        frameState.value = {
          ...frameState.value,
          [entry.id]: { ...frame, rotation: ((frame.rotation || 0) + QUARTER_TURN) % 360 }
        };
        fitView();
      }

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
        const pointer = localPoint(frame, event);
        const target = frameAt(point);
        if (target && target.entry.id === drag.sheetId) {
          // Magnetic sweep inside the origin sheet.
          const bounded = magneticSheetPlacement({
            items: entry.items,
            placements: entry.placedItems,
            index: drag.index,
            x: pointer.x - drag.dx,
            y: pointer.y - drag.dy,
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
            pointer.x - drag.dx,
            pointer.y - drag.dy
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

      // A stack is one sheet design behind many cuts. Splitting creates
      // the second sheet design and moves one cut onto it; the geometry
      // and the parts relation travel with the copy.
      async function splitStack(entry) {
        const cuts = cutsOf(entry.id);
        if (cuts.length < 2 || !entry.writable || !props.persistence || !records) return;
        try {
          const created = await props.persistence.createBlank();
          const newId = String(created?._id || created?.id || '');
          if (!newId) throw new Error('split created no sheet design');
          const updated = await props.persistence.patch(created, {
            fields: {
              geometry: entry.record?.fields?.geometry || null,
              compositionKey: entry.record?.fields?.compositionKey || null
            },
            relations: entry.record?.relations || {}
          });
          const name = entry.record?.fields?.name || t('sheetDesign.sheet');
          await props.persistence.rename(updated || created, `${name} 2`);
          const moved = cuts[cuts.length - 1];
          await records.update('sheet-cut-plan', String(moved._id || moved.id), {
            fields: { design: { type: 'sheet-design', id: newId } }
          });
          const copy = sheetEntry(updated || created);
          sheets.value.push(copy);
          activeSheetId.value = copy.id;
          loadCutPlans();
          reflowSheets();
          notify({ severity: 'success', summary: t('common.success'), detail: t('sheetDesign.splitStacked'), life: 2500 });
        } catch (error) {
          notify({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || t('sheetDesign.splitStackFailed') });
        }
      }

      // ---- chrome -------------------------------------------------------------------

      // The editor-page chrome api: the workspace file panel renders it —
      // the active sheet's name with in-place rename and the dirty-marked
      // save over every dirty sheet.
      const sheetChrome = Object.assign(
        reactive({
          name: computed(() => displayName.value || ''),
          dirty: computed(() => dirtyCount.value > 0),
          saving,
          diverged: false
        }),
        activeSheetEntry.value?.writable
          ? { save: () => save(), rename: name => applyRename(name) }
          : {}
      );

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
          onClick: () => zoomAt(svgSize.value.w / 2, svgSize.value.h / 2, 0.8)
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
        if (selection.value?.type === 'sheet') {
          return [{
            icon: 'pi pi-refresh',
            label: t('common.rotate'),
            command: rotateSheet
          }];
        }
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
      // corner (the sheet's, for a sheet selection) in screen space; SVG
      // geometry changes (drag, zoom, rotation) recompute it through the
      // render pass.
      function speedDialAnchor() {
        const svg = svgRef.value;
        const matrix = svg?.getScreenCTM?.();
        const selectionValue = selection.value;
        const frame = selectionValue ? sheetFrames.value.find(row => row.entry.id === selectionValue.sheet) : null;
        if (!matrix || !svg || !frame) return null;
        let corner;
        if (selectionValue.type === 'sheet') {
          corner = frameCanvasPoint(frame, { x: frame.width, y: 0 });
        } else {
          if (!selectedTransform.value || !selectedBounds.value) return null;
          corner = frameCanvasPoint(frame, {
            x: selectedTransform.value.x + selectedBounds.value.maxX,
            y: LABEL_HEIGHT + selectedTransform.value.y + selectedBounds.value.minY
          });
        }
        const canvas = svg.getBoundingClientRect();
        const point = new DOMPoint(corner.x, corner.y).matrixTransform(matrix);
        return {
          left: Math.min(Math.max(point.x - canvas.left, 48), Math.max(canvas.width - 48, 48)),
          top: Math.min(Math.max(point.y - canvas.top, 8), Math.max(canvas.height - 8, 8)),
          expandUp: point.y - canvas.top > 180
        };
      }

      function renderSpeedDial() {
        const anchored = selectedPlacement.value || selection.value?.type === 'sheet';
        const anchor = anchored ? speedDialAnchor() : null;
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
            if (event.shiftKey) {
              startPan(event);
              return;
            }
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
        const center = frameCenter(frame);
        return h('g', {
          key: entry.id,
          transform: `translate(${center.x} ${center.y}) rotate(${frame.rotation || 0}) translate(${-center.x} ${-center.y}) translate(${frame.x} ${frame.y})`,
          class: 'touch-none'
        }, [
          // The label band is the sheet's move handle.
          h('rect', {
            x: 0,
            y: 0,
            width: entry.width,
            height: LABEL_HEIGHT,
            fill: 'transparent',
            class: 'cursor-move',
            onPointerdown: event => startSheetDrag(event, entry)
          }),
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
            dragSheet(event);
            movePan(event);
          },
          onPointerup: event => {
            finishDrag(event);
            finishSheetDrag(event);
            finishPan(event);
          },
          onPointercancel: event => {
            finishDrag(event);
            finishSheetDrag(event);
            finishPan(event);
          },
          onKeydown: event => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              event.preventDefault();
              dragState.value = null;
              sheetDragState.value = null;
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


      const renderPalette = () => h('aside', { class: 'flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3' }, [
        h('div', { class: 'flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto' }, [
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

      const sectionLabel = label => h('small', { class: 'text-muted text-supporting' }, label);

      // The active sheet's distinct placed designs — the actual records
      // behind its placements.
      const activeSheetDesignIds = computed(() => {
        const entry = activeSheetEntry.value;
        if (!entry) return [];
        const ids = [];
        for (const placement of entry.placedItems) {
          const designId = sheetPlacementSource(entry.items, placement)?.design_id;
          const id = designId ? String(designId) : '';
          if (id && !ids.includes(id)) ids.push(id);
        }
        return ids;
      });

      const renderSheetTile = entry => h(components.InstanceInlineRef, {
        key: entry.id,
        type: 'sheet-design',
        entity: entry.record,
        id: entry.id,
        variant: 'tile',
        trace: true,
        active: activeSheetId.value === entry.id,
        selectable: true,
        onSelect: () => { selectSheet(entry.id); }
      }, {
        trailing: () => [
          cutsOf(entry.id).length > 1
            ? h(components.Button, {
              icon: 'pi pi-clone',
              severity: 'secondary',
              text: true,
              rounded: true,
              size: 'small',
              'aria-label': t('sheetDesign.splitStack'),
              disabled: !entry.writable,
              onClick: () => { splitStack(entry); }
            })
            : null,
          h(components.Button, {
            icon: 'pi pi-times',
            severity: 'secondary',
            text: true,
            rounded: true,
            size: 'small',
            'aria-label': t('sheetDesign.removeSheet'),
            disabled: entry.dirty || sheets.value.length <= 1,
            onClick: () => { removeSheetFromCanvas(entry); }
          })
        ]
      });

      const renderSheetsSection = () => h('section', { class: 'flex min-w-0 flex-col gap-3' }, [
        sectionLabel(t('sheetDesign.sheetDesigns')),
        ...sheets.value.map(renderSheetTile),
        sheetOptions.value.length
          ? h(components.InstanceSelect, {
              modelValue: null,
              options: sheetOptions.value,
              optionValue: 'value',
              typeId: 'sheet-design',
              placeholder: t('sheetDesign.selectSheet'),
              'onUpdate:modelValue': addSheetById
            })
          : null,
        pendingFamilySheets.value.length
          ? h(components.Button, {
              label: t('sheetDesign.addAllSheets'),
              icon: 'pi pi-clone',
              severity: 'secondary',
              outlined: true,
              size: 'small',
              class: 'w-full',
              onClick: addAllFamilySheets
            })
          : null
      ]);

      const renderDesignsSection = () => h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
        sectionLabel(t('sheetDesign.designs')),
        h(components.InstanceSelect, {
          modelValue: null,
          options: designOptions.value,
          optionValue: 'value',
          typeId: 'cassette-design',
          placeholder: t('sheetDesign.selectDesign'),
          disabled: !activeSheetEntry.value?.writable,
          'onUpdate:modelValue': addDesignById
        })
      ]);

      const renderInspector = () => h('aside', { class: 'flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3' }, [
        h('div', { class: 'flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto' }, [
          selectedPlacement.value && selectedEntry.value
            ? h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
                sectionLabel(t('sheetDesign.design')),
                h(components.InstanceInlineRef, {
                  type: 'cassette-design',
                  entity: selectedDesignRecord.value,
                  id: selectedSource.value?.design_id,
                  fetch: !selectedDesignRecord.value,
                  variant: 'tile'
                })
              ])
            : activeSheetEntry.value
              ? h('section', { class: 'flex min-w-0 flex-col gap-2' }, [
                  sectionLabel(t('sheetDesign.sheet')),
                  h(components.InstanceInlineRef, {
                    type: 'sheet-design',
                    entity: activeSheetEntry.value.record,
                    id: activeSheetEntry.value.id,
                    variant: 'tile'
                  }),
                  // The sheet's placed designs — the actual instances,
                  // one tile per distinct record.
                  ...activeSheetDesignIds.value.map(designId => h(components.InstanceInlineRef, {
                    key: designId,
                    type: 'cassette-design',
                    id: designId,
                    entity: designs.value.find(row => String(row._id) === designId) || null,
                    fetch: !designs.value.some(row => String(row._id) === designId),
                    variant: 'tile'
                  }))
                ])
              : null,
          renderDesignsSection(),
          renderSheetsSection()
        ])
      ]);

      return () => h(components.DesignerSurface, () => [
        h(components.DesignerWorkspace, {
          layout: 'lanes',
          workspaceId: 'sheet-design-editor',
          class: 'h-full',
          chrome: sheetChrome,
          canvasItems: canvasDockItems.value
        }, {
          palette: renderPalette,
          inspector: renderInspector,
          default: () => [
            h('div', { class: 'relative h-full w-full p-3' }, [
              renderCanvas(),
              renderSpeedDial()
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
