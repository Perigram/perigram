import { operationKindOf } from '~/packages/cts/src/index.js';
import { computed, ref } from 'vue';
import { formatProcessType } from '~/packages/processes/src/index.js';

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
  selectEdge
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
    for (const item of diff.removedEntityStatuses || []) {
      lines.push(t('processDesigner.applyDiffRemovedStatuses', { typeId: item.typeId, statuses: item.statuses.join(', ') }));
    }
    return lines;
  });

  const selectedNodePreview = computed(() => selectedNode.value ? dataflowPreview.value?.nodes?.[selectedNode.value.id] || null : null);
  const selectedNodeSupportsPreview = computed(() => {
    const kind = operationKindOf(selectedProcessNode.value || {});
    return Boolean(kind && !kind.startsWith('effect.') && !kind.startsWith('control.'));
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

  function formatPreviewPath(path = []) {
    return `{${path.join(';')}}`;
  }

  function formatPreviewItem(item) {
    if (item && typeof item === 'object' && !Array.isArray(item) && item.missing === true) {
      const path = Array.isArray(item.path) ? item.path.join('.') : String(item.path ?? '');
      return `missing(${path})`;
    }
    return JSON.stringify(item);
  }

  function formatPreviewItems(items = []) {
    return items.map(formatPreviewItem).join(', ');
  }

  // Apply focus: the first structured diagnostic with a graph anchor selects
  // the responsible node or edge so the author lands on the exact element.
  function focusValidationDiagnostic(diagnostic) {
    if (!diagnostic) return;
    if (diagnostic.edgeId) {
      const edge = edges.value.find(item => String(item.id) === String(diagnostic.edgeId));
      if (edge) {
        selectEdge(edge);
        return;
      }
    }
    if (diagnostic.nodeId) {
      const node = nodes.value.find(item => String(item.id) === String(diagnostic.nodeId));
      if (node) selectNode(node);
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
    selectedNodeSupportsPreview,
    selectedNodePreviewOutputs,
    previewDataflow,
    formatPreviewPath,
    formatPreviewItem,
    formatPreviewItems,
    focusValidationDiagnostic,
    focusFirstValidationDiagnostic
  };
}
