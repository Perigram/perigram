<script setup>
// Type authoring, in the designer. One surface: the canvas state cards and
// Save/Delete machinery from the old /organization/types page, relocated
// into a dialog over the process designer. Saving emits `types-changed` so
// the designer rebuilds its registry view and option lists live.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useVueFlow, VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useToast } from 'primevue/usetoast';
import CtsStateNode from '~/components/process-designer/CtsStateNode.vue';

const props = defineProps({ visible: Boolean });
const emit = defineEmits(['types-changed', 'update:visible']);
const toast = useToast();

const FLOW_ID = 'cts-type-authoring';
const { fitView } = useVueFlow({ id: FLOW_ID });

const types = ref([]);
const selectedTypeId = ref(null);
const isNewDraft = ref(false);
const dirty = ref(false);
const saving = ref(false);
const showNewType = ref(false);
const newTypeId = ref('');
const newTypeClass = ref('file');
const classOptions = ['file', 'group', 'process', 'item'].map(name => ({ label: name, value: name }));

const selectedType = computed(() => types.value.find(type => type.id === selectedTypeId.value) || null);
const editable = computed(() => Boolean(selectedType.value && (isNewDraft.value || selectedType.value.scope === 'org')));
const typeList = computed(() => types.value);

const stateNodes = ref([]);
const stateEdges = ref([]);

async function load() {
  try {
    const response = await $fetch('/api/admin/cts/types');
    types.value = response.types || [];
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Failed to load types', detail: error?.data?.message || error?.message, life: 6000 });
  }
}

async function refit() {
  await nextTick();
  if (stateNodes.value.length) fitView({ padding: 0.2, duration: 0, maxZoom: 1 });
}

watch(() => props.visible, async visible => {
  if (visible) {
    await load();
    if (selectedTypeId.value) openType(selectedTypeId.value);
  }
});

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
    position: { x: 100 + (index % 3) * 260, y: 80 + Math.floor(index / 3) * 190 },
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
    position: { x: 100 + (index % 3) * 260, y: 80 + Math.floor(index / 3) * 190 },
    data: { name, initial: index === 0, terminal: false, editable: true }
  });
  dirty.value = true;
  refit();
}

function onStateChange() { dirty.value = true; }
function setInitial(node) {
  for (const candidate of stateNodes.value) candidate.data.initial = candidate.id === node.id;
  dirty.value = true;
}

const selectedEdgeId = ref(null);
const selectedTransition = computed(() => stateEdges.value.find(edge => edge.id === selectedEdgeId.value) || null);

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

function setIntent(edge, intent) {
  edge.data.intent = String(intent || '').trim();
  edge.label = edge.data.intent;
  edge.animated = Boolean(edge.data.intent);
  edge.class = edge.data.intent ? '' : 'cts-edge-nointent';
  dirty.value = true;
}

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
}

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
    toast.add({ severity: 'success', summary: 'Type saved', life: 2000 });
    isNewDraft.value = false;
    await load();
    openType(selectedTypeId.value);
    emit('types-changed');
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
    toast.add({ severity: 'success', summary: 'Type removed', life: 2000 });
    selectedTypeId.value = null;
    stateNodes.value = [];
    stateEdges.value = [];
    await load();
    emit('types-changed');
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: error?.data?.message || error?.message, life: 6000 });
  } finally {
    saving.value = false;
  }
}

function close() {
  emit('update:visible', false);
}
</script>

<template>
  <div v-if="visible" class="flex flex-column gap-3" style="min-height: 26rem">
    <div class="flex flex-wrap gap-2 align-items-center">
      <Select
        :model-value="selectedTypeId"
        :options="typeList"
        option-label="id"
        option-value="id"
        placeholder="Select a type"
        size="small"
        class="min-w-14rem"
        @update:model-value="openType"
      />
      <Button label="New" icon="pi pi-plus" size="small" severity="secondary" outlined @click="showNewType = true" />
      <Button v-if="selectedType" label="Add state" icon="pi pi-plus-circle" size="small" severity="secondary" outlined :disabled="!editable" @click="addState" />
      <Button v-if="selectedType && editable && !isNewDraft" label="Delete type" icon="pi pi-trash" size="small" severity="danger" text @click="removeCurrentType" />
      <span class="flex-1" />
      <Tag v-if="selectedType && !editable" value="starter type — view only" severity="secondary" />
      <Tag v-else-if="dirty" value="unsaved" severity="warn" />
      <Button v-if="selectedType" label="Save" icon="pi pi-check" size="small" :loading="saving" :disabled="!editable" @click="saveType" />
    </div>

    <div v-if="!selectedType" class="flex-1 flex align-items-center justify-content-center text-muted">
      Select a type or create one — its states appear here as editable cards.
    </div>

    <div v-else class="relative flex-1 border-1 border-content-border rounded-ui overflow-hidden" style="min-height: 20rem">
      <ClientOnly>
        <VueFlow
          :id="FLOW_ID"
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
          @edge-click="event => selectedEdgeId = event.edge.id"
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
      <div class="absolute bottom-1 right-2 text-supporting text-muted">
        {{ stateNodes.length }} states · {{ stateEdges.length }} transitions
        <template v-if="selectedTransition"> — wire selected: set intent below</template>
      </div>
    </div>

    <div v-if="selectedTransition" class="flex gap-2 align-items-center">
      <span class="text-supporting text-muted">intent</span>
      <InputText
        :model-value="selectedTransition.data?.intent"
        :disabled="!editable"
        size="small"
        placeholder="e.g. requestNesting"
        @update:model-value="value => setIntent(selectedTransition, value)"
      />
    </div>

    <div v-if="showNewType" class="flex gap-2 align-items-center border-1 border-content-border rounded-ui p-2">
      <InputText v-model="newTypeId" placeholder="id, e.g. widget" size="small" />
      <Select v-model="newTypeClass" :options="classOptions" option-label="label" option-value="value" size="small" />
      <Button label="Create" size="small" :disabled="!newTypeId" @click="createDraftType" />
      <Button label="Cancel" size="small" text @click="showNewType = false" />
    </div>
  </div>
</template>

<style scoped>
.cts-edge-nointent { stroke-dasharray: 4 4; opacity: 0.7; }
</style>
