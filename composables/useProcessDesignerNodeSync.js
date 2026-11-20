import { computed } from 'vue';
import { operationKindOf, typeIdOf, setTypeBinding } from '#packages/cts';
import {
  EFFECT_SPECIES_KINDS,
  createProcessRecordSync,
  effectTriggerFor,
  formatProcessType,
  getProcessNodeDefinition,
  humanizeNodeLabel,
  parseProcessSocketHandleId,
  PROCESS_PORT_COMPATIBILITY_PROFILE
} from '#packages/processes';

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
  paletteDescription,
  portCompatibility
}) {
  const {
    processNodeOperations,
    processNodeOperationLabels,
    defaultTypeId
  } = nodeRecords;

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
      .map(port => ({ ...port, base: port.type?.base || 'json', label: processPortLabel(node, port) }));
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
    if (kind === 'cts.construct') return designer.createEntityOptions;
    if (kind === 'cts.mutate') return designer.updateEntityOptions;
    if (kind === 'cts.transition') return node.archiveIntent ? designer.archivableEntityOptions : designer.changeStatusOptions;
    if (kind === 'cts.remove') return designer.deleteEntityOptions;
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

  // The node's palette entry (item + its group): the one match the card's
  // label, description, and header category all read, so a node renders
  // one identity. Service nodes identify by their bound operator — a
  // kind-only match would collapse every service in a section onto the
  // first item. Same-kind variants disambiguate by authored shape:
  // operator, select, then literal type base; the entityRef-typed literal
  // is the pinned-entity variant.
  function paletteEntryForNode(node = {}) {
    const boundType = nodeTypeId(node);
    const candidates = designer.paletteGroups
      .flatMap(group => group.items.map(item => ({ group, item })))
      .filter(({ item }) => item.kind === node.kind)
      .filter(({ item }) => !item.preset?.typeId || item.preset.typeId === boundType);
    return candidates.find(({ item }) => item.preset?.operator && item.preset.operator === node.operator)
      || candidates.find(({ item }) => item.preset?.select && item.preset.select === node.select)
      || candidates.find(({ item }) => item.preset?.type?.base && item.preset.type.base === node.type?.base)
      || candidates.find(({ item }) => item.preset?.type?.base !== 'entityRef')
      || candidates[0] || null;
  }

  function processNodeDisplayLabel(node = {}) {
    // `record.label` is the kind sentinel the sync pass keeps, so the
    // palette item and the node definition are the only label sources.
    const entry = paletteEntryForNode(node);
    if (entry) return paletteLabel(entry.item);
    const definition = getProcessNodeDefinition(node.kind);
    return definition ? humanizeNodeLabel(definition.label || node.kind) : humanizeNodeLabel(node.kind || '');
  }

  function processNodeGroupLabel(node = {}) {
    return paletteEntryForNode(node)?.group?.id || '';
  }

  function processNodeDescription(node = {}) {
    const entry = paletteEntryForNode(node);
    return entry ? paletteDescription(entry.item) : '';
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

  function connectedProcessOutputIds(graphNode = {}, record = {}) {
    const outputs = catalogPorts(record).outputs;
    return edges.value
      .filter(edge => edge.source === graphNode.id)
      .map(edge => {
        const clean = parseProcessSocketHandleId(edge.sourceHandle);
        if ((!clean || clean === 'output') && outputs.length === 1) return outputs[0].id;
        return clean;
      })
      .filter(Boolean);
  }

  // Persisted authored trigger modes heal into derived ones
  // (effectTriggerFor owns the derivation).
  function syncEffectTriggerMode(graphNode = {}, record = {}) {
    if (!EFFECT_SPECIES_KINDS.has(opKind(record))) return;
    const connected = connectedProcessInputIds(graphNode, record);
    record.trigger = effectTriggerFor(connected.includes('in'), record);
  }

  // Pure port lookup shared by every consumer of handle-shaped ports.
  function portForHandle(ports, handle, direction) {
    const clean = parseProcessSocketHandleId(handle);
    if ((!clean || clean === direction) && ports.length === 1) return ports[0];
    return ports.find(port => port.id === clean) || null;
  }

  function socketPairCompatible(source, target) {
    if (!source || !target) return false;
    if (!portCompatibility) throw new Error('Shared graph port compatibility registry is required');
    return portCompatibility.compare(
      { ...source, compatibility: { profile: PROCESS_PORT_COMPATIBILITY_PROFILE } },
      { ...target, compatibility: { profile: PROCESS_PORT_COMPATIBILITY_PROFILE } }
    ).compatible;
  }

  return {
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
    processNodeInputs,
    processNodeOutputs,
    processNodeOperationOptions,
    processWorkflowPaths,
    processTypeIdOptions,
    processNodeSummary,
    processNodeDisplayLabel,
    processNodeGroupLabel,
    processNodeDescription,
    connectedProcessInputIds,
    connectedProcessOutputIds,
    syncEffectTriggerMode,
    syncProcessNode
  };
}
