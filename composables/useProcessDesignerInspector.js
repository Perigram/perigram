import { computed } from 'vue';

const RECORD_KEYS = Object.freeze({
  entity: 'producerOutputs',
  action: 'actions',
  service: 'services',
  socket: 'sockets',
  statusDefinition: 'statusDefinitions',
  valueInput: 'valueInputs',
  processNode: 'processNodes'
});

export function useProcessDesignerInspector({ draft, selectedNode, factories }) {
  function recordKeyForType(type) {
    return RECORD_KEYS[type] || RECORD_KEYS.entity;
  }

  function factoryForType(type) {
    return factories[type] || factories.entity;
  }

  function ensureRecord(key, node, factory) {
    if (!draft.value) draft.value = { data: {} };
    draft.value.data ||= {};
    draft.value.data[key] ||= {};
    const refId = node?.data?.refId || node?.id || `${key}_${Date.now()}`;
    draft.value.data[key][refId] ||= factory(refId);
    if (key === 'services') {
      draft.value.data[key][refId].billing ||= { mode: 'none', tokenCost: 0, meterKey: '' };
    }
    return draft.value.data[key][refId];
  }

  function selectedRecordFor(type) {
    const node = selectedNode.value;
    if (node?.type !== type) return {};
    return ensureRecord(recordKeyForType(type), node, factoryForType(type));
  }

  return {
    ensureRecord,
    factoryForType,
    recordKeyForType,
    selectedRecord: computed(() => {
      const node = selectedNode.value;
      if (!node) return {};
      return ensureRecord(recordKeyForType(node.type), node, factoryForType(node.type));
    }),
    selectedEntity: computed(() => selectedRecordFor('entity')),
    selectedAction: computed(() => selectedRecordFor('action')),
    selectedService: computed(() => selectedRecordFor('service')),
    selectedSocket: computed(() => selectedRecordFor('socket')),
    selectedStatusDefinition: computed(() => selectedRecordFor('statusDefinition')),
    selectedValueInput: computed(() => selectedRecordFor('valueInput')),
    selectedProcessNode: computed(() => selectedRecordFor('processNode'))
  };
}
