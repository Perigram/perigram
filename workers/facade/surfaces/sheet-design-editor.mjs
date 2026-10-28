// The facade plugin's sheet-design editor surface (surface contract 5).
// The mounted module receives the opened record and the generic
// persistence callbacks — never stores, routing, or auth; cross-type
// reads (layer standards, pen templates, cassette designs) ride the
// host's query transport, opening a placed design rides the host's
// workspace-open channel, and sheet lifecycle (blank constructs,
// record removal) rides the host's construct and remove transports.
// The canvas edits several sheet-design records at once (the facade
// SPEC's multi-sheet law): each panel is one record's sheet, placements
// drag within a sheet magnetically and between sheets by drop.
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

export default function createSurface({ vue, components, locale, queries, notify, access, open, construct, remove }) {
  const { h, ref, computed, watch, onMounted, defineComponent } = vue;
  const t = locale.t;

  if (!queries || !notify || !access || !open || !construct || !remove) {
    throw new Error('sheet-design-editor requires the contract-5 mount context');
  }

  return defineComponent({
    name: 'SheetDesignEditor',
    props: {
      record: { type: Object, default: null },
      persistence: { type: Object, default: null }
    },
    setup(props) {
      const sheets = ref([]);
      const activeSheet = ref(-1);
      const selection = ref({ sheet: -1, placement: -1 });
      const dragState = ref(null);
      const saving = ref(false);
      const constructing = ref(false);
      const designs = ref([]);
      const selectedDesignId = ref('');
      const viewZoom = ref(1);
      const localNames = ref({});
      const renameDraft = ref('');
      const standards = ref([]);
      const pens = ref([]);
      const margin = ref(0);
      const visibleLayerCodes = ref([]);
      const panelEls = new Map();

      const editable = computed(() => access.canWrite(props.record));

      onMounted(() => {
        queries.list('layer-standard').then(rows => { standards.value = rows || []; }).catch(() => {});
        queries.list('pen-template').then(rows => { pens.value = rows || []; }).catch(() => {});
        queries.list('cassette-design').then(rows => { designs.value = rows || []; }).catch(() => {});
      });

      function sheetPolygonOf(record) {
        return normalizeSheetPolygon(
          record?.fields?.geometry?.data?.sheetPolygon ||
          record?.fields?.geometry?.data?.sheet_polygon ||
          record?.fields?.geometry?.data?.polygon ||
          null
        );
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
          dirty: false
        };
      }

      // The working set: the opened record beside its sibling sheet
      // designs from the same read scope.
      function resetCanvas() {
        const opened = sheetEntry(props.record);
        selection.value = { sheet: -1, placement: -1 };
        activeSheet.value = 0;
        sheets.value = [opened];
        viewZoom.value = 1;
        queries.list('sheet-design').then(rows => {
          const siblings = (rows || [])
            .filter(row => String(row._id) !== opened.id)
            .map(row => sheetEntry(row));
          sheets.value = [opened, ...siblings];
          visibleLayerCodes.value = layerCodesOf(activeSheetEntry.value);
          history.reset();
        }).catch(() => {
          visibleLayerCodes.value = layerCodesOf(activeSheetEntry.value);
          history.reset();
        });
      }

      // The workspace opens editor tabs from an id stub; the record body
      // hydrates afterwards under the same id.
      watch(
        () => [props.record?._id, Boolean(props.record?.fields?.geometry)],
        resetCanvas,
        { immediate: true }
      );

      const activeSheetEntry = computed(() => sheets.value[activeSheet.value] || sheets.value[0] || null);
      const selectedPlacement = computed(() => {
        const { sheet, placement } = selection.value;
        const entry = sheets.value[sheet];
        return entry ? (entry.placedItems[placement] || null) : null;
      });
      const selectedSource = computed(() => {
        const { sheet, placement } = selection.value;
        const entry = sheets.value[sheet];
        return entry ? sheetPlacementSource(entry.items, entry.placedItems[placement] || {}) : null;
      });
      const selectedTransform = computed(() => selectedPlacement.value
        ? sheetPlacementTransform(selectedPlacement.value)
        : null);
      const selectedBounds = computed(() => {
        if (!selectedPlacement.value || !selectedSource.value || !selectedSheet.value) return null;
        return sheetItemBounds(
          selectedSource.value,
          selectedPlacement.value.transformation?.rotation ?? selectedPlacement.value.rotation ?? 0
        );
      });
      const selectedSheet = computed(() => sheets.value[selection.value.sheet] || null);
      const dirtyCount = computed(() => sheets.value.filter(entry => entry.dirty).length);
      const displayName = computed(() => {
        const entry = activeSheetEntry.value;
        return localNames.value[entry?.id] || entry?.record?.fields?.name || t('sheetDesign.editor');
      });

      const designOptions = computed(() => designs.value.map(design => ({
        label: design.name || design._id,
        value: design._id?.toString(),
        entity: design
      })));

      function sheetLayoutStateOf(record) {
        const result = JSON.parse(JSON.stringify(record?.fields?.geometry?.data || {}));
        const layout = result.solution?.layouts?.[0] || result.layouts?.[0] || {};
        return {
          items: Array.isArray(result.items) ? result.items : [],
          placedItems: layout.placed_items || layout.items || []
        };
      }

      function polygonBounds(polygon) {
        const outer = polygon?.outer || [];
        if (outer.length < 2) return {};
        const xs = outer.map(point => Number(point[0]) || 0);
        const ys = outer.map(point => Number(point[1]) || 0);
        return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      }

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

      // Layers that appear with later edits join the visible set; codes
      // that disappear leave it.
      const layerCodes = computed(() => layerCodesOf(activeSheetEntry.value));
      watch(layerCodes, (codes, previous) => {
        const known = new Set(previous || []);
        visibleLayerCodes.value = codes.filter(code => !known.has(code) || layerVisible(code));
      });

      function layerCodesOf(entry) {
        if (!entry) return [];
        return Array.from(new Set([
          'contour.material_sheet',
          'contour.cassette_face',
          ...entry.items.flatMap(item => (item.sourceLayers || []).map(sourceLayerCode))
        ].filter(Boolean)));
      }

      function sourceLayerCode(layer = {}) {
        return layer.standardCode || layer.code || layer.layer || layer.name || 'contour.cassette_face';
      }

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
        return resolvedLayerStyles.value.get(code) || { color: 'currentColor', weight: 1, dasharray: 'none' };
      }

      const sheetBoundaryStyle = computed(() => resolvedStyle('contour.material_sheet'));
      const fallbackPlacementStyle = computed(() => resolvedStyle('contour.cassette_face'));
      const selectedSnapPoint = computed(() => {
        const drag = dragState.value;
        if (!drag) return null;
        const entry = sheets.value[drag.sheet];
        const placement = entry?.placedItems[drag.placement];
        return placement ? sheetPlacementTransform(placement) : null;
      });

      function layerVisible(code) {
        return visibleLayerCodes.value.includes(code);
      }

      function updateVisibleLayerCodes(codes) {
        visibleLayerCodes.value = Array.isArray(codes) ? codes.filter(Boolean) : [];
      }

      // Layout history: snapshots are the canvas's serialized placements
      // (every sheet, keyed by record id); a record switch re-baselines.
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
          selection.value = { sheet: -1, placement: -1 };
        }
      });

      const dockMenu = ref(null);

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
        if (!Array.isArray(point) || !layer.geometry.text) return null;
        return { x: Number(point[0]) || 0, y: Number(point[1]) || 0, text: layer.geometry.text, fontSize: Number(layer.geometry.fontSize) || 12 };
      }

      function placementHasContour(entry, placement) {
        return placementLayers(entry, placement).some(layer => (
          /^(cut|contour)(\.|$)/.test(sourceLayerCode(layer)) && layerPoints(layer).length >= 3
        ));
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

      function sheetPoint(entry, event) {
        const svg = panelEls.get(entry.id);
        const matrix = svg?.getScreenCTM?.();
        if (!matrix) return { x: 0, y: 0 };
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        return { x: point.x, y: point.y };
      }

      function setPanelEl(entry, el) {
        if (el) panelEls.set(entry.id, el);
        else panelEls.delete(entry.id);
      }

      let dragFrame = 0;
      let pendingDragEvent = null;
      let dragMoved = false;

      function startDrag(event, sheetIndex, placementIndex) {
        if (!editable.value) return;
        const entry = sheets.value[sheetIndex];
        const pointer = sheetPoint(entry, event);
        const transform = sheetPlacementTransform(entry.placedItems[placementIndex]);
        activeSheet.value = sheetIndex;
        selection.value = { sheet: sheetIndex, placement: placementIndex };
        dragMoved = false;
        dragState.value = {
          sheet: sheetIndex,
          placement: placementIndex,
          pointerId: event.pointerId,
          dx: pointer.x - transform.x,
          dy: pointer.y - transform.y,
          clientX: event.clientX,
          clientY: event.clientY
        };
        panelEls.get(entry.id)?.setPointerCapture?.(event.pointerId);
      }

      // Snap resolution costs a polygon sweep per candidate, so drags
      // compute once per animation frame — pointermove fires far more often.
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
        drag.clientX = event.clientX;
        drag.clientY = event.clientY;
        const entry = sheets.value[drag.sheet];
        const pointer = sheetPoint(entry, event);
        const bounded = magneticSheetPlacement({
          items: entry.items,
          placements: entry.placedItems,
          index: drag.placement,
          x: pointer.x - drag.dx,
          y: pointer.y - drag.dy,
          sheetWidth: entry.width,
          sheetHeight: entry.height,
          sheetPolygon: entry.polygon,
          boundaryOffset: margin.value,
          clearance: margin.value
        });
        if (!bounded) return;
        const current = sheetPlacementTransform(entry.placedItems[drag.placement]);
        dragMoved = dragMoved || Math.abs(current.x - bounded.x) > 0.01 || Math.abs(current.y - bounded.y) > 0.01;
        entry.placedItems[drag.placement] = placementWithTranslation(entry.placedItems[drag.placement], bounded.x, bounded.y);
      }

      // A drop over another panel moves the placement between records:
      // the source item travels with it and the target sheet's free
      // sweep places it — both records commit on the next save.
      function finishDrag(event) {
        const drag = dragState.value;
        if (drag?.pointerId !== event.pointerId) return;
        endDrag();
        const target = panelIndexOf(event);
        if (!dragMoved) return;
        if (target >= 0 && target !== drag.sheet) {
          movePlacementToSheet(drag, target);
          return;
        }
        history.commit();
      }

      function panelIndexOf(event) {
        for (const [index, entry] of sheets.value.entries()) {
          const svg = panelEls.get(entry.id);
          const rect = svg?.getBoundingClientRect?.();
          if (!rect) continue;
          if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
            return index;
          }
        }
        return -1;
      }

      function movePlacementToSheet(drag, targetIndex) {
        const source = sheets.value[drag.sheet];
        const target = sheets.value[targetIndex];
        const placement = source.placedItems[drag.placement];
        const item = sheetPlacementSource(source.items, placement);
        if (!placement || !target || target === source) return;
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
        source.placedItems.splice(drag.placement, 1);
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
        activeSheet.value = targetIndex;
        selection.value = { sheet: targetIndex, placement: target.placedItems.length - 1 };
        history.commit();
      }

      function endDrag() {
        dragState.value = null;
        pendingDragEvent = null;
        if (dragFrame) {
          cancelAnimationFrame(dragFrame);
          dragFrame = 0;
        }
      }

      function removePlacement(sheetIndex, placementIndex) {
        if (!editable.value || placementIndex < 0) return;
        const entry = sheets.value[sheetIndex];
        if (!entry) return;
        entry.placedItems.splice(placementIndex, 1);
        entry.dirty = true;
        selection.value = { sheet: sheetIndex, placement: -1 };
        history.commit();
      }

      function removeSelected() {
        removePlacement(selection.value.sheet, selection.value.placement);
      }

      function rotateSelected() {
        const { sheet, placement } = selection.value;
        const entry = sheets.value[sheet];
        if (!editable.value || !entry || placement < 0) return;
        const rotated = rotateSheetPlacementQuarterTurn({
          items: entry.items,
          placements: entry.placedItems,
          index: placement,
          sheetWidth: entry.width,
          sheetHeight: entry.height,
          sheetPolygon: entry.polygon,
          boundaryOffset: margin.value,
          clearance: margin.value
        });
        if (rotated) {
          entry.placedItems[placement] = rotated;
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
        if (!entry || !design) return;
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
          selection.value = { sheet: activeSheet.value, placement: entry.placedItems.length - 1 };
        }
        entry.dirty = true;
        history.commit();
      }

      async function addSheet() {
        if (!editable.value || constructing.value) return;
        constructing.value = true;
        try {
          const record = await construct.run('sheet-design', 'fromLayout', { layout: null, designs: [] });
          if (record?._id) {
            sheets.value.push(sheetEntry(record));
            activeSheet.value = sheets.value.length - 1;
            selection.value = { sheet: activeSheet.value, placement: -1 };
          }
        } catch (error) {
          notify({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '' });
        } finally {
          constructing.value = false;
        }
      }

      async function removeSheet(sheetIndex) {
        const entry = sheets.value[sheetIndex];
        if (!editable.value || !entry || sheets.value.length <= 1) return;
        try {
          await remove.record('sheet-design', entry.id);
          sheets.value.splice(sheetIndex, 1);
          activeSheet.value = Math.min(activeSheet.value, sheets.value.length - 1);
          selection.value = { sheet: -1, placement: -1 };
        } catch (error) {
          notify({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '' });
        }
      }

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
          disabled: !editable.value || saving.value || !dirtyCount.value,
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
          icon: 'pi pi-plus',
          label: t('sheetDesign.addSheet'),
          disabled: !editable.value || constructing.value,
          loading: constructing.value,
          onClick: () => addSheet()
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
        const entry = selectedSheet.value;
        const svg = entry ? panelEls.get(entry.id) : null;
        const matrix = svg?.getScreenCTM?.();
        if (!matrix || !selectedTransform.value || !selectedBounds.value || !svg) return null;
        const canvas = svg.getBoundingClientRect();
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

      function editorPadding(entry) {
        return Math.max(entry.width, entry.height) * 0.025;
      }

      function editorViewBox(entry) {
        const width = (entry.width + editorPadding(entry) * 2) * viewZoom.value;
        const height = (entry.height + editorPadding(entry) * 2) * viewZoom.value;
        return [
          entry.width / 2 - width / 2,
          entry.height / 2 - height / 2,
          width,
          height
        ].join(' ');
      }

      function majorGridSize(entry) {
        const target = Math.max(entry.width, entry.height) / 28;
        const scale = 10 ** Math.floor(Math.log10(Math.max(target, 1)));
        return Math.ceil(target / scale) * scale;
      }

      function gridPatternId(entry) {
        return `sheet-layout-grid-${entry.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
      }

      function sheetPolygonPoints(entry) {
        return entry.polygon?.outer?.map(point => point.join(',')).join(' ') || '';
      }

      function renderSheetShape(entry, filled) {
        const stroke = sheetBoundaryStyle.value;
        const shape = sheetPolygonPoints(entry)
          ? h('polygon', {
            points: sheetPolygonPoints(entry),
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
            width: entry.width,
            height: entry.height,
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

      function placementSvgTransform(placement) {
        const transform = sheetPlacementTransform(placement);
        return `translate(${transform.x} ${transform.y}) rotate(${transform.rotation})`;
      }

      function renderPlacement(entry, sheetIndex, placement, index) {
        const selected = selection.value.sheet === sheetIndex && selection.value.placement === index;
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
            startDrag(event, sheetIndex, index);
          },
          onFocus: () => { selection.value = { sheet: sheetIndex, placement: index }; },
          onKeydown: event => {
            if (event.key !== 'Delete' && event.key !== 'Backspace') return;
            event.stopPropagation();
            event.preventDefault();
            removePlacement(sheetIndex, index);
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

      function renderPanel(entry, index) {
        const active = index === activeSheet.value;
        return h('section', {
          key: entry.id,
          class: 'flex h-full min-w-0 shrink-0 flex-col gap-1',
          style: { width: 'min(560px, 45vw)' }
        }, [
          h('div', { class: 'flex items-center gap-2 px-1' }, [
            h('button', {
              type: 'button',
              class: 'min-w-0 flex-1 truncate text-left text-sm font-medium',
              style: active ? { color: 'var(--p-primary-color)' } : {},
              title: localNames.value[entry.id] || entry.record?.fields?.name || '',
              onClick: () => {
                activeSheet.value = index;
                selection.value = { sheet: index, placement: -1 };
              }
            }, localNames.value[entry.id] || entry.record?.fields?.name || t('sheetDesign.sheet')),
            entry.dirty ? h('span', { class: 'text-muted text-xs' }, '•') : null,
            h(components.Button, {
              icon: 'pi pi-times',
              severity: 'secondary',
              text: true,
              rounded: true,
              size: 'small',
              'aria-label': t('common.delete'),
              disabled: !editable.value || sheets.value.length <= 1,
              onClick: () => removeSheet(index)
            })
          ]),
          h('div', { class: 'relative min-h-0 flex-1' }, [
            h('svg', {
              ref: el => setPanelEl(entry, el),
              class: `h-full w-full touch-none${active ? ' rounded-border border border-primary' : ' rounded-border border border-surface-200 dark:border-surface-700'}`,
              viewBox: editorViewBox(entry),
              role: 'application',
              'aria-label': t('sheetDesign.editor'),
              onPointerdown: () => {
                endDrag();
                activeSheet.value = index;
                selection.value = { sheet: index, placement: -1 };
              },
              onPointermove: dragPlacement,
              onPointerup: finishDrag,
              onPointercancel: finishDrag,
              onKeydown: event => {
                if (event.key !== 'Escape') return;
                event.stopPropagation();
                event.preventDefault();
                endDrag();
                selection.value = { sheet: -1, placement: -1 };
              }
            }, [
              h('defs', [
                h('pattern', {
                  id: gridPatternId(entry),
                  width: majorGridSize(entry),
                  height: majorGridSize(entry),
                  patternUnits: 'userSpaceOnUse'
                }, [
                  h('path', {
                    d: `M ${majorGridSize(entry)} 0 L 0 0 0 ${majorGridSize(entry)}`,
                    fill: 'none',
                    stroke: 'var(--p-text-muted-color)',
                    'stroke-opacity': 0.28,
                    'stroke-width': Math.max(majorGridSize(entry) / 80, 0.4)
                  })
                ])
              ]),
              renderSheetShape(entry, 'var(--p-content-background)'),
              renderSheetShape(entry, `url(#${gridPatternId(entry)})`),
              layerVisible('contour.material_sheet') ? renderSheetShape(entry, null) : null,
              dragState.value?.sheet === index && selectedSnapPoint.value ? h('g', { 'pointer-events': 'none' }, [
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
              ...entry.placedItems.map((placement, placementIndex) => renderPlacement(entry, index, placement, placementIndex))
            ])
          ])
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
                disabled: !editable.value || !selectedDesignId.value,
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
          selectedPlacement.value && selectedSheet.value
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
            h('div', { class: 'relative flex h-full w-full gap-4 overflow-x-auto p-3' }, [
              ...sheets.value.map(renderPanel),
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
