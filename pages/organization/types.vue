<template>
  <StandardPage :title="$t('typesPane.title')" :workspace="true">
    <template #actions>
      <Button :label="$t('processDesigner.title')" icon="pi pi-sitemap" severity="secondary" outlined @click="navigateTo('/organization/process')" />
      <Button :label="$t('common.refresh')" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="load" />
    </template>

    <Message severity="info" :closable="false">{{ $t('typesPane.registryBrowserHint') }}</Message>
    <Message v-if="errors.length" severity="error" :closable="false">{{ errors.join('; ') }}</Message>

    <div class="relative min-h-0 flex-1 overflow-hidden rounded-ui border border-content-border">
      <ClientOnly>
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          class="type-canvas absolute inset-0 h-full w-full"
          :min-zoom="0.1"
          :max-zoom="3"
          :nodes-connectable="false"
          :edges-updatable="false"
          :delete-key-code="null"
          @node-click="selectNode"
          @pane-click="clearSelection"
        >
          <template #node-typeNode="props"><TypeNode v-bind="props" /></template>
          <template #node-fieldNode="props"><FieldNode v-bind="props" /></template>
          <template #node-stateNode="props"><StateNode v-bind="props" /></template>
        </VueFlow>
        <template #fallback><div class="absolute inset-0" /></template>
      </ClientOnly>
    </div>

    <Drawer v-model:visible="inspectorOpen" position="right" class="w-full max-w-md" :header="inspectorTitle">
      <div v-if="selectedType" class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <Tag :value="selectedType.data.class" />
          <Tag :value="selectedType.data.scope === 'system' ? 'system' : 'org'" severity="secondary" />
          <Tag :value="`v${selectedType.data.version || 1}`" severity="secondary" />
          <Tag v-if="selectedType.data.editor" :value="selectedType.data.editor" severity="info" />
        </div>
        <div class="flex flex-col gap-1 text-sm">
          <span class="text-muted">{{ $t('typesPane.fields') }}: {{ selectedType.data.fieldCount || 0 }}</span>
          <span class="text-muted">{{ $t('typesPane.states') }}: {{ selectedType.data.stateCount || 0 }}</span>
          <span v-if="selectedType.data.payload" class="text-muted">payload: {{ payloadLabel(selectedType.data.payload) }}</span>
        </div>
        <div v-if="selectedType.data.scope !== 'system'" class="flex justify-end">
          <Button :label="$t('common.delete')" icon="pi pi-trash" severity="danger" outlined size="small" @click="deleteType(selectedType)" />
        </div>
      </div>

      <div v-else-if="selectedField" class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <Tag :value="selectedField.data.name || $t('typeCanvas.field')" />
          <Tag :value="fieldDescriptorLabel(selectedField.data.descriptor)" severity="secondary" />
        </div>
      </div>

      <div v-else-if="selectedState" class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <Tag :value="selectedState.data.value || $t('typeCanvas.state')" />
          <Tag v-if="selectedState.data.initial" :value="$t('typesPane.initial')" severity="info" />
          <Tag v-if="selectedState.data.terminal" :value="$t('typesPane.terminal')" severity="contrast" />
        </div>
      </div>
    </Drawer>
  </StandardPage>
</template>

<script setup>
// Types pane: the registry browser (SPEC §20/§21 one tree). Authoring of
// declarations lives in the process designer tree — this surface projects
// the merged org view (system pack types + org declarations) as a read-only
// canvas and owns only registry management (delete an org type, inspect
// compile errors). It compiles nothing.
import { computed, onMounted, ref } from 'vue';
import { VueFlow } from '@vue-flow/core';
import Button from 'primevue/button';
import Drawer from 'primevue/drawer';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import StandardPage from '~/components/shared/StandardPage.vue';
import TypeNode from '~/components/type-designer/TypeNode.vue';
import FieldNode from '~/components/type-designer/FieldNode.vue';
import StateNode from '~/components/type-designer/StateNode.vue';
import { canvasFromDeclarations } from '~/composables/useTypeCanvas.js';
import { cncPackContent } from '@cutkit/domain-cnc';
import { describeLabel } from '~/packages/cts/src/index.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const toast = useToast();
const { t } = useI18n();

const declarations = ref([]);
const nodes = ref([]);
const edges = ref([]);
const loading = ref(false);
const errors = ref([]);
const selectedNodeId = ref(null);

const selectedNode = computed(() => nodes.value.find(node => node.id === selectedNodeId.value) || null);
const selectedType = computed(() => selectedNode.value?.type === 'typeNode' ? selectedNode.value : null);
const selectedField = computed(() => selectedNode.value?.type === 'fieldNode' ? selectedNode.value : null);
const selectedState = computed(() => selectedNode.value?.type === 'stateNode' ? selectedNode.value : null);
const inspectorOpen = computed({
  get: () => Boolean(selectedType.value || selectedField.value || selectedState.value),
  set: open => { if (!open) selectedNodeId.value = null; }
});
const inspectorTitle = computed(() => {
  if (selectedType.value) return selectedType.value.data.label || selectedType.value.data.typeId;
  if (selectedField.value) return t('typeCanvas.field');
  if (selectedState.value) return t('typeCanvas.state');
  return '';
});

function fieldDescriptorLabel(descriptor = {}) {
  try {
    return describeLabel(descriptor);
  } catch {
    return descriptor.base || 'json';
  }
}

function payloadLabel(payload = {}) {
  if (typeof payload === 'string') return payload;
  return payload.mime ? [].concat(payload.mime).join(', ') : '';
}

async function load() {
  loading.value = true;
  try {
    const response = await $fetch('/api/admin/cts/types');
    declarations.value = response.types || [];
    errors.value = response.errors || [];
    projectCanvas();
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
  nodes.value = canvas.nodes
    .map(node => node.type === 'typeNode'
      ? { ...node, draggable: false, data: { ...node.data, fieldCount: fieldCounts.get(node.data.typeId) || 0, stateCount: stateCounts.get(node.data.typeId) || 0, editor: editorByType.get(node.data.typeId) || null } }
      : node)
    .map(node => ({ ...node, draggable: false }));
  edges.value = canvas.edges.map(edge => ({
    ...edge,
    type: 'default',
    ...(edge.role === 'transition' && edge.data?.intent ? { label: edge.data.intent } : {})
  }));
}

function selectNode({ node }) {
  selectedNodeId.value = node.id;
}

function clearSelection() {
  selectedNodeId.value = null;
}

async function deleteType(node) {
  const typeId = node.data.typeId;
  if (!window.confirm(t('typesPane.deleteConfirm', { id: typeId }))) return;
  try {
    await $fetch(`/api/admin/cts/types/${encodeURIComponent(typeId)}`, { method: 'DELETE' });
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.delete'), detail: error?.data?.message || error?.message, life: 8000 });
  }
}

onMounted(load);
</script>
