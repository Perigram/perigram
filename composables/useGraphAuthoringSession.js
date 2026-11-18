import { ref } from 'vue';
import { useProcessDesignerCanvas } from '~/composables/useProcessDesignerCanvas.js';
import { useProcessDesignerSelection } from '~/composables/useProcessDesignerSelection.js';

export function createGraphAuthoringState() {
  return { nodes: ref([]), edges: ref([]) };
}

// Shared graph-authoring mechanics used by both graph documents and CTS
// process graphs. Domain sessions provide node semantics and persistence;
// selection, canvas interaction, framing, viewport and deletion gestures are
// one implementation rather than parallel editor sessions.
export function useGraphAuthoringSession({
  nodes,
  edges,
  draft,
  decorateEdge,
  closePalette,
  syncEdges,
  selectedGraphNodes,
  selectedGraphEdges,
  deleteGraphSelection
}) {
  const selection = useProcessDesignerSelection({
    nodes,
    edges,
    decorateEdge,
    closePalette,
    syncEdges
  });

  const canvas = useProcessDesignerCanvas({
    nodes,
    edges,
    draft,
    selectedNodeId: selection.selectedNodeId,
    selectedEdgeId: selection.selectedEdgeId,
    selectedGraphNodes,
    selectedGraphEdges,
    deleteGraphSelection,
    clearGraphSelection: selection.clearGraphSelection,
    decorateEdge
  });

  return { ...selection, ...canvas, selection, canvas };
}
