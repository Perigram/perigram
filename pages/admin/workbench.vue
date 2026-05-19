<template>
  <StandardPage :title="$t('admin.workbench.title')" :subtitle="$t('admin.workbench.subtitle')">
    <template #actions>
      <Button icon="pi pi-refresh" :label="$t('common.reset')" severity="secondary" @click="resetWorkbench" />
      <Button icon="pi pi-download" :label="$t('admin.workbench.exportDraft')" @click="downloadDraft" />
    </template>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[22rem_1fr]">
      <Panel :header="$t('admin.workbench.entities')">
        <div class="flex flex-col gap-3">
          <InputText v-model="search" :placeholder="$t('common.search')" />
          <div class="flex flex-col gap-2">
            <button
              v-for="entity in visibleEntities"
              :key="entity.type"
              type="button"
              class="flex items-center justify-between gap-3 rounded-ui border border-content-border bg-content p-3 text-left"
              :class="selectedEntityType === entity.type ? 'border-primary' : ''"
              @click="selectedEntityType = entity.type"
            >
              <span class="flex flex-col gap-1">
                <strong>{{ entity.type }}</strong>
                <small class="text-muted-color">{{ entity.collection }}</small>
              </span>
              <Tag :value="entity.blocks?.length || 0" severity="secondary" size="small" />
            </button>
          </div>
        </div>
      </Panel>

      <div v-if="selectedEntity" class="flex flex-col gap-6">
        <Panel>
          <template #header>
            <div class="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div class="flex flex-col gap-1">
                <span>{{ selectedEntity.type }}</span>
                <small class="text-muted-color">{{ selectedEntity.collection }}</small>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button
                  v-for="section in sections"
                  :key="section.id"
                  :label="$t(section.labelKey)"
                  :icon="section.icon"
                  :severity="activeSection === section.id ? 'primary' : 'secondary'"
                  size="small"
                  @click="activeSection = section.id"
                />
              </div>
            </div>
          </template>

          <div v-if="activeSection === 'ui'" class="flex flex-col gap-4">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
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
              <div class="flex flex-col gap-3">
                <div v-for="(field, index) in uiDraft.fieldPaths" :key="`${field}-${index}`" class="grid grid-cols-[1fr_auto] gap-2">
                  <InputText v-model="uiDraft.fieldPaths[index]" />
                  <Button icon="pi pi-trash" severity="danger" text rounded @click="uiDraft.fieldPaths.splice(index, 1)" />
                </div>
                <Button icon="pi pi-plus" :label="$t('common.add')" size="small" @click="uiDraft.fieldPaths.push('data.')" />
              </div>
            </Panel>
          </div>

          <div v-else-if="activeSection === 'data'" class="flex flex-col gap-4">
            <Message v-if="modelError" severity="warn">{{ modelError }}</Message>
            <Message v-else-if="modelLoading" severity="info">{{ $t('common.loading') }}</Message>
            <Panel v-else :header="$t('admin.workbench.dataFields')">
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr>
                      <th class="text-left py-2">{{ $t('admin.dataModelReview.field') }}</th>
                      <th class="text-left py-2">{{ $t('common.type') }}</th>
                      <th class="text-left py-2">{{ $t('admin.dataModelReview.flags') }}</th>
                      <th class="text-left py-2">{{ $t('admin.dataModelReview.decision') }}</th>
                      <th class="text-left py-2">{{ $t('admin.dataModelReview.target') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="field in selectedModelFields" :key="field.name" class="border-t border-content-border align-top">
                      <td class="py-3 pr-3 font-mono">{{ field.name }}</td>
                      <td class="py-3 pr-3">{{ field.type }}</td>
                      <td class="py-3 pr-3">
                        <Tag v-for="issue in field.issues || []" :key="issue" :value="issue" severity="warn" size="small" class="mr-1" />
                      </td>
                      <td class="py-3 pr-3 min-w-48">
                        <Select v-model="dataDecisionFor(field).decision" :options="dataDecisionOptions" option-label="label" option-value="value" />
                      </td>
                      <td class="py-3 min-w-56">
                        <InputText v-model="dataDecisionFor(field).target" :placeholder="$t('admin.dataModelReview.targetPlaceholder')" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div v-else-if="activeSection === 'feedback'" class="flex flex-col gap-4">
            <div class="grid grid-cols-1 gap-3 md:grid-cols-[14rem_1fr]">
              <Select v-model="feedbackDraft.decision" :options="feedbackDecisionOptions" option-label="label" option-value="value" />
              <Textarea v-model="feedbackDraft.note" rows="8" auto-resize :placeholder="$t('uiLab.feedback.placeholder')" />
            </div>
          </div>

          <div v-else-if="activeSection === 'workflow'" class="flex flex-col gap-4">
            <Message severity="info">{{ $t('admin.workbench.workflowNoRoles') }}</Message>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="flex flex-col gap-2">
                <label>{{ $t('admin.domainBuilder.initialState') }}</label>
                <Select v-model="workflowDraft.initial" :options="workflowStateOptions" option-label="label" option-value="value" />
              </div>
              <div class="flex flex-col gap-2">
                <label>{{ $t('admin.domainBuilder.states') }}</label>
                <Button icon="pi pi-plus" :label="$t('admin.domainBuilder.addState')" size="small" @click="addWorkflowState" />
              </div>
            </div>

            <Panel :header="$t('admin.domainBuilder.states')">
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.state') }}</th>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.terminalState') }}</th>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.canUpdateMeta') }}</th>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.lifecycleActors') }}</th>
                      <th class="text-left py-2">{{ $t('common.actions.title') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="state in workflowStateNames" :key="state" class="border-t border-content-border">
                      <td class="py-2 pr-3 font-mono">{{ state }}</td>
                      <td class="py-2 pr-3"><Checkbox v-model="workflowDraft.states[state].isTerminal" binary /></td>
                      <td class="py-2 pr-3"><Checkbox v-model="workflowDraft.states[state].canUpdateMeta" binary /></td>
                      <td class="py-2 pr-3 min-w-72">
                        <InputText :model-value="stringifyCommaList(workflowDraft.states[state].lifecycle?.actors)" @update:model-value="value => updateStateActors(state, value)" />
                      </td>
                      <td class="py-2"><Button icon="pi pi-trash" severity="danger" text rounded @click="removeWorkflowState(state)" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel :header="$t('admin.domainBuilder.transitions')">
              <div class="flex justify-end mb-3">
                <Button icon="pi pi-plus" :label="$t('admin.domainBuilder.addTransition')" size="small" @click="addWorkflowTransition" />
              </div>
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.from') }}</th>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.to') }}</th>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.capabilities') }}</th>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.hooks') }}</th>
                      <th class="text-left py-2">{{ $t('common.actions.title') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(transition, index) in workflowDraft.transitions" :key="index" class="border-t border-content-border align-top">
                      <td class="py-2 pr-3 min-w-40"><Select v-model="transition.from" :options="workflowStateOptions" option-label="label" option-value="value" /></td>
                      <td class="py-2 pr-3 min-w-40"><Select v-model="transition.to" :options="workflowStateOptions" option-label="label" option-value="value" /></td>
                      <td class="py-2 pr-3 min-w-72"><InputText :model-value="stringifyCommaList(transition.capabilities)" @update:model-value="value => transition.capabilities = parseCommaList(value)" /></td>
                      <td class="py-2 pr-3 min-w-72"><InputText :model-value="stringifyCommaList((transition.hooks || []).map(hook => hook.handler))" @update:model-value="value => updateTransitionHooks(transition, value)" /></td>
                      <td class="py-2"><Button icon="pi pi-trash" severity="danger" text rounded @click="workflowDraft.transitions.splice(index, 1)" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div v-else class="flex flex-col gap-4">
            <Message severity="info">{{ $t('admin.workbench.permissionsNoWorkflowRoles') }}</Message>
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr>
                    <th class="text-left py-2">{{ $t('billing.role') }}</th>
                    <th class="text-left py-2">{{ selectedEntity.collection }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="role in permissionRoles" :key="role" class="border-t border-content-border">
                    <td class="py-2 pr-3 font-mono">{{ role }}</td>
                    <td class="py-2 min-w-48">
                      <Select v-model="permissionDraft[role][selectedEntity.collection]" :options="permissionLevelOptions" option-label="label" option-value="value" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
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
import { parseCommaList, stringifyCommaList } from '~/utils/domain-builder.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const STORAGE_KEY = 'cutkit:entity-workbench:v1';
const PERMISSION_LEVELS = ['none', 'read', 'write', 'admin'];
const BASE_PERMISSION_ROLES = ['system', 'manager', 'engineer', 'operator', 'mounter', 'viewer'];

const sections = [
  { id: 'ui', labelKey: 'admin.workbench.sectionsUi', icon: 'pi pi-desktop' },
  { id: 'data', labelKey: 'admin.workbench.sectionsData', icon: 'pi pi-database' },
  { id: 'feedback', labelKey: 'admin.workbench.sectionsFeedback', icon: 'pi pi-comment' },
  { id: 'workflow', labelKey: 'admin.workbench.sectionsWorkflow', icon: 'pi pi-sitemap' },
  { id: 'permissions', labelKey: 'admin.workbench.sectionsPermissions', icon: 'pi pi-lock' }
];

const entities = ref(structuredClone(cncEntities));
const workflows = ref(stripWorkflowRoles(cncWorkflows));
const ui = ref(createUiDraft());
const feedback = ref({});
const dataDecisions = ref({});
const permissionDraft = ref(createPermissionDraft());
const models = ref([]);
const modelLoading = ref(false);
const modelError = ref('');
const search = ref('');
const selectedEntityType = ref(entities.value[0]?.type || '');
const activeSection = ref('ui');

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
const permissionRoles = computed(() => Object.keys(permissionDraft.value));

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
const permissionLevelOptions = PERMISSION_LEVELS.map(value => ({ label: value, value }));

onMounted(() => {
  loadStoredDraft();
  loadModels();
});

watch([ui, workflows, feedback, dataDecisions, permissionDraft], saveDraft, { deep: true });

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

function createPermissionDraft() {
  return Object.fromEntries(BASE_PERMISSION_ROLES.map(role => [
    role,
    Object.fromEntries(cncEntities.map(entity => [entity.collection, role === 'system' ? 'admin' : 'none']))
  ]));
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
    permissionDraft.value = parsed.permissions || permissionDraft.value;
  } catch {
    resetWorkbench();
  }
}

function saveDraft() {
  if (!import.meta.client) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ui: ui.value,
    workflows: workflows.value,
    feedback: feedback.value,
    dataDecisions: dataDecisions.value,
    permissions: permissionDraft.value
  }));
}

function resetWorkbench() {
  ui.value = createUiDraft();
  workflows.value = stripWorkflowRoles(cncWorkflows);
  feedback.value = {};
  dataDecisions.value = {};
  permissionDraft.value = createPermissionDraft();
  if (import.meta.client) localStorage.removeItem(STORAGE_KEY);
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
  workflowDraft.value.transitions = workflowDraft.value.transitions.filter(transition => transition.from !== state && transition.to !== state);
  if (workflowDraft.value.initial === state) workflowDraft.value.initial = workflowStateNames.value[0] || '';
}

function updateStateActors(state, value) {
  const actors = parseCommaList(value);
  workflowDraft.value.states[state].lifecycle ||= {};
  if (actors.length) workflowDraft.value.states[state].lifecycle.actors = actors;
  else delete workflowDraft.value.states[state].lifecycle.actors;
}

function addWorkflowTransition() {
  const from = workflowDraft.value.initial || workflowStateNames.value[0] || '';
  const to = workflowStateNames.value.find(state => state !== from) || from;
  workflowDraft.value.transitions.push({ from, to, capabilities: [] });
}

function updateTransitionHooks(transition, value) {
  transition.hooks = parseCommaList(value).map(handler => ({ handler }));
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
    workflows: workflows.value,
    permissions: permissionDraft.value
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
</script>
