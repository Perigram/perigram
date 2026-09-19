export function useProcessDesignerGraphEditing({
  draft,
  nodes,
  edges,
  selectedNode,
  selectedNodeId,
  selectedEdgeId,
  recordKeyForType,
  onGraphChange
}) {
  function selectedGraphNodes() {
    const selected = nodes.value.filter(node => node.selected);
    if (selected.length) return selected;
    return selectedNode.value ? [selectedNode.value] : [];
  }

  function selectedGraphEdges() {
    const selected = edges.value.filter(edge => edge.selected);
    if (selected.length) return selected;
    const edge = edges.value.find(item => item.id === selectedEdgeId.value);
    return edge ? [edge] : [];
  }

  function deleteGraphSelection() {
    const removedNodeIds = new Set(selectedGraphNodes().map(node => node.id));
    const removedEdgeIds = new Set(selectedGraphEdges().map(edge => edge.id));
    for (const edge of edges.value) {
      if (removedNodeIds.has(edge.source) || removedNodeIds.has(edge.target)) {
        removedEdgeIds.add(edge.id);
      }
    }
    for (const node of selectedGraphNodes()) {
      const refId = node.data?.refId;
      if (refId && draft.value?.data) delete draft.value.data[recordKeyForType(node.type)]?.[refId];
    }
    nodes.value = nodes.value.filter(node => !removedNodeIds.has(node.id));
    edges.value = edges.value.filter(edge => !removedEdgeIds.has(edge.id));
    selectedNodeId.value = null;
    selectedEdgeId.value = null;
    onGraphChange?.();
  }

  return { deleteGraphSelection, selectedGraphEdges, selectedGraphNodes };
}
