<template>
  <StandardPage :title="$t('admin.workbench.title')" :subtitle="$t('admin.workbench.subtitle')">
    <template #actions>
      <Button icon="pi pi-refresh" :label="$t('common.reset')" severity="secondary" @click="resetWorkbench" />
      <Button icon="pi pi-download" :label="$t('admin.workbench.exportDraft')" @click="downloadDraft" />
    </template>

    <div class="grid grid-cols-1 gap-4 2xl:grid-cols-[18rem_1fr]">
      <Panel :header="$t('admin.workbench.entities')">
        <div class="flex flex-col gap-3">
          <InputText v-model="search" :placeholder="$t('common.search')" class="w-full" />
          <div class="grid max-h-[calc(100vh-18rem)] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 2xl:grid-cols-1">
            <button
              v-for="entity in visibleEntities"
              :key="entity.type"
              type="button"
              class="flex min-w-0 items-center justify-between gap-2 rounded-ui border border-content-border bg-content px-2 py-2 text-left"
              :class="selectedEntityType === entity.type ? 'border-primary' : ''"
              @click="selectedEntityType = entity.type"
            >
              <span class="flex min-w-0 items-center gap-2">
                <strong class="truncate">{{ entity.type }}</strong>
                <small class="truncate text-muted-color">{{ entity.collection }}</small>
              </span>
              <Tag :value="entity.blocks?.length || 0" severity="secondary" size="small" />
            </button>
          </div>
        </div>
      </Panel>

      <div v-if="selectedEntity" class="flex flex-col gap-4">
        <Panel>
          <template #header>
            <div class="flex w-full flex-col gap-1">
              <span>{{ selectedEntity.type }}</span>
              <small class="text-muted-color">{{ selectedEntity.collection }}</small>
            </div>
          </template>
        </Panel>

        <Panel :header="$t('admin.workbench.sectionsUi')">
          <div class="flex flex-col gap-4">
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div class="flex flex-col gap-2">
              <label>{{ $t('admin.workbench.componentKey') }}</label>
              <InputText :model-value="uiContract?.key || selectedEntity.type" disabled />
            </div>
            <div class="flex flex-col gap-2">
              <label>{{ $t('admin.workbench.statusPolicy') }}</label>
              <Select v-model="uiDraft.status" :options="statusPolicyOptions" option-label="label" option-value="value" />
            </div>
            <div class="flex flex-col gap-2">
              <label>{{ $t('admin.workbench.tracePolicy') }}</label>
              <Select v-model="uiDraft.trace" :options="tracePolicyOptions" option-label="label" option-value="value" />
            </div>
            <div class="flex flex-col gap-2">
              <label>{{ $t('admin.workbench.componentPath') }}</label>
              <InputText :model-value="manifestComponent?.componentPath || ''" disabled />
            </div>
          </div>

          <Panel :header="$t('admin.workbench.displayFields')">
            <div class="flex flex-col gap-2">
              <div v-for="(field, index) in uiDraft.fieldPaths" :key="`${field}-${index}`" class="grid grid-cols-[1fr_auto] gap-2">
                <InputText v-model="uiDraft.fieldPaths[index]" />
                <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="uiDraft.fieldPaths.splice(index, 1)" />
              </div>
              <Button icon="pi pi-plus" :label="$t('common.add')" size="small" @click="uiDraft.fieldPaths.push('data.')" />
            </div>
          </Panel>
          </div>
        </Panel>

        <Panel :header="$t('admin.workbench.sectionsData')">
          <Message v-if="modelError" severity="warn">{{ modelError }}</Message>
          <Message v-else-if="modelLoading" severity="info">{{ $t('common.loading') }}</Message>
          <div v-else class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr>
                  <th class="py-2 text-left">{{ $t('admin.dataModelReview.field') }}</th>
                  <th class="py-2 text-left">{{ $t('common.type') }}</th>
                  <th class="py-2 text-left">{{ $t('admin.dataModelReview.flags') }}</th>
                  <th class="py-2 text-left">{{ $t('admin.dataModelReview.decision') }}</th>
                  <th class="py-2 text-left">{{ $t('admin.dataModelReview.target') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in selectedModelFields" :key="field.name" class="border-t border-content-border align-top">
                  <td class="py-3 pr-3 font-mono">{{ field.name }}</td>
                  <td class="py-3 pr-3">{{ field.type }}</td>
                  <td class="py-3 pr-3">
                    <Tag v-for="issue in field.issues || []" :key="issue" :value="issue" severity="warn" size="small" class="mr-1" />
                  </td>
                  <td class="min-w-48 py-3 pr-3">
                    <Select v-model="dataDecisionFor(field).decision" :options="dataDecisionOptions" option-label="label" option-value="value" />
                  </td>
                  <td class="min-w-56 py-3">
                    <InputText v-model="dataDecisionFor(field).target" :placeholder="$t('admin.dataModelReview.targetPlaceholder')" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel :header="$t('admin.workbench.sectionsFeedback')">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-[14rem_1fr]">
            <Select v-model="feedbackDraft.decision" :options="feedbackDecisionOptions" option-label="label" option-value="value" />
            <Textarea v-model="feedbackDraft.note" rows="5" auto-resize :placeholder="$t('uiLab.feedback.placeholder')" />
          </div>
        </Panel>

        <Panel :header="$t('admin.workbench.sectionsWorkflow')">
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_22rem]">
            <div class="flex flex-col gap-4">
              <Message severity="info">{{ $t('admin.workbench.workflowNoRoles') }}</Message>
              <div class="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                <div class="flex flex-col gap-2">
                  <label>{{ $t('admin.domainBuilder.initialState') }}</label>
                  <Select v-model="workflowDraft.initial" :options="workflowStateOptions" option-label="label" option-value="value" />
                </div>
                <Button icon="pi pi-circle" :label="$t('admin.domainBuilder.addState')" size="small" @click="addWorkflowState" />
                <Button
                  icon="pi pi-arrow-right"
                  :label="$t('admin.domainBuilder.addTransition')"
                  :severity="transitionDraftFrom ? 'primary' : 'secondary'"
                  size="small"
                  @click="startTransitionDraft"
                />
              </div>
              <Message v-if="transitionDraftFrom" severity="info">
                {{ $t('admin.domainBuilder.transitionDraft', { state: transitionDraftFrom }) }}
              </Message>
              <div class="h-[32rem] w-full overflow-hidden rounded-ui border border-content-border bg-content">
                <VueFlow
                  :nodes="workflowNodes"
                  :edges="workflowEdges"
                  fit-view-on-init
                  :nodes-draggable="true"
                  :nodes-connectable="true"
                  :default-edge-options="defaultEdgeOptions"
                  @node-click="onWorkflowNodeClick"
                  @node-drag-stop="onWorkflowNodeDragStop"
                  @edge-click="onWorkflowEdgeClick"
                  @connect="onWorkflowConnect"
                />
              </div>
            </div>

            <div class="flex flex-col gap-4">
              <Panel v-if="selectedState" :header="$t('admin.domainBuilder.stateProperties')">
                <div class="flex flex-col gap-3">
                  <div class="flex flex-col gap-2">
                    <label>{{ $t('admin.domainBuilder.state') }}</label>
                    <InputText :model-value="selectedState" class="w-full font-mono" @update:model-value="renameSelectedState" />
                  </div>
                  <div class="flex items-center gap-2">
                    <Checkbox :model-value="workflowDraft.initial === selectedState" binary @update:model-value="value => value && (workflowDraft.initial = selectedState)" />
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
                    <div class="flex items-center justify-between">
                      <label>{{ $t('admin.domainBuilder.lifecycleAttachments') }}</label>
                      <Button icon="pi pi-plus" :label="$t('common.add')" size="small" @click="addLifecycleAttachment" />
                    </div>
                    <div v-for="attachment in selectedLifecycleAttachments" :key="attachment.name" class="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                      <InputText :model-value="attachment.name" :placeholder="$t('admin.domainBuilder.attachmentName')" @update:model-value="value => renameLifecycleAttachment(attachment.name, value)" />
                      <div class="flex items-center gap-2">
                        <Checkbox :model-value="attachment.multiple" binary @update:model-value="value => updateLifecycleAttachmentMultiple(attachment.name, value)" />
                        <label>{{ $t('admin.domainBuilder.multiple') }}</label>
                      </div>
                      <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="removeLifecycleAttachment(attachment.name)" />
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <Checkbox :model-value="selectedStateDefinition.lifecycle?.data === true" binary @update:model-value="updateLifecycleData" />
                    <label>{{ $t('admin.domainBuilder.lifecycleData') }}</label>
                  </div>
                  <Button icon="pi pi-trash" :label="$t('admin.domainBuilder.removeState')" severity="danger" outlined @click="removeWorkflowState(selectedState)" />
                </div>
              </Panel>

              <Panel v-else-if="selectedTransition" :header="$t('admin.domainBuilder.transitionProperties')">
                <div class="flex flex-col gap-3">
                  <div class="grid grid-cols-2 gap-3">
                    <div class="flex flex-col gap-2">
                      <label>{{ $t('admin.domainBuilder.from') }}</label>
                      <Select v-model="selectedTransition.from" :options="workflowStateOptions" option-label="label" option-value="value" />
                    </div>
                    <div class="flex flex-col gap-2">
                      <label>{{ $t('admin.domainBuilder.to') }}</label>
                      <Select v-model="selectedTransition.to" :options="workflowStateOptions" option-label="label" option-value="value" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-2">
                    <label>{{ $t('admin.domainBuilder.capabilities') }}</label>
                    <InputText :model-value="stringifyCommaList(selectedTransition.capabilities || selectedTransition.requiredCapabilities)" @update:model-value="value => updateTransitionCapabilities(selectedTransition, value)" />
                  </div>
                  <div class="flex items-center justify-between">
                    <strong>{{ $t('admin.domainBuilder.hooks') }}</strong>
                    <Button icon="pi pi-plus" :label="$t('common.add')" size="small" @click="addTransitionHook(selectedTransition)" />
                  </div>
                  <div v-for="(hook, index) in selectedTransition.hooks || []" :key="index" class="flex flex-col gap-2 rounded-ui border border-content-border p-3">
                    <Select v-model="hook.handler" :options="hookOptions" option-label="label" option-value="value" class="w-full" />
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
      </div>
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { MarkerType, Position, VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import StandardPage from '~/components/shared/StandardPage.vue';
import frameworkManifest from '~/framework.manifest.json';
import { cncEntities, cncWorkflows } from '~/packages/domain-cnc/src/index.js';
import { DESIGN_SYSTEM_ENTITY_CONTRACTS } from '~/utils/design-system-contract.js';
import { buildWorkflowGraph, parseCommaList, parseJsonObject, stringifyCommaList } from '~/utils/domain-builder.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const STORAGE_KEY = 'cutkit:entity-workbench:v1';
const WORKFLOW_LAYOUT_STORAGE_KEY = 'cutkit:entity-workbench-layout:v1';
const KNOWN_HOOKS = ['propagateToChildren', 'triggerAggregator', 'processPhysicalCut', 'createPhysicalUnits'];

const entities = ref(structuredClone(cncEntities));
const workflows = ref(stripWorkflowRoles(cncWorkflows));
const ui = ref(createUiDraft());
const feedback = ref({});
const dataDecisions = ref({});
const models = ref([]);
const modelLoading = ref(false);
const modelError = ref('');
const search = ref('');
const selectedEntityType = ref(entities.value[0]?.type || '');
const selectedState = ref('');
const selectedTransitionIndex = ref(null);
const transitionDraftFrom = ref('');
const workflowLayouts = ref({});

const visibleEntities = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return entities.value;
  return entities.value.filter(entity => `${entity.type} ${entity.collection}`.toLowerCase().includes(term));
});
const selectedEntity = computed(() => entities.value.find(entity => entity.type === selectedEntityType.value) || entities.value[0]);
const uiContract = computed(() => DESIGN_SYSTEM_ENTITY_CONTRACTS.find(entry => entry.entityType === selectedEntity.value?.type));
const manifestComponent = computed(() => frameworkManifest.designSystem?.components?.find(entry => entry.entityType === selectedEntity.value?.type));
const uiDraft = computed(() => ui.value[selectedEntity.value.type]);
const selectedModel = computed(() => models.value.find(model => normalizeCollection(model.collection) === normalizeCollection(selectedEntity.value.collection)));
const selectedModelFields = computed(() => selectedModel.value?.fields || []);
const feedbackDraft = computed(() => {
  feedback.value[selectedEntity.value.type] ||= { decision: 'unchecked', note: '' };
  return feedback.value[selectedEntity.value.type];
});
const workflowDraft = computed(() => {
  workflows.value[selectedEntity.value.type] ||= { initial: 'DRAFT', states: { DRAFT: { canUpdateMeta: true } }, transitions: [] };
  return workflows.value[selectedEntity.value.type];
});
const workflowStateNames = computed(() => Object.keys(workflowDraft.value.states || {}));
const workflowStateOptions = computed(() => workflowStateNames.value.map(value => ({ label: value, value })));
const workflowGraph = computed(() => buildWorkflowGraph(workflowDraft.value || {}));
const selectedStateDefinition = computed(() => {
  if (!selectedState.value) return {};
  workflowDraft.value.states[selectedState.value] ||= {};
  return workflowDraft.value.states[selectedState.value];
});
const selectedTransition = computed(() => {
  if (selectedTransitionIndex.value === null) return null;
  return workflowDraft.value.transitions[selectedTransitionIndex.value] || null;
});
const defaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--p-content-border-color)' },
  interactionWidth: 24
};
const workflowNodes = computed(() => workflowGraph.value.nodes.map(node => ({
  id: node.id,
  label: node.id,
  position: workflowNodePosition(node),
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
  label: transitionLabel(workflowDraft.value.transitions[edge.index]),
  type: edge.reciprocal ? 'default' : 'smoothstep',
  pathOptions: edgePathOptions(edge),
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: selectedTransitionIndex.value === edge.index ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'
  },
  interactionWidth: 24,
  selected: selectedTransitionIndex.value === edge.index,
  data: { index: edge.index },
  style: workflowEdgeStyle(edge),
  labelStyle: {
    color: 'var(--p-text-color)',
    fill: 'var(--p-text-color)',
    fontSize: '0.625rem',
    fontWeight: '500'
  },
  labelShowBg: true,
  labelBgStyle: {
    fill: 'var(--p-content-background)',
    stroke: 'var(--p-content-border-color)'
  },
  labelBgPadding: [4, 3],
  labelBgBorderRadius: 4
})));
const selectedLifecycleAttachments = computed(() => {
  const attachments = selectedStateDefinition.value.lifecycle?.attachments || {};
  return Object.entries(attachments).map(([name, definition]) => ({
    name,
    multiple: Boolean(definition?.multiple)
  }));
});
const hookOptions = computed(() => uniqueSorted([
  ...KNOWN_HOOKS,
  ...(workflowDraft.value.transitions || []).flatMap(transition => (transition.hooks || []).map(hook => hook.handler).filter(Boolean))
]).map(value => ({ label: value, value })));

const statusPolicyOptions = [
  { label: 'interactive', value: 'interactive' },
  { label: 'readonly', value: 'readonly' },
  { label: 'hidden', value: 'hidden' }
];
const tracePolicyOptions = [
  { label: 'enabled', value: true },
  { label: 'hidden', value: false }
];
const dataDecisionOptions = ['unchecked', 'keep', 'remove', 'rename', 'move', 'investigate'].map(value => ({ label: value, value }));
const feedbackDecisionOptions = ['unchecked', 'fix', 'improve', 'ok'].map(value => ({ label: value, value }));

onMounted(() => {
  loadStoredDraft();
  loadModels();
  loadWorkflowLayouts();
});

watch([ui, workflows, feedback, dataDecisions], saveDraft, { deep: true });
watch(workflowLayouts, saveWorkflowLayouts, { deep: true });
watch(selectedEntityType, () => {
  selectedState.value = '';
  selectedTransitionIndex.value = null;
  transitionDraftFrom.value = '';
});

async function loadModels() {
  modelLoading.value = true;
  modelError.value = '';
  try {
    models.value = await $fetch('/api/debug/data-models');
  } catch (error) {
    modelError.value = error?.message || 'Failed to load data models';
  } finally {
    modelLoading.value = false;
  }
}

function createUiDraft() {
  return Object.fromEntries(cncEntities.map(entity => {
    const contract = DESIGN_SYSTEM_ENTITY_CONTRACTS.find(entry => entry.entityType === entity.type);
    const manifest = frameworkManifest.designSystem?.components?.find(entry => entry.entityType === entity.type);
    return [entity.type, {
      status: contract?.status || 'hidden',
      trace: contract?.trace || false,
      fieldPaths: structuredClone(manifest?.fieldPaths || [])
    }];
  }));
}

function loadStoredDraft() {
  if (!import.meta.client) return;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    ui.value = parsed.ui || ui.value;
    workflows.value = parsed.workflows || workflows.value;
    feedback.value = parsed.feedback || {};
    dataDecisions.value = parsed.dataDecisions || {};
  } catch {
    resetWorkbench();
  }
}

function loadWorkflowLayouts() {
  if (!import.meta.client) return;
  const saved = localStorage.getItem(WORKFLOW_LAYOUT_STORAGE_KEY);
  if (!saved) return;
  try {
    workflowLayouts.value = JSON.parse(saved);
  } catch {
    workflowLayouts.value = {};
  }
}

function saveDraft() {
  if (!import.meta.client) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ui: ui.value,
    workflows: workflows.value,
    feedback: feedback.value,
    dataDecisions: dataDecisions.value
  }));
}

function saveWorkflowLayouts() {
  if (!import.meta.client) return;
  localStorage.setItem(WORKFLOW_LAYOUT_STORAGE_KEY, JSON.stringify(workflowLayouts.value));
}

function resetWorkbench() {
  ui.value = createUiDraft();
  workflows.value = stripWorkflowRoles(cncWorkflows);
  feedback.value = {};
  dataDecisions.value = {};
  workflowLayouts.value = {};
  if (import.meta.client) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(WORKFLOW_LAYOUT_STORAGE_KEY);
  }
}

function dataDecisionFor(field) {
  const key = `${selectedEntity.value.type}:${field.name}`;
  dataDecisions.value[key] ||= { decision: 'unchecked', target: '' };
  return dataDecisions.value[key];
}

function addWorkflowState() {
  const name = uniqueName('STATE', workflowStateNames.value);
  workflowDraft.value.states[name] = {};
  if (!workflowDraft.value.initial) workflowDraft.value.initial = name;
}

function removeWorkflowState(state) {
  delete workflowDraft.value.states[state];
  delete workflowLayouts.value[selectedEntity.value.type]?.[state];
  workflowDraft.value.transitions = workflowDraft.value.transitions.filter(transition => transition.from !== state && transition.to !== state);
  if (workflowDraft.value.initial === state) workflowDraft.value.initial = workflowStateNames.value[0] || '';
  if (selectedState.value === state) selectedState.value = workflowStateNames.value[0] || '';
  selectedTransitionIndex.value = null;
  if (transitionDraftFrom.value === state) transitionDraftFrom.value = '';
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

function edgePathOptions(edge) {
  if (edge.reciprocal) {
    return { curvature: edge.reverse ? 0.55 : 0.2 };
  }
  return {
    offset: 24 + edge.sameDirectionIndex * 18,
    borderRadius: 12
  };
}

function workflowNodePosition(node) {
  return workflowLayouts.value[selectedEntity.value.type]?.[node.id] || { x: node.x, y: node.y };
}

function transitionLabel(transition = {}) {
  const parts = [`${transition.from} -> ${transition.to}`];
  const capabilities = transition.capabilities || transition.requiredCapabilities || [];
  if (capabilities.length) parts.push(`${capabilities.length} caps`);
  if (transition.hooks?.length) parts.push(`${transition.hooks.length} hooks`);
  return parts.join(' / ');
}

function selectState(state) {
  if (transitionDraftFrom.value) {
    workflowDraft.value.transitions.push({
      from: transitionDraftFrom.value,
      to: state,
      capabilities: []
    });
    selectedTransitionIndex.value = workflowDraft.value.transitions.length - 1;
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
  transitionDraftFrom.value = selectedState.value || workflowDraft.value.initial || workflowStateNames.value[0] || '';
  selectedTransitionIndex.value = null;
}

function renameSelectedState(value) {
  const next = String(value || '').trim();
  const previous = selectedState.value;
  if (!next || next === previous || workflowDraft.value.states[next]) return;
  workflowDraft.value.states[next] = workflowDraft.value.states[previous];
  delete workflowDraft.value.states[previous];
  for (const transition of workflowDraft.value.transitions) {
    if (transition.from === previous) transition.from = next;
    if (transition.to === previous) transition.to = next;
  }
  if (workflowDraft.value.initial === previous) workflowDraft.value.initial = next;
  if (transitionDraftFrom.value === previous) transitionDraftFrom.value = next;
  if (workflowLayouts.value[selectedEntity.value.type]?.[previous]) {
    workflowLayouts.value[selectedEntity.value.type][next] = workflowLayouts.value[selectedEntity.value.type][previous];
    delete workflowLayouts.value[selectedEntity.value.type][previous];
  }
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

function updateTransitionCapabilities(transition, value) {
  const capabilities = parseCommaList(value);
  delete transition.requiredCapabilities;
  if (capabilities.length) transition.capabilities = capabilities;
  else delete transition.capabilities;
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
  if (selectedTransitionIndex.value === null) return;
  workflowDraft.value.transitions.splice(selectedTransitionIndex.value, 1);
  selectedTransitionIndex.value = null;
}

function onWorkflowNodeClick(event) {
  selectState(event.node.id);
}

function onWorkflowNodeDragStop(event) {
  workflowLayouts.value[selectedEntity.value.type] ||= {};
  workflowLayouts.value[selectedEntity.value.type][event.node.id] = {
    x: Math.round(event.node.position.x),
    y: Math.round(event.node.position.y)
  };
}

function onWorkflowEdgeClick(event) {
  selectTransition(event.edge.data.index);
}

function onWorkflowConnect(connection) {
  if (!connection.source || !connection.target) return;
  workflowDraft.value.transitions.push({
    from: connection.source,
    to: connection.target,
    capabilities: []
  });
  selectedTransitionIndex.value = workflowDraft.value.transitions.length - 1;
  selectedState.value = '';
  transitionDraftFrom.value = '';
}

function stripWorkflowRoles(source) {
  return Object.fromEntries(Object.entries(structuredClone(source || {})).map(([type, workflow]) => [
    type,
    {
      ...workflow,
      transitions: (workflow.transitions || []).map(({ roles, ...transition }) => transition)
    }
  ]));
}

function downloadDraft() {
  const blob = new Blob([JSON.stringify({
    entities: entities.value,
    ui: ui.value,
    dataDecisions: dataDecisions.value,
    feedback: feedback.value,
    workflows: workflows.value
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cutkit-workbench-draft.json';
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeCollection(collection) {
  return String(collection || '').replace(/-/g, '_');
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

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}
</script>
