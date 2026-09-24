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
    // Owned definition-plane records die with their canvas node: process
    // records and the producer outputs they anchored. (Save-time canvas
    // pruning covers unreferenced records, but validation and panels read
    // the draft live.)
    const removedRecordIds = new Set();
    for (const node of selectedGraphNodes()) {
      const refId = node.data?.refId;
      if (refId && draft.value?.data) {
        const record = draft.value.data[recordKeyForType(node.type)]?.[refId];
        // The record id and its canvas refId are the same by construction,
        // but match both so producer-output ownership survives them drifting.
        if (record?.id) removedRecordIds.add(String(record.id));
        removedRecordIds.add(String(refId));
        delete draft.value.data[recordKeyForType(node.type)]?.[refId];
      }
    }
    const producerOutputs = draft.value?.data?.producerOutputs || {};
    for (const [producerOutputId, output] of Object.entries(producerOutputs)) {
      if (output && removedRecordIds.has(String(output.nodeId))) delete producerOutputs[producerOutputId];
    }
    nodes.value = nodes.value.filter(node => !removedNodeIds.has(node.id));
    edges.value = edges.value.filter(edge => !removedEdgeIds.has(edge.id));
    selectedNodeId.value = null;
    selectedEdgeId.value = null;
    onGraphChange?.();
  }

  return { deleteGraphSelection, selectedGraphEdges, selectedGraphNodes };
}
