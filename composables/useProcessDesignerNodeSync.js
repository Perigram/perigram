import { computed } from 'vue';
import { operationKindOf, typeIdOf, setTypeBinding } from '~/packages/cts/src/index.js';
import {
  constructionInputsForContract,
  createProcessRecordSync,
  formatProcessType,
  getProcessNodeDefinition,
  humanizeNodeLabel,
  parseProcessSocketHandleId,
  processSocketsCompatible
} from '~/packages/processes/src/index.js';

// The node-sync adapter: record-level derivation lives in the package
// authoring seam (`createProcessRecordSync` — the same pipeline headless
// authoring drives); this composable layers designer presentation over
// it (i18n port labels, option lists, inspector summaries) and keeps the
// page's single sync entry point. See the processes README "Headless
// definition authoring".

export function useProcessDesignerNodeSync({
  designer,
  t,
  te,
  draft,
  edges,
  nodeRecords,
  projectedDomain,
  paletteLabel,
  paletteDescription
}) {
  const {
    processNodeOperations,
    processNodeOperationLabels,
    defaultTypeId
  } = nodeRecords;

  const artifactUploadKindOptions = computed(() => designer.attachmentKindOptions
    .filter(option => ['upload', 'capture', 'editor'].includes(option.creation?.mode)));

  const opKind = node => operationKindOf(node || {});
  function isOpKind(node, kindOrPrefix) {
    const kind = opKind(node);
    return kindOrPrefix.endsWith('.') ? kind.startsWith(kindOrPrefix) : kind === kindOrPrefix;
  }
  const nodeTypeId = node => typeIdOf(node || {});
  function setNodeTypeId(node, typeId) {
    setTypeBinding(node, typeId);
  }

  function processPortLabel(node = {}, port = {}) {
    const field = designer.fieldsForEntity(nodeTypeId(node)).find(candidate => candidate.value === port.id);
    if (field) return field.i18n ? t(field.i18n) : field.label;
    if (port.role === 'data' && port.id === 'start') return t('processDesigner.socketLabels.startPosition');
    // The produce/consume chain is named after what it transports: an
    // entity-bearing result carries its bound type's name — "result" is
    // a socket role, not a type, and never a label. Unbound, it reads
    // like every untyped entity stream ("instances").
    if (port.id === 'result' && ['entity', 'entityRef'].includes(port.type?.base)) {
      const bound = nodeTypeId(node);
      const options = processTypeIdOptions(node);
      const option = bound && Array.isArray(options)
        ? options.find(candidate => candidate.value === bound)
        : null;
      if (option?.label) return option.label;
      return processSocketLabel('entity');
    }
    return processSocketLabel(port.label || port.id);
  }

  const recordSync = createProcessRecordSync({
    contract: designer,
    defaultEntityTypeId: defaultTypeId,
    portLabel: processPortLabel
  });
  const catalogPorts = recordSync.catalogPorts;
  const catalogContext = recordSync.catalogContext;

  function processSocketLabel(value = '') {
    const normalized = String(value).replace(/\s+/g, '');
    const key = `processDesigner.socketLabels.${normalized}`;
    return te(key) ? t(key) : humanizeNodeLabel(value);
  }

  function processNodeInputs(node = {}) {
    return catalogPorts(node).inputs
      .map(port => ({ ...port, label: processPortLabel(node, port) }));
  }

  function processNodeOutputs(node = {}) {
    return catalogPorts(node).outputs
      .map(port => ({ ...port, label: processPortLabel(node, port) }));
  }

  function relationOptionsForEntity(typeId = '') {
    return recordSync.relationKeysForEntity(typeId).map(relation => ({
      label: `${relation.key} · ${relation.targetType} · ${relation.cardinality}`,
      value: relation.key
    }));
  }

  // The bound type's declared projections (SPEC §8 p): the extract
  // read's picker — what the type declares is what can be dereferenced.
  function projectionOptionsForEntity(typeId = '') {
    return Object.values(designer.domain.projectionContracts || {})
      .filter(contract => contract.typeId === typeId)
      .map(contract => ({ label: contract.label || contract.id, value: contract.id }));
  }

  function constructionContractForEntity(typeId) {
    return designer.construction(typeId) || {};
  }

  function constructionInputsForMode(contract = {}, mode = '') {
    return constructionInputsForContract(contract, mode);
  }

  function constructionModeOptions(typeId = '') {
    return designer.createModes(typeId).map(value => ({ label: value, value }));
  }

  function processNodeOperationOptions(kind = '') {
    const record = typeof kind === 'object' ? kind : { kind };
    // v5 species records have no operation switch: the species IS the
    // operation (SPEC §20 vocabulary).
    if (String(record.kind || '').startsWith('cts.')) return [];
    const operations = processNodeOperations[record.kind] || [];
    return operations.map(value => ({ label: processNodeOperationLabels[value] || value, value }));
  }

  // The one recursive walk over the bound type's projected lifecycle: every
  // declared state path (nested paths dotted) with its region axis. It backs
  // the status fallback choices and the transition from/to path options —
  // one derivation, optionally narrowed to a single axis.
  function processWorkflowPaths(node = {}, axis = null) {
    const workflow = designer.domain.workflows?.[nodeTypeId(node)];
    const options = [];
    for (const [regionAxis, region] of Object.entries(workflow?.regions || {})) {
      if (axis && regionAxis !== axis) continue;
      const walk = (states = {}, prefix = []) => {
        for (const [name, state = {}] of Object.entries(states)) {
          const path = [...prefix, name].join('.');
          options.push({ label: state.label || path, value: path, axis: regionAxis });
          if (state.states) walk(state.states, [...prefix, name]);
        }
      };
      walk(region.states || {});
    }
    return options;
  }

  function processTypeIdOptions(node = {}) {
    const kind = opKind(node);
    if (kind === 'effect.createEntity' || kind === 'effect.runProducer') return designer.createEntityOptions;
    if (kind === 'effect.updateEntity') return designer.updateEntityOptions;
    if (kind === 'effect.changeStatus') return designer.changeStatusOptions;
    if (kind === 'effect.archiveEntity') return designer.archivableEntityOptions;
    if (kind === 'effect.deleteEntity') return designer.deleteEntityOptions;
    if (node.kind === 'cts.field') return designer.readableEntityOptions;
    if (node.kind === 'cts.read' && ['all', 'children', 'extract'].includes(node.select)) return designer.listableEntityOptions;
    return designer.entityOptions;
  }

  function processNodeSummary(node = {}) {
    const showsType = node.kind?.startsWith('source.')
      || node.kind?.startsWith('value.')
      || node.kind?.startsWith('collection.')
      || node.kind?.startsWith('tree.');
    return [
      nodeTypeId(node),
      node.path,
      showsType && node.type ? formatProcessType(node.type) : '',
      isOpKind(node, 'collection.sort') ? node.direction : node.operation
    ].filter(Boolean).join(' · ');
  }

  function processNodeDisplayLabel(node = {}) {
    // `record.label` is the kind sentinel (the sync pass keeps
    // `label === kind`), not authored display data — the palette item and
    // the node definition are the only label sources.
    const boundType = nodeTypeId(node);
    const items = designer.paletteGroups.flatMap(group => group.items)
      .filter(candidate => candidate.kind === node.kind)
      .filter(candidate => !candidate.preset?.typeId || candidate.preset.typeId === boundType);
    const item = items.find(candidate => candidate.preset?.select && candidate.preset.select === node.select)
      || items[0];
    if (item) return paletteLabel(item);
    const definition = getProcessNodeDefinition(node.kind);
    return definition ? humanizeNodeLabel(definition.label || node.kind) : humanizeNodeLabel(node.kind || '');
  }

  function processNodeDescription(node = {}) {
    const item = designer.paletteGroups.flatMap(group => group.items)
      .find(candidate => candidate.kind === node.kind);
    return item ? paletteDescription(item) : '';
  }

  function artifactCreationKinds(record = {}) {
    const creator = (record.construction?.inputs || []).find(input => input.creator?.typeId === 'artifact')?.creator;
    if (creator?.attachmentKinds === 'userCreatable' || !Array.isArray(creator?.attachmentKinds)) {
      return artifactUploadKindOptions.value.map(option => option.value);
    }
    return creator.attachmentKinds.map(kind => typeof kind === 'string' ? kind : kind.kind).filter(Boolean);
  }

  function updateArtifactCreationKinds(record = {}, kinds = []) {
    record.construction ||= {};
    const contractInput = constructionInputsForMode(constructionContractForEntity(nodeTypeId(record)), record.construction.mode)
      .find(input => input.creator?.typeId === 'artifact');
    if (!contractInput) return;
    const index = (record.construction.inputs || []).findIndex(input => input.id === contractInput.id);
    const attachmentKinds = (kinds || []).map(kind => {
      const definition = designer.attachmentKindOptions.find(option => option.value === kind);
      return { kind, creation: definition?.creation || { mode: 'workflow' } };
    });
    const input = {
      ...(index >= 0 ? record.construction.inputs[index] : contractInput),
      creator: { ...contractInput.creator, attachmentKinds }
    };
    if (index >= 0) record.construction.inputs[index] = input;
    else record.construction.inputs = [...(record.construction.inputs || []), input];
  }

  // The one sync entry point for a process-node record: the package
  // pipeline over the draft data (defaults, envelopes, bindings, ports,
  // producer outputs) — the same pass headless authoring runs.
  function syncProcessNode(node = {}) {
    recordSync.syncProcessNode(node, { draftData: draft.value?.data || {} });
  }

  function connectedProcessInputIds(graphNode = {}, record = {}) {
    const inputs = catalogPorts(record).inputs;
    return edges.value
      .filter(edge => edge.target === graphNode.id)
      .map(edge => {
        const clean = parseProcessSocketHandleId(edge.targetHandle);
        if ((!clean || clean === 'input') && inputs.length === 1) return inputs[0].id;
        return clean;
      })
      .filter(Boolean);
  }

  // Trigger mode is derived, never authored: the event input is always
  // present on effects, and an effect runs automatically iff that input
  // is wired. The compiled `trigger.mode` spelling is written here from
  // the graph, so persisted authored modes heal into derived ones.
  function syncEffectTriggerMode(graphNode = {}, record = {}) {
    if (!opKind(record).startsWith('effect.')) return;
    const connected = connectedProcessInputIds(graphNode, record);
    record.trigger = { mode: connected.includes('in') ? 'event' : 'manual' };
  }

  // Pure port lookup shared by every consumer of handle-shaped ports.
  function portForHandle(ports, handle, direction) {
    const clean = parseProcessSocketHandleId(handle);
    if ((!clean || clean === direction) && ports.length === 1) return ports[0];
    return ports.find(port => port.id === clean) || null;
  }

  function socketPairCompatible(source, target) {
    if (!source || !target) return false;
    return processSocketsCompatible(source, target).ok;
  }

  return {
    artifactUploadKindOptions,
    opKind,
    isOpKind,
    nodeTypeId,
    setNodeTypeId,
    catalogPorts,
    catalogContext,
    portForHandle,
    socketPairCompatible,
    relationOptionsForEntity,
    projectionOptionsForEntity,
    constructionModeOptions,
    artifactCreationKinds,
    updateArtifactCreationKinds,
    processNodeInputs,
    processNodeOutputs,
    processNodeOperationOptions,
    processWorkflowPaths,
    processTypeIdOptions,
    processNodeSummary,
    processNodeDisplayLabel,
    processNodeDescription,
    connectedProcessInputIds,
    syncEffectTriggerMode,
    syncProcessNode
  };
}
