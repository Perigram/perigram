<template>
  <div class="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
    <Panel :header="$t('admin.workflows.regions')">
      <div class="flex flex-col gap-3">
        <Button icon="pi pi-plus" :label="$t('admin.workflows.addRegion')" size="small" @click="addRegion" />
        <button
          v-for="region in regionItems"
          :key="region.id"
          type="button"
          class="flex min-w-0 flex-col gap-1 rounded-ui border border-content-border bg-content px-3 py-2 text-left"
          :class="region.id === selectedRegionId ? 'border-primary' : ''"
          @click="selectedRegionId = region.id"
        >
          <strong class="truncate">{{ region.label || region.id }}</strong>
          <small class="truncate text-muted-color">{{ region.initial || $t('admin.workflows.noInitial') }}</small>
        </button>
      </div>
    </Panel>

    <div class="flex min-w-0 flex-col gap-4">
      <Panel :header="$t('admin.workflows.regionSettings')">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div class="flex flex-col gap-1">
            <label>{{ $t('admin.workflows.regionId') }}</label>
            <InputText :model-value="selectedRegionId" :disabled="selectedRegionId === 'main'" @update:model-value="renameRegion" />
          </div>
          <div class="flex flex-col gap-1">
            <label>{{ $t('admin.workflows.regionLabel') }}</label>
            <InputText v-model="selectedRegion.label" />
          </div>
          <div class="flex flex-col gap-1">
            <label>{{ $t('admin.domainBuilder.initialState') }}</label>
            <Select v-model="selectedRegion.initial" :options="stateOptions" option-label="label" option-value="value" />
          </div>
        </div>
      </Panel>

      <Panel :header="$t('admin.domainBuilder.graph')">
        <div class="min-h-64 overflow-auto rounded-ui border border-content-border">
          <svg :width="graph.width" :height="graph.height" role="img" class="block">
            <g v-for="edge in graph.edges" :key="edge.id">
              <line
                :x1="edge.x1"
                :y1="edge.y1"
                :x2="edge.x2"
                :y2="edge.y2"
                stroke="var(--p-content-border-color)"
                stroke-width="2"
                marker-end="url(#workflow-arrow)"
              />
              <text
                :x="(edge.x1 + edge.x2) / 2"
                :y="(edge.y1 + edge.y2) / 2 - 6"
                fill="var(--p-text-color)"
                font-size="11"
                text-anchor="middle"
              >
                {{ transitionLabel(selectedRegion.transitions[edge.index]) }}
              </text>
            </g>
            <defs>
              <marker id="workflow-arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="var(--p-content-border-color)" />
              </marker>
            </defs>
            <g
              v-for="node in graph.nodes"
              :key="node.id"
              class="cursor-pointer"
              tabindex="0"
              @click="selectedState = node.id"
              @keyup.enter="selectedState = node.id"
            >
              <rect
                :x="node.x"
                :y="node.y"
                :width="node.width"
                :height="node.height"
                rx="6"
                fill="var(--p-content-background)"
                :stroke="node.id === selectedState ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'"
                stroke-width="2"
              />
              <text :x="node.x + 12" :y="node.y + 27" fill="var(--p-text-color)" font-size="12">{{ node.id }}</text>
            </g>
          </svg>
        </div>
      </Panel>

      <div class="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel :header="$t('admin.workflows.states')">
          <div class="flex flex-col gap-3">
            <div class="flex gap-2">
              <InputText v-model="newStateName" :placeholder="$t('admin.workflows.stateName')" class="min-w-0 flex-1" />
              <Button icon="pi pi-plus" :aria-label="$t('admin.domainBuilder.addState')" size="small" @click="addState" />
            </div>
            <div class="flex flex-col gap-2">
              <button
                v-for="state in stateNames"
                :key="state"
                type="button"
                class="flex items-center justify-between gap-2 rounded-ui border border-content-border px-3 py-2 text-left"
                :class="state === selectedState ? 'border-primary' : ''"
                @click="selectedState = state"
              >
                <span class="truncate">{{ state }}</span>
                <Tag v-if="state === selectedRegion.initial" :value="$t('admin.domainBuilder.initialState')" severity="info" size="small" />
              </button>
            </div>
          </div>
        </Panel>

        <Panel :header="$t('admin.workflows.transitions')">
          <div class="flex flex-col gap-3">
            <Button icon="pi pi-plus" :label="$t('admin.domainBuilder.addTransition')" size="small" @click="addTransition" />
            <div class="flex flex-col gap-2">
              <button
                v-for="(transition, index) in selectedRegion.transitions"
                :key="`${transition.from}-${transition.to}-${index}`"
                type="button"
                class="flex min-w-0 items-center justify-between gap-2 rounded-ui border border-content-border px-3 py-2 text-left"
                :class="index === selectedTransitionIndex ? 'border-primary' : ''"
                @click="selectedTransitionIndex = index"
              >
                <span class="truncate">{{ transition.from }} -> {{ transition.to }}</span>
                <Tag :value="transition.display || 'inline'" severity="secondary" size="small" />
              </button>
            </div>
          </div>
        </Panel>
      </div>

      <Panel v-if="selectedState" :header="$t('admin.domainBuilder.stateProperties')">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div class="flex flex-col gap-1">
            <label>{{ $t('admin.domainBuilder.state') }}</label>
            <InputText :model-value="selectedState" @update:model-value="renameState" />
          </div>
          <label class="flex items-center gap-2">
            <Checkbox v-model="selectedStateDefinition.isTerminal" binary />
            <span>{{ $t('admin.domainBuilder.terminalState') }}</span>
          </label>
          <label class="flex items-center gap-2">
            <Checkbox v-model="selectedStateDefinition.canUpdateMeta" binary />
            <span>{{ $t('admin.domainBuilder.canUpdateMeta') }}</span>
          </label>
          <label class="flex items-center gap-2">
            <Checkbox v-model="selectedStateDefinition.canUpdateLifecycle" binary />
            <span>{{ $t('admin.domainBuilder.canUpdateLifecycle') }}</span>
          </label>
        </div>
        <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div class="flex flex-col gap-1">
            <label>{{ $t('admin.domainBuilder.lifecycleActors') }}</label>
            <InputText :model-value="stringifyList(selectedStateDefinition.lifecycle?.actors)" @update:model-value="updateLifecycleActors" />
          </div>
          <label class="flex items-center gap-2 self-end">
            <Checkbox :model-value="selectedStateDefinition.lifecycle?.data === true" binary @update:model-value="updateLifecycleData" />
            <span>{{ $t('admin.domainBuilder.lifecycleData') }}</span>
          </label>
        </div>
        <div class="mt-3 flex flex-col gap-1">
          <label>{{ $t('admin.domainBuilder.lifecycleAttachments') }}</label>
          <Textarea :model-value="formatJson(selectedStateDefinition.lifecycle?.attachments || {})" rows="4" auto-resize class="font-mono text-xs" @update:model-value="updateLifecycleAttachments" />
        </div>
        <div class="mt-3 flex justify-end">
          <Button icon="pi pi-trash" :label="$t('admin.domainBuilder.removeState')" severity="danger" outlined size="small" @click="removeState(selectedState)" />
        </div>
      </Panel>

      <Panel v-if="selectedTransition" :header="$t('admin.domainBuilder.transitionProperties')">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div class="flex flex-col gap-1">
            <label>{{ $t('admin.domainBuilder.from') }}</label>
            <Select v-model="selectedTransition.from" :options="stateOptions" option-label="label" option-value="value" />
          </div>
          <div class="flex flex-col gap-1">
            <label>{{ $t('admin.domainBuilder.to') }}</label>
            <Select v-model="selectedTransition.to" :options="stateOptions" option-label="label" option-value="value" />
          </div>
          <div class="flex flex-col gap-1">
            <label>{{ $t('admin.workflows.intent') }}</label>
            <InputText v-model="selectedTransition.intent" />
          </div>
          <div class="flex flex-col gap-1">
            <label>{{ $t('admin.workflows.display') }}</label>
            <Select v-model="selectedTransition.display" :options="displayOptions" option-label="label" option-value="value" />
          </div>
        </div>
        <div class="mt-3 flex flex-col gap-1">
          <label>{{ $t('admin.domainBuilder.access') }}</label>
          <Textarea :model-value="formatJson(selectedTransition.access || defaultAccess)" rows="5" auto-resize class="font-mono text-xs" @update:model-value="updateTransitionAccess" />
        </div>
        <div class="mt-3 flex flex-col gap-1">
          <label>{{ $t('admin.domainBuilder.capabilities') }}</label>
          <InputText :model-value="stringifyList(selectedTransition.capabilities || selectedTransition.requiredCapabilities)" @update:model-value="updateTransitionCapabilities" />
        </div>
        <div class="mt-3 flex flex-col gap-1">
          <label>{{ $t('admin.domainBuilder.hooksJson') }}</label>
          <Textarea :model-value="formatJson(selectedTransition.hooks || [])" rows="5" auto-resize class="font-mono text-xs" @update:model-value="updateTransitionHooks" />
        </div>
        <div class="mt-3 flex justify-end">
          <Button icon="pi pi-trash" :label="$t('admin.domainBuilder.removeTransition')" severity="danger" outlined size="small" @click="removeTransition" />
        </div>
      </Panel>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import { buildWorkflowGraph } from '~/utils/domain-builder.js';

const props = defineProps({
  modelValue: { type: Object, required: true },
  feature: { type: String, default: 'projects' }
});

const emit = defineEmits(['update:modelValue']);

const selectedRegionId = ref('main');
const selectedState = ref('');
const selectedTransitionIndex = ref(null);
const newStateName = ref('');
const defaultAccess = computed(() => ({ permissions: [{ feature: props.feature, level: 'write' }] }));
const displayOptions = [
  { label: 'inline', value: 'inline' },
  { label: 'menu', value: 'menu' },
  { label: 'hidden', value: 'hidden' }
];

const workflow = computed({
  get: () => normalizeWorkflowDraft(props.modelValue),
  set: value => emit('update:modelValue', normalizeWorkflowDraft(value))
});
const regionItems = computed(() => Object.entries(workflow.value.regions || {}).map(([id, region]) => ({ id, ...region })));
const selectedRegion = computed(() => {
  workflow.value.regions[selectedRegionId.value] ||= { initial: 'DRAFT', states: { DRAFT: { canUpdateMeta: true } }, transitions: [] };
  return workflow.value.regions[selectedRegionId.value];
});
const stateNames = computed(() => Object.keys(selectedRegion.value.states || {}));
const stateOptions = computed(() => stateNames.value.map(value => ({ label: value, value })));
const selectedStateDefinition = computed(() => {
  if (!selectedState.value) return {};
  selectedRegion.value.states[selectedState.value] ||= {};
  return selectedRegion.value.states[selectedState.value];
});
const selectedTransition = computed(() => selectedTransitionIndex.value === null ? null : selectedRegion.value.transitions?.[selectedTransitionIndex.value] || null);
const graph = computed(() => buildWorkflowGraph(workflow.value, selectedRegionId.value));

watch(() => props.modelValue, () => {
  if (!workflow.value.regions[selectedRegionId.value]) selectedRegionId.value = 'main';
  if (!selectedState.value || !selectedRegion.value.states?.[selectedState.value]) selectedState.value = stateNames.value[0] || '';
}, { immediate: true, deep: true });

function commit() {
  workflow.value = { ...workflow.value };
}

function addRegion() {
  const id = uniqueName('region', Object.keys(workflow.value.regions || {}));
  workflow.value.regions[id] = { label: id, initial: 'DRAFT', states: { DRAFT: { canUpdateMeta: true } }, transitions: [] };
  selectedRegionId.value = id;
  commit();
}

function renameRegion(next) {
  const id = normalizeId(next);
  if (!id || id === selectedRegionId.value || workflow.value.regions[id]) return;
  workflow.value.regions[id] = selectedRegion.value;
  delete workflow.value.regions[selectedRegionId.value];
  if (workflow.value.primaryRegion === selectedRegionId.value) workflow.value.primaryRegion = id;
  selectedRegionId.value = id;
  commit();
}

function addState() {
  const name = normalizeStateName(newStateName.value) || uniqueName('STATE', stateNames.value);
  if (selectedRegion.value.states[name]) return;
  selectedRegion.value.states[name] = {};
  if (!selectedRegion.value.initial) selectedRegion.value.initial = name;
  selectedState.value = name;
  newStateName.value = '';
  commit();
}

function renameState(next) {
  const name = normalizeStateName(next);
  if (!name || name === selectedState.value || selectedRegion.value.states[name]) return;
  selectedRegion.value.states[name] = selectedRegion.value.states[selectedState.value];
  delete selectedRegion.value.states[selectedState.value];
  for (const transition of selectedRegion.value.transitions || []) {
    if (transition.from === selectedState.value) transition.from = name;
    if (transition.to === selectedState.value) transition.to = name;
  }
  if (selectedRegion.value.initial === selectedState.value) selectedRegion.value.initial = name;
  selectedState.value = name;
  commit();
}

function removeState(state) {
  delete selectedRegion.value.states[state];
  selectedRegion.value.transitions = (selectedRegion.value.transitions || []).filter(transition => transition.from !== state && transition.to !== state);
  if (selectedRegion.value.initial === state) selectedRegion.value.initial = stateNames.value[0] || '';
  selectedState.value = stateNames.value[0] || '';
  commit();
}

function addTransition() {
  const from = selectedState.value || selectedRegion.value.initial || stateNames.value[0] || '';
  const to = stateNames.value.find(state => state !== from) || from;
  selectedRegion.value.transitions ||= [];
  selectedRegion.value.transitions.push({ from, to, display: 'inline', access: defaultAccess.value });
  selectedTransitionIndex.value = selectedRegion.value.transitions.length - 1;
  commit();
}

function removeTransition() {
  if (selectedTransitionIndex.value === null) return;
  selectedRegion.value.transitions.splice(selectedTransitionIndex.value, 1);
  selectedTransitionIndex.value = null;
  commit();
}

function updateTransitionAccess(value) {
  if (!selectedTransition.value) return;
  try {
    selectedTransition.value.access = JSON.parse(value);
    commit();
  } catch {}
}

function updateTransitionCapabilities(value) {
  if (!selectedTransition.value) return;
  selectedTransition.value.capabilities = parseList(value);
  delete selectedTransition.value.requiredCapabilities;
  commit();
}

function updateTransitionHooks(value) {
  if (!selectedTransition.value) return;
  try {
    const parsed = JSON.parse(value || '[]');
    selectedTransition.value.hooks = Array.isArray(parsed) ? parsed : [];
    commit();
  } catch {}
}

function updateLifecycleActors(value) {
  const lifecycle = ensureLifecycle();
  lifecycle.actors = parseList(value);
  commit();
}

function updateLifecycleAttachments(value) {
  const lifecycle = ensureLifecycle();
  try {
    const parsed = JSON.parse(value || '{}');
    lifecycle.attachments = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    commit();
  } catch {}
}

function updateLifecycleData(value) {
  const lifecycle = ensureLifecycle();
  if (value) lifecycle.data = true;
  else delete lifecycle.data;
  commit();
}

function ensureLifecycle() {
  selectedStateDefinition.value.lifecycle ||= {};
  return selectedStateDefinition.value.lifecycle;
}

function normalizeWorkflowDraft(value = {}) {
  if (value.regions) {
    return {
      schemaVersion: 2,
      primaryRegion: value.primaryRegion || 'main',
      ...structuredClone(value)
    };
  }
  return {
    schemaVersion: 2,
    primaryRegion: 'main',
    regions: {
      main: {
        label: 'Lifecycle',
        initial: value.initial || 'DRAFT',
        states: structuredClone(value.states || { DRAFT: { canUpdateMeta: true } }),
        transitions: structuredClone(value.transitions || [])
      }
    }
  };
}

function formatJson(value) {
  return JSON.stringify(value || {}, null, 2);
}

function stringifyList(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function parseList(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function transitionLabel(transition = {}) {
  return transition.intent || transition.display || '';
}

function normalizeId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function normalizeStateName(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_.-]+/g, '_').toUpperCase();
}

function uniqueName(prefix, existing = []) {
  let index = 1;
  let value = prefix;
  while (existing.includes(value)) {
    index += 1;
    value = `${prefix}_${index}`;
  }
  return value;
}
</script>
