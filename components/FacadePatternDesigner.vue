<template>
  <DesignerSurface>
    <DesignerWorkspace layout="canvas" class="h-full" :top-dock-items="dockItems">
    <template #palette>
      <div class="flex w-52 flex-col gap-2 rounded-ui border border-content-border p-3 shadow-overlay">
        <span class="text-label">{{ $t('facadePattern.nodes') }}</span>
        <Button
          v-for="nodeType in nodeTypes"
          :key="nodeType"
          :label="nodeType"
          size="small"
          severity="secondary"
          @click="addNode(nodeType)"
        />
      </div>
    </template>

    <VueFlow v-model:nodes="nodes" v-model:edges="edges" class="bg-surface-ground" fit-view-on-init>
      <template #node-default="node">
        <div class="rounded-ui border border-content-border px-3 py-2 text-body">
          {{ node.data.label }}
        </div>
      </template>
    </VueFlow>

    </DesignerWorkspace>
  </DesignerSurface>
</template>

<script setup>
import { computed, h, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import MotionDock from '~/components/shared/MotionDock.vue';
import { VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import { FACADE_PATTERN_NODE_TYPES } from '~/utils/facade-patterns/index.js';

const { t } = useI18n();
const dockItems = computed(() => [
  {
    icon: () => h('i', { class: saving.value ? 'pi pi-spinner pi-spin' : 'pi pi-save', 'aria-hidden': 'true' }),
    label: t('facadePattern.save'),
    disabled: props.readOnly || !props.pattern?._id,
    onClick: () => save()
  }
]);

const props = defineProps({ pattern: { type: Object, required: true }, readOnly: { type: Boolean, default: false } });
const emit = defineEmits(['saved']);
const nodes = ref([]);
const edges = ref([]);
const saving = ref(false);
const nodeTypes = FACADE_PATTERN_NODE_TYPES;

function nodeId(type) {
  return `${type}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}

function addNode(type) {
  const index = nodes.value.length;
  nodes.value.push({ id: nodeId(type), type: 'default', position: { x: 80 + (index % 4) * 180, y: 80 + Math.floor(index / 4) * 110 }, data: { patternType: type, label: type } });
}

function restorePattern() {
  const graph = props.pattern?.data?.graph || {};
  nodes.value = (graph.nodes || []).map((node, index) => ({ id: String(node.id), type: 'default', position: node.position || { x: 80 + (index % 4) * 180, y: 80 + Math.floor(index / 4) * 110 }, data: { ...node.data, patternType: node.type, label: node.data?.label || node.type } }));
  edges.value = (graph.edges || []).map(edge => ({ ...edge, id: String(edge.id || `${edge.source}-${edge.target}`) }));
}

async function save() {
  if (props.readOnly || !props.pattern?._id) return;
  saving.value = true;
  try {
    const graph = {
      schemaVersion: 1,
      nodes: nodes.value.map(node => ({ id: node.id, type: node.data.patternType, position: node.position, data: { label: node.data.label } })),
      edges: edges.value.map(edge => ({ id: edge.id, source: edge.source, target: edge.target })),
      outputs: [],
      parameters: []
    };
    emit('saved', await $fetch(`/api/facade-patterns/${encodeURIComponent(props.pattern._id)}`, { method: 'PUT', body: { graph } }));
  } finally { saving.value = false; }
}

watch(() => props.pattern, restorePattern, { immediate: true, deep: false });
</script>
