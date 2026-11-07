import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import {
  canvasToDefinition,
  definitionToCanvas,
  interpretDeclarationEdges,
  PROCESS_DATAFLOW_VERSION
} from '~/packages/processes/src/index.js';
import { useProcessDesignerPersistence } from '~/composables/useProcessDesignerPersistence.js';
import { useProcessDesignerTypes } from '~/composables/useProcessDesignerTypes.js';
import { useDeclarationStation } from '~/composables/useDeclarationStation.js';
import { useAuthStore } from '~/stores/auth';
import { mintId } from '~/utils/processDesignerIdentity.js';
import {
  declarationDiagnostics,
  declarationSubtreeOf,
  moveDeclarationField,
  newFieldDeclaration,
  newStateDeclaration,
  newTransitionDeclaration,
  operationTargetState,
  setIdentifierHolder,
  setTransitionTarget,
  tryRemoveDeclarationNode
} from '~/utils/processDesignerDeclarationEditor.js';

// The one surface-authoring session over a stationed type's declaration
// (SPEC §1): loads the stationing definition draft through the designer's
// persistence seam, projects the same canvas arrays, and mutates only
// through the pure gesture layer. Every surface affordance — the record
// page's property rows, the state surface's authoring lane — is a
// projection of this session; save is a draft PATCH and Apply stays in the
// designer.
export function useDeclarationAuthoring({ typeId, t, toast, confirm }) {
  const authStore = useAuthStore();
  const persistence = useProcessDesignerPersistence();

  const phase = ref('idle');
  const loadError = ref('');
  const definition = ref(null);
  const nodes = ref([]);
  const edges = ref([]);
  const viewport = ref({ x: 0, y: 0, zoom: 1 });
  const saving = ref(false);
  const savedSignature = ref('');
  const diagnostics = ref([]);
  const refusals = ref([]);

  function activeOrganizationId() {
    return definition.value?.lineage?.organizationId
      || authStore.organizationData?._id
      || authStore.userData?.organizationId
      || authStore.memberships?.[0]?.organizationId
      || null;
  }

  const records = () => definition.value?.data?.processNodes || {};

  const { ctsTypeView, loadOrgTypes, loadProcessCapabilities } = useProcessDesignerTypes({
    nodes,
    edges,
    t,
    toast,
    activeOrganizationId,
    records,
    syncNow: () => runDiagnostics()
  });

  const typeOptions = computed(() => ctsTypeView().map(entry => ({ label: entry.label, value: entry.id })));
  const subtree = computed(() => declarationSubtreeOf(nodes.value, edges.value, records(), typeId));
  const ready = computed(() => phase.value === 'ready' && Boolean(subtree.value));

  const declarationSignature = computed(() => JSON.stringify({
    data: definition.value?.data ?? null,
    nodes: nodes.value.map(node => [node.id, node.type, node.data]),
    wires: edges.value.map(edge => [edge.id, edge.source, edge.target, edge.sourceHandle, edge.targetHandle, edge.role, edge.label])
  }));
  const dirty = computed(() => phase.value === 'ready' && declarationSignature.value !== savedSignature.value);

  function runDiagnostics() {
    diagnostics.value = declarationDiagnostics(nodes.value, edges.value, records(), activeOrganizationId());
  }

  watch(declarationSignature, () => {
    refusals.value = [];
    runDiagnostics();
  });

  async function resolve() {
    if (phase.value !== 'idle') return;
    if (!typeId || !authStore.hasPermission('organizations', 'admin')) {
      phase.value = 'unstationed';
      return;
    }
    phase.value = 'loading';
    const { declaringDefinitionFor } = useDeclarationStation();
    const stationId = await declaringDefinitionFor(typeId).catch(() => null);
    if (!stationId) {
      phase.value = 'unstationed';
      return;
    }
    try {
      const loaded = await persistence.loadById(stationId);
      if (!declarationSubtreeOf(...canvasOf(loaded), typeId)) {
        phase.value = 'unstationed';
        return;
      }
      seatDefinition(loaded);
      phase.value = 'ready';
      loadOrgTypes();
      loadProcessCapabilities();
    } catch (error) {
      loadError.value = error?.data?.message || error?.message || t('common.error');
      phase.value = 'error';
    }
  }

  function canvasOf(documentRecord) {
    const canvas = definitionToCanvas(documentRecord?.data || {});
    return [canvas.nodes, canvas.edges, documentRecord?.data?.processNodes || {}];
  }

  function seatDefinition(documentRecord) {
    definition.value = JSON.parse(JSON.stringify(documentRecord || {}));
    const canvas = definitionToCanvas(definition.value.data || {});
    nodes.value = canvas.nodes;
    edges.value = canvas.edges;
    viewport.value = canvas.viewport || { x: 0, y: 0, zoom: 1 };
    savedSignature.value = declarationSignature.value;
    runDiagnostics();
  }

  function interpretNow() {
    const { mutations } = interpretDeclarationEdges(nodes.value, edges.value, records(), {});
    for (const mutation of mutations) {
      if (mutation.scope === 'node') {
        const node = nodes.value.find(candidate => candidate.id === mutation.nodeId);
        if (node) node.data[mutation.key] = mutation.value;
        continue;
      }
      const record = records()[mutation.recordId];
      if (!record) continue;
      if (mutation.key === 'typeId') {
        record.typeId = mutation.value;
        continue;
      }
      if (mutation.key.startsWith('inputDefaults.')) {
        record.inputDefaults = { ...(record.inputDefaults || {}), [mutation.key.slice('inputDefaults.'.length)]: mutation.value };
      }
    }
  }

  function snapshot() {
    return {
      ...canvasToDefinition(
        { nodes: nodes.value, edges: edges.value, viewport: viewport.value },
        definition.value?.data || {}
      ),
      dataflowVersion: PROCESS_DATAFLOW_VERSION
    };
  }

  async function save() {
    if (!definition.value?._id || saving.value || !dirty.value) return;
    saving.value = true;
    try {
      const updated = await persistence.saveDraft(String(definition.value._id), snapshot());
      definition.value = updated;
      savedSignature.value = declarationSignature.value;
      toast.add({ severity: 'success', summary: t('common.success'), detail: t('processDesigner.saved'), life: 2400 });
    } catch (error) {
      toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message, life: 6000 });
    } finally {
      saving.value = false;
    }
  }

  // A state enters the vocabulary through an operation (SPEC §7): the first
  // construct without an initial state carries it, else a targeting
  // transition is minted — `addStateCarrier` states which before the author
  // commits.
  const addStateCarrier = computed(() => (subtree.value?.constructs || []).some(({ record }) => !operationTargetState(record))
    ? 'initial'
    : 'transition');

  function addField({ name, descriptor } = {}) {
    if (!ready.value) return null;
    const gesture = newFieldDeclaration({
      id: mintId('ctsField'),
      classNode: subtree.value.classNode,
      name: String(name ?? '').trim(),
      descriptor
    });
    nodes.value = [...nodes.value, gesture.node];
    edges.value = [...edges.value, gesture.edge];
    interpretNow();
    return gesture.node.id;
  }

  function renameField(fieldNode, name) {
    fieldNode.data.name = String(name ?? '');
  }

  function setDescriptor(fieldNode, value) {
    fieldNode.data.descriptor = value;
  }

  function toggleIdentifier(fieldNode) {
    setIdentifierHolder(nodes.value, fieldNode.id, fieldNode.data?.descriptor?.identifier !== true);
  }

  function moveField(fieldNode, offset) {
    const next = moveDeclarationField(nodes.value, fieldNode.id, offset);
    if (next.moved) nodes.value = next.nodes;
  }

  function removeWithGate(nodeId) {
    const result = tryRemoveDeclarationNode(nodes.value, edges.value, records(), nodeId, activeOrganizationId());
    if (!result.ok) {
      refusals.value = result.diagnostics;
      return false;
    }
    nodes.value = result.nodes;
    edges.value = result.edges;
    if (definition.value?.data) {
      definition.value.data.processNodes = result.records;
      const producerOutputs = { ...(definition.value.data.producerOutputs || {}) };
      let changed = false;
      for (const recordId of result.removedRecordIds) {
        for (const [outputId, output] of Object.entries(producerOutputs)) {
          if (output?.nodeId === recordId) {
            delete producerOutputs[outputId];
            changed = true;
          }
        }
      }
      if (changed) definition.value.data.producerOutputs = producerOutputs;
    }
    interpretNow();
    return true;
  }

  function setStateValue(stateNode, value) {
    stateNode.data.value = String(value || '').trim();
    interpretNow();
  }

  function setStateLabel(stateNode, label) {
    stateNode.data.label = String(label || '').trim() || undefined;
  }

  function setStateSeverity(stateNode, severity) {
    stateNode.data.severity = severity || 'info';
  }

  function setStateIcon(stateNode, icon) {
    stateNode.data.icon = icon;
  }

  function entryEdge(stateNodeId, targetNodeId) {
    return {
      id: mintId('entry'),
      source: stateNodeId,
      target: targetNodeId,
      sourceHandle: 'output:state',
      targetHandle: 'data:state',
      type: 'default',
      role: 'type',
      label: 'entry'
    };
  }

  function addState(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed || !subtree.value) return;
    const state = newStateDeclaration({ id: mintId('ctsState'), value: trimmed });
    nodes.value = [...nodes.value, state.node];
    const construct = subtree.value.constructs.find(({ record }) => !operationTargetState(record));
    if (construct) {
      edges.value = [...edges.value, entryEdge(state.node.id, construct.node.id)];
    } else {
      const gesture = newTransitionDeclaration({
        id: mintId('processNode'),
        typeId,
        stateNodeId: state.node.id,
        stateValue: trimmed
      });
      nodes.value = [...nodes.value, gesture.node];
      edges.value = [...edges.value, gesture.edge];
      definition.value.data.processNodes = { ...records(), [gesture.record.id]: gesture.record };
    }
    interpretNow();
  }

  function stateValueOptions() {
    return (subtree.value?.states || [])
      .map(({ node }) => ({ label: node.data?.value || '', value: node.data?.value || '' }))
      .filter(option => option.value);
  }

  function retargetTransition(entry, value) {
    const stateNode = (subtree.value?.states || []).find(({ node }) => node.data?.value === value)?.node;
    if (!stateNode) return;
    const next = setTransitionTarget(edges.value, entry.record, stateNode.id);
    edges.value = next.edges;
    definition.value.data.processNodes = { ...records(), [entry.record.id]: next.record };
    interpretNow();
  }

  function setTransitionIntent(entry, value) {
    entry.record.label = String(value);
  }

  function addTransition(targetValue) {
    const target = (subtree.value?.states || []).find(({ node }) => node.data?.value === targetValue);
    if (!target) return;
    const gesture = newTransitionDeclaration({
      id: mintId('processNode'),
      typeId,
      stateNodeId: target.node.id,
      stateValue: String(target.node.data?.value || '')
    });
    nodes.value = [...nodes.value, gesture.node];
    edges.value = [...edges.value, gesture.edge];
    definition.value.data.processNodes = { ...records(), [gesture.record.id]: gesture.record };
    interpretNow();
  }

  function confirmLeave() {
    if (!dirty.value) return Promise.resolve(true);
    return new Promise(resolve => {
      confirm.require({
        message: t('typeDeclaration.unsavedLeave'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: () => resolve(true),
        reject: () => resolve(false)
      });
    });
  }

  function handleBeforeUnload(event) {
    if (!dirty.value) return;
    event.preventDefault();
  }

  if (process.client) {
    watch(dirty, value => {
      if (value) window.addEventListener('beforeunload', handleBeforeUnload);
      else window.removeEventListener('beforeunload', handleBeforeUnload);
    });
    onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload));
    onBeforeRouteLeave(async () => await confirmLeave());
  }

  return {
    phase,
    loadError,
    ready,
    resolve,
    subtree,
    dirty,
    saving,
    save,
    diagnostics,
    refusals,
    typeOptions,
    addStateCarrier,
    addField,
    renameField,
    setDescriptor,
    toggleIdentifier,
    moveField,
    removeWithGate,
    setStateValue,
    setStateLabel,
    setStateSeverity,
    setStateIcon,
    addState,
    stateValueOptions,
    retargetTransition,
    setTransitionIntent,
    addTransition
  };
}
