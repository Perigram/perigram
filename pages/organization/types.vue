<template>
  <StandardPage :title="$t('typesPane.title')" :workspace="true">
    <template #actions>
      <Button :label="$t('processDesigner.title')" icon="pi pi-sitemap" severity="secondary" outlined @click="navigateTo('/organization/process')" />
      <Button :label="$t('common.save')" icon="pi pi-check" :loading="saving" :disabled="!dirty" @click="saveAll" />
    </template>

    <Message v-if="errors.length" severity="error" :closable="false">{{ errors.join('; ') }}</Message>

    <div class="relative min-h-0 flex-1 overflow-hidden rounded-ui border border-content-border">
      <ClientOnly>
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          class="type-canvas absolute inset-0 h-full w-full"
          :min-zoom="0.1"
          :max-zoom="3"
          :delete-key-code="null"
          @connect="onConnect"
          @node-double-click="selectNode"
        >
          <template #node-typeNode="props"><TypeNode v-bind="props" /></template>
          <template #node-fieldNode="props"><FieldNode v-bind="props" /></template>
          <template #node-stateNode="props"><StateNode v-bind="props" /></template>
        </VueFlow>
        <template #fallback><div class="absolute inset-0" /></template>
      </ClientOnly>

      <div class="absolute left-3 top-3 z-10 flex w-60 flex-col gap-1 rounded-ui border border-content-border bg-content p-2 shadow-card">
        <span class="px-1 uppercase text-muted text-supporting">{{ $t('typeCanvas.declare') }}</span>
        <Button v-for="classOf in classes" :key="classOf" :label="classLabel(classOf)" :icon="classIcon(classOf)" size="small" text class="justify-start" @click="declareType(classOf)" />
        <span class="mt-1 px-1 uppercase text-muted text-supporting">{{ $t('typeCanvas.compose') }}</span>
        <Button :label="$t('typeCanvas.field')" icon="pi pi-angle-right" size="small" text class="justify-start" @click="addFieldNode" />
        <Button :label="$t('typeCanvas.state')" icon="pi pi-circle" size="small" text class="justify-start" @click="addStateNode" />
        <span class="mt-2 px-1 text-supporting text-muted">{{ $t('typeCanvas.wiringHint') }}</span>
      </div>
    </div>

    <Drawer v-model:visible="inspectorOpen" position="right" class="w-full max-w-md" :header="inspectorTitle">
      <div v-if="selectedType" class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <Tag :value="selectedType.data.class" />
          <Tag :value="selectedType.data.scope === 'system' ? 'system' : 'org'" severity="secondary" />
          <Tag :value="`v${selectedType.data.version || 1}`" severity="secondary" />
        </div>
        <div v-if="selectedType.data.scope === 'system'">
          <Message severity="secondary" :closable="false">{{ $t('typesPane.systemReadonlyHint') }}</Message>
        </div>
        <template v-else>
          <div class="flex flex-col gap-1">
            <label>{{ $t('typesPane.typeId') }}</label>
            <InputText v-model="selectedType.data.typeId" :disabled="!!selectedType.data.loaded" />
          </div>
          <div class="flex flex-col gap-1">
            <label>{{ $t('typesPane.payloadMime') }}</label>
            <InputText v-model="payloadMime" placeholder="application/perigram+occs" />
          </div>
          <div class="flex justify-end">
            <Button :label="$t('common.delete')" icon="pi pi-trash" severity="danger" outlined size="small" @click="deleteType(selectedType)" />
          </div>
        </template>
      </div>

      <div v-else-if="selectedField" class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('typeCanvas.fieldName') }}</label>
          <InputText v-model="selectedField.data.name" />
        </div>
        <div class="flex flex-col gap-1">
          <label>{{ $t('typesPane.class') }}</label>
          <Select v-model="selectedField.data.descriptor.base" :options="fieldBases" option-label="label" option-value="value" @change="onFieldBaseChange" />
        </div>
        <div v-if="selectedField.data.descriptor.base === 'quantity'" class="flex flex-col gap-1">
          <label>{{ $t('typeCanvas.unit') }}</label>
          <Select v-model="selectedField.data.descriptor.unit" :options="units" />
        </div>
        <div v-else-if="selectedField.data.descriptor.base === 'ref'" class="flex flex-col gap-1">
          <label>{{ $t('typeCanvas.accepts') }}</label>
          <Select v-model="selectedField.data.descriptor.accepts" :options="typeIdOptions" multiple filter />
        </div>
        <div v-else-if="selectedField.data.descriptor.base === 'list'" class="flex flex-col gap-1">
          <label>{{ $t('typeCanvas.itemType') }}</label>
          <Select v-model="listItemBase" :options="fieldBases" option-label="label" option-value="value" />
        </div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="selectedField.data.descriptor.nullable" :binary="true" />
          <label>{{ $t('typesPane.nullable') }}</label>
        </div>
        <div class="flex justify-end">
          <Button icon="pi pi-times" severity="danger" text size="small" @click="removeNode(selectedField)" />
        </div>
      </div>

      <div v-else-if="selectedState" class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('typeCanvas.stateName') }}</label>
          <InputText v-model="selectedState.data.value" />
        </div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="selectedState.data.initial" :binary="true" />
          <label>{{ $t('typesPane.initial') }}</label>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="selectedState.data.terminal" :binary="true" />
          <label>{{ $t('typesPane.terminal') }}</label>
        </div>
        <div class="flex justify-end">
          <Button icon="pi pi-times" severity="danger" text size="small" @click="removeNode(selectedState)" />
        </div>
      </div>

      <div v-else-if="selectedTransition" class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('typesPane.intent') }}</label>
          <InputText v-model="selectedTransition.data.intent" placeholder="finish" />
        </div>
      </div>
    </Drawer>
  </StandardPage>
</template>

<script setup>
// Types canvas (SPEC §20/§21 slice B): declarations ARE nodes — type, field,
// and state nodes; transitions are state wires with intents; children are
// type wires. Saving compiles the canvas into registry declarations through
// the real registry (refuse-on-breaking diff). System types render read-only.
import { computed, onMounted, ref, watch } from 'vue';
import { VueFlow } from '@vue-flow/core';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Drawer from 'primevue/drawer';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import StandardPage from '~/components/shared/StandardPage.vue';
import TypeNode from '~/components/type-designer/TypeNode.vue';
import FieldNode from '~/components/type-designer/FieldNode.vue';
import StateNode from '~/components/type-designer/StateNode.vue';
import { canvasFromDeclarations, declarationsFromCanvas, suggestTypeId, FIELD_BASES, TYPE_CANVAS_CLASSES } from '~/composables/useTypeCanvas.js';
import { cncPackContent } from '@cutkit/domain-cnc';
import { UNITS } from '~/packages/cts/src/index.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const toast = useToast();
const { t } = useI18n();

const classes = TYPE_CANVAS_CLASSES;
const fieldBases = FIELD_BASES.map(base => ({ label: base, value: base }));
const units = [...UNITS];

const declarations = ref([]);
const nodes = ref([]);
const edges = ref([]);
const loading = ref(false);
const saving = ref(false);
const errors = ref([]);
const dirty = ref(false);
const selectedNodeId = ref(null);
const selectedEdgeId = ref(null);

const typeIdOptions = computed(() => declarations.value.map(declaration => declaration.id));

const selectedNode = computed(() => nodes.value.find(node => node.id === selectedNodeId.value) || null);
const selectedEdge = computed(() => edges.value.find(edge => edge.id === selectedEdgeId.value) || null);
const selectedType = computed(() => selectedNode.value?.type === 'typeNode' ? selectedNode.value : null);
const selectedField = computed(() => selectedNode.value?.type === 'fieldNode' ? selectedNode.value : null);
const selectedState = computed(() => selectedNode.value?.type === 'stateNode' ? selectedNode.value : null);
const selectedTransition = computed(() => selectedEdge.value?.role === 'transition' ? selectedEdge.value : null);
const inspectorOpen = computed({
  get: () => Boolean(selectedType.value || selectedField.value || selectedState.value || selectedTransition.value),
  set: open => { if (!open) { selectedNodeId.value = null; selectedEdgeId.value = null; } }
});
const inspectorTitle = computed(() => {
  if (selectedType.value) return selectedType.value.data.label || selectedType.value.data.typeId;
  if (selectedField.value) return t('typeCanvas.field');
  if (selectedState.value) return t('typeCanvas.state');
  if (selectedTransition.value) return t('typesPane.transitions');
  return '';
});

const payloadMime = computed({
  get: () => selectedType.value?.data?.payload?.mime || '',
  set: value => {
    const node = selectedType.value;
    if (!node) return;
    node.data.payload = value ? { ...(node.data.payload || {}), mime: value } : null;
  }
});

const listItemBase = computed({
  get: () => selectedField.value?.data?.descriptor?.itemType?.base || 'json',
  set: base => {
    const descriptor = selectedField.value?.data?.descriptor;
    if (!descriptor) return;
    descriptor.itemType = base === 'ref'
      ? { base: 'ref', accepts: typeIdOptions.value.length ? [typeIdOptions.value[0]] : [] }
      : { base };
  }
});

watch([nodes, edges], () => { dirty.value = true; }, { deep: true });

function classLabel(classOf) { return classOf; }
function classIcon(classOf) {
  return { file: 'pi pi-file', item: 'pi pi-box', group: 'pi pi-folder', process: 'pi pi-cog' }[classOf] || 'pi pi-database';
}

async function load() {
  loading.value = true;
  try {
    const response = await $fetch('/api/admin/cts/types');
    declarations.value = response.types || [];
    errors.value = response.errors || [];
    projectCanvas();
    dirty.value = false;
  } catch (error) {
    toast.add({ severity: 'error', summary: t('typesPane.loadFailed'), detail: error?.data?.message || error?.message, life: 8000 });
  } finally {
    loading.value = false;
  }
}

function projectCanvas() {
  const canvas = canvasFromDeclarations(declarations.value);
  const fieldCounts = new Map(declarations.value.map(declaration => [declaration.id, Object.keys(declaration.fields || {}).length]));
  const stateCounts = new Map(declarations.value.map(declaration => [declaration.id, (declaration.states?.main?.values || []).length]));
  const editorByType = new Map((cncPackContent.editors || []).map(editor => [editor.type, editor.surface]));
  nodes.value = canvas.nodes.map(node => node.type === 'typeNode'
    ? { ...node, data: { ...node.data, fieldCount: fieldCounts.get(node.data.typeId) || 0, stateCount: stateCounts.get(node.data.typeId) || 0, editor: editorByType.get(node.data.typeId) || null, loaded: true } }
    : node);
  edges.value = canvas.edges.map(edge => ({ ...edge, type: 'default' }));
}

function selectNode({ node }) {
  selectedEdgeId.value = null;
  selectedNodeId.value = node.id;
}

function onConnect(connection) {
  const source = nodes.value.find(node => node.id === connection.source);
  const target = nodes.value.find(node => node.id === connection.target);
  if (!source || !target) return;
  const role = connectionRole(source, target);
  if (!role) {
    toast.add({ severity: 'warn', summary: t('typeCanvas.invalidWire'), life: 3000 });
    return;
  }
  if (role === 'declares') {
    // attaching a field/state to a system type is read-only
    if (target.data?.scope === 'system') {
      toast.add({ severity: 'warn', summary: t('typesPane.systemReadonly'), life: 3000 });
      return;
    }
    source.data.typeId = target.data.typeId;
  }
  if (role === 'transition' && source.data?.typeId !== target.data?.typeId) {
    toast.add({ severity: 'warn', summary: t('typeCanvas.sameTypeStates'), life: 3000 });
    return;
  }
  if (role === 'children' && (source.data?.scope === 'system' || !source.data)) return;
  edges.value.push({
    id: `${role}:${connection.source}-${connection.target}-${Date.now()}`,
    source: connection.source,
    target: connection.target,
    role,
    type: 'default',
    ...(role === 'transition' ? { data: { intent: '' } } : {}),
    ...(role === 'children' ? { data: { key: `${target.data.typeId}s` } } : {})
  });
}

function connectionRole(source, target) {
  if ((source.type === 'fieldNode' || source.type === 'stateNode') && target.type === 'typeNode') return 'declares';
  if (source.type === 'stateNode' && target.type === 'stateNode') return 'transition';
  if (source.type === 'typeNode' && target.type === 'typeNode') return 'children';
  return null;
}

function nextPosition() {
  return { x: 240 + (nodes.value.length % 5) * 300, y: 80 + Math.floor(nodes.value.length / 5) * 160 };
}

function declareType(classOf) {
  const id = suggestTypeId(typeIdOptions.value, classOf);
  nodes.value.push({
    id: `type:${id}`,
    type: 'typeNode',
    position: nextPosition(),
    selected: true,
    data: { typeId: id, class: classOf, scope: 'org', label: id, payload: null, version: 1 }
  });
  selectedNodeId.value = `type:${id}`;
}

function addFieldNode() {
  const id = `field:__new_${Date.now()}`;
  nodes.value.push({
    id,
    type: 'fieldNode',
    position: nextPosition(),
    selected: true,
    data: { typeId: null, name: '', descriptor: { base: 'string' } }
  });
  selectedNodeId.value = id;
}

function addStateNode() {
  const id = `state:__new_${Date.now()}`;
  nodes.value.push({
    id,
    type: 'stateNode',
    position: nextPosition(),
    selected: true,
    data: { typeId: null, value: '', initial: false, terminal: false }
  });
  selectedNodeId.value = id;
}

function removeNode(node) {
  nodes.value = nodes.value.filter(candidate => candidate.id !== node.id);
  edges.value = edges.value.filter(edge => edge.source !== node.id && edge.target !== node.id);
  selectedNodeId.value = null;
}

function onFieldBaseChange() {
  const descriptor = selectedField.value?.data?.descriptor;
  if (!descriptor) return;
  const base = descriptor.base;
  if (base === 'quantity') descriptor.unit = descriptor.unit || 'mm';
  if (base === 'ref') descriptor.accepts = descriptor.accepts?.length ? descriptor.accepts : (typeIdOptions.value.length ? [typeIdOptions.value[0]] : []);
  if (base === 'list') descriptor.itemType = descriptor.itemType || { base: 'json' };
}

async function saveAll() {
  saving.value = true;
  errors.value = [];
  try {
    const { declarations: compiled, diagnostics } = declarationsFromCanvas(
      { nodes: nodes.value, edges: edges.value },
      declarations.value
    );
    if (diagnostics.length) {
      errors.value = diagnostics;
      return;
    }
    for (const declaration of compiled) {
      try {
        await $fetch('/api/admin/cts/types', { method: 'POST', body: declaration });
      } catch (error) {
        errors.value.push(`${declaration.id}: ${error?.data?.message || error?.message}`);
      }
    }
    if (!errors.value.length) {
      toast.add({ severity: 'success', summary: t('common.save'), life: 2000 });
      await load();
    }
  } finally {
    saving.value = false;
  }
}

async function deleteType(node) {
  const typeId = node.data.typeId;
  if (!window.confirm(t('typesPane.deleteConfirm', { id: typeId }))) return;
  try {
    await $fetch(`/api/admin/cts/types/${encodeURIComponent(typeId)}`, { method: 'DELETE' });
    removeNode(node);
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.delete'), detail: error?.data?.message || error?.message, life: 8000 });
  }
}

onMounted(load);
</script>
