export function useProcessDesignerGraphEditing({
  draft,
  nodes,
  edges,
  selectedNode,
  selectedNodeId,
  selectedEdgeId,
  recordKeyForType,
  clearSemanticConnection,
  syncInferredActionInputs,
  onBlockedStatusNodes
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
    const selectedNodes = selectedGraphNodes();
    const candidateNodeIds = new Set(selectedNodes.map(node => node.id));
    const selectedProcessRefs = new Set(selectedNodes
      .filter(node => node.type === 'processNode')
      .map(node => node.data?.refId)
      .filter(Boolean));
    const remainingProcessNodes = Object.entries(draft.value?.data?.processNodes || {})
      .filter(([refId]) => !selectedProcessRefs.has(refId))
      .map(([, node]) => node);
    const blockedStatusNodeIds = new Set(selectedNodes
      .filter(node => node.type === 'statusDefinition')
      .filter(node => remainingProcessNodes.some(record => record.statusRef === (node.data?.refId || node.id)))
      .map(node => node.id));
    const removedNodeIds = new Set([...candidateNodeIds].filter(id => !blockedStatusNodeIds.has(id)));
    const protectedStatusEdges = new Set(edges.value
      .filter(edge => blockedStatusNodeIds.has(edge.source) && !removedNodeIds.has(edge.target))
      .map(edge => edge.id));
    const removedEdgeIds = new Set(selectedGraphEdges()
      .map(edge => edge.id)
      .filter(id => !protectedStatusEdges.has(id)));

    for (const edge of edges.value) {
      if ((removedNodeIds.has(edge.source) || removedNodeIds.has(edge.target)) && !protectedStatusEdges.has(edge.id)) {
        removedEdgeIds.add(edge.id);
      }
    }
    for (const edge of edges.value.filter(edge => removedEdgeIds.has(edge.id))) clearSemanticConnection(edge);
    for (const node of selectedNodes.filter(node => removedNodeIds.has(node.id))) {
      const refId = node.data?.refId;
      if (refId && draft.value?.data) delete draft.value.data[recordKeyForType(node.type)]?.[refId];
    }
    nodes.value = nodes.value.filter(node => !removedNodeIds.has(node.id));
    edges.value = edges.value.filter(edge => !removedEdgeIds.has(edge.id));
    if (blockedStatusNodeIds.size) onBlockedStatusNodes();
    selectedNodeId.value = nodes.value.find(node => blockedStatusNodeIds.has(node.id))?.id || null;
    selectedEdgeId.value = null;
    syncInferredActionInputs();
  }

  return { deleteGraphSelection, selectedGraphEdges, selectedGraphNodes };
}
