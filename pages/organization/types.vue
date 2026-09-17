<script setup>
// CTS types canvas: the designer's type graph. Type nodes wired by their
// declared edges; double-click opens the type's state machine as state
// nodes + transition wires. Authoring gestures (connect = transition,
// delete, toggles) build a declaration saved through the L0 API; compile
// errors from the registry surface inline. System types open read-only.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { SelectionMode, VueFlow, useVueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useToast } from 'primevue/usetoast';
import StandardPage from '~/components/shared/StandardPage.vue';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';

definePageMeta({ layout: 'app', middleware: 'auth' });
const toast = useToast();

const CLASS_ORDER = ['party', 'file', 'group', 'process', 'item'];
const CLASS_NODE_CLASS = {
  party: 'cts-node cts-node-party',
  file: 'cts-node cts-node-file',
  group: 'cts-node cts-node-group',
  process: 'cts-node cts-node-process',
  item: 'cts-node cts-node-item'
};

const types = ref([]);
const loading = ref(true);
const loadError = ref('');
const mode = ref('types'); // 'types' | 'states'
const selectedTypeId = ref(null);
const saving = ref(false);
const isNewDraft = ref(false);

const { fitView, onConnect, onNodeDoubleClick, onEdgeClick, onNodeClick, onPaneClick } = useVueFlow();

async function refit() {
  await nextTick();
  const hasNodes = (mode.value === 'types' ? typeNodes.value : stateNodes.value).length > 0;
  if (hasNodes) fitView({ padding: 0.16, duration: 0, maxZoom: 1 });
}

const selectedType = computed(() => types.value.find(type => type.id === selectedTypeId.value) || null);
const editable = computed(() => Boolean(selectedType.value && (isNewDraft.value || selectedType.value.scope === 'org')));

// ---- type graph (mode: types) ----
const typeNodes = computed(() => {
  const byClass = new Map(CLASS_ORDER.map(className => [className, []]));
  for (const type of types.value) {
    if (!byClass.has(type.class)) byClass.set(type.class, []);
    byClass.get(type.class).push(type);
  }
  const nodes = [];
  for (const [className, group] of byClass) {
    const columnIndex = CLASS_ORDER.indexOf(className);
    group.forEach((type, index) => {
      nodes.push({
        id: `type:${type.id}`,
        position: { x: 60 + columnIndex * 330, y: 90 + index * 92 },
        label: type.id,
        class: CLASS_NODE_CLASS[className] || 'cts-node',
        data: { type }
      });
    });
  }
  return nodes;
});

const typeEdges = computed(() => {
  const edges = [];
  const present = new Set(types.value.map(type => type.id));
  for (const type of types.value) {
    for (const [key, declaration] of Object.entries(type.edges?.children || {})) {
      for (const target of declaration.types) {
        if (present.has(target) && target !== type.id) {
          edges.push({ id: `child:${type.id}:${target}`, source: `type:${type.id}`, target: `type:${target}`, label: key, animated: false });
        }
      }
    }
    for (const [key, declaration] of Object.entries(type.edges?.relations || {})) {
      for (const target of declaration.types) {
        if (present.has(target) && target !== type.id) {
          edges.push({ id: `rel:${type.id}:${target}`, source: `type:${type.id}`, target: `type:${target}`, label: key, animated: false, class: 'cts-edge-rel' });
        }
      }
    }
  }
  return edges;
});

// ---- state machine graph (mode: states) ----
const stateNodes = ref([]);
const stateEdges = ref([]);
const stateDraftDirty = ref(false);

function openType(typeId) {
  const type = types.value.find(candidate => candidate.id === typeId);
  if (!type) return;
  selectedTypeId.value = typeId;
  isNewDraft.value = false;
  buildStateGraph(type);
  mode.value = 'states';
  refit();
}

function buildStateGraph(type) {
  const values = type.states?.main?.values || [];
  const terminal = new Set(type.states?.main?.terminal || []);
  stateNodes.value = values.map((name, index) => ({
    id: `state:${index}:${name}`,
    position: { x: 80 + (index % 4) * 250, y: 80 + Math.floor(index / 4) * 170 },
    label: name,
    class: terminal.has(name) ? 'cts-node cts-node-terminal' : 'cts-node cts-node-state',
    data: {
      name,
      initial: name === type.states?.main?.initial,
      terminal: terminal.has(name)
    }
  }));
  stateEdges.value = (type.transitions || []).map((transition, index) => ({
    id: `tr:${index}:${transition.from}->${transition.to}`,
    source: nodeIdForState(transition.from),
    target: nodeIdForState(transition.to),
    label: transition.intent || '',
    animated: true,
    class: transition.intent ? '' : 'cts-edge-nointent',
    data: { intent: transition.intent || '', from: transition.from, to: transition.to }
  })).filter(edge => edge.source && edge.target);
  stateDraftDirty.value = false;
}

function nodeIdForState(name) {
  return stateNodes.value.find(node => node.data.name === name)?.id
    || `state:?:${name}`;
}

onNodeDoubleClick(({ node }) => {
  if (mode.value !== 'types') return;
  if (node.id?.startsWith('type:')) openType(node.id.slice(5));
});

onNodeClick(({ node }) => {
  selectedNodeId.value = node.id;
  selectedEdgeId.value = null;
});

onEdgeClick(({ edge }) => {
  selectedEdgeId.value = edge.id;
  selectedNodeId.value = null;
});

onPaneClick(() => {
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
});

// Connect gesture in states mode = new transition.
onConnect(connection => {
  if (mode.value !== 'states' || !editable.value) return;
  const source = stateNodes.value.find(node => node.id === connection.source);
  const target = stateNodes.value.find(node => node.id === connection.target);
  if (!source || !target) return;
  stateEdges.value.push({
    id: `tr:new:${Date.now()}`,
    source: connection.source,
    target: connection.target,
    label: '',
    animated: true,
    class: 'cts-edge-nointent',
    data: { intent: '', from: source.data.name, to: target.data.name }
  });
  stateDraftDirty.value = true;
});

const selectedNodeId = ref(null);
const selectedEdgeId = ref(null);
const selectedStateNode = computed(() => stateNodes.value.find(node => node.id === selectedNodeId.value) || null);
const selectedTransition = computed(() => stateEdges.value.find(edge => edge.id === selectedEdgeId.value) || null);

function markDirty() {
  stateDraftDirty.value = true;
}

function setInitial(node) {
  for (const candidate of stateNodes.value) candidate.data.initial = candidate.id === node.id;
  markDirty();
}

function toggleTerminal(node) {
  node.data.terminal = !node.data.terminal;
  node.class = node.data.terminal ? 'cts-node cts-node-terminal' : 'cts-node cts-node-state';
  markDirty();
}

function renameState(node, name) {
  const clean = String(name || '').trim();
  if (!clean || clean === node.data.name) return;
  node.data.name = clean;
  node.label = clean;
  markDirty();
}

function setIntent(edge, intent) {
  edge.data.intent = String(intent || '').trim();
  edge.label = edge.data.intent;
  edge.class = edge.data.intent ? '' : 'cts-edge-nointent';
  markDirty();
}

function addState() {
  if (!editable.value) return;
  const index = stateNodes.value.length;
  const name = `state${index + 1}`;
  stateNodes.value.push({
    id: `state:${Date.now()}:${name}`,
    position: { x: 80 + (index % 4) * 250, y: 80 + Math.floor(index / 4) * 170 },
    label: name,
    class: index === 0 ? 'cts-node cts-node-initial' : 'cts-node cts-node-state',
    data: { name, initial: index === 0, terminal: false }
  });
  markDirty();
}

function removeSelected() {
  if (!editable.value) return;
  if (selectedStateNode.value) {
    stateNodes.value = stateNodes.value.filter(node => node.id !== selectedStateNode.value.id);
    stateEdges.value = stateEdges.value.filter(edge => edge.source !== selectedStateNode.value.id && edge.target !== selectedStateNode.value.id);
    selectedNodeId.value = null;
    markDirty();
  } else if (selectedTransition.value) {
    stateEdges.value = stateEdges.value.filter(edge => edge.id !== selectedTransition.value.id);
    selectedEdgeId.value = null;
    markDirty();
  }
}

// ---- save (L0 API) ----
function buildDeclaration() {
  const base = isNewDraft.value ? { id: newTypeId.value, class: newTypeClass.value, fields: newTypeFields() } : selectedType.value;
  const values = stateNodes.value.map(node => node.data.name);
  const transitions = stateEdges.value.map(edge => {
    const from = stateNodes.value.find(node => node.id === edge.source)?.data.name;
    const to = stateNodes.value.find(node => node.id === edge.target)?.data.name;
    const transition = { from, to };
    if (edge.data?.intent) transition.intent = edge.data.intent;
    return transition;
  }).filter(transition => transition.from && transition.to);
  const declaration = {
    id: base.id,
    class: base.class,
    fields: base.fields || {},
    ...(base.payload ? { payload: base.payload } : {}),
    ...(base.edges ? { edges: base.edges } : {}),
    ...(base.operators ? { operators: base.operators } : {})
  };
  if (values.length) {
    declaration.states = {
      main: {
        initial: stateNodes.value.find(node => node.data.initial)?.data.name || values[0],
        values,
        terminal: stateNodes.value.filter(node => node.data.terminal).map(node => node.data.name)
      }
    };
    declaration.transitions = transitions;
  }
  return declaration;
}

async function saveType() {
  if (!editable.value) return;
  saving.value = true;
  try {
    await $fetch('/api/admin/cts/types', { method: 'POST', body: buildDeclaration() });
    toast.add({ severity: 'success', summary: 'Type saved', life: 2500 });
    isNewDraft.value = false;
    await load();
    openType(selectedTypeId.value || newTypeId.value);
  } catch (error) {
    const message = error?.data?.message || error?.message || 'save failed';
    toast.add({ severity: 'error', summary: 'Compile error', detail: message, life: 8000 });
  } finally {
    saving.value = false;
  }
}

// ---- new type ----
const showNewType = ref(false);
const newTypeId = ref('');
const newTypeClass = ref('file');
const classOptions = CLASS_ORDER.filter(className => className !== 'party').map(className => ({ label: className, value: className }));

function newTypeFields() {
  return newTypeClass.value === 'file' || newTypeClass.value === 'group'
    ? { name: { base: 'string' } }
    : { serial: { base: 'string' } };
}

function createDraftType() {
  const id = String(newTypeId.value || '').trim().replace(/_/g, '-');
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    toast.add({ severity: 'error', summary: 'Type id must be kebab-case', life: 4000 });
    return;
  }
  selectedTypeId.value = id;
  isNewDraft.value = true;
  stateNodes.value = [];
  stateEdges.value = [];
  stateDraftDirty.value = true;
  showNewType.value = false;
  mode.value = 'states';
  refit();
}

async function removeCurrentType() {
  if (!selectedType.value || selectedType.value.scope !== 'org') return;
  saving.value = true;
  try {
    await $fetch(`/api/admin/cts/types/${encodeURIComponent(selectedType.value.id)}`, { method: 'DELETE' });
    toast.add({ severity: 'success', summary: 'Type removed', life: 2500 });
    mode.value = 'types';
    selectedTypeId.value = null;
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: error?.data?.message || error?.message, life: 6000 });
  } finally {
    saving.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const response = await $fetch('/api/admin/cts/types');
    types.value = response.types || [];
    loadError.value = response.errors?.length ? response.errors.join('; ') : '';
  } catch (error) {
    loadError.value = error?.message || 'failed to load types';
  } finally {
    loading.value = false;
    await refit();
  }
}

onMounted(load);

watch(mode, () => refit());

const breadcrumb = computed(() => mode.value === 'states'
  ? `types / ${selectedTypeId.value}${isNewDraft.value ? ' (new)' : ''}`
  : 'types');
</script>

<template>
  <StandardPage workspace :title="`Type Registry — ${breadcrumb}`">
    <DesignerSurface>
      <DesignerWorkspace
        layout="canvas"
        class="relative h-full min-h-0 overflow-hidden bg-process-canvas"
      >
        <template #toolbar>
          <div class="flex gap-2 align-items-center p-2">
            <Button v-if="mode === 'states'" label="Types" icon="pi pi-arrow-left" size="small" text @click="mode = 'types'" />
            <Button label="New type" icon="pi pi-plus" size="small" severity="secondary" outlined @click="showNewType = true" />
            <template v-if="mode === 'states'">
              <Button label="Add state" icon="pi pi-circle" size="small" severity="secondary" outlined :disabled="!editable" @click="addState" />
              <Button label="Delete selection" icon="pi pi-trash" size="small" severity="danger" text :disabled="!editable" @click="removeSelected" />
              <Button label="Save" icon="pi pi-check" size="small" :disabled="!editable" :loading="saving" @click="saveType" />
              <Button v-if="editable && !isNewDraft && selectedType" label="Remove type" icon="pi pi-times" size="small" severity="danger" text @click="removeCurrentType" />
            </template>
            <Tag v-if="mode === 'states' && !editable" value="system type — read-only" severity="secondary" />
            <Tag v-if="stateDraftDirty && editable" value="unsaved" severity="warn" />
          </div>
        </template>

        <template #default>
          <ClientOnly>
            <VueFlow
              v-if="mode === 'types'"
              :nodes="typeNodes"
              :edges="typeEdges"
              class="absolute inset-0 h-full w-full"
              :min-zoom="0.15"
              :max-zoom="2"
              :pan-on-scroll="true"
              :zoom-on-scroll="false"
              :zoom-on-pinch="true"
              :selection-key-code="true"
              :selection-mode="SelectionMode.Partial"
              :delete-key-code="null"
            />
            <VueFlow
              v-else
              v-model:nodes="stateNodes"
              v-model:edges="stateEdges"
              class="absolute inset-0 h-full w-full"
              :min-zoom="0.2"
              :max-zoom="2"
              :pan-on-scroll="true"
              :zoom-on-scroll="false"
              :zoom-on-pinch="true"
              :delete-key-code="editable ? 'Backspace' : null"
            />
            <template #fallback><div class="absolute inset-0" /></template>
          </ClientOnly>

          <div v-if="mode === 'types'" class="absolute top-2 left-2 flex gap-2 text-xs surface-0 border-round p-2 shadow-1">
            <span><span class="cts-legend cts-legend-file" /> file</span>
            <span><span class="cts-legend cts-legend-group" /> group</span>
            <span><span class="cts-legend cts-legend-process" /> process</span>
            <span><span class="cts-legend cts-legend-item" /> item</span>
            <span><span class="cts-legend cts-legend-party" /> party</span>
          </div>
          <div v-if="mode === 'types'" class="absolute bottom-2 left-2 text-xs text-500">
            double-click a type to open its state machine
          </div>
        </template>

        <template #inspector>
          <div v-if="mode === 'states' && selectedStateNode" class="p-3 flex flex-column gap-2">
            <div class="text-sm font-medium">State</div>
            <label class="text-xs">name</label>
            <InputText :model-value="selectedStateNode.data.name" :disabled="!editable" size="small" @update:model-value="value => renameState(selectedStateNode, value)" />
            <div class="flex gap-2">
              <Button label="Set initial" size="small" severity="secondary" outlined :disabled="!editable" @click="setInitial(selectedStateNode)" />
              <Button :label="selectedStateNode.data.terminal ? 'Unmark terminal' : 'Mark terminal'" size="small" severity="secondary" outlined :disabled="!editable" @click="toggleTerminal(selectedStateNode)" />
            </div>
          </div>
          <div v-else-if="mode === 'states' && selectedTransition" class="p-3 flex flex-column gap-2">
            <div class="text-sm font-medium">Transition</div>
            <div class="text-xs text-500">{{ selectedTransition.data?.from }} → {{ selectedTransition.data?.to }}</div>
            <label class="text-xs">intent</label>
            <InputText :model-value="selectedTransition.data?.intent" :disabled="!editable" size="small" placeholder="e.g. requestNesting" @update:model-value="value => setIntent(selectedTransition, value)" />
          </div>
          <div v-else-if="mode === 'states'" class="p-3 text-xs text-500">
            click a state or transition to edit; drag between states to add a transition
          </div>
          <div v-else class="p-3 text-xs text-500">
            click a type node for details; double-click to edit its states
          </div>
        </template>
      </DesignerWorkspace>
    </DesignerSurface>

    <Message v-if="loadError" severity="error" :closable="false" class="m-2">{{ loadError }}</Message>

    <Dialog v-model:visible="showNewType" modal header="New type" :style="{ width: '24rem' }">
      <div class="flex flex-column gap-3 p-2">
        <div>
          <label class="text-sm">id (kebab-case)</label>
          <InputText v-model="newTypeId" class="w-full" placeholder="e.g. widget" />
        </div>
        <div>
          <label class="text-sm">class</label>
          <Select v-model="newTypeClass" :options="classOptions" option-label="label" option-value="value" class="w-full" />
        </div>
        <div class="flex justify-content-end gap-2">
          <Button label="Cancel" text @click="showNewType = false" />
          <Button label="Create" :disabled="!newTypeId" @click="createDraftType" />
        </div>
      </div>
    </Dialog>
  </StandardPage>
</template>

<style scoped>
.cts-node {
  font-size: 11px;
  border-width: 2px;
  border-radius: 8px;
  padding: 6px 10px;
  min-width: 120px;
}
.cts-node-party { background: #f4f4f5; border-color: #a1a1aa; }
.cts-node-file { background: #eff6ff; border-color: #93c5fd; }
.cts-node-group { background: #fffbeb; border-color: #fcd34d; }
.cts-node-process { background: #faf5ff; border-color: #d8b4fe; }
.cts-node-item { background: #f0fdf4; border-color: #86efac; }
.cts-node-state { background: #f8fafc; border-color: #cbd5e1; }
.cts-node-initial { background: #eff6ff; border-color: #60a5fa; }
.cts-node-terminal { background: #fef2f2; border-color: #fca5a5; }
.cts-edge-rel { stroke-dasharray: 6 4; }
.cts-edge-nointent { stroke-dasharray: 4 4; opacity: 0.7; }
.cts-legend { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; border: 1px solid rgba(0,0,0,0.2); }
.cts-legend-file { background: #eff6ff; }
.cts-legend-group { background: #fffbeb; }
.cts-legend-process { background: #faf5ff; }
.cts-legend-item { background: #f0fdf4; }
.cts-legend-party { background: #f4f4f5; }
</style>
