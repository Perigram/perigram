import { nextTick, ref } from 'vue';
import { DESIGNER_DRAWER_WIDTHS } from './useProcessDesignerCanvas.js';

// The socket-filtered context palette: right-click on empty canvas opens the
// full palette at that graph position; dropping a wire on empty canvas opens
// it filtered to operations with a compatible opposite socket, and choosing
// one creates and connects it immediately. Compatibility resolves through
// the same catalog ports the node cards render.
export function useProcessDesignerContextPalette({
  nodes,
  draft,
  canvasFrame,
  clientPoint,
  clientToGraphPosition,
  catalogPorts,
  portForHandle,
  socketPairCompatible,
  createProcessNode,
  clonePalettePreset,
  syncProcessNode,
  addNode,
  onConnect
}) {
  const contextPaletteSearch = ref(null);
  const contextPalette = ref({
    open: false,
    x: 0,
    y: 0,
    graphPosition: { x: 0, y: 0 },
    query: '',
    socket: null
  });

  function openPanePalette(event) {
    event?.preventDefault?.();
    openContextPalette(event, null);
  }

  function beginSocketConnection(connection = {}) {
    closeContextPalette();
    contextPalette.value.socket = {
      nodeId: connection.nodeId,
      handleId: connection.handleId,
      handleType: connection.handleType
    };
  }

  function endSocketConnection(event) {
    const socket = contextPalette.value.socket;
    if (!socket) return;
    const target = event?.target;
    const endedOnPane = target?.classList?.contains('vue-flow__pane')
      || target?.classList?.contains('vue-flow__transformationpane');
    if (endedOnPane) openContextPalette(event, socket);
    else contextPalette.value.socket = null;
  }

  function openContextPalette(event, socket) {
    const rect = canvasFrame.value?.getBoundingClientRect?.();
    const point = clientPoint(event);
    const x = Math.max(8, Math.min((rect?.width || 1200) - DESIGNER_DRAWER_WIDTHS.palette, point.x - (rect?.left || 0)));
    const y = Math.max(8, Math.min((rect?.height || 720) - 336, point.y - (rect?.top || 0)));
    contextPalette.value = {
      open: true,
      x,
      y,
      graphPosition: clientToGraphPosition(point),
      query: '',
      socket
    };
    nextTick(() => {
      const element = contextPaletteSearch.value?.$el;
      (element?.querySelector?.('input') || element)?.focus?.();
    });
  }

  function closeContextPalette() {
    contextPalette.value = {
      open: false,
      x: 0,
      y: 0,
      graphPosition: { x: 0, y: 0 },
      query: '',
      socket: null
    };
  }

  function contextItemCompatible(item) {
    const socket = contextPalette.value.socket;
    if (!socket) return true;
    if (item.type !== 'processNode') return false;
    const existingNode = nodes.value.find(node => node.id === socket.nodeId);
    const existingRecord = draft.value?.data?.processNodes?.[existingNode?.data?.refId];
    if (!existingRecord) return false;
    const candidate = createProcessNode('__candidate__', item.kind);
    Object.assign(candidate, clonePalettePreset(item.preset));
    syncProcessNode(candidate);
    const existingPorts = catalogPorts(existingRecord);
    const candidatePorts = catalogPorts(candidate);
    if (socket.handleType === 'source') {
      const output = portForHandle(existingPorts.outputs, socket.handleId, 'output');
      return candidatePorts.inputs.some(input => socketPairCompatible(output, input));
    }
    const input = portForHandle(existingPorts.inputs, socket.handleId, 'input');
    return candidatePorts.outputs.some(output => socketPairCompatible(output, input));
  }

  function addContextNode(item) {
    const socket = contextPalette.value.socket;
    const position = contextPalette.value.graphPosition;
    const node = addNode(item, position);
    if (!socket || !node) {
      closeContextPalette();
      return;
    }
    const candidate = draft.value?.data?.processNodes?.[node.data?.refId];
    const candidatePorts = catalogPorts(candidate);
    const existingNode = nodes.value.find(value => value.id === socket.nodeId);
    const existingRecord = draft.value?.data?.processNodes?.[existingNode?.data?.refId];
    const existingPorts = catalogPorts(existingRecord);
    if (socket.handleType === 'source') {
      const output = portForHandle(existingPorts.outputs, socket.handleId, 'output');
      const input = candidatePorts.inputs.find(port => socketPairCompatible(output, port));
      if (input) onConnect({
        source: socket.nodeId,
        sourceHandle: socket.handleId,
        target: node.id,
        targetHandle: `${input.role}:${input.id}`
      });
    } else {
      const input = portForHandle(existingPorts.inputs, socket.handleId, 'input');
      const output = candidatePorts.outputs.find(port => socketPairCompatible(port, input));
      if (output) onConnect({
        source: node.id,
        sourceHandle: `${output.role}:${output.id}`,
        target: socket.nodeId,
        targetHandle: socket.handleId
      });
    }
    closeContextPalette();
  }

  return {
    contextPalette,
    contextPaletteSearch,
    openPanePalette,
    beginSocketConnection,
    endSocketConnection,
    openContextPalette,
    closeContextPalette,
    contextItemCompatible,
    addContextNode
  };
}
