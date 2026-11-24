import { computed, nextTick, ref, watch } from 'vue';
import { createPortCompatibilityRegistry } from '@perigram/plugin-sdk/nodes';
import {
  EFFECT_SPECIES_KINDS,
  getProcessNodeDefinition,
  applyFieldDisplayRole,
  authoredSocketDefault,
  canvasToDefinition,
  DECLARATION_NODE_TYPES,
  declarationNodePorts,
  declarationWireLegality,
  childrenWireLegality,
  definitionToCanvas,
  isProcessDataHandle,
  normalizeDesignerAccess,
  parseProcessSocketHandleId,
  registerProcessPortCompatibilityProfile,
  PROCESS_PORT_COMPATIBILITY_PROFILE,
  compileTreeDeclarations,
  PROCESS_DATAFLOW_VERSION,
  authoredProcessDataFromGraphDocument,
  createProcessGraphDocument
} from '#packages/processes';
import { normalizeType, operationKindOf } from '#packages/cts';
import { createPaletteText } from '~/utils/processDesignerPaletteText.js';
import { signalForPaletteGroup } from '~/utils/processDesignerSignals.js';
import { generateTypeId, mintId } from '~/utils/processDesignerIdentity.js';
import { commandInputs, commandOutputs } from '~/utils/processDesignerCommandPorts.js';
import { createService, createSocket } from '~/utils/processDesignerDefinitionRecords.js';

import { createGraphAuthoringState, useGraphAuthoringSession } from '~/composables/useGraphAuthoringSession.js';
import { useProcessDesignerConnectionInference } from '~/composables/useProcessDesignerConnectionInference.js';
import { useProcessDesignerInspector } from '~/composables/useProcessDesignerInspector.js';
import { useProcessDesignerNodeRecords } from '~/composables/useProcessDesignerNodeRecords.js';
import { useProcessDesignerNodeSync } from '~/composables/useProcessDesignerNodeSync.js';
import { useProcessDesignerTypes } from '~/composables/useProcessDesignerTypes.js';
import { useProcessDesignerContextPalette } from '~/composables/useProcessDesignerContextPalette.js';
import { useProcessDesignerPalette } from '~/composables/useProcessDesignerPalette.js';
import { useProcessDesignerPreview } from '~/composables/useProcessDesignerPreview.js';
import { useProcessDesignerGraphEditing } from '~/composables/useProcessDesignerGraphEditing.js';
import { useProcessDesignerLiveGraph } from '~/composables/useProcessDesignerLiveGraph.js';

// Process profile over useGraphAuthoringSession (composables/README.md).
export function useProcessProfile({
  t,
  te,
  toast,
  draft = ref(null),
  roles = () => ({}),
  activeOrganizationId = () => null,
  persistence = {},
  graphEvaluation = { value: null },
  seedPlacement = node => node
}) {
  const portCompatibility = createPortCompatibilityRegistry();
  registerProcessPortCompatibilityProfile(portCompatibility);
  const { nodes, edges } = createGraphAuthoringState();
  const validation = ref(null);

  const { paletteLabel, paletteDescription, paletteGroupLabel } = createPaletteText({ t, te });

  const {
    designer,
    ctsRegistry,
    ctsProjectedDomain,
    ctsTypeView,
    classNameMap,
    ctsOrgTypes,
    refreshTreeOverlay,
    loadOrgTypes,
    loadProcessCapabilities,
    persistTreeDeclarations,
    servedCommands,
    servedPreviewChannels,
    servedClientEngines,
    servedClientRuntimes
  } = useProcessDesignerTypes({
    nodes,
    edges,
    t,
    toast,
    activeOrganizationId,
    records: () => draft.value?.data?.processNodes || {},
    syncNow: () => syncNodeData()
  });

  // The sync pass is late-bound below (it reads option lists this section has
  // not created yet): node records own factory shapes, the sync composable
  // owns record derivation, and each receives the other through a wrapper.
  let syncProcessNodeImpl = () => {};
  const nodeRecords = useProcessDesignerNodeRecords({
    designer,
    translate: key => t(key),
    syncProcessNode: node => syncProcessNodeImpl(node)
  });
  const {
    isOpKind,
    nodeTypeId,
    setNodeTypeId,
    catalogPorts,
    catalogContext,
    portForHandle,
    socketPairCompatible,
    opKind,
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
  } = useProcessDesignerNodeSync({
    designer,
    t,
    te,
    draft,
    edges,
    nodeRecords,
    projectedDomain: ctsProjectedDomain,
    paletteLabel,
    paletteDescription,
    portCompatibility
  });
  syncProcessNodeImpl = syncProcessNode;

  const authoring = useGraphAuthoringSession({
    nodes,
    edges,
    draft,
    decorateEdge: value => decorateEdge(value),
    closePalette: () => closeContextPalette(),
    syncEdges: () => syncEdgeSelection(),
    selectedGraphNodes: () => selectedGraphNodes(),
    selectedGraphEdges: () => selectedGraphEdges(),
    deleteGraphSelection: () => deleteGraphSelection()
  });
  const {
    clearGraphSelection,
    reset: resetGraphSelection,
    selectEdge,
    selectedEdgeId,
    selectedNode,
    selectedNodeId,
    selectNode
  } = authoring;
  const { inferGenericNodeTypeFromConnection } = useProcessDesignerConnectionInference({
    nodes,
    draft,
    resolveOutputs: record => catalogPorts(record).outputs,
    portForHandle,
    syncProcessNode
  });

  const {
    processNodeOperations,
    processNodeOperationLabels,
    createProcessNode,
    defaultTypeId
  } = nodeRecords;

  const {
    ensureRecord,
    factoryForType,
    recordKeyForType,
    selectedEntity,
    selectedProcessNode
  } = useProcessDesignerInspector({
    draft,
    selectedNode,
    factories: {
      processNode: createProcessNode,
      ctsClass: id => ({ id, kind: 'class', typeId: '', class: 'file', payload: null, operators: [] }),
      ctsField: id => ({ id, kind: 'field', typeId: null, name: '', descriptor: { base: 'string' } }),
      ctsState: id => ({ id, kind: 'state', typeId: null, value: '', initial: false, terminal: false }),
      ctsType: id => ({ id, kind: 'type', typeId: '' })
    }
  });

  const {
    deleteGraphSelection,
    selectedGraphEdges,
    selectedGraphNodes
  } = useProcessDesignerGraphEditing({
    draft,
    nodes,
    edges,
    selectedNode,
    selectedNodeId,
    selectedEdgeId,
    recordKeyForType,
    onGraphChange: () => syncNodeData()
  });

  const {
    canvasFrame,
    touchPanDrag,
    handleDesignerPointerDown,
    handleDesignerFocus,
    handleDesignerWheel,
    clientPoint,
    clientToGraphPosition,
    nextNodePosition,
    frameAllNodes,
    frameSelectedNodes,
    frameNodeIds,
    zoomCanvasIn,
    zoomCanvasOut,
    resetCanvasZoom,
    fitInitialCanvas,
    snapshotViewport,
    designerViewport
  } = authoring;

  const bindFrame = instance => { canvasFrame.value = instance; };
  const bindContextPaletteSearch = instance => { contextPaletteSearch.value = instance; };

  const {
    validationDiffLines,
    selectedNodeSupportsPreview,
    selectedChannelNode,
    selectedChannelInputs,
    selectedChannelOutputs,
    formatPreviewPath,
    formatPreviewItems,
    nodeDiagnostics,
    focusValidationDiagnostic,
    focusFirstValidationDiagnostic
  } = useProcessDesignerPreview({
    t,
    validation,
    selectedNode,
    selectedProcessNode,
    processNodeInputs,
    processNodeOutputs,
    nodes,
    edges,
    selectNode,
    selectEdge,
    frameNodeIds,
    graphEvaluation
  });

  const {
    contextPalette,
    openPanePalette,
    closeContextPalette,
    contextItemCompatible,
    addContextNode,
    contextPaletteSearch,
    beginSocketConnection,
    endSocketConnection
  } = useProcessDesignerContextPalette({
    nodes,
    draft,
    canvasFrame,
    clientPoint,
    clientToGraphPosition,
    catalogPorts,
    portForHandle,
    socketPairCompatible,
    createProcessNode,
    clonePalettePreset,
    syncProcessNode,
    addNode,
    onConnect: connection => onConnect(connection)
  });

  const { filteredGroups: designerPaletteGroups, contextGroups: designerContextPaletteGroups } = useProcessDesignerPalette({
    // A getter, not the array: capability and type-catalog loads replace
    // designer.paletteGroups after mount, and the palette must follow without
    // a remount (the async-loaded case the composable resolves reactively).
    groups: () => designer.paletteGroups,
    context: contextPalette,
    isCompatible: contextItemCompatible
  });

  // Palette groups for the dock and the context palette: localized group
  // labels and per-item labels (the filter matches them), descriptions for
  // the row tooltip, and the shared category signal (the dot reads it).
  // Plugin sections carry their subgroups through beside the flat items.
  const toPaletteItems = (items, signalId) => (items || []).map(item => ({
    ...item,
    label: paletteLabel(item),
    description: paletteDescription(item),
    signal: signalForPaletteGroup(signalId)
  }));
  const toPaletteGroups = groups => (groups || []).map(group => ({
    id: group.id,
    source: group.source,
    label: group.label || paletteGroupLabel(group.id),
    items: toPaletteItems(group.items, group.id),
    ...(Array.isArray(group.subgroups) && group.subgroups.length ? {
      subgroups: group.subgroups.map(subgroup => ({
        id: subgroup.id,
        label: subgroup.label,
        items: toPaletteItems(subgroup.items, subgroup.id)
      }))
    } : {})
  })).filter(group => group.items.length);
  const paletteGroups = computed(() => toPaletteGroups(designerPaletteGroups.value));
  const contextPaletteGroups = computed(() => toPaletteGroups(designerContextPaletteGroups.value));

  const roleList = computed(() => Object.values(roles() || {}));
  const roleOptions = computed(() => roleList.value.map(role => ({ label: role.label || role.id, value: role.id })));
  const servicePrincipals = computed(() => draft.value?.data?.servicePrincipals || {});
  const servicePrincipalList = computed(() => Object.values(servicePrincipals.value));
  const servicePrincipalOptions = computed(() => servicePrincipalList.value.map(principal => ({ label: principal.label || principal.id, value: principal.id })));
  const typeIdOptions = computed(() => {
    const icons = new Map(ctsTypeView().map(entry => [entry.id, entry.icon]));
    return designer.entityOptions.map(option => ({ ...option, icon: icons.get(option.value) || null }));
  });
  const commandOptions = computed(() => designer.commandOptions);
  const serviceList = computed(() => Object.values(draft.value?.data?.services || {}));
  const socketList = computed(() => Object.values(draft.value?.data?.sockets || {}));
  const selectedSocketId = ref('');
  const selectedSocketRecord = computed(() => draft.value?.data?.sockets?.[selectedSocketId.value] || socketList.value[0] || null);
  const selectedEntityAvailable = computed(() => Boolean(selectedEntity.value?.producerOutputId));
  const socketDirections = [
    { label: t('processDesigner.socketDirection.outbound'), value: 'outbound' },
    { label: t('processDesigner.socketDirection.inbound'), value: 'inbound' }
  ];
  const fieldOptionsForSelectedSocket = computed(() => designer.fieldsForEntity(selectedSocketRecord.value?.typeId));
  const declarationNodeTypes = DECLARATION_NODE_TYPES;
  const selectedDeclarationEdge = computed(() => edges.value.find(edge => edge.id === selectedEdgeId.value && edge.role === 'type') || null);
  // The registry accepts kebab ids only; anything else silently drops the
  // declaration from the overlay (defineType throws), which reads on the
  // canvas as "sockets stopped regenerating". Validity is authored live.
  const classTypeIdValid = computed(() => /^[a-z][a-z0-9-]*$/.test(selectedNode.value?.type === 'ctsClass' ? selectedNode.value.data?.typeId || '' : 'x'));
  // Declaration diagnostics against the registry's own normalizer: what
  // SAVE/APPLY would reject is visible while authoring, not after. The
  // compile is gated on the declaration plane's authoring signature, so
  // position drags and selection churn never recompile it.
  const declarationPlaneSignature = computed(() => JSON.stringify({
    cards: nodes.value.filter(node => node.type !== 'processNode').map(node => [node.id, node.type, node.data]),
    wires: edges.value.filter(edge => edge.role === 'type').map(edge => [edge.id, edge.source, edge.target, edge.sourceHandle, edge.targetHandle, edge.label]),
    records: draft.value?.data?.processNodes ?? null
  }));
  const classDeclarationDiagnostics = ref([]);
  watch(declarationPlaneSignature, () => {
    if (!nodes.value.some(node => node.type === 'ctsClass')) {
      classDeclarationDiagnostics.value = [];
      return;
    }
    const { declarations, diagnostics } = compileTreeDeclarations(
      nodes.value,
      edges.value,
      draft.value?.data?.processNodes || {}
    );
    for (const declaration of declarations) {
      try {
        normalizeType({ ...declaration, scope: 'org', organizationId: activeOrganizationId() });
      } catch (error) {
        diagnostics.push(`${declaration.id || '(unnamed type)'}: ${error.message}`);
      }
    }
    classDeclarationDiagnostics.value = diagnostics;
  }, { immediate: true });
  // Node-scoped diagnostics re-stamp on every validation arrival: the
  // anchored diagnostics of the fresh result land on the faulted cards
  // through the one enrichment pass (SPEC §28).
  watch(nodeDiagnostics, () => {
    for (const node of nodes.value) enrichNodeData(node);
  });
  // Row-relative row-field ids (SPEC §7/§20): projected schema paths carry
  // the `fields.`/`data.`/`specs.` block prefix; guard paths, field-policy
  // lists, and the enforcement seams address the bare row id.
  function rowFieldIdOptions(typeId, { topLevelOnly = false } = {}) {
    const seen = new Set();
    const options = [];
    for (const field of designer.fieldsForEntity(typeId)) {
      if (!['fields', 'data', 'specs'].includes(field.block)) continue;
      const stripped = String(field.value || '').replace(/^(fields|data|specs)\./, '');
      const id = topLevelOnly ? stripped.split('.')[0] : stripped;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      options.push({ label: field.i18n ? t(field.i18n) : (field.label && field.label !== field.value ? field.label : id), value: id });
    }
    return options;
  }
  const transitionGuardFieldOptions = computed(() => {
    const record = selectedProcessNode.value;
    if (record?.kind !== 'cts.transition') return [];
    return rowFieldIdOptions(nodeTypeId(record));
  });
  // The state-policy facet authors on the typed operation (SPEC §7): the
  // transition's target state, the construct's initial state. The socket
  // default arrives as a data-tree packet in live records; the authored
  // value is the target.
  const recordStatePolicyTarget = computed(() => {
    const record = selectedProcessNode.value;
    if (!['cts.transition', 'cts.construct'].includes(record?.kind)) return '';
    if (!nodeTypeId(record)) return '';
    const raw = record.kind === 'cts.transition'
      ? (record.state?.to ?? authoredSocketDefault(record.inputDefaults?.state))
      : authoredSocketDefault(record.inputDefaults?.state);
    const value = authoredSocketDefault(raw);
    return typeof value === 'string' ? value : '';
  });
  const recordStateFieldPolicyOptions = computed(() => {
    if (!recordStatePolicyTarget.value) return [];
    const record = selectedProcessNode.value;
    return rowFieldIdOptions(nodeTypeId(record), { topLevelOnly: true });
  });
  // The class inspector's identifier dropdown (SPEC §4): options are the
  // sibling field nodes of the selected class; '' leaves the flag unowned
  // and the declaration carries the compile error until a field is picked.
  const classIdentifierField = computed(() => {
    const node = selectedNode.value;
    if (node?.type !== 'ctsClass') return { options: [], value: '' };
    const siblings = nodes.value.filter(candidate => candidate.type === 'ctsField'
      && (candidate.data?.typeId ?? null) === (node.data?.typeId ?? null));
    if (!siblings.length) return { options: [], value: '' };
    const holder = siblings.find(candidate => candidate.data?.descriptor?.identifier === true);
    return {
      options: [
        { label: t('processDesigner.unset'), value: '' },
        ...siblings.map(candidate => ({ label: candidate.data?.name || candidate.id, value: candidate.id }))
      ],
      value: holder?.id || ''
    };
  });
  function commandForId(commandId) {
    return servedCommands.value.find(command => command?.id === commandId) || null;
  }

  const selectedCommandService = computed(() => {
    const node = selectedProcessNode.value;
    if (!isOpKind(node, 'cts.command') || !node.commandId) return null;
    return serviceList.value.find(service => service.commandId === node.commandId) || null;
  });
  function createCommandServiceForSelectedNode() {
    const node = selectedProcessNode.value;
    if (!isOpKind(node, 'cts.command') || !node.commandId) return;
    const id = mintId('service');
    const record = createService(id);
    record.commandId = node.commandId;
    const command = commandForId(node.commandId);
    record.label = command?.label || node.commandId;
    record.serviceType = command?.service || '';
    record.inputs = commandInputs(command);
    record.outputs = commandOutputs(command);
    draft.value.data.services ||= {};
    draft.value.data.services[id] = record;
    syncNodeData();
  }
  function removeSelectedCommandService() {
    const record = selectedCommandService.value;
    if (!record) return;
    delete draft.value.data.services[record.id];
    syncNodeData();
  }
  function addSocket() {
    const id = mintId('socket');
    draft.value.data.sockets ||= {};
    draft.value.data.sockets[id] = createSocket(id);
    selectedSocketId.value = id;
  }
  function removeSelectedSocket() {
    if (!selectedSocketRecord.value) return;
    delete draft.value.data.sockets[selectedSocketRecord.value.id];
    selectedSocketId.value = '';
  }
  const ACCESS_LEVEL_ORDER = { read: 0, write: 1, admin: 2 };
  const selectedProcessNodeEffectiveAccess = computed(() => {
    const node = selectedProcessNode.value;
    const typeId = nodeTypeId(node) || node?.targetTypeId || '';
    if (!EFFECT_SPECIES_KINDS.has(opKind(node)) || !typeId) return [];
    const byRole = new Map();
    const record = (roleId, level, inherited) => {
      const current = byRole.get(roleId);
      if (current && ACCESS_LEVEL_ORDER[current.level] >= ACCESS_LEVEL_ORDER[level]) return;
      byRole.set(roleId, { roleId, level, inherited });
    };
    for (const grant of node.access?.grants || []) {
      if (grant.roleId) record(grant.roleId, grant.level || node.access?.level || 'write', false);
    }
    for (const output of Object.values(draft.value?.data?.producerOutputs || {})) {
      if (output.typeId !== typeId) continue;
      for (const level of ['read', 'write', 'admin']) {
        for (const roleId of output.allowedRoles?.[level] || []) record(roleId, level, true);
      }
    }
    return [...byRole.values()]
      .map(item => ({
        label: `${roles()?.[item.roleId]?.label || item.roleId}: ${item.level}${item.inherited ? ' (from entity access)' : ''}`,
        inherited: item.inherited
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  });
  const selectedProcessNodeGrants = computed(() => (selectedProcessNode.value?.access?.grants || []).filter(grant => grant.roleId));
  function updateSelectedProcessNodeGrantLevel(index, level) {
    const node = selectedProcessNode.value;
    if (!node) return;
    const grants = [...(node.access?.grants || [])];
    if (grants[index]) grants[index] = { ...grants[index], level: level || 'write' };
    node.access = { ...(node.access || {}), grants };
    syncNodeData();
  }

  // The live evaluation loop (Blender-style): any authoring change — a
  // rename, a wire, an inspector edit, a descriptor change — re-interprets
  // declaration wires and re-syncs every dependent surface. Connect
  // handlers call evaluateNow() for instant feedback; everything else is
  // the watcher's job. Instantiated after every composable and option list
  // the sync pass reads: the watcher runs its first pass immediately, and
  // those bindings must not be in their temporal dead zone.
  // Consumer species (mutate/transition/remove) carry no Type pin — plugging
  // a typed entity stream into one adapts it to that type through the
  // resolver below.
  const liveGraph = useProcessDesignerLiveGraph({
    nodes,
    edges,
    draft,
    apply: applyGraphInterpretation,
    resolveEntityBinding: resolveEntityInputType,
    // The registry view owns the rest of the known vocabulary; tree classes
    // are known through the canvas itself inside interpretation.
    knownTypeIds: () => ctsTypeView().map(entry => entry.id)
  });
  const { evaluateNow } = liveGraph;

  // The incoming entity window of one record — the entity-bearing output
  // port of whatever feeds its `entity` input, resolved through the same
  // catalog ports the node cards render (never by sniffing stored record
  // shapes). One resolver feeds both consumers: the live-graph entity
  // binding (type only) and the inspector's access-detail window (type,
  // status, access).
  function incomingEntityContract(recordId) {
    const graphNode = nodes.value.find(node => node.type === 'processNode' && node.data?.refId === recordId);
    if (!graphNode) return {};
    const edge = edges.value.find(item => (
      item.target === graphNode.id
      && String(item.targetHandle || '').replace(/^(?:input|data):/, '') === 'entity'
    ));
    if (!edge) return {};
    const source = nodes.value.find(node => node.id === edge.source);
    if (!source) return {};
    const sourceRecord = source.data?.refId
      ? draft.value?.data?.processNodes?.[source.data.refId]
      : null;
    const sourcePorts = sourceRecord ? catalogPorts(sourceRecord).outputs : [];
    const port = sourceRecord
      ? (portForHandle(sourcePorts, edge.sourceHandle, 'output')
        || sourcePorts.find(candidate => candidate.type?.typeId || candidate.type?.itemType?.typeId)
        || null)
      : null;
    const typeId = port?.type?.typeId || port?.type?.itemType?.typeId
      || (sourceRecord ? nodeTypeId(sourceRecord) : '')
      || source.data?.typeId
      || '';
    return {
      typeId,
      status: typeof port?.status === 'string' ? port.status : (sourceRecord?.state?.to || sourceRecord?.status?.to || ''),
      access: sourceRecord?.access ? normalizeDesignerAccess(sourceRecord.access) : null
    };
  }

  function resolveEntityInputType(recordId) {
    return incomingEntityContract(recordId).typeId || '';
  }

  function applyGraphInterpretation(mutations) {
    for (const mutation of mutations) {
      if (mutation.scope === 'node') {
        const node = nodes.value.find(candidate => candidate.id === mutation.nodeId);
        if (node) node.data[mutation.key] = mutation.value;
        continue;
      }
      const record = draft.value?.data?.processNodes?.[mutation.recordId];
      if (!record) continue;
      if (mutation.key === 'typeId') {
        setNodeTypeId(record, mutation.value);
        continue;
      }
      if (mutation.key === 'path') {
        record.path = mutation.value;
        continue;
      }
      if (mutation.key.startsWith('inputDefaults.')) {
        const inputId = mutation.key.slice('inputDefaults.'.length);
        record.inputDefaults = { ...(record.inputDefaults || {}), [inputId]: mutation.value };
        continue;
      }
      if (mutation.key.startsWith('state.')) {
        record.state = { ...(record.state || {}), [mutation.key.slice('state.'.length)]: mutation.value };
      }
      // Unknown record keys are ignored: interpretation is the only mutation
      // source, and a silent fallback reinterpreting them as typeId writes
      // corrupted records (the recursive-update loop).
    }
    syncNodeData();
    // No live edge pruning here: sockets legitimately vanish and return
    // during transient authoring (an unset ref mid-gesture, a rename), and
    // deleting the wire destroys the author's wiring when the socket comes
    // back. Serialization owns stale-edge filtering (`validProcessEdges`), so
    // a genuinely removed socket drops its edge at save — never before.
  }

  // The one node-data enrichment pass: mutates and returns the canvas node
  // with everything its card and the inspector read — record sync, derived
  // labels, port specs, and option lists. Both initial projection
  // (loadDocument/addNode) and every live sync go through here, so a node's
  // rendered state has exactly one derivation.
  //
  // DERIVED_NODE_DATA_KEYS is the single list this function and
  // stripRuntimeNodeData work from: enrich may only write derived values
  // under these keys, and strip removes exactly these keys (minus the
  // declaration-authored carve-out inside strip) so derived state never
  // persists. Add a derived key here and to the list in the same change.
  // Retired derivations (e.g. `processFieldOptions`) stay listed so copies
  // persisted by older drafts are still stripped at save.
  const DERIVED_NODE_DATA_KEYS = [
    'label',
    'typeId',
    'commandId',
    'type',
    'version',
    'scope',
    'fields',
    'states',
    'processNodeRecord',
    'onProcessNodeUpdate',
    'processTypeIdOptions',
    'processOperationOptions',
    'processFieldOptions',
    'processStatusOptions',
    'processConnectedInputIds',
    'processConnectedOutputIds',
    'processNodeGlyph',
    'kindLabel',
    'groupLabel',
    'diagnostics',
    'summary',
    'purpose',
    'inputSpecs',
    'outputSpecs',
    'fieldTypeLabelFor'
  ];

  function enrichNodeData(node) {
    const record = ensureRecord(recordKeyForType(node.type), node, factoryForType(node.type));
    const isProcessNode = node.type === 'processNode';
    if (isProcessNode) {
      syncEffectTriggerMode(node, record);
      syncProcessNode(record);
    }
    if (DECLARATION_NODE_TYPES.includes(node.type)) syncDeclarationRecord(record, node);

    const data = node.data || (node.data = {});
    Object.assign(data, {
      // Declaration node labels derive from the declaration itself; a
      // renamed class card shows the current name, not the drop-time one.
      label: declarationNodeLabel(node, record),
      typeId: nodeTypeId(record),
      commandId: record.commandId,
      processNodeRecord: isProcessNode ? record : null,
      onProcessNodeUpdate: isProcessNode ? updates => updateProcessNodeRecord(record.id || data.refId, updates) : null,
      processTypeIdOptions: isProcessNode ? processTypeIdOptions(record) : [],
      processOperationOptions: isProcessNode ? processNodeOperationOptions(record) : [],
      processStatusOptions: isProcessNode ? processWorkflowPaths(record) : [],
      processConnectedInputIds: isProcessNode ? connectedProcessInputIds(node, record) : [],
      processConnectedOutputIds: isProcessNode ? connectedProcessOutputIds(node, record) : [],
      processNodeGlyph: isProcessNode ? getProcessNodeDefinition(record.kind)?.glyph || '' : '',
      kindLabel: isProcessNode ? processNodeDisplayLabel(record) : record.kind,
      groupLabel: isProcessNode ? paletteGroupLabel(processNodeGroupLabel(record)) : '',
      summary: processNodeSummary(record),
      purpose: isProcessNode ? processNodeDescription(record) : '',
      diagnostics: nodeDiagnostics.value?.(node.id) ?? null
    });

    if (DECLARATION_NODE_TYPES.includes(node.type)) {
      // Declaration nodes derive their typed specs from the declaration
      // itself (declarationNodePorts / the registry entry), never from record
      // inputs/outputs.
      const ports = declarationNodePorts(node, ctsTypeView()) || {};
      data.inputSpecs = ports.inputSpecs || [];
      data.outputSpecs = ports.outputSpecs || [];
      if (node.type === 'ctsField') {
        // Ref cards render accepted type LABELS (SPEC §4): the resolver
        // covers tree class names first, the registry view's labels second.
        const labels = classNameMap();
        data.fieldTypeLabelFor = id => labels.get(id) || id;
      }
      if (node.type === 'ctsClass') {
        data.scope = node.data?.scope || 'org';
      }
      if (node.type === 'ctsType') {
        const entry = ctsTypeView().find(candidate => candidate.id === data.typeId);
        data.type = entry || null;
        data.label = entry?.label || data.typeId || 'type';
      }
    } else {
      data.inputSpecs = record.inputs || [];
      data.outputSpecs = record.outputs || [];
    }
    return node;
  }

  // Declaration authoring state persists in `ctsTypes` records with the
  // draft (SPEC §20/§21 one tree): saving keeps the nodes, activation
  // compiles them into registry declarations.
  function syncDeclarationRecord(record = {}, node = {}) {
    record.kind = { ctsClass: 'class', ctsField: 'field', ctsState: 'state', ctsType: 'type' }[node.type] || record.kind;
    if (node.type === 'ctsClass') {
      record.typeId = node.data.typeId || '';
      record.name = node.data.name || '';
      record.glyph = node.data.glyph || null;
      record.class = node.data.class || 'file';
      record.payload = node.data.payload || null;
      record.operators = Array.isArray(node.data.operators) ? node.data.operators : [];
    }
    if (node.type === 'ctsField') {
      record.typeId = node.data.typeId || null;
      record.name = node.data.name || '';
      record.descriptor = { ...(node.data.descriptor || { base: 'string' }) };
    }
    if (node.type === 'ctsState') {
      record.typeId = node.data.typeId || null;
      record.value = node.data.value || '';
    }
    if (node.type === 'ctsType') record.typeId = node.data?.typeId || '';
  }

  function declarationNodeLabel(node, record) {
    if (node.type === 'ctsClass') return node.data?.name || node.data?.typeId || '';
    if (node.type === 'ctsField') return node.data?.name || '';
    if (node.type === 'ctsState') return node.data?.value || '';
    if (node.type === 'ctsType') return node.data?.typeId || 'type';
    return record.label || record.typeId || record.commandId || node.data?.label || '';
  }

  function updateProcessNodeRecord(nodeId, updates = {}) {
    const node = draft.value?.data?.processNodes?.[nodeId];
    if (!node) return;
    if (updates.typeId && updates.typeId !== nodeTypeId(node)) {
      node.path = '';
      node.relationKey = '';
    }
    // Inspector updates arrive in working keys; they land on the record in the
    // record's own vocabulary.
    const { typeId, ...rest } = updates;
    Object.assign(node, rest);
    if (typeId !== undefined) setNodeTypeId(node, typeId);
    syncProcessNode(node);
    pruneMissingProcessNodeInputEdges(nodeId, node);
    syncNodeData();
  }

  function updateProcessNodeConstructionMode(node = {}, mode = '') {
    if (!node?.id || !mode || node.construction?.mode === mode) return;
    // `construction.mode` is the one authored spelling; the v4 executable
    // contract derives its `via` at the lowering seam.
    updateProcessNodeRecord(node.id, {
      construction: { ...(node.construction || {}), mode }
    });
  }

  function pruneMissingProcessNodeInputEdges(nodeId, node = {}) {
    const graphNodeId = nodes.value.find(item => item.type === 'processNode' && item.data?.refId === nodeId)?.id;
    if (!graphNodeId) return;
    const inputIds = new Set(processNodeInputs(node).map(input => input.id));
    edges.value = edges.value.filter(edge => (
      edge.target !== graphNodeId
      || !isProcessDataHandle(edge.targetHandle)
      || inputIds.has(parseProcessSocketHandleId(edge.targetHandle))
    ));
  }

  function validProcessEdges() {
    const processNodesByGraphId = new Map(nodes.value
      .filter(node => node.type === 'processNode' && node.data?.refId)
      .map(node => [node.id, draft.value?.data?.processNodes?.[node.data.refId]]));
    return edges.value.filter(edge => {
      const node = processNodesByGraphId.get(edge.target);
      if (!node || !isProcessDataHandle(edge.targetHandle)) return true;
      return processNodeInputs(node).some(input => input.id === parseProcessSocketHandleId(edge.targetHandle));
    });
  }

  function stripRuntimeNodeData(node) {
    const runtimeFreeNode = { ...node };
    delete runtimeFreeNode.selected;
    delete runtimeFreeNode.dragging;
    delete runtimeFreeNode.resizing;
    // The canvas node's `hidden` flag is runtime presentation state — it
    // never persists into the draft graph.
    delete runtimeFreeNode.hidden;
    const data = { ...(node.data || {}) };
    // Declaration nodes carry authored state in keys the derived list also
    // uses for process nodes (typeId/version/scope/fields/states). Stripping
    // them here erased the class/type binding at save: canvasToDefinition
    // rebuilt the ctsTypes records from the stripped node data, nulled the
    // binding, and the live interpretation unbound every construct wired to
    // the class (ports collapsed, wires dropped). For declaration nodes
    // these keys ARE the authoring state and must persist.
    const authoredDeclarationKeys = DECLARATION_NODE_TYPES.includes(node.type)
      ? new Set(['typeId', 'version', 'scope', 'fields', 'states'])
      : null;
    for (const key of DERIVED_NODE_DATA_KEYS) {
      if (authoredDeclarationKeys?.has(key)) continue;
      delete data[key];
    }
    return { ...runtimeFreeNode, data };
  }

  function stripRuntimeEdgeData(edge) {
    const { animated, style, selected, markerEnd, pathOptions, ...rest } = edge;
    return rest;
  }

  function clonePalettePreset(preset = {}) {
    return clonePlainData(preset);
  }

  function clonePlainData(value = {}) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function isEffectNode(node) {
    const record = draft.value?.data?.processNodes?.[node.data?.refId];
    return Boolean(record) && EFFECT_SPECIES_KINDS.has(String(operationKindOf(record) || ''));
  }

  function nodeOperationKind(node) {
    const record = draft.value?.data?.processNodes?.[node.data?.refId];
    return record ? operationKindOf(record) : '';
  }

  // A fresh declaration in the tree gets a suggested kebab id unique among
  // registry types and in-tree declarations.
  // Fresh classes get an opaque random id at creation; it never changes
  // after that (rename is a label change only).
  function suggestTreeTypeId() {
    const taken = new Set([...ctsTypeView().map(entry => entry.id), ...nodes.value.filter(node => node.type === 'ctsClass').map(node => node.data.typeId)]);
    let id = generateTypeId();
    while (taken.has(id)) id = generateTypeId();
    return id;
  }

  // A name authors identity; the registry id is derived from it. The id only
  // becomes hand-authored when the author edits it directly — until then,
  // renaming re-derives the id (deduped against registry + tree).
  function updateClassName(node, name) {
    if (!node || node.type !== 'ctsClass') return;
    node.data.name = String(name || '');
    syncNodeData();
  }

  // The class dropdown drives the single-holder move (SPEC §4): a
  // field pick flags that field and clears its siblings; the empty pick
  // leaves the identifier unowned.
  function setClassIdentifierField(classNode, fieldNodeId) {
    if (!classNode || classNode.type !== 'ctsClass') return;
    if (fieldNodeId) {
      applyFieldDisplayRole(nodes.value, fieldNodeId, 'identifier', true);
    } else {
      const typeId = classNode.data?.typeId ?? null;
      const holder = nodes.value.find(candidate => candidate.type === 'ctsField'
        && (candidate.data?.typeId ?? null) === typeId
        && candidate.data?.descriptor?.identifier === true);
      if (holder) applyFieldDisplayRole(nodes.value, holder.id, 'identifier', false);
    }
    syncNodeData();
  }

  function renameDeclarationNode(props, value) {
    const node = nodes.value.find(candidate => candidate.id === props.id);
    if (!node) return;
    if (node.type === 'ctsField') node.data.name = String(value || '').trim();
    if (node.type === 'ctsState') node.data.value = String(value || '').trim();
    // No manual propagation here: the live-graph watcher re-interprets the
    // declaration wires, refreshes class counts and the tree overlay, and
    // re-syncs dependent ports in the same tick.
  }

  function addNode(item, position = nextNodePosition()) {
    const type = typeof item === 'string' ? item : item.type;
    const processNodeKind = typeof item === 'object' ? item.kind : null;
    const id = mintId(type);
    const refId = id;
    const node = {
      id,
      type,
      position,
      selected: true,
      data: { refId, label: refId }
    };
    // The loop item authors the loop PAIR: the closer is loop vocabulary,
    // not an independent authoring choice, so it lands beside its loop.
    const pairedKind = processNodeKind === 'control.forEach' ? 'control.forEachEnd' : null;
    if (DECLARATION_NODE_TYPES.includes(type)) {
      // Declaration-plane canvas nodes own `ctsTypes` records — they ARE the
      // type vocabulary, composed in the same tree (SPEC §20/§21), persisted
      // with the draft and compiled to the registry at activation.
      const classOf = typeof item === 'object' ? item.preset?.classOf : null;
      const typeNode = {
        id,
        type,
        position,
        selected: true,
        data: {
          refId: id,
          ...(type === 'ctsClass'
            ? { typeId: suggestTreeTypeId(), name: '', class: classOf || 'file', scope: 'tree', label: '', payload: null, fields: 0 }
            : type === 'ctsType'
              ? { typeId: '', label: '' }
              : type === 'ctsField'
                ? { typeId: null, name: '', descriptor: { base: 'string' } }
                : { typeId: null, value: '', severity: 'info' })
        }
      };
      nodes.value = [
        ...nodes.value.map(item => ({ ...item, selected: false })),
        enrichNodeData(typeNode)
      ];
      edges.value = edges.value.map(edge => decorateEdge({ ...edge, selected: false }));
      selectedNodeId.value = id;
      selectedEdgeId.value = null;
      syncEdgeSelection();
      return typeNode;
    }
    if (processNodeKind) {
      const record = ensureRecord('processNodes', node, createProcessNode);
      Object.assign(record, clonePalettePreset(typeof item === 'object' ? item.preset : {}));
      record.kind = processNodeKind;
      syncProcessNode(record);
    }
    let pairedNode = null;
    if (pairedKind) {
      const pairedId = mintId(pairedKind);
      pairedNode = {
        id: pairedId,
        type: 'processNode',
        position: { x: position.x + 320, y: position.y },
        selected: false,
        data: { refId: pairedId, label: pairedId }
      };
      const pairedRecord = ensureRecord('processNodes', pairedNode, createProcessNode);
      pairedRecord.kind = pairedKind;
      syncProcessNode(pairedRecord);
    }
    nodes.value = [
      ...nodes.value.map(item => ({ ...item, selected: false })),
      enrichNodeData(seedPlacement(node)),
      ...(pairedNode ? [enrichNodeData(seedPlacement(pairedNode))] : [])
    ];
    edges.value = edges.value.map(edge => decorateEdge({ ...edge, selected: false }));
    selectedNodeId.value = id;
    selectedEdgeId.value = null;
    syncEdgeSelection();
    return node;
  }

  function decorateEdges(items = []) {
    return items.map(edge => decorateEdge(edge));
  }

  // Wire styling encodes WHAT TRAVELS (node UI contract in
  // solid = instances (the entity
  // spine between operations), dashed = values, dotted = events — the one
  // wire family allowed color, the primary accent. Declaration bindings
  // keep the demuted structure dashed family as the second association
  // layer. No markers anywhere: direction reads from the left-to-right
  // handle canon.
  const WIRE_STYLES = {
    event: { stroke: 'var(--p-primary-color)', strokeWidth: 2.5, strokeDasharray: '1 5', strokeLinecap: 'round' },
    instance: { stroke: 'var(--p-text-color)', strokeWidth: 2 },
    value: { stroke: 'var(--p-text-muted-color)', strokeWidth: 1.5, strokeDasharray: '5 4' },
    type: { stroke: 'var(--ck-signal-structure-muted)', strokeWidth: 1.5, strokeDasharray: '4 3' }
  };

  // An edge's cargo layer: events (control role), declaration bindings
  // (type role), or the data role split by what its SOURCE socket
  // transports — entity bases are instances, everything else is a value.
  function edgeLayer(edge = {}) {
    if (edge.role === 'control') return 'event';
    if (edge.role === 'type') return 'type';
    const source = nodes.value.find(node => node.id === edge.source);
    const handle = edge.sourceHandle || '';
    const specId = handle.includes(':') ? handle.slice(handle.indexOf(':') + 1) : handle;
    const spec = [...(source?.data?.outputSpecs || []), ...(source?.data?.inputSpecs || [])]
      .find(candidate => candidate.id === specId);
    const base = spec?.type?.base || spec?.base || '';
    return base === 'entity' || base === 'entityRef' ? 'instance' : 'value';
  }

  function decorateEdge(edge = {}) {
    const selected = edge.selected === true || edge.id === selectedEdgeId.value;
    const layer = WIRE_STYLES[edgeLayer(edge)] || WIRE_STYLES.value;
    const decorated = {
      ...edge,
      // A wire leaving and re-entering one node (a class declaring itself
      // as its own children target — recursive containment, SPEC §6) draws
      // as a hoop over the card: the default bezier degenerates there into
      // a line through the node.
      type: edge.source === edge.target ? 'selfloop' : 'default',
      animated: selected,
      style: {
        stroke: selected ? 'var(--p-primary-color)' : layer.stroke,
        strokeWidth: selected ? 3 : layer.strokeWidth,
        ...(layer.strokeDasharray ? { strokeDasharray: layer.strokeDasharray } : {}),
        ...(layer.strokeLinecap ? { strokeLinecap: layer.strokeLinecap } : {})
      }
    };
    // No wire renders markers — and control edges persisted by earlier
    // stylings carry markerEnd inside the stored graph, so it is dropped
    // here rather than spread back into the live edge.
    delete decorated.markerEnd;
    return decorated;
  }

  function syncEdgeSelection() {
    edges.value = decorateEdges(edges.value);
  }

  function serializeProcess() {
    const originalData = draft.value?.data;
    draft.value.data = JSON.parse(JSON.stringify(originalData || {}));
    try {
      syncNodeData();
      return processDefinitionSnapshot();
    } finally {
      draft.value.data = originalData;
    }
  }

  function serializeCanonicalGraph(options = {}) {
    return createProcessGraphDocument(serializeProcess(), options);
  }

  function loadCanonicalGraph(graph, options = {}) {
    const data = authoredProcessDataFromGraphDocument(graph);
    return loadDocument({ ...(draft.value || {}), data }, options);
  }

  function processDefinitionSnapshot() {
    return {
      ...canvasToDefinition(
        { nodes: nodes.value.map(stripRuntimeNodeData), edges: validProcessEdges().map(stripRuntimeEdgeData), viewport: snapshotViewport() },
        draft.value?.data || {}
      ),
      dataflowVersion: PROCESS_DATAFLOW_VERSION
    };
  }

  function syncNodeData() {
    // live tree first: ports, palette, and options below resolve against the
    // overlay registry, so field/state wiring is visible immediately
    refreshTreeOverlay();
    for (const node of nodes.value) {
      if (!node.data?.refId) continue;
      // One malformed record must not freeze the sync for every other node:
      // a thrown error here would kill the live-evaluation pass midway and
      // read on the canvas as "sockets stopped updating".
      try {
        enrichNodeData(node);
      } catch (error) {
        console.error(`[process-designer] sync failed for ${node.type} ${node.id}`, error);
      }
    }
    // A wire's cargo derives from its source socket, so rebinding a source
    // (rename, type change, declaration re-wire) restyles its edges in the
    // same pass — instance/value/event never drifts stale on the canvas.
    edges.value = decorateEdges(edges.value);
  }

  // One wire per single-value socket: a second connection into an input
  // that does not declare `multiple` is rejected on the gesture, not at save
  // time — the canvas never shows a wire the serializer would have to drop.
  function singleWireViolation(connection = {}) {
    const target = nodes.value.find(node => node.id === connection.target);
    if (!target || target.type !== 'processNode') return null;
    if (String(connection.targetHandle || '').startsWith('control:')) return null;
    const record = draft.value?.data?.processNodes?.[target.data?.refId];
    if (!record) return null;
    const input = portForHandle(catalogPorts(record).inputs, connection.targetHandle, 'input');
    if (!input || input.multiple === true) return null;
    const occupied = edges.value.some(edge => (
      edge.target === connection.target
      && String(edge.targetHandle || '') === String(connection.targetHandle || '')
    ));
    return occupied ? input : null;
  }

  function onConnect(connection) {
    contextPalette.value.socket = null;
    syncNodeData();
    const occupiedInput = singleWireViolation(connection);
    if (occupiedInput) {
      toast.add({
        severity: 'warn',
        summary: t('processDesigner.incompatiblePorts'),
        detail: t('processDesigner.socketSingleWire', { socket: occupiedInput.label || occupiedInput.id }),
        life: 3000
      });
      return;
    }
    const processNodeSnapshot = clonePlainData(draft.value?.data?.processNodes || {});
    inferGenericNodeTypeFromConnection(connection);
    const compatibility = connectionCompatibility(connection);
    if (!compatibility.ok) {
      draft.value.data.processNodes = processNodeSnapshot;
      syncNodeData();
      toast.add({
        severity: 'warn',
        summary: t('processDesigner.incompatiblePorts'),
        detail: compatibility.reason
          ? `${t('processDesigner.incompatiblePortsDetail', {
            source: compatibility.source?.label || compatibility.source?.id || t('processDesigner.source'),
            target: compatibility.target?.label || compatibility.target?.id || t('processDesigner.target')
          })} — ${compatibility.reason}`
          : t('processDesigner.incompatiblePortsDetail', {
            source: compatibility.source?.label || compatibility.source?.id || t('processDesigner.source'),
            target: compatibility.target?.label || compatibility.target?.id || t('processDesigner.target')
          }),
        life: 3000
      });
      return;
    }
    // declaration wires carry their side effects through live interpretation
    // (applyGraphInterpretation): they persist as role:'type' edges — the
    // vocabulary compileTreeDeclarations and interpretDeclarationEdges read —
    // never as generic data edges. Binding follows the wire for as long as it
    // exists; renaming the source re-binds every wired descendant.
    const sourceNode = nodes.value.find(node => node.id === connection.source);
    const targetNode = nodes.value.find(node => node.id === connection.target);
    const targetNodeRecord = draft.value?.data?.processNodes?.[targetNode?.data?.refId];
    // Children wires are drawn child-first: the edge leaves the child's
    // output:type and enters the parent's input:declare, exactly as drawn —
    // the compatibility gate already refused an illegal direction.
    const childrenPair = ['ctsClass', 'ctsType'].includes(sourceNode?.type) && targetNode?.type === 'ctsClass';
    if (childrenPair && childrenWireLegality({ target: { type: targetNode.type, class: targetNode.data?.class } })) {
      const declarationEdge = {
        id: `children:${sourceNode.id}-${targetNode.id}`,
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle: 'output:type',
        targetHandle: 'input:declare',
        type: 'default',
        role: 'type',
        label: 'children',
        data: { key: `${sourceNode.data.typeId}s`, onRemove: 'restrict' }
      };
      if (edges.value.some(edge => edge.id === declarationEdge.id)) return;
      selectedEdgeId.value = null;
      edges.value.push(decorateEdge(declarationEdge));
      syncEdgeSelection();
      evaluateNow();
      return;
    }
    const legality = declarationWireLegality({
      sourceType: sourceNode?.type,
      targetType: targetNode?.type,
      targetRecord: targetNodeRecord
    });
    if (legality) {
      // one binding wire per record: a new bind replaces the previous one
      if (legality === 'binds') {
        edges.value = edges.value.filter(edge => !(
          edge.role === 'type' && edge.label === 'type' && edge.target === targetNode.id
        ));
      }
      const declarationEdge = {
        ...connection,
        type: 'default',
        role: 'type',
        label: legality === 'declares' ? (sourceNode.type === 'ctsField' ? 'field' : 'state')
          : legality === 'binds' ? 'type'
            : legality === 'targets' ? 'ref-target'
              : legality === 'entry' ? 'entry'
                : legality
      };
      if (legality === 'declares') declarationEdge.id = `declares:${sourceNode.id}-${targetNode.id}`;
      if (legality === 'nested') declarationEdge.id = mintId('nested');
      if (legality === 'binds') declarationEdge.id = mintId('bind');
      if (legality === 'entry') declarationEdge.id = mintId('entry');
      if (legality === 'targets') declarationEdge.id = mintId('ref-target');
      // Deterministic declares/children ids: the same declaration wire twice
      // is a no-op, not a duplicate edge.
      if (edges.value.some(edge => edge.id === declarationEdge.id)) return;
      selectedEdgeId.value = null;
      edges.value.push(decorateEdge(declarationEdge));
      syncEdgeSelection();
      evaluateNow();
      return;
    }
    selectedEdgeId.value = null;
    edges.value.push(decorateEdge({
      ...connection,
      id: mintId('edge'),
      type: 'default',
      role: compatibility.source?.role === 'data' ? 'data' : 'control',
      data: { kind: compatibility.source?.role || 'data' }
    }));
    syncEdgeSelection();
  }

  function sharedPortCompatibility(source, target) {
    const result = portCompatibility.compare(
      { ...source, compatibility: { profile: PROCESS_PORT_COMPATIBILITY_PROFILE } },
      { ...target, compatibility: { profile: PROCESS_PORT_COMPATIBILITY_PROFILE } }
    );
    return { ok: result.compatible, reason: result.reason };
  }

  function connectionCompatibility(connection = {}) {
    const source = nodes.value.find(item => item.id === connection.source);
    const target = nodes.value.find(item => item.id === connection.target);
    if (!source || !target) return { ok: true };
    const sourceRecord = draft.value?.data?.processNodes?.[source.data?.refId];
    const targetRecord = draft.value?.data?.processNodes?.[target.data?.refId];
    if (!sourceRecord || !targetRecord) {
      // Declaration wires are legal only between declaration partners
      // (declarationWireLegality): field/state -> class declares;
      // class/reference -> cts.* species record binds. A declaration node is
      // never a value source and no data node can feed a class declare
      // input, so the generic spec path never applies to them.
      if (DECLARATION_NODE_TYPES.includes(source.type) || DECLARATION_NODE_TYPES.includes(target.type)) {
        const legality = declarationWireLegality({
          sourceType: source.type,
          targetType: target.type,
          targetRecord
        });
        if (legality === 'declares') {
          const sourcePort = (source.data?.outputSpecs || [])[0];
          const targetPort = (target.data?.inputSpecs || [])[0];
          if (!sourcePort || !targetPort) {
            return { ok: false, reason: t('processDesigner.connectReasons.declareSocket') };
          }
          // The declare input sinks declarations of any field type; the
          // field's value type types its value socket, not its declaration.
          return { ok: true, source: sourcePort, target: targetPort };
        }
        if (legality === 'binds') {
          const sourcePort = (source.data?.outputSpecs || [])[0];
          if (!sourcePort) {
            return { ok: false, reason: source.type === 'ctsClass' ? t('processDesigner.connectReasons.nameClassBeforeBinding') : t('processDesigner.connectReasons.typeNodeNoType') };
          }
          // The binding wire lands on the persistent Type pin (origin
          // species: construct/read). It typechecks against the source
          // alone — the pin accepts any declared type.
          const inputs = catalogPorts(targetRecord).inputs;
          const pin = portForHandle(inputs, connection.targetHandle, 'input') || inputs.find(port => port.id === 'type');
          if (!pin || pin.id !== 'type') {
            return { ok: false, reason: t('processDesigner.connectReasons.typePinOnly') };
          }
          return {
            ...sharedPortCompatibility(sourcePort, pin),
            source: sourcePort,
            target: pin
          };
        }
        if (legality === 'children') {
          // Drawn child-first (SPEC §5): the target must be a class that
          // can parent; the wire lands exactly as drawn.
          if (!childrenWireLegality({ target: { type: target.type, class: target.data?.class } })) {
            const className = String(target.data?.name || target.data?.typeId || '').trim() || t('processDesigner.connectReasons.theClass');
            return {
              ok: false,
              reason: t('processDesigner.connectReasons.childrenContainment', { name: className, kind: target.data.class })
            };
          }
          return source.data?.typeId && target.data?.typeId
            ? { ok: true }
            : { ok: false, reason: t('processDesigner.connectReasons.childrenNeedTypeIds') };
        }
        if (legality === 'nested') {
          // Nesting is wiring (SPEC §7): a state into a state input. The
          // type scope is authored data that may arrive later (declare
          // wire, inspector) — it is never a precondition for nesting.
          if (source.id === target.id) {
            return { ok: false, reason: t('processDesigner.connectReasons.stateNestSelf') };
          }
          const parentOf = new Map(edges.value
            .filter(edge => edge.role === 'type' && edge.label === 'nested')
            .map(edge => [edge.source, edge.target]));
          parentOf.set(source.id, target.id);
          const seen = new Set();
          let cursor = source.id;
          while (cursor && parentOf.has(cursor)) {
            if (seen.has(cursor)) {
              return { ok: false, reason: t('processDesigner.connectReasons.stateParentCycle') };
            }
            seen.add(cursor);
            cursor = parentOf.get(cursor);
          }
          return { ok: true };
        }
        if (legality === 'entry') {
          // The state wire lands on a status-typed input of the target
          // record (construct creation state, transition target).
          const targetRecord2 = draft.value?.data?.processNodes?.[target.data?.refId];
          if (!targetRecord2) return { ok: false, reason: t('processDesigner.connectReasons.stateWiresLandOnProcessNodes') };
          const inputs = catalogPorts(targetRecord2).inputs;
          const input = portForHandle(inputs, connection.targetHandle, 'input') || inputs.find(port => port.type?.base === 'status');
          if (!input || input.type?.base !== 'status') {
            return { ok: false, reason: t('processDesigner.connectReasons.stateWiresLandOnStatusInputs') };
          }
          return { ok: true };
        }
        if (legality === 'field') {
          // The field wire lands on the getField's field input (SPEC §20
          // socket algebra); any other target handle is refused.
          const targetRecord2 = draft.value?.data?.processNodes?.[target.data?.refId];
          if (!targetRecord2) return { ok: false, reason: t('processDesigner.connectReasons.fieldWiresLandOnProcessNodes') };
          const inputs = catalogPorts(targetRecord2).inputs;
          const input = portForHandle(inputs, connection.targetHandle, 'input') || inputs.find(port => port.id === 'field');
          if (!input || input.id !== 'field') {
            return { ok: false, reason: t('processDesigner.connectReasons.fieldWiresLandOnFieldInput') };
          }
          return { ok: true };
        }
        if (legality === 'targets') {
          // ref fields receive their accepted target types as wired inputs
          if (target.data?.descriptor?.base !== 'ref') {
            return { ok: false, reason: t('processDesigner.connectReasons.refBaseRequired') };
          }
          return source.data?.typeId
            ? { ok: true }
            : { ok: false, reason: t('processDesigner.connectReasons.nameClassBeforeRefTarget') };
        }
        // A type-reference card is a child end only (SPEC §5): the children
        // wire leaves the card's output into the class's declare input.
        if (source.type === 'ctsClass' && target.type === 'ctsType') {
          return { ok: false, reason: t('processDesigner.connectReasons.typeCardNeverParents') };
        }
        return {
          ok: false,
          reason: (source.type === 'ctsClass' || source.type === 'ctsType') && targetRecord
            ? t('processDesigner.connectReasons.typePinOriginOnly')
            : t('processDesigner.connectReasons.onlyCurrentNodes')
        };
      }
      return { ok: false, reason: t('processDesigner.connectReasons.onlyCurrentNodes') };
    }
    const sourcePort = portForHandle(catalogPorts(sourceRecord).outputs, connection.sourceHandle, 'output');
    const targetPort = portForHandle(catalogPorts(targetRecord).inputs, connection.targetHandle, 'input');
    if (!sourcePort || !targetPort) return { ok: true };
    const result = portCompatibility.compare(
      { ...sourcePort, compatibility: { profile: PROCESS_PORT_COMPATIBILITY_PROFILE } },
      { ...targetPort, compatibility: { profile: PROCESS_PORT_COMPATIBILITY_PROFILE } }
    );
    return {
      ok: result.compatible,
      reason: result.reason,
      source: sourcePort,
      target: targetPort
    };
  }

  const draftDataSignature = computed(() => JSON.stringify(draft.value?.data ?? null));

  function designerSignature() {
    return JSON.stringify({
      data: draftDataSignature.value,
      nodes: nodes.value.map(node => ({ id: node.id, type: node.type, position: node.position, data: { refId: node.data?.refId } })),
      edges: edges.value.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        role: edge.role
      }))
    });
  }

  // The document load: clones the authored data, projects the canvas, and
  // resets the graph surface. `seedNodes` lands host placement facts (the
  // process page seats lane membership); `onLoaded` runs after the commit
  // for host baselines.
  function loadDocument(value, { seedNodes = null, onLoaded = null } = {}) {
    value = clonePlainData(value || {});
    draft.value = value;
    let canvas;
    try {
      canvas = definitionToCanvas(value?.data || {});
      validation.value = null;
    } catch (error) {
      canvas = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
      validation.value = { ok: false, errors: [error.message], warnings: [] };
    }
    resetGraphSelection();
    liveGraph.reset();
    const projected = canvas.nodes.map(enrichNodeData);
    nodes.value = seedNodes ? seedNodes(projected) : projected;
    edges.value = decorateEdges(canvas.edges);
    onLoaded?.();
    nextTick(fitInitialCanvas);
    return value;
  }

  return {
    // graph state
    draft,
    nodes,
    edges,
    validation,
    draftDataSignature,
    designerSignature,
    loadDocument,
    serializeProcess,
    serializeCanonicalGraph,
    loadCanonicalGraph,
    processDefinitionSnapshot,
    // types plane
    designer,
    ctsRegistry,
    ctsProjectedDomain,
    ctsTypeView,
    classNameMap,
    ctsOrgTypes,
    refreshTreeOverlay,
    loadOrgTypes,
    loadProcessCapabilities,
    persistTreeDeclarations,
    servedCommands,
    servedPreviewChannels,
    servedClientEngines,
    servedClientRuntimes,
    // node records + sync
    nodeRecords,
    processNodeOperations,
    processNodeOperationLabels,
    defaultTypeId,
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
    ensureRecord,
    factoryForType,
    recordKeyForType,
    enrichNodeData,
    syncNodeData,
    updateProcessNodeRecord,
    updateProcessNodeConstructionMode,
    stripRuntimeNodeData,
    stripRuntimeEdgeData,
    validProcessEdges,
    // selection + canvas
    selectedNode,
    selectedNodeId,
    selectedEdgeId,
    selectedGraphNodes,
    selectedGraphEdges,
    selectNode,
    selectEdge,
    clearGraphSelection,
    resetGraphSelection,
    deleteGraphSelection,
    canvasFrame,
    bindFrame,
    bindContextPaletteSearch,
    touchPanDrag,
    handleDesignerPointerDown,
    handleDesignerFocus,
    handleDesignerWheel,
    beginSocketConnection,
    endSocketConnection,
    clientPoint,
    clientToGraphPosition,
    nextNodePosition,
    frameAllNodes,
    frameSelectedNodes,
    frameNodeIds,
    zoomCanvasIn,
    zoomCanvasOut,
    resetCanvasZoom,
    fitInitialCanvas,
    snapshotViewport,
    designerViewport,
    // authoring
    addNode,
    onConnect,
    connectionCompatibility,
    decorateEdge,
    decorateEdges,
    syncEdgeSelection,
    evaluateNow,
    applyGraphInterpretation,
    incomingEntityContract,
    isEffectNode,
    nodeOperationKind,
    suggestTreeTypeId,
    updateClassName,
    setClassIdentifierField,
    renameDeclarationNode,
    classIdentifierField,
    classTypeIdValid,
    classDeclarationDiagnostics,
    declarationPlaneSignature,
    declarationNodeTypes,
    selectedDeclarationEdge,
    // palettes
    paletteGroups,
    contextPaletteGroups,
    contextPalette,
    openPanePalette,
    closeContextPalette,
    addContextNode,
    contextPaletteSearch,
    clonePalettePreset,
    clonePlainData,
    // inspector seams
    selectedEntity,
    selectedProcessNode,
    selectedEntityAvailable,
    servicePrincipals,
    servicePrincipalList,
    servicePrincipalOptions,
    typeIdOptions,
    optionalTypeIdOptions: computed(() => [{ label: t('processDesigner.noneOption'), value: '' }, ...typeIdOptions.value]),
    roleOptions,
    commandOptions,
    commandForId,
    selectedCommandService,
    createCommandServiceForSelectedNode,
    removeSelectedCommandService,
    serviceList,
    socketList,
    selectedSocketId,
    selectedSocketRecord,
    addSocket,
    removeSelectedSocket,
    socketDirections,
    fieldOptionsForSelectedSocket,
    rowFieldIdOptions,
    transitionGuardFieldOptions,
    recordStatePolicyTarget,
    recordStateFieldPolicyOptions,
    selectedProcessNodeGrants,
    selectedProcessNodeEffectiveAccess,
    updateSelectedProcessNodeGrantLevel,
    // whole-graph channel preview
    validationDiffLines,
    selectedNodeSupportsPreview,
    selectedChannelNode,
    selectedChannelInputs,
    selectedChannelOutputs,
    formatPreviewPath,
    formatPreviewItems,
    nodeDiagnostics,
    focusValidationDiagnostic,
    focusFirstValidationDiagnostic
  };
}
