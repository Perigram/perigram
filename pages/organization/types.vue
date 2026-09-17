<script setup>
// CTS types editor on the process-designer authoring model: palette (left)
// offers authoring actions and openable types; the canvas shows the opened
// type's state machine as inline-editable state cards wired by drag between
// handles; transitions carry intents edited in the inspector; Save posts the
// declaration through the type storage API.
import { computed, h, nextTick, onMounted, onErrorCaptured, ref } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useToast } from 'primevue/usetoast';
import StandardPage from '~/components/shared/StandardPage.vue';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';
import MotionDock from '~/components/shared/MotionDock.vue';
import CtsStateNode from '~/components/process-designer/CtsStateNode.vue';

definePageMeta({ layout: 'app', middleware: 'auth' });
const toast = useToast();
const { fitView } = useVueFlow();

const mountError = ref('');
onErrorCaptured(error => {
  mountError.value = error?.message || String(error);
  return false;
});

const types = ref([]);
const loading = ref(true);
const selectedTypeId = ref(null);
const saving = ref(false);
const isNewDraft = ref(false);
const dirty = ref(false);
const paletteQuery = ref('');

const selectedType = computed(() => types.value.find(type => type.id === selectedTypeId.value) || null);
const editable = computed(() => Boolean(selectedType.value && (isNewDraft.value || selectedType.value.scope === 'org')));

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
  if (stateNodes.value.length) fitView({ padding: 0.2, duration: 0, maxZoom: 1 });
}

// ---- palette: searchable grouped add/open actions (process-designer pattern) ----
const orgTypes = computed(() => types.value.filter(type => type.scope === 'org'));

const paletteGroups = computed(() => {
  const query = paletteQuery.value.trim().toLowerCase();
  const groups = [];
  if (selectedType.value && editable.value) {
    groups.push({
      id: 'authoring',
      items: [{ id: 'add-state', icon: 'pi pi-plus-circle', label: 'Add state', action: addState }]
    });
  }
  const orgMatches = orgTypes.value.filter(type => !query || type.id.includes(query));
  if (orgMatches.length) {
    groups.push({
      id: 'your categories',
      items: orgMatches.map(type => ({
        id: `open:${type.id}`,
        icon: type.id === selectedTypeId.value ? 'pi pi-pencil' : 'pi pi-file',
        label: type.id,
        action: () => openType(type.id)
      }))
    });
  }
  const systemMatches = types.value
    .filter(type => type.scope === 'system' && (!query || type.id.includes(query)))
    .slice(0, query ? 30 : 12);
  if (systemMatches.length) {
    groups.push({
      id: 'built-in categories (view only)',
      items: systemMatches.map(type => ({
        id: `view:${type.id}`,
        icon: 'pi pi-eye',
        label: type.id,
        action: () => openType(type.id)
      }))
    });
  }
  return groups;
});

// ---- canvas: the opened type's state machine ----
const stateNodes = ref([]);
const stateEdges = ref([]);

function openType(typeId) {
  const type = types.value.find(candidate => candidate.id === typeId);
  if (!type) return;
  selectedTypeId.value = typeId;
  isNewDraft.value = false;
  buildStateGraph(type);
}

function buildStateGraph(type) {
  const values = type.states?.main?.values || [];
  const terminal = new Set(type.states?.main?.terminal || []);
  const canEdit = isNewDraft.value || type.scope === 'org';
  stateNodes.value = values.map((name, index) => ({
    id: `state:${index}:${name}`,
    type: 'ctsState',
    position: { x: 120 + (index % 3) * 260, y: 100 + Math.floor(index / 3) * 190 },
    data: { name, initial: name === type.states?.main?.initial, terminal: terminal.has(name), editable: canEdit }
  }));
  stateEdges.value = (type.transitions || []).map((transition, index) => {
    const source = stateNodes.value.find(node => node.data.name === transition.from)?.id;
    const target = stateNodes.value.find(node => node.data.name === transition.to)?.id;
    return {
      id: `tr:${index}:${transition.from}->${transition.to}`,
      source,
      target,
      label: transition.intent || '',
      animated: Boolean(transition.intent),
      class: transition.intent ? '' : 'cts-edge-nointent',
      data: { intent: transition.intent || '' }
    };
  }).filter(edge => edge.source && edge.target);
  dirty.value = false;
  refit();
}

function addState() {
  if (!editable.value) return;
  const index = stateNodes.value.length;
  const name = `state${index + 1}`;
  stateNodes.value.push({
    id: `state:${Date.now()}:${name}`,
    type: 'ctsState',
    position: { x: 120 + (index % 3) * 260, y: 100 + Math.floor(index / 3) * 190 },
    data: { name, initial: index === 0, terminal: false, editable: true }
  });
  dirty.value = true;
  refit();
}

function onStateChange(node) {
  dirty.value = true;
}
function setInitial(node) {
  for (const candidate of stateNodes.value) candidate.data.initial = candidate.id === node.id;
  dirty.value = true;
}

function handleConnect(connection) {
  if (!editable.value) return;
  const source = stateNodes.value.find(node => node.id === connection.source);
  const target = stateNodes.value.find(node => node.id === connection.target);
  if (!source || !target) return;
  stateEdges.value.push({
    id: `tr:new:${Date.now()}`,
    source: connection.source,
    target: connection.target,
    label: '',
    animated: false,
    class: 'cts-edge-nointent',
    data: { intent: '' }
  });
  dirty.value = true;
}

const selectedEdgeId = ref(null);
const selectedTransition = computed(() => stateEdges.value.find(edge => edge.id === selectedEdgeId.value) || null);

function handleEdgeClick({ edge }) {
  selectedEdgeId.value = edge.id;
}

function setIntent(edge, intent) {
  edge.data.intent = String(intent || '').trim();
  edge.label = edge.data.intent;
  edge.animated = Boolean(edge.data.intent);
  edge.class = edge.data.intent ? '' : 'cts-edge-nointent';
  dirty.value = true;
}

// ---- new type ----
const showNewType = ref(false);
const newTypeId = ref('');
const newTypeClass = ref('file');
const classOptions = ['file', 'group', 'process', 'item'].map(className => ({ label: className, value: className }));

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
  selectedEdgeId.value = null;
  showNewType.value = false;
  dirty.value = true;
  addState();
  toast.add({ severity: 'info', summary: `Authoring ${id}`, detail: 'add states, wire transitions, set intents, then Save', life: 4000 });
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
  const values = stateNodes.value.map(node => String(node.data.name || '').trim()).filter(Boolean);
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
    selectedTypeId.value = null;
    stateNodes.value = [];
    stateEdges.value = [];
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: error?.data?.message || error?.message, life: 6000 });
  } finally {
    saving.value = false;
  }
}

// ---- bottom dock (canvas actions, process-designer pattern) ----
const selectedNode = computed(() => stateNodes.value.find(node => node.selected) || null);

const canvasDockItems = computed(() => {
  const items = [];
  if (selectedType.value) {
    items.push({
      icon: () => h('i', { class: 'pi pi-arrow-left', 'aria-hidden': 'true' }),
      label: 'Back',
      onClick: () => { selectedTypeId.value = null; stateNodes.value = []; stateEdges.value = []; }
    });
    if (editable.value) {
      items.push({
        icon: () => h('i', { class: 'pi pi-plus-circle', 'aria-hidden': 'true' }),
        label: 'Add state',
        onClick: addState
      });
      items.push({
        icon: () => h('i', { class: 'pi pi-trash', 'aria-hidden': 'true' }),
        label: 'Delete selection',
        onClick: deleteSelection
      });
      items.push({
        icon: () => h('i', { class: saving.value ? 'pi pi-spinner pi-spin' : 'pi pi-check', 'aria-hidden': 'true' }),
        label: 'Save',
        attention: dirty.value,
        onClick: saveType
      });
      if (!isNewDraft.value) {
        items.push({
          icon: () => h('i', { class: 'pi pi-times', 'aria-hidden': 'true' }),
          label: 'Remove type',
          onClick: removeCurrentType
        });
      }
    }
  } else {
    items.push({
      icon: () => h('i', { class: 'pi pi-plus', 'aria-hidden': 'true' }),
      label: 'New category',
      onClick: () => { showNewType.value = true; }
    });
  }
  return items;
});

function deleteSelection() {
  if (!editable.value) return;
  if (selectedNode.value) {
    stateNodes.value = stateNodes.value.filter(node => node.id !== selectedNode.value.id);
    stateEdges.value = stateEdges.value.filter(edge => edge.source !== selectedNode.value.id && edge.target !== selectedNode.value.id);
    dirty.value = true;
  } else if (selectedTransition.value) {
    stateEdges.value = stateEdges.value.filter(edge => edge.id !== selectedTransition.value.id);
    selectedEdgeId.value = null;
    dirty.value = true;
  }
}
</script>

<template>
  <StandardPage workspace>
    <DesignerSurface>
      <DesignerWorkspace layout="canvas" class="relative h-full min-h-0 overflow-hidden bg-process-canvas">
        <ClientOnly>
          <VueFlow
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
            @edge-click="handleEdgeClick"
            @connect="handleConnect"
          >
            <template #node-ctsState="nodeProps">
              <CtsStateNode
                :data="nodeProps.data"
                :selected="nodeProps.selected"
                @change="onStateChange(nodeProps)"
                @set-initial="setInitial(nodeProps)"
              />
            </template>
          </VueFlow>
          <template #fallback><div class="absolute inset-0" /></template>
        </ClientOnly>

        <div v-if="!selectedType" class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div class="rounded-ui surface-0 shadow-2 px-4 py-3 text-center pointer-events-auto">
            <div class="text-label">Nothing selected</div>
            <div class="text-supporting text-muted mt-1">Pick a category from the list on the left, or create your own.</div>
            <Button label="New category" icon="pi pi-plus" class="mt-3" @click="showNewType = true" />
          </div>
        </div>

        <div v-if="selectedType" class="absolute top-2 left-2 z-10 flex gap-2 align-items-center">
          <span class="text-label">{{ selectedType.id }}</span>
          <Tag v-if="!editable" value="built-in — view only" severity="secondary" />
          <Tag v-else-if="dirty" value="unsaved" severity="warn" />
        </div>

        <div class="absolute bottom-2 right-2 z-10 text-supporting text-muted rounded-ui surface-0 px-2 py-1 shadow-1">
          {{ stateNodes.length }} states · {{ stateEdges.length }} transitions
        </div>
        <div v-if="mountError" class="cts-error-banner">
          canvas error: {{ mountError }}
        </div>

        <template #palette>
          <div class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
            <div class="flex items-center gap-1">
              <InputText v-model="paletteQuery" size="small" class="min-w-0 flex-1" placeholder="Search categories" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Button
                icon="pi pi-plus"
                label="New category"
                size="small"
                text
                class="min-w-0 justify-start border border-transparent bg-subtle px-2 hover:border-content-border"
                @click="showNewType = true"
              />
            </div>
            <div v-for="group in paletteGroups" :key="group.id" class="flex flex-col gap-1.5">
              <span class="px-1 uppercase text-muted text-supporting">{{ group.id }}</span>
              <div class="grid grid-cols-2 gap-1.5">
                <Button
                  v-for="item in group.items"
                  :key="item.id"
                  :icon="item.icon"
                  :label="item.label"
                  size="small"
                  text
                  class="min-w-0 justify-start border border-transparent bg-subtle px-2 hover:border-content-border"
                  @click="item.action"
                />
              </div>
            </div>
          </div>
        </template>

        <template #dock>
          <MotionDock :items="canvasDockItems" aria-label="type editor actions" />
        </template>

        <template #inspector>
          <div class="p-3 flex flex-column gap-2">
            <template v-if="selectedTransition">
              <div class="text-label">Transition</div>
              <div class="text-supporting text-muted">
                {{ stateNodes.find(node => node.id === selectedTransition.source)?.data.name }}
                →
                {{ stateNodes.find(node => node.id === selectedTransition.target)?.data.name }}
              </div>
              <label class="text-supporting">intent</label>
              <InputText
                :model-value="selectedTransition.data?.intent"
                :disabled="!editable"
                size="small"
                placeholder="e.g. requestNesting"
                @update:model-value="value => setIntent(selectedTransition, value)"
              />
            </template>
            <template v-else-if="selectedType">
              <div class="text-label">{{ selectedType.id }}</div>
              <div class="text-supporting text-muted">{{ selectedType.class }} · {{ stateNodes.length }} states · {{ stateEdges.length }} transitions</div>
              <div v-if="editable" class="text-supporting text-muted mt-2">
                Rename states and toggle initial/terminal inside the cards.
                Drag from a state's right handle to another state to add a transition,
                then click the wire to set its intent here.
              </div>
              <div v-else class="text-supporting text-muted mt-2">
                This is a built-in category — view only. Create your own to edit.
              </div>
            </template>
            <template v-else>
              <div class="text-supporting text-muted">Pick a category to see its states.</div>
            </template>
          </div>
        </template>
      </DesignerWorkspace>
    </DesignerSurface>

    <StandardDialog v-model:visible="showNewType" header="New category" size="sm">
      <div class="flex flex-column gap-3 p-2">
        <div>
          <label class="text-supporting">id (kebab-case)</label>
          <InputText v-model="newTypeId" class="w-full" placeholder="e.g. widget" />
        </div>
        <div>
          <label class="text-supporting">class</label>
          <Select v-model="newTypeClass" :options="classOptions" option-label="label" option-value="value" class="w-full" />
        </div>
        <div class="flex justify-content-end gap-2">
          <Button label="Cancel" text @click="showNewType = false" />
          <Button label="Create" :disabled="!newTypeId" @click="createDraftType" />
        </div>
      </div>
    </StandardDialog>
  </StandardPage>
</template>

<style scoped>
.cts-error-banner {
  position: absolute;
  top: 0.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  border-radius: var(--ck-radius-ui);
  border: 2px solid var(--ck-status-danger);
  background: var(--ck-surface);
  color: var(--ck-status-danger);
  padding: 0.5rem 0.75rem;
  box-shadow: var(--ck-shadow-2);
  max-width: 30rem;
}
.cts-edge-nointent { stroke-dasharray: 4 4; opacity: 0.7; }
</style>
