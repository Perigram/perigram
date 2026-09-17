<script setup>
// CTS types canvas, structured after the process designer: no page title,
// actions in the workspace top dock, VueFlow as the direct canvas child,
// node/edge events bound as template props. Type nodes wired by declared
// edges; double-click opens the type's state machine; org types are
// editable and saved through the L0 storage API.
import { computed, h, nextTick, onMounted, ref, watch } from 'vue';
import { SelectionMode, VueFlow, useVueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useToast } from 'primevue/usetoast';
import StandardPage from '~/components/shared/StandardPage.vue';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';

definePageMeta({ layout: 'app', middleware: 'auth' });
const toast = useToast();
const { fitView } = useVueFlow();

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
const mode = ref('types'); // 'types' | 'states'
const selectedTypeId = ref(null);
const saving = ref(false);
const isNewDraft = ref(false);
const selectedNodeId = ref(null);
const selectedEdgeId = ref(null);

const selectedType = computed(() => types.value.find(type => type.id === selectedTypeId.value) || null);
const editable = computed(() => Boolean(selectedType.value && (isNewDraft.value || selectedType.value.scope === 'org')));

// ---- load ----
async function load() {
  loading.value = true;
  try {
    const response = await $fetch('/api/admin/cts/types');
    types.value = response.types || [];
    if (response.errors?.length) {
      toast.add({ severity: 'warn', summary: 'Compile diagnostics', detail: response.errors.join('; '), life: 6000 });
    }
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Failed to load types', detail: error?.data?.message || error?.message, life: 6000 });
  } finally {
    loading.value = false;
    refit();
  }
}
onMounted(load);

async function refit() {
  await nextTick();
  const hasNodes = (mode.value === 'types' ? typeNodes.value : stateNodes.value).length > 0;
  if (hasNodes) fitView({ padding: 0.16, duration: 0, maxZoom: 1 });
}

// ---- type graph ----
const typeNodes = ref([]);
const typeEdges = ref([]);

function buildTypeGraph() {
  const byClass = new Map(CLASS_ORDER.map(className => [className, []]));
  for (const type of types.value) {
    if (!byClass.has(type.class)) byClass.set(type.class, []);
    byClass.get(type.class).push(type);
  }
  const nodes = [];
  const present = new Set(types.value.map(type => type.id));
  const edges = [];
  for (const [className, group] of byClass) {
    const columnIndex = CLASS_ORDER.indexOf(className);
    group.forEach((type, index) => {
      nodes.push({
        id: `type:${type.id}`,
        position: { x: 60 + columnIndex * 330, y: 90 + index * 92 },
        label: type.id,
        class: CLASS_NODE_CLASS[className] || 'cts-node',
        data: { type },
        draggable: true
      });
    });
  }
  for (const type of types.value) {
    for (const [key, declaration] of Object.entries(type.edges?.children || {})) {
      for (const target of declaration.types) {
        if (present.has(target) && target !== type.id) {
          edges.push({ id: `child:${type.id}:${target}`, source: `type:${type.id}`, target: `type:${target}`, label: key });
        }
      }
    }
    for (const [key, declaration] of Object.entries(type.edges?.relations || {})) {
      for (const target of declaration.types) {
        if (present.has(target) && target !== type.id) {
          edges.push({ id: `rel:${type.id}:${target}`, source: `type:${type.id}`, target: `type:${target}`, label: key, class: 'cts-edge-rel' });
        }
      }
    }
  }
  typeNodes.value = nodes;
  typeEdges.value = edges;
}
watch(types, buildTypeGraph, { immediate: true });
watch(mode, () => refit());

// ---- state machine graph ----
const stateNodes = ref([]);
const stateEdges = ref([]);
const dirty = ref(false);

function openType(typeId) {
  const type = types.value.find(candidate => candidate.id === typeId);
  if (!type) return;
  selectedTypeId.value = typeId;
  isNewDraft.value = false;
  buildStateGraph(type);
  mode.value = 'states';
}

function buildStateGraph(type) {
  const values = type.states?.main?.values || [];
  const terminal = new Set(type.states?.main?.terminal || []);
  stateNodes.value = values.map((name, index) => ({
    id: `state:${index}:${name}`,
    position: { x: 80 + (index % 4) * 250, y: 80 + Math.floor(index / 4) * 170 },
    label: name,
    class: terminal.has(name) ? 'cts-node cts-node-terminal' : 'cts-node cts-node-state',
    data: { name, initial: name === type.states?.main?.initial, terminal: terminal.has(name) }
  }));
  stateEdges.value = (type.transitions || []).map((transition, index) => {
    const source = stateNodes.value.find(node => node.data.name === transition.from)?.id;
    const target = stateNodes.value.find(node => node.data.name === transition.to)?.id;
    return {
      id: `tr:${index}:${transition.from}->${transition.to}`,
      source,
      target,
      label: transition.intent || '',
      animated: true,
      class: transition.intent ? '' : 'cts-edge-nointent',
      data: { intent: transition.intent || '' }
    };
  }).filter(edge => edge.source && edge.target);
  dirty.value = false;
}

// ---- canvas events (template props, like the process designer) ----
function handleNodeDoubleClick({ node }) {
  if (mode.value === 'types' && node.id?.startsWith('type:')) openType(node.id.slice(5));
}
function handleNodeClick({ node }) {
  selectedNodeId.value = node.id;
  selectedEdgeId.value = null;
}
function handleEdgeClick({ edge }) {
  selectedEdgeId.value = edge.id;
  selectedNodeId.value = null;
}
function handlePaneClick() {
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
}
function handleConnect(connection) {
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
    data: { intent: '' }
  });
  dirty.value = true;
}

// ---- inspector edits ----
const selectedStateNode = computed(() => stateNodes.value.find(node => node.id === selectedNodeId.value) || null);
const selectedTransition = computed(() => stateEdges.value.find(edge => edge.id === selectedEdgeId.value) || null);
const selectedTypeNode = computed(() => typeNodes.value.find(node => node.id === selectedNodeId.value) || null);

function renameState(node, name) {
  const clean = String(name || '').trim();
  if (!clean || clean === node.data.name) return;
  node.data.name = clean;
  node.label = clean;
  dirty.value = true;
}
function setInitial(node) {
  for (const candidate of stateNodes.value) candidate.data.initial = candidate.id === node.id;
  dirty.value = true;
}
function toggleTerminal(node) {
  node.data.terminal = !node.data.terminal;
  node.class = node.data.terminal ? 'cts-node cts-node-terminal' : 'cts-node cts-node-state';
  dirty.value = true;
}
function setIntent(edge, intent) {
  edge.data.intent = String(intent || '').trim();
  edge.label = edge.data.intent;
  edge.class = edge.data.intent ? '' : 'cts-edge-nointent';
  dirty.value = true;
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
  dirty.value = true;
}
function removeSelected() {
  if (!editable.value) return;
  if (selectedStateNode.value) {
    stateNodes.value = stateNodes.value.filter(node => node.id !== selectedStateNode.value.id);
    stateEdges.value = stateEdges.value.filter(edge => edge.source !== selectedStateNode.value.id && edge.target !== selectedStateNode.value.id);
    selectedNodeId.value = null;
    dirty.value = true;
  } else if (selectedTransition.value) {
    stateEdges.value = stateEdges.value.filter(edge => edge.id !== selectedTransition.value.id);
    selectedEdgeId.value = null;
    dirty.value = true;
  }
}

// ---- save / delete ----
function buildDeclaration() {
  const base = isNewDraft.value
    ? { id: newTypeId.value, class: newTypeClass.value, fields: newTypeClass.value === 'item' ? { serial: { base: 'string' } } : { name: { base: 'string' } } }
    : selectedType.value;
  const declaration = {
    id: base.id,
    class: base.class,
    fields: base.fields || {},
    ...(base.payload ? { payload: base.payload } : {}),
    ...(base.edges ? { edges: base.edges } : {}),
    ...(base.operators ? { operators: base.operators } : {})
  };
  const values = stateNodes.value.map(node => node.data.name);
  if (values.length) {
    declaration.states = {
      main: {
        initial: stateNodes.value.find(node => node.data.initial)?.data.name || values[0],
        values,
        terminal: stateNodes.value.filter(node => node.data.terminal).map(node => node.data.name)
      }
    };
    declaration.transitions = stateEdges.value
      .map(edge => {
        const from = stateNodes.value.find(node => node.id === edge.source)?.data.name;
        const to = stateNodes.value.find(node => node.id === edge.target)?.data.name;
        if (!from || !to) return null;
        return edge.data?.intent ? { from, to, intent: edge.data.intent } : { from, to };
      })
      .filter(Boolean);
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
    openType(selectedTypeId.value);
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Compile error', detail: error?.data?.message || error?.message, life: 9000 });
  } finally {
    saving.value = false;
  }
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

// ---- new type ----
const showNewType = ref(false);
const newTypeId = ref('');
const newTypeClass = ref('file');
const classOptions = CLASS_ORDER.filter(className => className !== 'party').map(className => ({ label: className, value: className }));

function createDraftType() {
  const id = String(newTypeId.value || '').trim().replace(/_/g, '-');
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    toast.add({ severity: 'error', summary: 'Type id must be kebab-case (e.g. widget)', life: 4000 });
    return;
  }
  selectedTypeId.value = id;
  isNewDraft.value = true;
  stateNodes.value = [];
  stateEdges.value = [];
  dirty.value = true;
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
  showNewType.value = false;
  mode.value = 'states';
}

// ---- top dock (same pattern as the process designer) ----
const dockItems = computed(() => {
  const items = [];
  if (mode.value === 'states') {
    items.push({
      icon: () => h('i', { class: 'pi pi-arrow-left', 'aria-hidden': 'true' }),
      label: 'Types',
      onClick: () => { mode.value = 'types'; }
    });
    items.push({
      icon: () => h('i', { class: 'pi pi-plus-circle', 'aria-hidden': 'true' }),
      label: 'Add state',
      disabled: !editable.value,
      onClick: addState
    });
    items.push({
      icon: () => h('i', { class: 'pi pi-trash', 'aria-hidden': 'true' }),
      label: 'Delete selection',
      disabled: !editable.value,
      onClick: removeSelected
    });
    items.push({
      icon: () => h('i', { class: saving.value ? 'pi pi-spinner pi-spin' : 'pi pi-check', 'aria-hidden': 'true' }),
      label: 'Save',
      disabled: !editable.value,
      attention: dirty.value,
      onClick: saveType
    });
    if (editable.value && !isNewDraft.value && selectedType.value) {
      items.push({
        icon: () => h('i', { class: 'pi pi-times', 'aria-hidden': 'true' }),
        label: 'Remove type',
        onClick: removeCurrentType
      });
    }
  } else {
    items.push({
      icon: () => h('i', { class: 'pi pi-plus', 'aria-hidden': 'true' }),
      label: 'New type',
      onClick: () => { showNewType.value = true; }
    });
  }
  return items;
});
</script>

<template>
  <StandardPage workspace>
    <DesignerSurface>
      <DesignerWorkspace
        layout="canvas"
        :top-dock-items="dockItems"
        class="relative h-full min-h-0 overflow-hidden bg-process-canvas"
      >
        <ClientOnly>
          <VueFlow
            v-if="mode === 'types'"
            v-model:nodes="typeNodes"
            v-model:edges="typeEdges"
            class="absolute inset-0 h-full w-full"
            :min-zoom="0.15"
            :max-zoom="2"
            :delete-key-code="null"
            :selection-key-code="true"
            :selection-mode="SelectionMode.Partial"
            pan-activation-key-code="Space"
            :pan-on-scroll="true"
            :zoom-on-scroll="false"
            :zoom-on-pinch="true"
            @node-click="handleNodeClick"
            @node-double-click="handleNodeDoubleClick"
            @edge-click="handleEdgeClick"
            @pane-click="handlePaneClick"
          />
          <VueFlow
            v-else
            v-model:nodes="stateNodes"
            v-model:edges="stateEdges"
            class="absolute inset-0 h-full w-full"
            :min-zoom="0.2"
            :max-zoom="2"
            :delete-key-code="editable ? 'Backspace' : null"
            pan-activation-key-code="Space"
            :pan-on-scroll="true"
            :zoom-on-scroll="false"
            :zoom-on-pinch="true"
            @node-click="handleNodeClick"
            @edge-click="handleEdgeClick"
            @pane-click="handlePaneClick"
            @connect="handleConnect"
          />
          <template #fallback><div class="absolute inset-0" /></template>
        </ClientOnly>

        <div v-if="mode === 'types'" class="absolute top-2 left-2 z-10 flex gap-3 text-xs surface-0 border-round p-2 shadow-1">
          <span><span class="cts-legend cts-legend-file" /> file</span>
          <span><span class="cts-legend cts-legend-group" /> group</span>
          <span><span class="cts-legend cts-legend-process" /> process</span>
          <span><span class="cts-legend cts-legend-item" /> item</span>
          <span><span class="cts-legend cts-legend-party" /> party</span>
        </div>
        <div v-if="mode === 'types'" class="absolute bottom-2 left-2 z-10 text-xs text-500">
          double-click a type to open its state machine
        </div>
        <div v-if="mode === 'states'" class="absolute top-2 left-2 z-10 text-sm font-medium">
          {{ selectedTypeId }}<span v-if="isNewDraft"> (new)</span>
          <Tag v-if="!editable" value="system — read-only" severity="secondary" class="ml-2" />
          <Tag v-else-if="dirty" value="unsaved" severity="warn" class="ml-2" />
        </div>

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
            <div class="text-xs text-500">drag between states to add; click a wire to set its intent</div>
            <label class="text-xs">intent</label>
            <InputText :model-value="selectedTransition.data?.intent" :disabled="!editable" size="small" placeholder="e.g. requestNesting" @update:model-value="value => setIntent(selectedTransition, value)" />
          </div>
          <div v-else-if="mode === 'states'" class="p-3 text-xs text-500">
            {{ editable ? 'click a state or wire to edit — drag between states to add a transition' : 'system type: open a copy via New type to author' }}
          </div>
          <div v-else-if="selectedTypeNode" class="p-3 flex flex-column gap-1">
            <div class="text-sm font-medium">{{ selectedTypeNode.data.type.render?.label || selectedTypeNode.data.type.id }}</div>
            <div class="text-xs text-500">{{ selectedTypeNode.data.type.class }} · v{{ selectedTypeNode.data.type.version }}</div>
            <div class="text-xs text-500">
              {{ selectedTypeNode.data.type.states?.main ? `${selectedTypeNode.data.type.states.main.values.length} states · ${selectedTypeNode.data.type.transitions.length} transitions` : 'no lifecycle' }}
            </div>
            <Button label="Open state machine" size="small" severity="secondary" outlined class="mt-2" @click="openType(selectedTypeNode.data.type.id)" />
          </div>
          <div v-else class="p-3 text-xs text-500">click a type for details · double-click to edit states</div>
        </template>
      </DesignerWorkspace>
    </DesignerSurface>

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
