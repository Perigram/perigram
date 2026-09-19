import { computed, ref } from 'vue';

export function useProcessDesignerSelection({ nodes, edges, decorateEdge, closePalette, syncEdges }) {
  const selectedNodeId = ref(null);
  const selectedEdgeId = ref(null);
  const selectedNode = computed(() => nodes.value.find(node => node.id === selectedNodeId.value) || null);

  function selectNode(node) {
    selectedNodeId.value = node.id;
    selectedEdgeId.value = null;
    // Selection flags are authoritative at click time: a stale `selected`
    // left by a palette drop or a finished rubber-band must never redirect
    // deletion onto a different node than the one clicked.
    for (const candidate of nodes.value) {
      if (candidate.selected !== (candidate.id === node.id)) candidate.selected = candidate.id === node.id;
    }
    syncEdges();
  }

  function selectEdge(edge) {
    selectedEdgeId.value = edge.id;
    selectedNodeId.value = null;
    for (const candidate of nodes.value) {
      if (candidate.selected) candidate.selected = false;
    }
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
