<template>
  <StandardPage :title="$t('admin.domainBuilder.title')" :subtitle="$t('admin.domainBuilder.subtitle')">
    <template #actions>
      <Button icon="pi pi-refresh" :label="$t('admin.domainBuilder.resetSource')" severity="secondary" @click="resetToSource" />
      <Button icon="pi pi-upload" :label="$t('admin.domainBuilder.importDraft')" severity="secondary" @click="triggerImport" />
      <Button icon="pi pi-download" :label="$t('admin.domainBuilder.exportDraft')" severity="secondary" @click="downloadDraft" />
      <Button icon="pi pi-code" :label="$t('admin.domainBuilder.exportJs')" :disabled="!validation.ok" @click="downloadSource" />
    </template>

    <input ref="fileInput" type="file" accept="application/json" class="hidden" @change="importDraft" />

    <Message v-if="!authStore.isSuperAdmin" severity="warn">
      {{ $t('admin.domainBuilder.superAdminOnly') }}
    </Message>

    <div v-else class="flex flex-col gap-6">
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
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
          <div class="flex flex-col gap-3">
            <Select v-model="selectedWorkflowType" :options="workflowOptions" option-label="label" option-value="value" class="w-full" />
            <Button icon="pi pi-plus" :label="$t('admin.domainBuilder.addWorkflow')" @click="addWorkflow" />
            <Button icon="pi pi-trash" :label="$t('admin.domainBuilder.removeWorkflow')" severity="danger" outlined :disabled="!selectedWorkflowType" @click="removeWorkflow" />
          </div>

          <div v-if="currentWorkflow" class="flex flex-col gap-6">
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
              <svg :viewBox="`0 0 ${workflowGraph.width} ${workflowGraph.height}`" class="w-full max-h-[26rem] border border-content-border rounded-ui bg-surface-0">
                <defs>
                  <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,6 L9,3 z" fill="currentColor" />
                  </marker>
                </defs>
                <g v-for="edge in workflowGraph.edges" :key="edge.id">
                  <path
                    v-if="edge.self"
                    :d="`M ${edge.x1 - 20} ${edge.y1 - 18} C ${edge.x1 + 42} ${edge.y1 - 60}, ${edge.x1 + 42} ${edge.y1 + 60}, ${edge.x1 - 20} ${edge.y1 + 18}`"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    marker-end="url(#arrow)"
                  />
                  <line v-else :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)" />
                </g>
                <g v-for="node in workflowGraph.nodes" :key="node.id">
                  <rect :x="node.x" :y="node.y" :width="node.width" :height="node.height" rx="8" :class="nodeClass(node)" />
                  <text :x="node.x + 12" :y="node.y + 27" class="fill-current text-xs font-mono">{{ node.id }}</text>
                </g>
              </svg>
            </Panel>

            <Panel :header="$t('admin.domainBuilder.states')">
              <div class="flex justify-end mb-3">
                <Button icon="pi pi-plus" :label="$t('common.add')" size="small" @click="addState" />
              </div>
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.state') }}</th>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.definitionJson') }}</th>
                      <th class="text-left py-2">{{ $t('common.actions.title') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="state in stateNames" :key="state" class="border-t border-content-border align-top">
                      <td class="py-2 pr-3 min-w-44 font-mono">{{ state }}</td>
                      <td class="py-2 pr-3 min-w-[32rem]">
                        <Textarea :model-value="JSON.stringify(currentWorkflow.states[state], null, 2)" rows="5" class="w-full font-mono text-xs" @update:model-value="value => updateStateDefinition(state, value)" />
                      </td>
                      <td class="py-2">
                        <Button icon="pi pi-trash" severity="danger" text rounded @click="removeState(state)" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel :header="$t('admin.domainBuilder.transitions')">
              <div class="flex justify-end mb-3">
                <Button icon="pi pi-plus" :label="$t('common.add')" size="small" @click="addTransition" />
              </div>
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.from') }}</th>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.to') }}</th>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.roles') }}</th>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.capabilities') }}</th>
                      <th class="text-left py-2">{{ $t('admin.domainBuilder.hooksJson') }}</th>
                      <th class="text-left py-2">{{ $t('common.actions.title') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(transition, index) in currentWorkflow.transitions" :key="index" class="border-t border-content-border align-top">
                      <td class="py-2 pr-3 min-w-40"><Select v-model="transition.from" :options="stateOptions" option-label="label" option-value="value" class="w-full" /></td>
                      <td class="py-2 pr-3 min-w-40"><Select v-model="transition.to" :options="stateOptions" option-label="label" option-value="value" class="w-full" /></td>
                      <td class="py-2 pr-3 min-w-72"><InputText :model-value="stringifyCommaList(transition.roles)" class="w-full" @update:model-value="value => transition.roles = parseCommaList(value)" /></td>
                      <td class="py-2 pr-3 min-w-72"><InputText :model-value="stringifyCommaList(transition.capabilities || transition.requiredCapabilities)" class="w-full" @update:model-value="value => updateTransitionCapabilities(transition, value)" /></td>
                      <td class="py-2 pr-3 min-w-96">
                        <Textarea :model-value="JSON.stringify(transition.hooks || [], null, 2)" rows="4" class="w-full font-mono text-xs" @update:model-value="value => updateTransitionHooks(transition, value)" />
                      </td>
                      <td class="py-2">
                        <Button icon="pi pi-trash" severity="danger" text rounded @click="currentWorkflow.transitions.splice(index, 1)" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import StandardPage from '~/components/shared/StandardPage.vue';
import { useAuthStore } from '~/stores/auth';
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
const authStore = useAuthStore();
const fileInput = ref(null);
const tabs = ['entities', 'workflows', 'summaries', 'validation', 'export'];
const activeTab = ref('entities');
const selectedWorkflowType = ref('project');

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
}

function removeState(state) {
  if (!currentWorkflow.value) return;
  delete currentWorkflow.value.states[state];
  currentWorkflow.value.transitions = currentWorkflow.value.transitions.filter(transition => transition.from !== state && transition.to !== state);
  if (currentWorkflow.value.initial === state) currentWorkflow.value.initial = stateNames.value[0] || '';
}

function updateStateDefinition(state, value) {
  if (!currentWorkflow.value) return;
  currentWorkflow.value.states[state] = parseJsonObject(value, currentWorkflow.value.states[state] || {});
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
}

function updateTransitionCapabilities(transition, value) {
  const capabilities = parseCommaList(value);
  delete transition.requiredCapabilities;
  if (capabilities.length) transition.capabilities = capabilities;
  else delete transition.capabilities;
}

function updateTransitionHooks(transition, value) {
  try {
    const hooks = JSON.parse(value || '[]');
    transition.hooks = Array.isArray(hooks) ? hooks : [];
  } catch {
    transition.hooks = transition.hooks || [];
  }
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

function nodeClass(node) {
  if (node.initial) return 'fill-primary stroke-primary';
  if (node.terminal) return 'fill-surface-200 stroke-content-border';
  return 'fill-content stroke-content-border';
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
