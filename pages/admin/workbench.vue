<template>
  <StandardPage :title="$t('admin.workbench.title')" :subtitle="$t('admin.workbench.subtitle')">
    <template #actions>
      <Button icon="pi pi-refresh" :label="$t('common.reset')" severity="secondary" @click="resetWorkbench" />
      <Button icon="pi pi-download" :label="$t('admin.workbench.exportDraft')" @click="downloadDraft" />
    </template>

    <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Panel :header="$t('admin.workbench.entities')" class="lg:sticky lg:top-4">
        <div class="flex flex-col gap-3">
          <InputText v-model="search" :placeholder="$t('common.search')" class="w-full" />
          <div class="flex max-h-[calc(100vh-12rem)] flex-col gap-1 overflow-y-auto pr-1">
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
              </span>
              <Tag :value="entity.blocks?.length || 0" severity="secondary" size="small" />
            </button>
          </div>
        </div>
      </Panel>

      <div v-if="selectedEntity" class="flex flex-col gap-4">
        <Panel :header="$t('admin.workbench.sectionsUi')">
          <div class="flex flex-col gap-4">
            <Message v-if="selectedUiRows.length === 0" severity="warn">
              {{ $t('uiLab.contract.missingComponent') }}
            </Message>
            <article v-for="row in selectedUiRows" :key="row.key" class="flex flex-col gap-4">
              <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 class="m-0 text-base font-semibold">{{ $t(row.labelKey) }}</h3>
                  <small class="text-muted-color">{{ row.entityType }} · {{ row.propName }}</small>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <Tag :value="$t(`uiLab.statusPolicy.${row.status}`)" severity="secondary" size="small" />
                  <Tag :value="row.trace ? $t('uiLab.tracePolicy.enabled') : $t('uiLab.tracePolicy.hidden')" severity="secondary" size="small" />
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,20rem)_minmax(0,1fr)]">
                <div class="flex flex-col gap-2">
                  <small class="text-muted-color">{{ $t('uiLab.variants.card') }}</small>
                  <component :is="row.component" v-bind="row.props" variant="card" />
                </div>
                <div class="flex flex-col gap-2">
                  <small class="text-muted-color">{{ $t('uiLab.variants.compact') }}</small>
                  <component :is="row.component" v-bind="row.props" variant="compact" />
                </div>
                <div class="flex flex-col gap-2">
                  <small class="text-muted-color">{{ $t('uiLab.variants.inline') }}</small>
                  <div class="flex min-h-12 items-center">
                    <component :is="row.component" v-bind="row.props" variant="inline" />
                  </div>
                </div>
              </div>
            </article>
          </div>
        </Panel>

        <Panel :header="$t('admin.workbench.sectionsWorkflow')" class="order-2">
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

        <Panel :header="$t('admin.workbench.sectionsData')" class="order-3">
          <Message v-if="modelError" severity="warn">{{ modelError }}</Message>
          <Message v-else-if="modelLoading" severity="info">{{ $t('common.loading') }}</Message>
          <div v-else class="flex flex-col gap-3">
            <div class="flex flex-wrap gap-2">
              <Tag :value="selectedModel?.collection || selectedEntity.collection" severity="secondary" size="small" />
              <Tag :value="`${compactModelFields.length} fields`" severity="secondary" size="small" />
              <Tag v-if="selectedModel?.issues?.length" :value="`${selectedModel.issues.length} issues`" severity="warn" size="small" />
            </div>
            <div class="flex flex-wrap gap-2">
              <div v-for="field in compactModelFields" :key="field.name" class="flex max-w-full flex-wrap items-center gap-2 rounded-ui border border-content-border bg-content px-2 py-1">
                <span class="font-mono text-sm">{{ field.name }}</span>
                <Tag :value="field.type" severity="secondary" size="small" />
                <Tag v-for="issue in field.issues || []" :key="issue" :value="issue" severity="warn" size="small" />
                <Select v-model="dataDecisionFor(field).decision" :options="dataDecisionOptions" option-label="label" option-value="value" size="small" />
                <InputText
                  v-if="dataDecisionFor(field).decision === 'rename' || dataDecisionFor(field).decision === 'move'"
                  v-model="dataDecisionFor(field).target"
                  :placeholder="$t('admin.dataModelReview.targetPlaceholder')"
                />
              </div>
            </div>
          </div>
        </Panel>

        <Panel :header="$t('admin.workbench.sectionsFeedback')" class="order-4">
          <div class="flex flex-col gap-3">
            <Textarea v-model="feedbackDraft.note" rows="5" auto-resize :placeholder="$t('uiLab.feedback.placeholder')" />
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
import { cncEntities, cncWorkflows } from '~/packages/domain-cnc/src/index.js';
import { createDesignSystemDemoRows } from '~/utils/design-system.js';
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
const uiRows = createDesignSystemDemoRows();
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
const selectedUiRows = computed(() => uiRows.filter(row => row.entityType === selectedEntity.value.type));
const selectedModel = computed(() => models.value.find(model => normalizeCollection(model.collection) === normalizeCollection(selectedEntity.value.collection)));
const selectedModelFields = computed(() => selectedModel.value?.fields || []);
const compactModelFields = computed(() => selectedModelFields.value.filter(field => !isObviousModelField(field)));
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

const dataDecisionOptions = ['unchecked', 'keep', 'remove', 'rename', 'move', 'investigate'].map(value => ({ label: value, value }));

onMounted(() => {
  loadStoredDraft();
  loadModels();
  loadWorkflowLayouts();
});

watch([workflows, feedback, dataDecisions], saveDraft, { deep: true });
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
    const result = await $fetch('/api/debug/data-models');
    if (result?.success === false) throw new Error(result.error || 'Failed to load data models');
    models.value = Array.isArray(result) ? result : (result?.models || []);
  } catch (error) {
    modelError.value = error?.message || 'Failed to load data models';
  } finally {
    modelLoading.value = false;
  }
}

function loadStoredDraft() {
  if (!import.meta.client) return;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
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

function isObviousModelField(field) {
  const name = field?.name || '';
  if (!name || name === '_id') return true;
  if (['identity', 'lineage', 'origin', 'status', 'specs', 'attachments', 'data', 'summary'].includes(name)) return true;
  return name.startsWith('lineage.') || name.startsWith('origin.') || name.startsWith('identity.');
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
    uiComponents: selectedUiRows.value.map(row => ({
      key: row.key,
      entityType: row.entityType,
      propName: row.propName,
      status: row.status,
      trace: row.trace
    })),
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
