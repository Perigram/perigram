<template>
  <StandardPage workspace :title="title" :subtitle="definitionName">
    <template #actions>
      <Button
        icon="pi pi-save"
        :label="$t('common.save')"
        size="small"
        :disabled="!dirty || saving"
        :loading="saving"
        data-testid="declaration-save"
        @click="save"
      />
    </template>

    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <StateBlock v-else-if="loadError" state="error" :message="loadError" />
    <StateBlock v-else-if="!subtree" state="error" :message="$t('typeDeclaration.notStationed')" />
    <div v-else class="flex w-full max-w-[60rem] flex-col gap-6 self-center">
      <Message v-for="item in refusalDiagnostics" :key="item" severity="warn" :closable="false">{{ item }}</Message>
      <Message v-for="item in diagnostics" :key="item" severity="error" :closable="false">{{ item }}</Message>

      <section class="flex flex-col gap-4">
        <ActionToolbar :title="$t('typeDeclaration.fields')" :level="2">
          <template #actions>
            <Button
              icon="pi pi-plus"
              :label="$t('typesPane.addField')"
              size="small"
              text
              severity="secondary"
              @click="addField"
            />
          </template>
        </ActionToolbar>
        <div class="flex flex-col">
          <DeclarationFieldRow
            v-for="field in subtree.fields"
            :key="field.node.id"
            :field="field"
            :summary="summaryOf(field.node)"
            :type-options="typeOptions"
            :expanded="expandedFieldId === field.node.id"
            @rename="name => renameField(field.node, name)"
            @descriptor="value => setDescriptor(field.node, value)"
            @toggle-identifier="() => toggleIdentifier(field.node)"
            @toggle-expand="() => toggleExpand(field.node.id)"
            @remove="() => removeField(field)"
          />
        </div>
      </section>

      <section class="flex flex-col gap-4">
        <ActionToolbar :title="$t('typeDeclaration.lifecycle')" :level="2">
          <template #actions>
            <Button
              icon="pi pi-share-alt"
              :label="$t('typeDeclaration.machineView')"
              size="small"
              text
              severity="secondary"
              @click="machineVisible = true"
            />
          </template>
        </ActionToolbar>

        <div class="flex flex-col">
          <DeclarationStateRow
            v-for="state in subtree.states"
            :key="state.node.id"
            :state="state"
            @rename="value => setStateValue(state.node, value)"
            @severity="value => state.node.data.severity = value"
            @icon="value => state.node.data.icon = value"
            @remove="() => removeState(state)"
          />
          <div v-if="addingState" class="flex items-center gap-3 py-2">
            <InputText
              ref="newStateInput"
              v-model="newStateValue"
              size="small"
              class="w-40"
              :placeholder="$t('typeCanvas.stateName')"
              @keydown.enter.prevent="commitAddState"
            />
            <Button
              icon="pi pi-check"
              size="small"
              text
              :disabled="!newStateValue.trim()"
              :aria-label="$t('common.add')"
              @click="commitAddState"
            />
            <Button
              icon="pi pi-times"
              size="small"
              text
              severity="secondary"
              :aria-label="$t('common.cancel')"
              @click="cancelAddState"
            />
          </div>
          <Button
            v-else
            icon="pi pi-plus"
            :label="$t('typeDeclaration.addState')"
            size="small"
            text
            severity="secondary"
            class="self-start"
            @click="startAddState"
          />
        </div>

        <div class="flex flex-col">
          <div v-if="subtree.transitions.length" class="flex min-w-0 items-center gap-3 pb-1">
            <span class="min-w-0 flex-1 truncate text-label text-muted">{{ $t('typeDeclaration.from') }}</span>
            <span class="w-4 shrink-0" aria-hidden="true" />
            <span class="w-40 shrink-0 truncate text-label text-muted">{{ $t('typeDeclaration.to') }}</span>
            <span class="min-w-0 flex-1 truncate text-label text-muted">{{ $t('typeDeclaration.intent') }}</span>
            <span class="w-8 shrink-0" aria-hidden="true" />
          </div>
          <DeclarationTransitionRow
            v-for="entry in subtree.transitions"
            :key="entry.record.id"
            :entry="entry"
            :states="subtree.states"
            :state-options="stateValueOptions"
            @retarget="value => retargetTransition(entry, value)"
            @intent="value => entry.record.label = value"
            @remove="() => removeTransition(entry)"
          />
          <Button
            v-if="subtree.states.length"
            icon="pi pi-plus"
            :label="$t('typeDeclaration.addTransition')"
            size="small"
            text
            severity="secondary"
            class="self-start"
            @click="addTransition"
          />
        </div>
      </section>
    </div>

    <StandardDialog v-model:visible="machineVisible" :header="$t('typeDeclaration.machineView')" size="lg">
      <div :class="MARKDOWN_ELEMENT_CLASSES" class="max-h-[60dvh] overflow-auto" v-html="machineHtml" />
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
// Contract table: components/type-designer/README.md (SPEC §1 — one
// authoring model, two projections).
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import DeclarationFieldRow from '~/components/type-designer/DeclarationFieldRow.vue';
import DeclarationStateRow from '~/components/type-designer/DeclarationStateRow.vue';
import DeclarationTransitionRow from '~/components/type-designer/DeclarationTransitionRow.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { MARKDOWN_ELEMENT_CLASSES, renderMarkdown } from '#shared/markdown.js';
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
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { normalizeProcessDisplayName } from '~/utils/processDesignerDisplay.js';
import { mintId } from '~/utils/processDesignerIdentity.js';
import {
  declarationDiagnostics,
  declarationSubtreeOf,
  fieldDescriptorSummary,
  machineModelOf,
  mermaidFlowchartOf,
  newFieldDeclaration,
  newStateDeclaration,
  newTransitionDeclaration,
  operationTargetState,
  setIdentifierHolder,
  setTransitionTarget,
  tryRemoveDeclarationNode
} from '~/utils/processDesignerDeclarationEditor.js';
import { setWorkspacePageDirty } from '~/utils/workspace-page-dirty.js';

const props = defineProps({
  typeId: { type: String, default: '' },
  definitionId: { type: String, default: '' }
});

const { t, te } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const authStore = useAuthStore();
const persistence = useProcessDesignerPersistence();

const loading = ref(true);
const loadError = ref('');
const definition = ref(null);
const nodes = ref([]);
const edges = ref([]);
const viewport = ref({ x: 0, y: 0, zoom: 1 });
const saving = ref(false);
const savedSignature = ref('');
const expandedFieldId = ref(null);
const refusalDiagnostics = ref([]);
const machineVisible = ref(false);
const addingState = ref(false);
const newStateValue = ref('');
const newStateInput = ref(null);

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
const typeLabelById = computed(() => Object.fromEntries(typeOptions.value.map(option => [option.value, option.label])));
const title = computed(() => subtree.value?.classNode?.data?.name
  || generatedEntityLabel(props.typeId, { t, te }));
const definitionName = computed(() => normalizeProcessDisplayName(
  definition.value?.identity?.name || definition.value?.identity?.uid || ''
));
const subtree = computed(() => declarationSubtreeOf(nodes.value, edges.value, records(), props.typeId));

const declarationSignature = computed(() => JSON.stringify({
  data: definition.value?.data ?? null,
  nodes: nodes.value.map(node => [node.id, node.type, node.data]),
  wires: edges.value.map(edge => [edge.id, edge.source, edge.target, edge.sourceHandle, edge.targetHandle, edge.role, edge.label])
}));
const diagnostics = ref([]);
const dirty = computed(() => Boolean(definition.value) && declarationSignature.value !== savedSignature.value);
const workspacePageKey = inject('workspacePageKey', null);
watch(dirty, value => setWorkspacePageDirty(workspacePageKey, value));

function runDiagnostics() {
  diagnostics.value = declarationDiagnostics(nodes.value, edges.value, records(), activeOrganizationId());
}

watch(declarationSignature, () => {
  refusalDiagnostics.value = [];
  runDiagnostics();
});

// The workspace tab is a singleton: opening a second type reuses it with
// fresh params, so the projection follows the type id.
watch(() => [props.typeId, props.definitionId], () => {
  if (props.typeId) load();
});

onMounted(() => {
  load();
  loadOrgTypes();
  loadProcessCapabilities();
  window.addEventListener('beforeunload', handleBeforeUnload);
});
onBeforeUnmount(() => {
  setWorkspacePageDirty(workspacePageKey, false);
  window.removeEventListener('beforeunload', handleBeforeUnload);
});

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    let targetId = props.definitionId;
    if (!targetId) {
      const { declaringDefinitionFor } = useDeclarationStation();
      targetId = await declaringDefinitionFor(props.typeId);
    }
    if (!targetId) {
      loadError.value = t('typeDeclaration.notStationed');
      return;
    }
    const loaded = await persistence.loadById(String(targetId));
    if (!declarationSubtreeOf(...canvasOf(loaded), props.typeId)) {
      loadError.value = t('typeDeclaration.notStationed');
      return;
    }
    seatDefinition(loaded);
  } catch (error) {
    loadError.value = error?.data?.message || error?.message || t('common.error');
  } finally {
    loading.value = false;
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
  if (!definition.value?._id || saving.value) return;
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

function summaryOf(fieldNode) {
  return fieldDescriptorSummary(fieldNode.data?.descriptor || {}, value => typeLabelById.value[value] || value);
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

function toggleExpand(fieldNodeId) {
  expandedFieldId.value = expandedFieldId.value === fieldNodeId ? null : fieldNodeId;
}

function addField() {
  if (!subtree.value) return;
  const gesture = newFieldDeclaration({ id: mintId('ctsField'), classNode: subtree.value.classNode });
  nodes.value = [...nodes.value, gesture.node];
  edges.value = [...edges.value, gesture.edge];
  expandedFieldId.value = gesture.node.id;
  interpretNow();
}

function removeField(field) {
  removeWithGate(field.node.id);
}

function setStateValue(stateNode, value) {
  stateNode.data.value = String(value || '').trim();
  interpretNow();
}

function startAddState() {
  addingState.value = true;
  newStateValue.value = '';
  nextTick(() => newStateInput.value?.$el?.focus?.());
}

function cancelAddState() {
  addingState.value = false;
  newStateValue.value = '';
}

function commitAddState() {
  const value = newStateValue.value.trim();
  if (!value || !subtree.value) return;
  const state = newStateDeclaration({ id: mintId('ctsState'), value });
  nodes.value = [...nodes.value, state.node];
  // SPEC §7: a state enters the vocabulary through an operation — carry it
  // into the first construct without an initial state, else mint the
  // targeting transition.
  const construct = subtree.value.constructs.find(({ record }) => !operationTargetState(record));
  if (construct) {
    edges.value = [...edges.value, entryEdge(state.node.id, construct.node.id)];
    interpretNow();
  } else {
    const gesture = newTransitionDeclaration({
      id: mintId('processNode'),
      typeId: props.typeId,
      stateNodeId: state.node.id,
      stateValue: value
    });
    nodes.value = [...nodes.value, gesture.node];
    edges.value = [...edges.value, gesture.edge];
    definition.value.data.processNodes = { ...records(), [gesture.record.id]: gesture.record };
    interpretNow();
  }
  cancelAddState();
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

function removeState(state) {
  removeWithGate(state.node.id);
}

const stateValueOptions = computed(() => (subtree.value?.states || [])
  .map(({ node }) => ({ label: node.data?.value || '', value: node.data?.value || '' }))
  .filter(option => option.value));

function retargetTransition(entry, value) {
  const stateNode = (subtree.value?.states || []).find(({ node }) => node.data?.value === value)?.node;
  if (!stateNode) return;
  const next = setTransitionTarget(edges.value, entry.record, stateNode.id);
  edges.value = next.edges;
  definition.value.data.processNodes = { ...records(), [entry.record.id]: next.record };
  interpretNow();
}

function addTransition() {
  if (!subtree.value?.states.length) return;
  const target = subtree.value.states[0];
  const gesture = newTransitionDeclaration({
    id: mintId('processNode'),
    typeId: props.typeId,
    stateNodeId: target.node.id,
    stateValue: String(target.node.data?.value || '')
  });
  nodes.value = [...nodes.value, gesture.node];
  edges.value = [...edges.value, gesture.edge];
  definition.value.data.processNodes = { ...records(), [gesture.record.id]: gesture.record };
  interpretNow();
}

function removeTransition(entry) {
  removeWithGate(entry.node.id);
}

function removeWithGate(nodeId) {
  const result = tryRemoveDeclarationNode(nodes.value, edges.value, records(), nodeId, activeOrganizationId());
  if (!result.ok) {
    refusalDiagnostics.value = result.diagnostics;
    return;
  }
  nodes.value = result.nodes;
  edges.value = result.edges;
  if (definition.value?.data) {
    definition.value.data.processNodes = result.records;
    for (const recordId of result.removedRecordIds) {
      const producerOutputs = { ...(definition.value.data.producerOutputs || {}) };
      let changed = false;
      for (const [outputId, output] of Object.entries(producerOutputs)) {
        if (output?.nodeId === recordId) {
          delete producerOutputs[outputId];
          changed = true;
        }
      }
      if (changed) definition.value.data.producerOutputs = producerOutputs;
    }
  }
  interpretNow();
}

const machineHtml = computed(() => {
  if (!machineVisible.value) return '';
  const mermaid = mermaidFlowchartOf(machineModelOf(subtree.value));
  return renderMarkdown(`\`\`\`mermaid\n${mermaid}\`\`\``);
});

function handleBeforeUnload(event) {
  if (!dirty.value) return;
  event.preventDefault();
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

defineExpose({ confirmLeave, save });
</script>
