import { computed } from 'vue';
import { CONSUMER_EFFECT_KINDS } from '~/packages/processes/src/node-catalog.js';

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

  // The entity-producing process node is the only workflow editing anchor:
  // selecting it resolves its producer output directly instead of projecting
  // a second detached entity canvas node. Node-synced outputs may not yet
  // carry the editor shape (the old entity-node factory seeded it lazily), so
  // resolution seeds the same defaults the editor binds to.
  function producerOutputForProcessNode() {
    const node = selectedNode.value;
    if (node?.type !== 'processNode') return {};
    const record = selectedRecordFor('processNode');
    // Consumer effects never anchor the created-entity panel — a stale
    // producerOutputId on a loaded pre-protocol draft must not resurrect it.
    if (CONSUMER_EFFECT_KINDS.includes(record?.kind)) return {};
    const producerOutputs = draft.value?.data?.producerOutputs || {};
    const byId = record?.producerOutputId && producerOutputs[record.producerOutputId]
      ? producerOutputs[record.producerOutputId]
      : null;
    // Origin self-heal: resolve by ownership when the recorded id is stale
    // (legacy socket keys, sync ordering) so the panel follows the node.
    const owned = Object.values(producerOutputs)
      .filter(output => String(output?.nodeId) === String(record?.id || node.id));
    const producerOutput = byId || (owned.length === 1 ? owned[0] : null);
    if (!producerOutput) return {};
    producerOutput.lifecycle ||= { mode: 'defaultCreated' };
    producerOutput.allowedRoles ||= { read: [], write: [], admin: [] };
    producerOutput.fields ||= { read: [], write: [], private: [] };
    producerOutput.relations ||= [];
    return producerOutput;
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
    selectedEntity: computed(() => (
      Object.keys(producerOutputForProcessNode()).length
        ? producerOutputForProcessNode()
        : selectedRecordFor('entity')
    )),
    selectedAction: computed(() => selectedRecordFor('action')),
    selectedService: computed(() => selectedRecordFor('service')),
    selectedSocket: computed(() => selectedRecordFor('socket')),
    selectedStatusDefinition: computed(() => selectedRecordFor('statusDefinition')),
    selectedValueInput: computed(() => selectedRecordFor('valueInput')),
    selectedProcessNode: computed(() => selectedRecordFor('processNode'))
  };
}
