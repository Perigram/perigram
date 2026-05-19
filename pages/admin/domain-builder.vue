<template>
  <StandardPage :title="$t('admin.domainBuilder.title')" :subtitle="$t('admin.domainBuilder.subtitle')">
    <template #actions>
      <Button icon="pi pi-refresh" :label="$t('admin.domainBuilder.resetSource')" severity="secondary" @click="resetToSource" />
      <Button icon="pi pi-upload" :label="$t('admin.domainBuilder.importDraft')" severity="secondary" @click="triggerImport" />
      <Button icon="pi pi-download" :label="$t('admin.domainBuilder.exportDraft')" severity="secondary" @click="downloadDraft" />
      <Button icon="pi pi-code" :label="$t('admin.domainBuilder.exportJs')" :disabled="!validation.ok" @click="downloadSource" />
    </template>

    <input ref="fileInput" type="file" accept="application/json" class="hidden" @change="importDraft" />

    <div class="flex flex-col gap-6">
      <Panel :header="$t('admin.domainBuilder.status')">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-5">
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.domainBuilder.entities') }}</span>
            <strong>{{ draft.entities.length }}</strong>
          </div>
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.domainBuilder.routes') }}</span>
            <strong>{{ draft.frontendEntities.length }}</strong>
          </div>
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.domainBuilder.workflows') }}</span>
            <strong>{{ workflowTypes.length }}</strong>
          </div>
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.domainBuilder.summaries') }}</span>
            <strong>{{ draft.summaries.length }}</strong>
          </div>
          <div class="flex flex-col gap-1">
            <span>{{ $t('admin.domainBuilder.validation') }}</span>
            <Tag :severity="validation.ok ? 'success' : 'danger'" :value="validation.ok ? $t('common.success') : validation.issues.length" />
          </div>
        </div>
      </Panel>

      <div class="flex flex-wrap gap-2">
        <Button
          v-for="tab in tabs"
          :key="tab"
          :label="$t(`admin.domainBuilder.tabs.${tab}`)"
          :severity="activeTab === tab ? 'primary' : 'secondary'"
          size="small"
          @click="activeTab = tab"
        />
      </div>

      <Panel v-if="activeTab === 'entities'" :header="$t('admin.domainBuilder.tabs.entities')">
        <div class="flex justify-end mb-3">
          <Button icon="pi pi-plus" :label="$t('common.add')" size="small" @click="addEntity" />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr>
                <th class="text-left py-2">{{ $t('common.type') }}</th>
                <th class="text-left py-2">{{ $t('admin.domainBuilder.collection') }}</th>
                <th class="text-left py-2">{{ $t('admin.domainBuilder.blocks') }}</th>
                <th class="text-left py-2">{{ $t('common.actions.title') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(entity, index) in draft.entities" :key="`${entity.type}-${index}`" class="border-t border-content-border">
                <td class="py-2 pr-3 min-w-48"><InputText v-model="entity.type" class="w-full" /></td>
                <td class="py-2 pr-3 min-w-56"><InputText v-model="entity.collection" class="w-full" /></td>
                <td class="py-2 pr-3 min-w-96">
                  <InputText :model-value="stringifyCommaList(entity.blocks)" class="w-full" @update:model-value="value => entity.blocks = parseCommaList(value)" />
                </td>
                <td class="py-2">
                  <Button icon="pi pi-trash" severity="danger" text rounded @click="removeEntity(index)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <Divider />

        <div class="flex justify-between items-center mb-3">
          <h3 class="m-0 text-base font-semibold">{{ $t('admin.domainBuilder.frontendRoutes') }}</h3>
          <Button icon="pi pi-plus" :label="$t('common.add')" size="small" @click="addFrontendEntity" />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr>
                <th class="text-left py-2">{{ $t('common.type') }}</th>
                <th class="text-left py-2">{{ $t('admin.domainBuilder.collection') }}</th>
                <th class="text-left py-2">{{ $t('admin.domainBuilder.singleRoute') }}</th>
                <th class="text-left py-2">{{ $t('admin.domainBuilder.listRoute') }}</th>
                <th class="text-left py-2">{{ $t('common.actions.title') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(route, index) in draft.frontendEntities" :key="`${route.type}-${index}`" class="border-t border-content-border">
                <td class="py-2 pr-3 min-w-40"><InputText v-model="route.type" class="w-full" /></td>
                <td class="py-2 pr-3 min-w-48"><InputText v-model="route.collection" class="w-full" /></td>
                <td class="py-2 pr-3 min-w-56"><InputText v-model="route.routes.single" class="w-full" /></td>
                <td class="py-2 pr-3 min-w-56"><InputText v-model="route.routes.list" class="w-full" /></td>
                <td class="py-2">
                  <Button icon="pi pi-trash" severity="danger" text rounded @click="draft.frontendEntities.splice(index, 1)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel v-else-if="activeTab === 'workflows'" :header="$t('admin.domainBuilder.tabs.workflows')">
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-[18rem_1fr_22rem]">
          <div class="flex flex-col gap-3">
            <Select v-model="selectedWorkflowType" :options="workflowOptions" option-label="label" option-value="value" class="w-full" />
            <Button icon="pi pi-plus" :label="$t('admin.domainBuilder.addWorkflow')" @click="addWorkflow" />
            <Button icon="pi pi-trash" :label="$t('admin.domainBuilder.removeWorkflow')" severity="danger" outlined :disabled="!selectedWorkflowType" @click="removeWorkflow" />
            <Divider />
            <Button icon="pi pi-circle" :label="$t('admin.domainBuilder.addState')" :disabled="!currentWorkflow" @click="addState" />
            <Button
              icon="pi pi-arrow-right"
              :label="$t('admin.domainBuilder.addTransition')"
              :severity="transitionDraftFrom ? 'primary' : 'secondary'"
              :disabled="!currentWorkflow || stateNames.length === 0"
              @click="startTransitionDraft"
            />
            <Message v-if="transitionDraftFrom" severity="info">
              {{ $t('admin.domainBuilder.transitionDraft', { state: transitionDraftFrom }) }}
            </Message>
          </div>

          <div v-if="currentWorkflow" class="flex flex-col gap-4">
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="flex flex-col gap-2">
                <label>{{ $t('admin.domainBuilder.initialState') }}</label>
                <Select v-model="currentWorkflow.initial" :options="stateOptions" option-label="label" option-value="value" />
              </div>
              <div class="flex flex-col gap-2">
                <label>{{ $t('common.type') }}</label>
                <InputText :model-value="selectedWorkflowType" disabled />
              </div>
            </div>

            <Panel :header="$t('admin.domainBuilder.graph')">
              <div class="h-[32rem] w-full overflow-hidden rounded-ui border border-content-border bg-content">
                <VueFlow
                  :nodes="workflowNodes"
                  :edges="workflowEdges"
                  fit-view-on-init
                  :nodes-draggable="true"
                  :nodes-connectable="true"
                  :default-edge-options="defaultEdgeOptions"
                  @node-click="onWorkflowNodeClick"
                  @edge-click="onWorkflowEdgeClick"
                  @connect="onWorkflowConnect"
                >
                  <Background :gap="24" :size="1" color="var(--p-content-border-color)" />
                </VueFlow>
              </div>
            </Panel>
          </div>

          <div v-if="currentWorkflow" class="flex flex-col gap-4">
            <Panel v-if="selectedState" :header="$t('admin.domainBuilder.stateProperties')">
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-2">
                  <label>{{ $t('admin.domainBuilder.state') }}</label>
                  <InputText :model-value="selectedState" class="w-full font-mono" @update:model-value="renameSelectedState" />
                </div>
                <div class="flex items-center gap-2">
                  <Checkbox :model-value="currentWorkflow.initial === selectedState" binary @update:model-value="value => value && (currentWorkflow.initial = selectedState)" />
                  <label>{{ $t('admin.domainBuilder.initialState') }}</label>
                </div>
                <div class="flex items-center gap-2">
                  <Checkbox v-model="selectedStateDefinition.isTerminal" binary />
                  <label>{{ $t('admin.domainBuilder.terminalState') }}</label>
                </div>
                <div class="flex items-center gap-2">
                  <Checkbox v-model="selectedStateDefinition.canUpdateMeta" binary />
                  <label>{{ $t('admin.domainBuilder.canUpdateMeta') }}</label>
                </div>
                <div class="flex items-center gap-2">
                  <Checkbox v-model="selectedStateDefinition.canUpdateLifecycle" binary />
                  <label>{{ $t('admin.domainBuilder.canUpdateLifecycle') }}</label>
                </div>
                <div class="flex flex-col gap-2">
                  <label>{{ $t('admin.domainBuilder.lifecycleActors') }}</label>
                  <InputText :model-value="stringifyCommaList(selectedStateDefinition.lifecycle?.actors)" class="w-full" @update:model-value="updateLifecycleActors" />
                </div>
                <div class="flex flex-col gap-2">
                  <div class="flex justify-between items-center">
                    <label>{{ $t('admin.domainBuilder.lifecycleAttachments') }}</label>
                    <Button icon="pi pi-plus" :label="$t('common.add')" size="small" @click="addLifecycleAttachment" />
                  </div>
                  <div v-for="attachment in selectedLifecycleAttachments" :key="attachment.name" class="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                    <InputText :model-value="attachment.name" :placeholder="$t('admin.domainBuilder.attachmentName')" @update:model-value="value => renameLifecycleAttachment(attachment.name, value)" />
                    <div class="flex items-center gap-2">
                      <Checkbox :model-value="attachment.multiple" binary @update:model-value="value => updateLifecycleAttachmentMultiple(attachment.name, value)" />
                      <label>{{ $t('admin.domainBuilder.multiple') }}</label>
                    </div>
                    <Button icon="pi pi-trash" severity="danger" text rounded @click="removeLifecycleAttachment(attachment.name)" />
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <Checkbox :model-value="selectedStateDefinition.lifecycle?.data === true" binary @update:model-value="updateLifecycleData" />
                  <label>{{ $t('admin.domainBuilder.lifecycleData') }}</label>
                </div>
                <Button icon="pi pi-trash" :label="$t('admin.domainBuilder.removeState')" severity="danger" outlined @click="removeState(selectedState)" />
              </div>
            </Panel>

            <Panel v-else-if="selectedTransition" :header="$t('admin.domainBuilder.transitionProperties')">
              <div class="flex flex-col gap-3">
                <div class="grid grid-cols-2 gap-3">
                  <div class="flex flex-col gap-2">
                    <label>{{ $t('admin.domainBuilder.from') }}</label>
                    <Select v-model="selectedTransition.from" :options="stateOptions" option-label="label" option-value="value" />
                  </div>
                  <div class="flex flex-col gap-2">
                    <label>{{ $t('admin.domainBuilder.to') }}</label>
                    <Select v-model="selectedTransition.to" :options="stateOptions" option-label="label" option-value="value" />
                  </div>
                </div>
                <div class="flex flex-col gap-2">
                  <label>{{ $t('admin.domainBuilder.roles') }}</label>
                  <InputText :model-value="stringifyCommaList(selectedTransition.roles)" class="w-full" @update:model-value="value => selectedTransition.roles = parseCommaList(value)" />
                </div>
                <div class="flex flex-col gap-2">
                  <label>{{ $t('admin.domainBuilder.capabilities') }}</label>
                  <InputText :model-value="stringifyCommaList(selectedTransition.capabilities || selectedTransition.requiredCapabilities)" class="w-full" @update:model-value="value => updateTransitionCapabilities(selectedTransition, value)" />
                </div>
                <Divider />
                <div class="flex justify-between items-center">
                  <strong>{{ $t('admin.domainBuilder.hooks') }}</strong>
                  <Button icon="pi pi-plus" :label="$t('common.add')" size="small" @click="addTransitionHook(selectedTransition)" />
                </div>
                <div v-for="(hook, index) in selectedTransition.hooks || []" :key="index" class="flex flex-col gap-2 border border-content-border rounded-ui p-3">
                  <InputText v-model="hook.handler" :placeholder="$t('admin.domainBuilder.hookHandler')" class="w-full" />
                  <Textarea :model-value="JSON.stringify(hook.params || {}, null, 2)" rows="3" class="w-full font-mono text-xs" @update:model-value="value => updateHookParams(hook, value)" />
                  <Button icon="pi pi-trash" :label="$t('common.delete')" severity="danger" text @click="selectedTransition.hooks.splice(index, 1)" />
                </div>
                <Button icon="pi pi-trash" :label="$t('admin.domainBuilder.removeTransition')" severity="danger" outlined @click="removeSelectedTransition" />
              </div>
            </Panel>

            <Panel v-else :header="$t('admin.domainBuilder.selection')">
              <Message severity="info">{{ $t('admin.domainBuilder.selectGraphItem') }}</Message>
            </Panel>
          </div>
        </div>
      </Panel>

      <Panel v-else-if="activeTab === 'summaries'" :header="$t('admin.domainBuilder.tabs.summaries')">
        <div class="flex justify-end mb-3">
          <Button icon="pi pi-plus" :label="$t('common.add')" size="small" @click="addSummary" />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr>
                <th class="text-left py-2">{{ $t('admin.domainBuilder.entityType') }}</th>
                <th class="text-left py-2">{{ $t('admin.domainBuilder.parentType') }}</th>
                <th class="text-left py-2">{{ $t('admin.domainBuilder.parentIdKey') }}</th>
                <th class="text-left py-2">{{ $t('admin.domainBuilder.countField') }}</th>
                <th class="text-left py-2">{{ $t('admin.domainBuilder.sumFieldsJson') }}</th>
                <th class="text-left py-2">{{ $t('common.actions.title') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(summary, index) in draft.summaries" :key="index" class="border-t border-content-border align-top">
                <td class="py-2 pr-3 min-w-44"><InputText v-model="summary.entityType" class="w-full" /></td>
                <td class="py-2 pr-3 min-w-44"><InputText v-model="summary.parentType" class="w-full" /></td>
                <td class="py-2 pr-3 min-w-44"><InputText v-model="summary.parentIdKey" class="w-full" /></td>
                <td class="py-2 pr-3 min-w-44"><InputText v-model="summary.countField" class="w-full" /></td>
                <td class="py-2 pr-3 min-w-80">
                  <Textarea :model-value="JSON.stringify(summary.sumFields || {}, null, 2)" rows="4" class="w-full font-mono text-xs" @update:model-value="value => summary.sumFields = parseJsonObject(value, {})" />
                </td>
                <td class="py-2"><Button icon="pi pi-trash" severity="danger" text rounded @click="draft.summaries.splice(index, 1)" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel v-else-if="activeTab === 'validation'" :header="$t('admin.domainBuilder.tabs.validation')">
        <Message v-if="validation.ok" severity="success">{{ $t('admin.domainBuilder.valid') }}</Message>
        <div v-else class="flex flex-col gap-2">
          <Message v-for="issue in validation.issues" :key="issue.message" severity="error">
            <span class="font-mono">{{ issue.area }}</span>: {{ issue.message }}
          </Message>
        </div>
        <Divider v-if="validation.warnings.length" />
        <Message v-for="warning in validation.warnings" :key="warning.message" severity="warn">
          <span class="font-mono">{{ warning.area }}</span>: {{ warning.message }}
        </Message>
      </Panel>

      <Panel v-else :header="$t('admin.domainBuilder.tabs.export')">
        <Message v-if="!validation.ok" severity="warn" class="mb-4">
          {{ $t('admin.domainBuilder.exportBlocked') }}
        </Message>
        <Textarea :model-value="generatedSource" readonly rows="26" class="w-full font-mono text-xs" />
      </Panel>
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Background } from '@vue-flow/background';
import { MarkerType, Position, VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Divider from 'primevue/divider';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import StandardPage from '~/components/shared/StandardPage.vue';
import { cncEntities, cncFrontendEntities, cncSummaries, cncWorkflows } from '~/packages/domain-cnc/src/index.js';
import {
  DOMAIN_BUILDER_STORAGE_KEY,
  buildWorkflowGraph,
  createDomainDraft,
  generateDomainCncSource,
  parseCommaList,
  parseJsonObject,
  stringifyCommaList,
  validateDomainDraft
} from '~/utils/domain-builder.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { t } = useI18n();
const fileInput = ref(null);
const tabs = ['entities', 'workflows', 'summaries', 'validation', 'export'];
const activeTab = ref('entities');
const selectedWorkflowType = ref('project');
const selectedState = ref('');
const selectedTransitionIndex = ref(null);
const transitionDraftFrom = ref('');

const sourceDraft = () => createDomainDraft({
  entities: cncEntities,
  frontendEntities: cncFrontendEntities,
  workflows: cncWorkflows,
  summaries: cncSummaries
});

const draft = ref(sourceDraft());

const workflowTypes = computed(() => Object.keys(draft.value.workflows || {}).sort());
const workflowOptions = computed(() => [
  ...workflowTypes.value.map(type => ({ label: type, value: type })),
  ...draft.value.entities
    .filter(entity => !draft.value.workflows?.[entity.type])
    .map(entity => ({ label: `${entity.type} (${t('common.create')})`, value: entity.type }))
]);
const currentWorkflow = computed(() => draft.value.workflows?.[selectedWorkflowType.value] || null);
const stateNames = computed(() => Object.keys(currentWorkflow.value?.states || {}));
const stateOptions = computed(() => stateNames.value.map(state => ({ label: state, value: state })));
const validation = computed(() => validateDomainDraft(draft.value));
const generatedSource = computed(() => generateDomainCncSource(draft.value));
const workflowGraph = computed(() => buildWorkflowGraph(currentWorkflow.value || {}));
const selectedStateDefinition = computed(() => {
  if (!currentWorkflow.value || !selectedState.value) return {};
  currentWorkflow.value.states[selectedState.value] ||= {};
  return currentWorkflow.value.states[selectedState.value];
});
const selectedTransition = computed(() => {
  if (!currentWorkflow.value || selectedTransitionIndex.value === null) return null;
  return currentWorkflow.value.transitions[selectedTransitionIndex.value] || null;
});
const defaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: MarkerType.ArrowClosed,
  interactionWidth: 24
};
const workflowNodes = computed(() => workflowGraph.value.nodes.map(node => ({
  id: node.id,
  label: node.id,
  position: { x: node.x, y: node.y },
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
  selected: selectedState.value === node.id,
  data: { label: node.id },
  style: workflowNodeStyle(node)
})));
const workflowEdges = computed(() => workflowGraph.value.edges.map(edge => ({
  id: edge.id,
  source: edge.from,
  target: edge.to,
  label: `${edge.from} -> ${edge.to}`,
  type: 'smoothstep',
  markerEnd: MarkerType.ArrowClosed,
  interactionWidth: 24,
  selected: selectedTransitionIndex.value === edge.index,
  data: { index: edge.index },
  style: workflowEdgeStyle(edge),
  labelStyle: {
    color: 'var(--p-text-color)',
    fontSize: '0.75rem',
    fontWeight: '500'
  },
  labelShowBg: true,
  labelBgStyle: {
    fill: 'var(--p-content-background)',
    stroke: 'var(--p-content-border-color)'
  },
  labelBgPadding: [6, 8],
  labelBgBorderRadius: 6
})));
const selectedLifecycleAttachments = computed(() => {
  const attachments = selectedStateDefinition.value.lifecycle?.attachments || {};
  return Object.entries(attachments).map(([name, definition]) => ({
    name,
    multiple: Boolean(definition?.multiple)
  }));
});

onMounted(() => {
  if (!import.meta.client) return;
  const saved = localStorage.getItem(DOMAIN_BUILDER_STORAGE_KEY);
  if (!saved) return;
  try {
    draft.value = JSON.parse(saved);
  } catch {
    draft.value = sourceDraft();
  }
});

watch(draft, (value) => {
  if (!import.meta.client) return;
  localStorage.setItem(DOMAIN_BUILDER_STORAGE_KEY, JSON.stringify(value));
}, { deep: true });

watch(selectedWorkflowType, () => {
  selectedState.value = '';
  selectedTransitionIndex.value = null;
  transitionDraftFrom.value = '';
});

function resetToSource() {
  draft.value = sourceDraft();
  selectedWorkflowType.value = workflowTypes.value[0] || '';
}

function addEntity() {
  const type = `entity_${draft.value.entities.length + 1}`;
  draft.value.entities.push({
    type,
    collection: `${type}s`,
    blocks: ['identity', 'origin', 'status', 'attachments', 'data']
  });
}

function removeEntity(index) {
  const [removed] = draft.value.entities.splice(index, 1);
  if (!removed) return;
  delete draft.value.workflows[removed.type];
  draft.value.frontendEntities = draft.value.frontendEntities.filter(route => route.collection !== removed.collection);
  draft.value.summaries = draft.value.summaries.filter(summary => summary.entityType !== removed.type && summary.parentType !== removed.type);
}

function addFrontendEntity() {
  const entity = draft.value.entities[0] || { type: 'entity', collection: 'entities' };
  draft.value.frontendEntities.push({
    type: entity.type,
    collection: entity.collection,
    routes: { single: `/api/${entity.collection}/:id`, list: `/api/${entity.collection}` }
  });
}

function addWorkflow() {
  const type = selectedWorkflowType.value || draft.value.entities[0]?.type;
  if (!type || draft.value.workflows[type]) return;
  draft.value.workflows[type] = {
    initial: 'DRAFT',
    states: { DRAFT: { canUpdateMeta: true } },
    transitions: []
  };
  selectedWorkflowType.value = type;
  selectedState.value = 'DRAFT';
  selectedTransitionIndex.value = null;
}

function removeWorkflow() {
  if (!selectedWorkflowType.value) return;
  delete draft.value.workflows[selectedWorkflowType.value];
  selectedWorkflowType.value = workflowTypes.value[0] || '';
}

function addState() {
  if (!currentWorkflow.value) return;
  const name = uniqueName('STATE', stateNames.value);
  currentWorkflow.value.states[name] = {};
  if (!currentWorkflow.value.initial) currentWorkflow.value.initial = name;
  selectedState.value = name;
  selectedTransitionIndex.value = null;
}

function removeState(state) {
  if (!currentWorkflow.value) return;
  delete currentWorkflow.value.states[state];
  currentWorkflow.value.transitions = currentWorkflow.value.transitions.filter(transition => transition.from !== state && transition.to !== state);
  if (currentWorkflow.value.initial === state) currentWorkflow.value.initial = stateNames.value[0] || '';
  if (selectedState.value === state) selectedState.value = stateNames.value[0] || '';
  selectedTransitionIndex.value = null;
  if (transitionDraftFrom.value === state) transitionDraftFrom.value = '';
}

function addTransition() {
  if (!currentWorkflow.value) return;
  const from = currentWorkflow.value.initial || stateNames.value[0] || '';
  const to = stateNames.value.find(state => state !== from) || from;
  currentWorkflow.value.transitions.push({
    from,
    to,
    roles: ['SuperAdmin']
  });
  selectedTransitionIndex.value = currentWorkflow.value.transitions.length - 1;
  selectedState.value = '';
}

function updateTransitionCapabilities(transition, value) {
  const capabilities = parseCommaList(value);
  delete transition.requiredCapabilities;
  if (capabilities.length) transition.capabilities = capabilities;
  else delete transition.capabilities;
}

function addSummary() {
  draft.value.summaries.push({
    entityType: draft.value.entities[0]?.type || 'entity',
    parentType: draft.value.entities[1]?.type || draft.value.entities[0]?.type || 'parent',
    parentIdKey: 'parentId',
    countField: 'count'
  });
}

function triggerImport() {
  fileInput.value?.click();
}

async function importDraft(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  draft.value = JSON.parse(text);
  event.target.value = '';
}

function downloadDraft() {
  downloadText('domain-cnc-draft.json', JSON.stringify(draft.value, null, 2), 'application/json');
}

function downloadSource() {
  downloadText('domain-cnc.generated.js', generatedSource.value, 'text/javascript');
}

function downloadText(fileName, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function workflowNodeStyle(node) {
  const selected = selectedState.value === node.id || transitionDraftFrom.value === node.id;
  const base = {
    width: `${node.width}px`,
    minHeight: `${node.height}px`,
    borderRadius: 'var(--ck-radius-ui)',
    border: selected ? '2px solid var(--p-primary-color)' : '1px solid var(--p-content-border-color)',
    boxShadow: selected ? 'var(--ck-shadow-card-hover)' : 'var(--ck-shadow-card)',
    fontFamily: 'inherit',
    fontWeight: 600
  };
  if (node.initial || transitionDraftFrom.value === node.id) {
    return {
      ...base,
      background: 'var(--p-primary-color)',
      color: 'var(--p-primary-contrast-color)'
    };
  }
  if (node.terminal) {
    return {
      ...base,
      background: 'var(--ck-subtle-background)',
      color: 'var(--p-text-color)'
    };
  }
  return {
    ...base,
    background: 'var(--p-content-background)',
    color: 'var(--p-text-color)'
  };
}

function workflowEdgeStyle(edge) {
  return {
    stroke: selectedTransitionIndex.value === edge.index ? 'var(--p-primary-color)' : 'var(--p-content-border-color)',
    strokeWidth: selectedTransitionIndex.value === edge.index ? 3 : 2
  };
}

function selectState(state) {
  if (transitionDraftFrom.value) {
    currentWorkflow.value.transitions.push({
      from: transitionDraftFrom.value,
      to: state,
      roles: ['SuperAdmin']
    });
    selectedTransitionIndex.value = currentWorkflow.value.transitions.length - 1;
    selectedState.value = '';
    transitionDraftFrom.value = '';
    return;
  }
  selectedState.value = state;
  selectedTransitionIndex.value = null;
}

function selectTransition(index) {
  selectedTransitionIndex.value = index;
  selectedState.value = '';
  transitionDraftFrom.value = '';
}

function startTransitionDraft() {
  if (transitionDraftFrom.value) {
    transitionDraftFrom.value = '';
    return;
  }
  transitionDraftFrom.value = selectedState.value || currentWorkflow.value?.initial || stateNames.value[0] || '';
  selectedTransitionIndex.value = null;
}

function renameSelectedState(value) {
  if (!currentWorkflow.value || !selectedState.value) return;
  const next = String(value || '').trim();
  const previous = selectedState.value;
  if (!next || next === previous || currentWorkflow.value.states[next]) return;
  currentWorkflow.value.states[next] = currentWorkflow.value.states[previous];
  delete currentWorkflow.value.states[previous];
  for (const transition of currentWorkflow.value.transitions) {
    if (transition.from === previous) transition.from = next;
    if (transition.to === previous) transition.to = next;
  }
  if (currentWorkflow.value.initial === previous) currentWorkflow.value.initial = next;
  if (transitionDraftFrom.value === previous) transitionDraftFrom.value = next;
  selectedState.value = next;
}

function ensureLifecycle() {
  selectedStateDefinition.value.lifecycle ||= {};
  return selectedStateDefinition.value.lifecycle;
}

function pruneLifecycle() {
  const lifecycle = selectedStateDefinition.value.lifecycle;
  if (!lifecycle) return;
  if (!lifecycle.actors?.length) delete lifecycle.actors;
  if (!lifecycle.attachments || Object.keys(lifecycle.attachments).length === 0) delete lifecycle.attachments;
  if (lifecycle.data !== true) delete lifecycle.data;
  if (Object.keys(lifecycle).length === 0) delete selectedStateDefinition.value.lifecycle;
}

function updateLifecycleActors(value) {
  const actors = parseCommaList(value);
  if (actors.length) ensureLifecycle().actors = actors;
  else if (selectedStateDefinition.value.lifecycle) delete selectedStateDefinition.value.lifecycle.actors;
  pruneLifecycle();
}

function updateLifecycleData(value) {
  if (value) ensureLifecycle().data = true;
  else if (selectedStateDefinition.value.lifecycle) delete selectedStateDefinition.value.lifecycle.data;
  pruneLifecycle();
}

function ensureLifecycleAttachments() {
  const lifecycle = ensureLifecycle();
  lifecycle.attachments ||= {};
  return lifecycle.attachments;
}

function addLifecycleAttachment() {
  const attachments = ensureLifecycleAttachments();
  const name = uniqueName('attachment', Object.keys(attachments));
  attachments[name] = { multiple: false };
}

function renameLifecycleAttachment(previous, value) {
  const next = String(value || '').trim();
  const attachments = selectedStateDefinition.value.lifecycle?.attachments;
  if (!attachments || !next || next === previous || attachments[next]) return;
  attachments[next] = attachments[previous];
  delete attachments[previous];
}

function updateLifecycleAttachmentMultiple(name, value) {
  const attachments = ensureLifecycleAttachments();
  attachments[name] ||= {};
  attachments[name].multiple = Boolean(value);
}

function removeLifecycleAttachment(name) {
  const attachments = selectedStateDefinition.value.lifecycle?.attachments;
  if (!attachments) return;
  delete attachments[name];
  pruneLifecycle();
}

function addTransitionHook(transition) {
  transition.hooks ||= [];
  transition.hooks.push({ handler: 'triggerAggregator' });
}

function updateHookParams(hook, value) {
  hook.params = parseJsonObject(value, hook.params || {});
  if (Object.keys(hook.params).length === 0) delete hook.params;
}

function removeSelectedTransition() {
  if (!currentWorkflow.value || selectedTransitionIndex.value === null) return;
  currentWorkflow.value.transitions.splice(selectedTransitionIndex.value, 1);
  selectedTransitionIndex.value = null;
}

function onWorkflowNodeClick(event) {
  selectState(event.node.id);
}

function onWorkflowEdgeClick(event) {
  selectTransition(event.edge.data.index);
}

function onWorkflowConnect(connection) {
  if (!currentWorkflow.value || !connection.source || !connection.target) return;
  currentWorkflow.value.transitions.push({
    from: connection.source,
    to: connection.target,
    roles: ['SuperAdmin']
  });
  selectedTransitionIndex.value = currentWorkflow.value.transitions.length - 1;
  selectedState.value = '';
  transitionDraftFrom.value = '';
}

function uniqueName(prefix, existing) {
  let index = 1;
  let value = `${prefix}_${index}`;
  while (existing.includes(value)) {
    index += 1;
    value = `${prefix}_${index}`;
  }
  return value;
}
</script>
