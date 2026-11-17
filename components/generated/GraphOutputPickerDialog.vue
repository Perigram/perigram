<template>
  <StandardDialog :visible="visible" size="sm" title="Insert graph output" @update:visible="shown => { if (!shown) emit('close'); }">
    <div class="flex max-h-[70vh] min-w-72 flex-col gap-1 overflow-y-auto">
      <Button v-for="output in outputs" :key="output.executionInstanceId + ':' + output.outputId" :label="output.label + ' · ' + output.count" icon="pi pi-sitemap" text class="w-full justify-start" @click="emit('pick', { source: { kind: 'graph-output', executionInstanceId: output.executionInstanceId, graphDocumentInstanceId: output.graphDocumentInstanceId, graphId: output.graphId, graphRevision: output.graphRevision, outputId: output.outputId }, parameters: {}, resultPolicy: 'pinned' })" />
      <div v-if="!loading && !outputs.length" class="py-3 text-sm text-muted">No saved collection outputs are available.</div>
      <div v-if="loading" class="py-3 text-sm text-muted">Loading…</div>
    </div>
  </StandardDialog>
</template>

<script setup>
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';

const props = defineProps({ visible: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'pick']);
const outputs = ref([]);
const loading = ref(false);
watch(() => props.visible, async visible => {
  if (!visible) return;
  loading.value = true;
  try {
    outputs.value = await $fetch('/api/graph-executions/collection-outputs');
  } catch {
    outputs.value = [];
  } finally {
    loading.value = false;
  }
}, { immediate: true });
</script>
