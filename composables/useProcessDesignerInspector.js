import { computed } from 'vue';
import { CONSUMER_EFFECT_KINDS } from '~/packages/processes/src/node-catalog.js';

const RECORD_KEYS = Object.freeze({
  processNode: 'processNodes',
  // Declaration-plane nodes own their authoring records in `ctsTypes`
  // (persisted with the draft; compiled to the registry at activation).
  ctsClass: 'ctsTypes',
  ctsField: 'ctsTypes',
  ctsState: 'ctsTypes',
  ctsType: 'ctsTypes'
});

export function useProcessDesignerInspector({ draft, selectedNode, factories }) {
  function recordKeyForType(type) {
    return RECORD_KEYS[type] || RECORD_KEYS.processNode;
  }

  function factoryForType(type) {
    return factories[type] || factories.processNode;
  }

  function ensureRecord(key, node, factory) {
    if (!draft.value) draft.value = { data: {} };
    draft.value.data ||= {};
    draft.value.data[key] ||= {};
    const refId = node?.data?.refId || node?.id || `${key}_${Date.now()}`;
    draft.value.data[key][refId] ||= factory(refId);
    return draft.value.data[key][refId];
  }

  // The entity-producing process node is the only workflow editing anchor:
  // selecting it resolves its producer output directly. Node-synced outputs
  // may not yet carry the editor shape, so resolution seeds the defaults the
  // created-entity panel binds to.
  function producerOutputForProcessNode() {
    const node = selectedNode.value;
    if (node?.type !== 'processNode') return {};
    const record = ensureRecord(recordKeyForType('processNode'), node, factoryForType('processNode'));
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
    selectedEntity: computed(() => {
      const output = producerOutputForProcessNode();
      return Object.keys(output).length ? output : {};
    }),
    selectedProcessNode: computed(() => {
      const node = selectedNode.value;
      if (node?.type !== 'processNode') return {};
      return ensureRecord(recordKeyForType('processNode'), node, factoryForType('processNode'));
    })
  };
}
