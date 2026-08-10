import { computed, ref } from 'vue';

export function useProcessDesignerSelection({ nodes, edges, decorateEdge, closePalette, syncEdges }) {
  const selectedNodeId = ref(null);
  const selectedEdgeId = ref(null);
  const selectedNode = computed(() => nodes.value.find(node => node.id === selectedNodeId.value) || null);

  function selectNode(node) {
    selectedNodeId.value = node.id;
    selectedEdgeId.value = null;
    syncEdges();
  }

  function selectEdge(edge) {
    selectedEdgeId.value = edge.id;
    selectedNodeId.value = null;
    syncEdges();
  }

  function clearGraphSelection() {
    closePalette();
    nodes.value = nodes.value.map(node => ({ ...node, selected: false }));
    edges.value = edges.value.map(edge => decorateEdge({ ...edge, selected: false }));
    reset();
    syncEdges();
  }

  function reset() {
    selectedNodeId.value = null;
    selectedEdgeId.value = null;
  }

  return {
    clearGraphSelection,
    reset,
    selectEdge,
    selectedEdgeId,
    selectedNode,
    selectedNodeId,
    selectNode
  };
}
