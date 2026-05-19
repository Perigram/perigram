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
          <div class="flex flex-col gap-4">
          <Message severity="info">{{ $t('admin.workbench.workflowNoRoles') }}</Message>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div class="flex flex-col gap-2">
              <label>{{ $t('admin.domainBuilder.initialState') }}</label>
              <Select v-model="workflowDraft.initial" :options="workflowStateOptions" option-label="label" option-value="value" />
            </div>
            <Button icon="pi pi-plus" :label="$t('admin.domainBuilder.addState')" size="small" @click="addWorkflowState" />
          </div>

          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr>
                  <th class="py-2 text-left">{{ $t('admin.domainBuilder.state') }}</th>
                  <th class="py-2 text-left">{{ $t('admin.domainBuilder.terminalState') }}</th>
                  <th class="py-2 text-left">{{ $t('admin.domainBuilder.canUpdateMeta') }}</th>
                  <th class="py-2 text-left">{{ $t('admin.domainBuilder.lifecycleActors') }}</th>
                  <th class="py-2 text-left">{{ $t('common.actions.title') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="state in workflowStateNames" :key="state" class="border-t border-content-border">
                  <td class="py-2 pr-3 font-mono">{{ state }}</td>
                  <td class="py-2 pr-3"><Checkbox v-model="workflowDraft.states[state].isTerminal" binary /></td>
                  <td class="py-2 pr-3"><Checkbox v-model="workflowDraft.states[state].canUpdateMeta" binary /></td>
                  <td class="min-w-72 py-2 pr-3">
                    <InputText :model-value="stringifyCommaList(workflowDraft.states[state].lifecycle?.actors)" @update:model-value="value => updateStateActors(state, value)" />
                  </td>
                  <td class="py-2"><Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="removeWorkflowState(state)" /></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex justify-end">
            <Button icon="pi pi-plus" :label="$t('admin.domainBuilder.addTransition')" size="small" @click="addWorkflowTransition" />
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr>
                  <th class="py-2 text-left">{{ $t('admin.domainBuilder.from') }}</th>
                  <th class="py-2 text-left">{{ $t('admin.domainBuilder.to') }}</th>
                  <th class="py-2 text-left">{{ $t('admin.domainBuilder.capabilities') }}</th>
                  <th class="py-2 text-left">{{ $t('admin.domainBuilder.hooks') }}</th>
                  <th class="py-2 text-left">{{ $t('common.actions.title') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(transition, index) in workflowDraft.transitions" :key="index" class="border-t border-content-border align-top">
                  <td class="min-w-40 py-2 pr-3"><Select v-model="transition.from" :options="workflowStateOptions" option-label="label" option-value="value" /></td>
                  <td class="min-w-40 py-2 pr-3"><Select v-model="transition.to" :options="workflowStateOptions" option-label="label" option-value="value" /></td>
                  <td class="min-w-72 py-2 pr-3"><InputText :model-value="stringifyCommaList(transition.capabilities)" @update:model-value="value => transition.capabilities = parseCommaList(value)" /></td>
                  <td class="min-w-72 py-2 pr-3"><InputText :model-value="stringifyCommaList((transition.hooks || []).map(hook => hook.handler))" @update:model-value="value => updateTransitionHooks(transition, value)" /></td>
                  <td class="py-2"><Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="workflowDraft.transitions.splice(index, 1)" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          </div>
        </Panel>

        <Panel :header="$t('admin.workbench.sectionsPermissions')">
          <div class="flex flex-col gap-4">
            <Message severity="info">{{ $t('admin.workbench.permissionsNoWorkflowRoles') }}</Message>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-[18rem_1fr] md:items-end">
              <div class="flex flex-col gap-2">
                <label>{{ $t('admin.workbench.permissionFeature') }}</label>
                <Select v-model="selectedPermissionFeature" :options="permissionFeatureOptions" option-label="label" option-value="value" />
              </div>
              <small class="text-muted-color">{{ selectedEntity.type }} -> {{ selectedPermissionFeature }}</small>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr>
                    <th class="py-2 text-left">{{ $t('billing.role') }}</th>
                    <th class="py-2 text-left">{{ selectedPermissionFeature }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="role in permissionTemplateRoles" :key="role" class="border-t border-content-border">
                    <td class="py-2 pr-3 font-mono">{{ role }}</td>
                    <td class="min-w-48 py-2">
                      <Select v-model="permissionDraft[role][selectedPermissionFeature]" :options="permissionLevelOptions" option-label="label" option-value="value" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="flex items-center justify-between gap-3">
              <span>{{ $t('admin.workbench.uiActions') }}</span>
              <Button icon="pi pi-plus" :label="$t('common.add')" size="small" @click="addUiPermissionAction" />
            </div>
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr>
                    <th class="py-2 text-left">{{ $t('billing.role') }}</th>
                    <th v-for="action in selectedUiActions" :key="action" class="py-2 text-left">{{ action }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="role in permissionTemplateRoles" :key="role" class="border-t border-content-border">
                    <td class="py-2 pr-3 font-mono">{{ role }}</td>
                    <td v-for="action in selectedUiActions" :key="action" class="py-2 pr-4">
                      <Checkbox :model-value="uiActionEnabled(role, action)" binary @update:model-value="value => setUiPermissionAction(role, action, value)" />
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
import { USER_ROLES } from '~/constants/roles.constants.js';
import { PERMISSION_TEMPLATES } from '~/shared/permission-templates.js';
import { UI_PERMISSIONS } from '~/shared/ui-permissions.js';
import { DESIGN_SYSTEM_ENTITY_CONTRACTS } from '~/utils/design-system-contract.js';
import { parseCommaList, stringifyCommaList } from '~/utils/domain-builder.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const STORAGE_KEY = 'cutkit:entity-workbench:v1';
const PERMISSION_LEVELS = ['none', 'read', 'write', 'admin'];
const DEFAULT_UI_ACTIONS = ['view', 'create', 'edit', 'delete'];

const entities = ref(structuredClone(cncEntities));
const workflows = ref(stripWorkflowRoles(cncWorkflows));
const ui = ref(createUiDraft());
const feedback = ref({});
const dataDecisions = ref({});
const permissionDraft = ref(createPermissionDraft());
const uiPermissions = ref(createUiPermissionDraft());
const permissionFeatureOverrides = ref({});
const models = ref([]);
const modelLoading = ref(false);
const modelError = ref('');
const search = ref('');
const selectedEntityType = ref(entities.value[0]?.type || '');

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
const permissionTemplateRoles = computed(() => USER_ROLES.filter(role => permissionDraft.value[role]));
const permissionFeatureKeys = computed(() => {
  const keys = new Set();
  Object.values(permissionDraft.value).forEach(template => Object.keys(template || {}).forEach(key => keys.add(key)));
  return [...keys].sort();
});
const permissionFeatureOptions = computed(() => permissionFeatureKeys.value.map(value => ({ label: value, value })));
const selectedPermissionFeature = computed({
  get() {
    const type = selectedEntity.value?.type;
    return permissionFeatureOverrides.value[type] || inferPermissionFeature(selectedEntity.value);
  },
  set(value) {
    permissionFeatureOverrides.value[selectedEntity.value.type] = value;
    ensurePermissionFeature(value);
  }
});
const selectedUiActions = computed(() => {
  const actions = new Set();
  permissionTemplateRoles.value.forEach(role => {
    Object.keys(uiPermissions.value[role]?.[selectedPermissionFeature.value] || {}).forEach(action => actions.add(action));
  });
  return [...actions].sort();
});

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

watch([ui, workflows, feedback, dataDecisions, permissionDraft, uiPermissions, permissionFeatureOverrides], saveDraft, { deep: true });

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
  return Object.fromEntries(USER_ROLES.map(role => [
    role,
    structuredClone(PERMISSION_TEMPLATES[role] || {})
  ]));
}

function createUiPermissionDraft() {
  return Object.fromEntries(USER_ROLES.map(role => [
    role,
    structuredClone(UI_PERMISSIONS[role] && !UI_PERMISSIONS[role]['*'] ? UI_PERMISSIONS[role] : {})
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
    uiPermissions.value = parsed.uiPermissions || uiPermissions.value;
    permissionFeatureOverrides.value = parsed.permissionFeatureOverrides || {};
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
    permissions: permissionDraft.value,
    uiPermissions: uiPermissions.value,
    permissionFeatureOverrides: permissionFeatureOverrides.value
  }));
}

function resetWorkbench() {
  ui.value = createUiDraft();
  workflows.value = stripWorkflowRoles(cncWorkflows);
  feedback.value = {};
  dataDecisions.value = {};
  permissionDraft.value = createPermissionDraft();
  uiPermissions.value = createUiPermissionDraft();
  permissionFeatureOverrides.value = {};
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

function inferPermissionFeature(entity) {
  const collection = normalizeCollection(entity?.collection);
  const type = entity?.type || '';
  if (permissionFeatureKeys.value.includes(collection)) return collection;
  if (['project'].includes(type)) return 'projects';
  if (['queue'].includes(type)) return 'queues';
  if (['cassetteTemplate', 'cassetteDesign', 'cassetteInstance'].includes(type)) return 'cassettes';
  if (['warehouse'].includes(type)) return 'warehouses';
  if (['catalog', 'color', 'layerStandard', 'penTemplate', 'toolProfile'].includes(type)) return 'catalogs';
  if (['requisition'].includes(type)) return 'requisitions';
  if (['materialPile', 'batchPile', 'sheet', 'sheetDesign', 'remnant', 'nestingRun'].includes(type)) return 'materials';
  if (['user'].includes(type)) return 'users';
  if (['organization'].includes(type)) return 'organizations';
  return permissionFeatureKeys.value[0] || 'projects';
}

function ensurePermissionFeature(feature) {
  permissionTemplateRoles.value.forEach(role => {
    permissionDraft.value[role] ||= {};
    permissionDraft.value[role][feature] ||= 'none';
    uiPermissions.value[role] ||= {};
    uiPermissions.value[role][feature] ||= {};
  });
}

function addUiPermissionAction() {
  const existing = selectedUiActions.value;
  const action = uniqueName('action', existing);
  permissionTemplateRoles.value.forEach(role => {
    uiPermissions.value[role] ||= {};
    uiPermissions.value[role][selectedPermissionFeature.value] ||= {};
    uiPermissions.value[role][selectedPermissionFeature.value][action] = false;
  });
}

function uiActionEnabled(role, action) {
  return Boolean(uiPermissions.value[role]?.[selectedPermissionFeature.value]?.[action]);
}

function setUiPermissionAction(role, action, value) {
  uiPermissions.value[role] ||= {};
  uiPermissions.value[role][selectedPermissionFeature.value] ||= {};
  uiPermissions.value[role][selectedPermissionFeature.value][action] = value;
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
    permissions: permissionDraft.value,
    uiPermissions: uiPermissions.value,
    permissionFeatureOverrides: permissionFeatureOverrides.value
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
