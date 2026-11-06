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
    <div v-else class="flex max-w-app flex-col gap-6 self-center">
      <div v-if="refusalDiagnostics.length" class="flex flex-col gap-2">
        <Message v-for="item in refusalDiagnostics" :key="item" severity="warn" :closable="false">{{ item }}</Message>
      </div>
      <div v-if="diagnostics.length" class="flex flex-col gap-2">
        <Message v-for="item in diagnostics" :key="item" severity="error" :closable="false">{{ item }}</Message>
      </div>

      <section class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-label">{{ $t('typeDeclaration.fields') }}</h2>
          <Button icon="pi pi-plus" :label="$t('typesPane.addField')" size="small" text @click="addField" />
        </div>
        <div class="flex flex-col">
          <div
            v-for="field in subtree.fields"
            :key="field.node.id"
            class="flex flex-col gap-2 border-b border-chrome-border py-1.5"
          >
            <div class="flex min-w-0 items-center gap-2">
              <InputText
                v-model="field.node.data.name"
                size="small"
                class="w-44 shrink-0"
                :aria-label="$t('typeCanvas.fieldName')"
              />
              <Tag :value="fieldSummary(field.node)" severity="secondary" />
              <Tag
                v-if="field.node.data.descriptor?.nullable === true"
                :value="$t('typesPane.nullable')"
                severity="secondary"
              />
              <Tag v-else :value="$t('typeDeclaration.required')" severity="secondary" />
              <Tag v-if="field.node.data.descriptor?.identifier === true" :value="$t('typeDeclaration.identifier')" />
              <div class="ml-auto flex shrink-0 items-center gap-1">
                <Button
                  icon="pi pi-id-card"
                  size="small"
                  text
                  :severity="field.node.data.descriptor?.identifier === true ? 'success' : 'secondary'"
                  :aria-label="$t('typeDeclaration.identifier')"
                  :title="$t('typeDeclaration.identifier')"
                  @click="toggleIdentifier(field.node)"
                />
                <Button
                  icon="pi pi-pencil"
                  size="small"
                  text
                  :aria-label="$t('common.edit')"
                  :title="$t('common.edit')"
                  @click="expandedFieldId = expandedFieldId === field.node.id ? null : field.node.id"
                />
                <Button
                  icon="pi pi-trash"
                  size="small"
                  text
                  severity="danger"
                  :aria-label="$t('common.delete')"
                  :title="$t('common.delete')"
                  @click="removeField(field)"
                />
              </div>
            </div>
            <div v-if="expandedFieldId === field.node.id">
              <DescriptorEditor
                :model-value="field.node.data.descriptor || { base: 'string' }"
                :type-options="typeOptions"
                @update:model-value="value => setDescriptor(field.node, value)"
              />
            </div>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-label">{{ $t('typeDeclaration.lifecycle') }}</h2>
          <Button
            icon="pi pi-share-alt"
            :label="$t('typeDeclaration.machineView')"
            size="small"
            text
            @click="machineVisible = true"
          />
        </div>

        <div class="flex flex-col">
          <div
            v-for="state in subtree.states"
            :key="state.node.id"
            class="flex items-center gap-2 border-b border-chrome-border py-1.5"
          >
            <InputText
              :model-value="state.node.data.value || ''"
              size="small"
              class="w-40 shrink-0"
              :aria-label="$t('typeCanvas.stateName')"
              @update:model-value="value => setStateValue(state.node, value)"
            />
            <Select
              :model-value="state.node.data.severity || 'info'"
              :options="severityOptions"
              option-label="label"
              option-value="value"
              size="small"
              class="w-36"
              :aria-label="$t('processDesigner.stateSeverity')"
              @update:model-value="value => setStatePolicy(state.node, 'severity', value)"
            />
            <InputText
              :model-value="state.node.data.icon || ''"
              size="small"
              class="w-32"
              :placeholder="$t('processDesigner.stateIcon')"
              :aria-label="$t('processDesigner.stateIcon')"
              @update:model-value="value => setStatePolicy(state.node, 'icon', value)"
            />
            <i v-if="state.node.data.icon" :class="state.node.data.icon" aria-hidden="true" />
            <div class="ml-auto">
              <Button
                icon="pi pi-trash"
                size="small"
                text
                severity="danger"
                :aria-label="$t('common.delete')"
                :title="$t('common.delete')"
                @click="removeState(state)"
              />
            </div>
          </div>
          <div v-if="addingState" class="flex items-center gap-2 py-1.5">
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
            class="self-start"
            @click="startAddState"
          />
        </div>

        <div class="flex flex-col">
          <div
            v-for="entry in subtree.transitions"
            :key="entry.record.id"
            class="flex min-w-0 items-center gap-2 border-b border-chrome-border py-1.5"
          >
            <span class="w-24 shrink-0 truncate text-muted text-supporting">{{ fromLabel(entry.record) }}</span>
            <i class="pi pi-arrow-right text-muted" aria-hidden="true" />
            <Select
              :model-value="transitionTarget(entry.record)"
              :options="stateValueOptions"
              option-label="label"
              option-value="value"
              size="small"
              class="w-40 shrink-0"
              :aria-label="$t('typeDeclaration.targetState')"
              @update:model-value="value => retargetTransition(entry, value)"
            />
            <InputText
              :model-value="entry.record.label || ''"
              size="small"
              class="min-w-0 flex-1"
              :placeholder="$t('typeDeclaration.intent')"
              :aria-label="$t('typeDeclaration.intent')"
              @update:model-value="value => entry.record.label = String(value)"
            />
            <Button
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              :aria-label="$t('common.delete')"
              :title="$t('common.delete')"
              @click="removeTransition(entry)"
            />
          </div>
          <Button
            v-if="subtree.states.length"
            icon="pi pi-plus"
            :label="$t('typeDeclaration.addTransition')"
            size="small"
            text
            class="self-start"
            @click="addTransition"
          />
        </div>
      </section>
    </div>

    <StandardDialog v-model:visible="machineVisible" :header="$t('typeDeclaration.machineView')">
      <!-- The shared markdown pipeline renders the derived mermaid fence;
           SSR paints nothing and hydration swaps the diagram in. -->
      <div :class="MARKDOWN_ELEMENT_CLASSES" v-html="machineHtml" />
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
// One authoring model, two projections (SPEC §1): this page edits the
// canvas declaration arrays of the stationing definition's draft; the
// contract table lives in components/type-designer/README.md.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from '~/components/shared/InstanceSelect.vue';
import Tag from 'primevue/tag';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';
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

const severityOptions = ['info', 'success', 'warn', 'danger', 'secondary'].map(value => ({ label: value, value }));

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
const title = computed(() => generatedEntityLabel(props.typeId, { t, te }));
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

function runDiagnostics() {
  diagnostics.value = declarationDiagnostics(nodes.value, edges.value, records(), activeOrganizationId());
}

watch(declarationSignature, () => {
  refusalDiagnostics.value = [];
  runDiagnostics();
});

// The workspace tab is a singleton (`page:typeDeclaration`): opening a
// second type reuses it with fresh params, so the projection follows the
// type id.
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

// The same live interpretation the canvas runs: declaration wires carry
// the binding and the entry value (field type ids, operation state
// defaults), so structural edits land through the same pass.
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

function fieldSummary(fieldNode) {
  return fieldDescriptorSummary(fieldNode.data?.descriptor || {});
}

function setDescriptor(fieldNode, value) {
  fieldNode.data.descriptor = value;
}

function toggleIdentifier(fieldNode) {
  setIdentifierHolder(nodes.value, fieldNode.id, fieldNode.data?.descriptor?.identifier !== true);
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

function setStatePolicy(stateNode, key, value) {
  if (key === 'severity') {
    stateNode.data.severity = value || 'info';
    return;
  }
  stateNode.data.icon = String(value || '').trim() || null;
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
  // A state enters the vocabulary through an operation (SPEC §7): carry
  // it into the first construct without an initial state, else mint the
  // transition that targets it.
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

function transitionTarget(record) {
  return operationTargetState(record);
}

function fromLabel(record) {
  return typeof record.state?.from === 'string' && record.state.from
    ? record.state.from
    : t('typeDeclaration.fromAny');
}

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

// The routed twin calls this from its own leave guard; pane-hosted mounts
// keep the browser unload guard above (the pane tab close carries no
// veto seam today).
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
