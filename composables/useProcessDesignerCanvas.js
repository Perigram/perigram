import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useVueFlow } from '@vue-flow/core';

// Canvas viewport and interaction: zoom/frame controls, ctrl-wheel zoom at
// the pointer, keyboard shortcuts (select-all, delete, frame, escape), and
// coarse-pointer pan defaults. Node placement owns the nearest-unoccupied
// grid position around the visible viewport center between the side
// drawers. The page supplies selection/deletion boundaries and the edge
// decorator; the composable self-registers its listeners.
export function useProcessDesignerCanvas({
  nodes,
  edges,
  draft,
  selectedNodeId,
  selectedEdgeId,
  selectedGraphNodes,
  selectedGraphEdges,
  deleteGraphSelection,
  clearGraphSelection,
  decorateEdge
}) {
  const canvasFrame = ref(null);
  const canvasKeyboardActive = ref(false);
  // Touch hosts have no pan-activation key: one-finger pane drag pans while
  // nodes stay draggable; mouse hosts keep the Space-activated precision pan.
  const touchPanDrag = ref(false);
  let touchPointerQuery = null;
  const { fitView, getViewport, setViewport, zoomIn, zoomOut, zoomTo } = useVueFlow();

  onMounted(() => {
    window.addEventListener('keydown', handleCanvasKeydown);
    touchPointerQuery = window.matchMedia?.('(pointer: coarse)') || null;
    touchPanDrag.value = Boolean(touchPointerQuery?.matches);
    touchPointerQuery?.addEventListener?.('change', syncTouchPanDrag);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleCanvasKeydown);
    touchPointerQuery?.removeEventListener?.('change', syncTouchPanDrag);
    touchPointerQuery = null;
  });

  function syncTouchPanDrag() {
    touchPanDrag.value = Boolean(touchPointerQuery?.matches);
  }

  function handleDesignerPointerDown(event) {
    canvasKeyboardActive.value = Boolean(event.target?.closest?.('.vue-flow'));
  }

  function handleDesignerFocus(event) {
    canvasKeyboardActive.value = Boolean(event.target?.closest?.('.vue-flow'));
  }

  // Ctrl-wheel zooms around the pointer: browsers otherwise hijack ctrl+wheel
  // for page zoom, so the gesture is captured at the frame and applied
  // through the viewport transform.
  function handleDesignerWheel(event) {
    if (!event.ctrlKey || !event.target?.closest?.('.vue-flow')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    canvasKeyboardActive.value = true;
    const viewport = getViewport?.() || { x: 0, y: 0, zoom: 1 };
    const rect = canvasFrame.value?.getBoundingClientRect?.();
    const previousZoom = Number(viewport.zoom) || 1;
    const nextZoom = Math.min(4, Math.max(0.1, previousZoom * Math.exp(-Number(event.deltaY || 0) * 0.002)));
    const pointerX = Number(event.clientX || 0) - Number(rect?.left || 0);
    const pointerY = Number(event.clientY || 0) - Number(rect?.top || 0);
    const graphX = (pointerX - Number(viewport.x || 0)) / previousZoom;
    const graphY = (pointerY - Number(viewport.y || 0)) / previousZoom;
    setViewport({
      x: pointerX - graphX * nextZoom,
      y: pointerY - graphY * nextZoom,
      zoom: nextZoom
    }, { duration: 0 });
  }

  function clientPoint(event = {}) {
    const touch = event.changedTouches?.[0] || event.touches?.[0];
    return {
      x: Number(touch?.clientX ?? event.clientX ?? 0),
      y: Number(touch?.clientY ?? event.clientY ?? 0)
    };
  }

  function clientToGraphPosition(point) {
    const viewport = getViewport?.() || { x: 0, y: 0, zoom: 1 };
    const rect = canvasFrame.value?.getBoundingClientRect?.();
    const zoom = Number(viewport.zoom) || 1;
    return {
      x: Math.round((point.x - (rect?.left || 0) - Number(viewport.x || 0)) / zoom),
      y: Math.round((point.y - (rect?.top || 0) - Number(viewport.y || 0)) / zoom)
    };
  }

  function handleCanvasKeydown(event) {
    if (!canvasKeyboardActive.value || isTextEditingTarget(event.target)) return;
    if (['Delete', 'Backspace'].includes(event.key)) {
      if (!selectedGraphNodes().length && !selectedGraphEdges().length) return;
      event.preventDefault();
      deleteGraphSelection();
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      frameAllNodes();
      return;
    }
    if (event.code === 'NumpadDecimal') {
      event.preventDefault();
      frameSelectedNodes();
      return;
    }
    if (event.key.toLowerCase() === 'a' && event.altKey) {
      event.preventDefault();
      clearGraphSelection();
      return;
    }
    if (event.key.toLowerCase() === 'a' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      nodes.value = nodes.value.map(node => ({ ...node, selected: true }));
      edges.value = edges.value.map(edge => decorateEdge({ ...edge, selected: false }));
      selectedNodeId.value = nodes.value[0]?.id || null;
      selectedEdgeId.value = null;
      return;
    }
    if (event.key === 'Escape') clearGraphSelection();
  }

  function isTextEditingTarget(target) {
    const tagName = target?.tagName?.toLowerCase();
    return target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
  }

  // The visible center between the palette and inspector drawers; a newly
  // dropped node lands near it without covering an existing node or its
  // socket hit targets.
  function activeViewportCenter() {
    const viewport = getViewport?.() || draft.value?.data?.graph?.viewport || { x: 0, y: 0, zoom: 1 };
    const zoom = Number(viewport.zoom) || 1;
    const rect = canvasFrame.value?.getBoundingClientRect?.();
    const width = rect?.width || 1200;
    const height = rect?.height || 720;
    const visibleLeft = 304;
    const visibleRight = 432;
    const visibleCenter = visibleLeft + Math.max(0, width - visibleLeft - visibleRight) / 2;
    return {
      x: Math.round((visibleCenter - Number(viewport.x || 0)) / zoom - 128),
      y: Math.round((height / 2 - Number(viewport.y || 0)) / zoom - 80)
    };
  }

  function nextNodePosition() {
    const origin = activeViewportCenter();
    const occupied = nodes.value.map(node => node.position || {});
    const columns = [0, 320, -320, 640, -640];
    for (let row = 0; row < 20; row += 1) {
      for (const column of columns) {
        const candidate = {
          x: Math.round(origin.x + column),
          y: Math.round(origin.y + row * 180)
        };
        const overlaps = occupied.some(position => (
          Math.abs(Number(position.x || 0) - candidate.x) < 300
          && Math.abs(Number(position.y || 0) - candidate.y) < 150
        ));
        if (!overlaps) return candidate;
      }
    }
    return { x: Math.round(origin.x), y: Math.round(origin.y + occupied.length * 180) };
  }

  function frameAllNodes() {
    if (!nodes.value.length) return;
    fitView({ padding: 0.16, duration: 180 });
  }

  function frameSelectedNodes() {
    const ids = selectedGraphNodes().map(node => node.id);
    if (!ids.length) return frameAllNodes();
    fitView({ nodes: ids, padding: 0.3, duration: 180 });
  }

  function zoomCanvasIn() {
    zoomIn({ duration: 120 });
  }

  function zoomCanvasOut() {
    zoomOut({ duration: 120 });
  }

  function resetCanvasZoom() {
    zoomTo(1, { duration: 160 });
  }

  function fitInitialCanvas() {
    if (nodes.value.length) {
      fitView({ padding: 0.16, duration: 0, maxZoom: 1 });
      return;
    }
    setViewport(draft.value?.data?.graph?.viewport || { x: 0, y: 0, zoom: 1 }, { duration: 0 });
  }

  function snapshotViewport() {
    return getViewport?.() || draft.value?.data?.graph?.viewport || { x: 0, y: 0, zoom: 1 };
  }

  return {
    canvasFrame,
    canvasKeyboardActive,
    touchPanDrag,
    fitView,
    getViewport,
    setViewport,
    handleDesignerPointerDown,
    handleDesignerFocus,
    handleDesignerWheel,
    handleCanvasKeydown,
    clientPoint,
    clientToGraphPosition,
    nextNodePosition,
    frameAllNodes,
    frameSelectedNodes,
    zoomCanvasIn,
    zoomCanvasOut,
    resetCanvasZoom,
    fitInitialCanvas,
    snapshotViewport
  };
}
