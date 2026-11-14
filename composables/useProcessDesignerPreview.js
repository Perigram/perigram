import { EFFECT_SPECIES_KINDS } from '@perigram/processes/index';
import { operationKindOf } from '@perigram/cts/index';
import { computed, ref } from 'vue';
import { formatProcessType } from '@perigram/processes/index';
import { formatPreviewItem, formatPreviewItems, formatPreviewPath } from '~/utils/processDesignerChannelOutputs.js';

// Per-node preview visibility (SPEC §28): a record's authored
// `previewVisible: false` removes its outputs from the preview
// channels. A hidden node keeps its error so fault states survive
// the hiding.
export function visiblePreviewOutputs(evaluation = {}, definition = {}) {
  const recordOfNode = new Map(
    (definition.graph?.nodes || []).map(node => [String(node.id), node.data?.refId || String(node.id)])
  );
  const records = definition.processNodes || {};
  const nodes = {};
  for (const [id, node] of Object.entries(evaluation.nodes || {})) {
    if (records[recordOfNode.get(String(id)) || '']?.previewVisible !== false) {
      nodes[id] = node;
    } else if (node.error) {
      nodes[id] = { ...node, outputs: {} };
    }
  }
  return { ...evaluation, nodes };
}

// Output Preview and Apply-diff display for the process designer. The page
// remains the composition root: persistence, serialization, selection, and
// node-port resolution are injected.
export function useProcessDesignerPreview({
  t,
  validation,
  selectedNode,
  selectedNodeId,
  selectedProcessNode,
  processNodeOutputs,
  persistence,
  serializeProcess,
  nodes,
  edges,
  selectNode,
  selectEdge,
  frameNodeIds = () => {},
  graphEvaluation = { value: null }
} = {}) {
  const dataflowPreview = ref(null);
  const previewingData = ref(false);

  const validationDiffLines = computed(() => {
    const diff = validation.value?.diff;
    if (!diff) return [];
    const lines = [];
    const counts = record => [
      record.added?.length ? `+${record.added.length}` : '',
      record.removed?.length ? `−${record.removed.length}` : '',
      record.changed?.length ? `~${record.changed.length}` : ''
    ].filter(Boolean).join(' · ');
    for (const [key, labelKey] of [
      ['actions', 'processDesigner.applyDiffActions'],
      ['screens', 'processDesigner.applyDiffScreens'],
      ['roles', 'processDesigner.applyDiffRoles']
    ]) {
      const summary = counts(diff[key] || {});
      if (summary) lines.push(`${t(labelKey)}: ${summary}`);
    }
    for (const [key, labelKey] of [
      ['workflows', 'processDesigner.applyDiffWorkflows'],
      ['fieldPolicies', 'processDesigner.applyDiffFieldPolicies']
    ]) {
      const record = diff[key] || {};
      const summary = counts({ added: record.addedProducers, removed: record.removedProducers, changed: record.changed });
      if (summary) lines.push(`${t(labelKey)}: ${summary}`);
    }
    for (const change of diff.capabilities?.changed || []) {
      const parts = [
        change.added?.length ? `+${change.added.join(', ')}` : '',
        change.removed?.length ? `−${change.removed.join(', ')}` : ''
      ].filter(Boolean).join(' · ');
      if (parts) lines.push(`${t('processDesigner.applyDiffCapabilities')} — ${change.typeId}: ${parts}`);
    }
    for (const item of diff.removedInstanceStatees || []) {
      lines.push(t('processDesigner.applyDiffRemovedStatuses', { typeId: item.typeId, statuses: item.statuses.join(', ') }));
    }
    return lines;
  });

  const selectedNodePreview = computed(() => selectedNode.value ? dataflowPreview.value?.nodes?.[selectedNode.value.id] || null : null);

  // C2 live values (SPEC §28 canvas rethinking): the whole-graph channel
  // evaluation (`graphEvaluation`) is the selected node's live state —
  // outputs render in the inspector the moment the evaluation lands,
  // without a per-node run.
  const selectedChannelNode = computed(() => selectedNode.value
    ? graphEvaluation.value?.nodes?.[selectedNode.value.id] || null
    : null);
  const selectedChannelOutputs = computed(() => {
    const outputs = selectedChannelNode.value?.outputs || {};
    const ports = processNodeOutputs(selectedProcessNode.value || {});
    return Object.entries(outputs).map(([id, tree]) => {
      const port = ports.find(item => item.id === id);
      return {
        id,
        label: port?.label || id,
        type: port?.type ? formatProcessType(port.type) : '',
        tree
      };
    });
  });

  // Node-scoped diagnostics (SPEC §28): the anchored diagnostics of the
  // current validation plus the whole-graph evaluation's per-node
  // errors, indexed by node — the canvas marks each faulted node.
  // Edge-anchored diagnostics mark their endpoint nodes so a wire
  // problem stays visible on the cards it connects; an evaluation error
  // names its own node alone (an upstream failure is that node's error).
  const nodeDiagnosticIndex = computed(() => {
    const index = new Map();
    const add = (nodeId, message) => {
      const key = String(nodeId);
      index.set(key, [...(index.get(key) || []), message]);
    };
    const diagnostics = validation.value?.diagnostics || [];
    const edgeNodeIds = new Map((edges.value || []).map(edge => [String(edge.id), [edge.source, edge.target]]));
    for (const diagnostic of diagnostics) {
      const anchored = [];
      if (diagnostic.nodeId) anchored.push(diagnostic.nodeId);
      if (diagnostic.edgeId) anchored.push(...(edgeNodeIds.get(String(diagnostic.edgeId)) || []));
      for (const nodeId of anchored) add(nodeId, diagnostic.message);
    }
    for (const [nodeId, evaluation] of Object.entries(graphEvaluation.value?.nodes || {})) {
      if (evaluation?.error) add(nodeId, evaluation.error);
    }
    return index;
  });
  const nodeDiagnostics = computed(() => {
    const index = nodeDiagnosticIndex.value;
    if (!index.size) return null;
    return nodeId => index.get(String(nodeId)) || null;
  });
  const selectedNodeSupportsPreview = computed(() => {
    const kind = operationKindOf(selectedProcessNode.value || {});
    if (kind === 'cts.service') return true;
    return Boolean(kind && !EFFECT_SPECIES_KINDS.has(kind) && !kind.startsWith('control.'));
  });
  const selectedNodePreviewOutputs = computed(() => {
    const outputs = selectedNodePreview.value?.outputs || {};
    const ports = processNodeOutputs(selectedProcessNode.value || {});
    return Object.entries(outputs).map(([id, tree]) => {
      const port = ports.find(item => item.id === id);
      return {
        id,
        label: port?.label || id,
        type: port?.type ? formatProcessType(port.type) : '',
        tree
      };
    });
  });

  async function previewDataflow() {
    if (!selectedNodeSupportsPreview.value) return;
    previewingData.value = true;
    try {
      const definition = serializeProcess();
      dataflowPreview.value = await persistence.previewDraft(definition, selectedNodeId.value);
    } catch (error) {
      dataflowPreview.value = { nodes: { [selectedNodeId.value]: { error: error?.data?.message || error.message } } };
    } finally {
      previewingData.value = false;
    }
  }

  // Apply focus: the first structured diagnostic with a graph anchor selects
  // the responsible node or edge and frames it into view, so the author
  // lands on the exact element even in a large graph.
  function focusValidationDiagnostic(diagnostic) {
    if (!diagnostic) return;
    if (diagnostic.edgeId) {
      const edge = edges.value.find(item => String(item.id) === String(diagnostic.edgeId));
      if (edge) {
        selectEdge(edge);
        frameNodeIds([edge.source, edge.target]);
        return;
      }
    }
    if (diagnostic.nodeId) {
      const node = nodes.value.find(item => String(item.id) === String(diagnostic.nodeId));
      if (node) {
        selectNode(node);
        frameNodeIds([node.id]);
      }
    }
  }

  function focusFirstValidationDiagnostic(result) {
    if (result?.ok) return;
    focusValidationDiagnostic((result?.diagnostics || []).find(diagnostic => diagnostic.edgeId || diagnostic.nodeId));
  }

  return {
    dataflowPreview,
    previewingData,
    validationDiffLines,
    selectedNodePreview,
    selectedChannelNode,
    selectedChannelOutputs,
    selectedNodeSupportsPreview,
    selectedNodePreviewOutputs,
    nodeDiagnosticIndex,
    nodeDiagnostics,
    previewDataflow,
    formatPreviewPath,
    formatPreviewItem,
    formatPreviewItems,
    focusValidationDiagnostic,
    focusFirstValidationDiagnostic
  };
}
