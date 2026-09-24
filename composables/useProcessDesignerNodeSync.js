import { computed } from 'vue';
import { operationKindOf, typeIdOf, setTypeBinding } from '~/packages/cts/src/index.js';
import {
  formatProcessType,
  getProcessNodeDefinition,
  parseProcessSocketHandleId,
  processSocketsCompatible,
  processType,
  resolveCatalogNodePorts,
  syncProcessNodeProducerOutputs
} from '~/packages/processes/src/index.js';
import { normalizeDesignerAccess } from '~/utils/processDesignerAccess.js';
import { defaultProcessNodeOperation, humanizeNodeLabel, iconForProcessNode } from './useProcessDesignerNodeRecords.js';

// The node-sync family: record-level derivation for process nodes — kind
// normalization, construction contracts, path/status defaults, port
// resolution, labels, and option lists. The page remains the composition
// root: the designer contract, i18n, the record factories, and the
// projected-domain resolver are injected; every mutation flows back through
// the page's single sync entry point (the live-graph pass calls these
// functions; they never re-enter it).
//
// The vocabulary seam is @perigram/cts: `operationKindOf` maps species kinds
// to their operation twins (one seam, no duplicated vocabulary) and
// `typeIdOf`/`setTypeBinding` own the type binding (`typeId` for species
// records, `typeId` for pure-algebra kinds).

const MANAGED_PROCESS_BLOCKS = new Set(['origin', 'status', 'provenance', 'summary']);

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
  const sameTypeId = (a, b) => String(a || '').replace(/_/g, '-') === String(b || '').replace(/_/g, '-');

  function v5Record(node = {}) {
    if (String(node?.kind || '').startsWith('cts.')) return true;
    if (node?.kind) return false;
    return (draft.value?.data?.graphProtocol || draft.value?.graphProtocol) === 5;
  }
  function setNodeBlocks(node, blocks) {
    if (v5Record(node)) node.slots = blocks;
    else node.blocks = blocks;
  }

  function relationOptionsForEntity(typeId = '') {
    return (designer.domain.relations || [])
      .filter(relation => relation.ownerType === typeId)
      .map(relation => ({
        label: `${relation.key} · ${relation.targetType} · ${relation.cardinality}`,
        value: relation.key
      }));
  }

  // The domain workflow's primary region (falling back to its first): the
  // single resolution for initial states and status fallback choices.
  function primaryRegionOf(typeId) {
    const workflow = designer.domain.workflows?.[typeId];
    if (!workflow) return null;
    return workflow.regions?.[workflow.primaryRegion] || Object.values(workflow.regions || {})[0] || null;
  }

  function initialStateForEntity(typeId) {
    return primaryRegionOf(typeId)?.initial || '';
  }

  function constructionContractForEntity(typeId) {
    return designer.construction(typeId) || {};
  }

  function constructionInputsForMode(contract = {}, mode = '') {
    return contract.modeInputs?.[mode] || contract.inputs || [];
  }

  function constructionModeOptions(typeId = '') {
    return designer.createModes(typeId).map(value => ({ label: value, value }));
  }

  // The construct's accepted canonical blocks (record data consumed by
  // compilation; the cts construct surface itself exposes row-field sockets).
  function constructibleEntityBlocks(typeId = '') {
    const fieldBlocks = designer.fieldsForEntity(typeId)
      .filter(field => field.constructible !== false)
      .map(field => field.block)
      .filter(block => block && !MANAGED_PROCESS_BLOCKS.has(block));
    const openBlocks = designer.blocksForEntity(typeId)
      .map(block => block.id)
      .filter(block => designer.blockComposition(block) && !MANAGED_PROCESS_BLOCKS.has(block));
    return [...new Set([...fieldBlocks, ...openBlocks])];
  }

  function catalogPorts(record) {
    // v5 cts records go to the catalog RAW: the cts() ports wrapper resolves
    // the operation twin itself and owns the persistent type binding pin +
    // the declaration-only construct contract (no block substrate).
    // Pre-resolving here would bypass it.
    return resolveCatalogNodePorts(record, catalogContext(record));
  }

  function catalogContext(node = {}) {
    // cts.field resolves its field against the bound type; everything else
    // resolves entity fields by its own binding when present.
    const bound = nodeTypeId(node);
    const fields = node.kind === 'cts.field' || bound
      ? designer.fieldsForEntity(bound)
      : [];
    return {
      fieldSchema: fields.find(field => field.value === node.path) || null,
      fieldSchemas: fields,
      command: designer.domain.commands?.[node.commandId] || null,
      domain: projectedDomain()
    };
  }

  function processNodeInputs(node = {}) {
    return catalogPorts(node).inputs
      .map(port => ({ ...port, label: processPortLabel(node, port) }));
  }

  function processNodeOutputs(node = {}) {
    return catalogPorts(node).outputs
      .map(port => ({ ...port, label: processPortLabel(node, port) }));
  }

  function processSocketLabel(value = '') {
    const normalized = String(value).replace(/\s+/g, '');
    const key = `processDesigner.socketLabels.${normalized}`;
    return te(key) ? t(key) : humanizeNodeLabel(value);
  }

  function processPortLabel(node = {}, port = {}) {
    const field = designer.fieldsForEntity(nodeTypeId(node)).find(candidate => candidate.value === port.id);
    if (field) return field.i18n ? t(field.i18n) : field.label;
    if (port.role === 'data' && port.id === 'start') return t('processDesigner.socketLabels.startPosition');
    return processSocketLabel(port.label || port.id);
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

  function processNodeOperationOptions(kind = '') {
    const record = typeof kind === 'object' ? kind : { kind };
    // v5 species records have no operation switch: the species IS the
    // operation (SPEC §20 vocabulary).
    if (String(record.kind || '').startsWith('cts.')) return [];
    const operations = processNodeOperations[record.kind] || [];
    return operations.map(value => ({ label: processNodeOperationLabels[value] || value, value }));
  }

  // The field projection's path choices: the bound type's readable fields.
  // Unbound, a cts.field offers no paths (only its entity input).
  function processNodeFieldOptions(node = {}) {
    if (node.kind !== 'cts.field') return [];
    const bound = nodeTypeId(node);
    if (!bound) return [];
    return designer.fieldsForEntity(bound)
      .filter(field => field.readable !== false)
      .map(field => ({
        label: field.i18n ? `${t(field.i18n)} · ${field.value}` : field.label,
        value: field.value,
        type: field.type
      }));
  }

  // Status fallback choices for an effect's typed status input: the bound
  // type's declared top-level states (the domain lifecycle the compiler and
  // the status engine resolve against).
  function processStatusOptionsFor(node = {}) {
    const region = primaryRegionOf(nodeTypeId(node));
    if (!region) return [];
    return Object.entries(region.states || {})
      .filter(([key]) => !key.includes('.'))
      .map(([key, state]) => ({ label: state.label || key, value: key }));
  }

  function processTypeIdOptions(node = {}) {
    const kind = opKind(node);
    if (kind === 'effect.createEntity' || kind === 'effect.runProducer') return designer.createEntityOptions;
    if (kind === 'effect.updateEntity') return designer.updateEntityOptions;
    if (kind === 'effect.changeStatus') return designer.changeStatusOptions;
    if (kind === 'effect.archiveEntity') return designer.archivableEntityOptions;
    if (kind === 'effect.deleteEntity') return designer.deleteEntityOptions;
    if (kind === 'read.queryEntities' || kind === 'read.children') return designer.listableEntityOptions;
    if (kind.startsWith('read.')) return designer.readableEntityOptions;
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
    // `record.label` is the kind sentinel (syncProcessNode keeps
    // `label === kind`), not authored display data — the palette item and
    // the node definition are the only label sources.
    // The bound type decides the catalog item: a bare species record must
    // not borrow the first catalog entry's label (the type catalog leads
    // the palette, so items[0] is always a pre-bound variant).
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

  function syncProcessNodeConstruction(node = {}) {
    const contract = constructionContractForEntity(nodeTypeId(node));
    const modes = contract.modes?.length ? contract.modes : ['genericCreate'];
    node.construction ||= {};
    // Legacy draft records carried the authored mode as `via`; the sync
    // pass adopts it as the one spelling and drops the stale key so the
    // next save persists `construction.mode` only.
    if (!node.construction.mode && node.via && modes.includes(node.via)) {
      node.construction.mode = node.via;
    }
    if (node.via !== undefined) delete node.via;
    if (!modes.includes(node.construction.mode)) {
      node.construction.mode = contract.defaultMode && modes.includes(contract.defaultMode)
        ? contract.defaultMode
        : modes[0];
    }
    node.construction.inputs = constructionInputsForMode(contract, node.construction.mode)
      .map(input => ({ ...input }));
  }

  // The one sync entry point for a process-node record. The steps run in a
  // fixed order and later steps read what earlier ones normalized — the
  // Item/List/Tree access string must land before effect grant
  // normalization rewrites `access`, construction before the initial state,
  // blocks/fields before port resolution — and every step is idempotent, so
  // repeated passes converge instead of oscillating.
  function syncProcessNode(node = {}) {
    normalizeProcessNodeDefaults(node);
    seedLiteralEntityBinding(node);
    normalizeEffectEnvelope(node);
    normalizeCreateEnvelope(node);
    normalizeBindingDefaults(node);
    resolveProcessNodePorts(node);
  }

  function normalizeProcessNodeDefaults(node = {}) {
    node.kind ||= 'source.literalItem';
    const op = opKind(node);
    if (op === 'collection.sort') {
      node.direction = ['asc', 'desc'].includes(node.direction) ? node.direction : 'asc';
      delete node.operation;
    } else {
      node.operation ||= defaultProcessNodeOperation(node.kind);
    }
    node.type = node.type?.base ? processType(node.type.base, node.type) : processType('json');
    // Effect records carry grant objects in `access`; the Item/List/Tree
    // socket-access string belongs to the pure value algebra only. Writing
    // the string on an effect would spread it into `{"0":"i",…}` junk keys
    // when normalizeDesignerAccess runs in the effect envelope below.
    if (!op.startsWith('effect.')) {
      node.access = node.kind === 'source.literalList' ? 'list' : node.kind === 'source.literalTree' ? 'tree' : (node.access || 'item');
    }
    node.matching = ['longest', 'shortest', 'cross'].includes(node.matching) ? node.matching : 'longest';
    node.inputTransforms ||= {};
    node.icon = iconForProcessNode(node.kind);
    // Designer-owned junk keys, pruned on every pass (authored records
    // never carry them; drafts written by older factories did). `cases`
    // is NOT junk — the shared control-node contract reads it.
    delete node.retry;
    delete node.status;
  }

  // An entityRef literal needs a concrete entity type to be authorable:
  // seed the first type when none is bound and keep the value's type
  // aligned with the record binding.
  function seedLiteralEntityBinding(node = {}) {
    if (opKind(node) !== 'source.literalItem' || node.type?.base !== 'entityRef') return;
    node.typeId ||= defaultTypeId();
    node.type.typeId = node.typeId;
    if (node.value?.id) node.value = { ...node.value, type: node.typeId };
  }

  function normalizeEffectEnvelope(node = {}) {
    if (!opKind(node).startsWith('effect.')) return;
    node.trigger ||= { mode: 'manual' };
    if (!['manual', 'event'].includes(node.trigger.mode)) node.trigger.mode = 'event';
    node.access = normalizeDesignerAccess(node.access);
    node.entryTriggerId = node.id;
  }

  function normalizeCreateEnvelope(node = {}) {
    const op = opKind(node);
    if (['effect.createEntity', 'effect.runProducer'].includes(op)) {
      syncProcessNodeConstruction(node);
      node.state ||= {};
      node.state.to ||= initialStateForEntity(nodeTypeId(node));
    }
    if (op === 'effect.createEntity') {
      setNodeBlocks(node, constructibleEntityBlocks(nodeTypeId(node)));
      node.fields = [];
    }
  }

  function normalizeBindingDefaults(node = {}) {
    if (node.kind === 'cts.field') {
      // The projection gate carries no Type pin of its own: its binding
      // follows the entity input, so a stray stored binding is dropped.
      delete node.typeId;
      delete node.fieldSchemas;
      // An unbound record offers only its entity input; a bound one
      // defaults its path to the type's first readable field.
      const bound = nodeTypeId(node);
      const available = bound
        ? designer.fieldsForEntity(bound).filter(field => field.readable !== false)
        : [];
      if (!available.some(field => field.value === node.path)) node.path = available[0]?.value || '';
    } else {
      node.path = '';
    }
    delete node.fieldSchema;
    if (isOpKind(node, 'read.related')) {
      const relations = relationOptionsForEntity(nodeTypeId(node));
      if (!relations.some(relation => relation.value === node.relationKey)) node.relationKey = relations[0]?.value || '';
    }
  }

  function resolveProcessNodePorts(node = {}) {
    // `label` is the kind sentinel (display labels derive from the palette
    // item / node definition, never from an authored record label).
    node.label = node.kind;
    node.inputs = processNodeInputs(node);
    node.outputs = processNodeOutputs(node);
    syncProcessNodeProducerOutputs(draft.value.data, node);
    node.inputDefaults ||= {};
    const inputIds = new Set(node.inputs.map(input => input.id));
    for (const inputId of Object.keys(node.inputDefaults)) {
      if (!inputIds.has(inputId)) delete node.inputDefaults[inputId];
    }
  }

  function applyInferredProcessNodeInputs(record = {}) {
    if (record?.kind) syncProcessNode(record);
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
    sameTypeId,
    v5Record,
    catalogPorts,
    catalogContext,
    portForHandle,
    socketPairCompatible,
    relationOptionsForEntity,
    initialStateForEntity,
    constructionContractForEntity,
    constructionInputsForMode,
    constructionModeOptions,
    artifactCreationKinds,
    updateArtifactCreationKinds,
    processNodeInputs,
    processNodeOutputs,
    processNodeOperationOptions,
    processNodeFieldOptions,
    processStatusOptionsFor,
    processTypeIdOptions,
    processNodeSummary,
    processNodeDisplayLabel,
    processNodeDescription,
    connectedProcessInputIds,
    applyInferredProcessNodeInputs,
    syncProcessNode
  };
}
