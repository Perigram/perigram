<template>
  <div v-if="entries.length" class="flex flex-col gap-3">
    <section v-for="entry in entries" :key="entry.id" class="flex flex-col gap-1">
      <span v-if="entry.section" class="truncate text-muted text-supporting">{{ entry.section }}</span>
      <div class="flex min-w-0 items-center gap-1.5">
        <i v-if="entry.error" class="pi pi-exclamation-triangle shrink-0 text-status-danger" aria-hidden="true" />
        <strong class="min-w-0 flex-1 truncate text-label">{{ entry.label }}</strong>
      </div>
      <span v-if="entry.error" class="text-supporting text-status-danger">{{ entry.error }}</span>
      <section v-for="output in entry.outputs" :key="output.id" class="rounded-ui bg-subtle p-2 text-supporting">
        <div class="mb-2 flex items-center justify-between gap-2">
          <span class="flex min-w-0 items-baseline gap-2">
            <strong class="truncate">{{ output.label }}</strong>
            <span v-if="output.type" class="shrink-0 text-muted">{{ output.type }}</span>
          </span>
          <span class="text-muted">{{ $t('processDesigner.previewCounts', { branches: output.tree.branchCount, items: output.tree.itemCount }) }}</span>
        </div>
        <div v-for="branch in output.tree.branches" :key="branch.path.join(';')" class="mb-1 flex flex-col gap-1 last:mb-0">
          <code v-if="branch.path.length" class="text-muted">{{ formatPreviewPath(branch.path) }}</code>
          <GraphOutputView :value="branch.items" :alt="output.label" />
        </div>
        <div v-if="output.tree.truncated" class="mt-1 text-muted">{{ $t('processDesigner.previewTruncated') }}</div>
      </section>
    </section>
  </div>
  <StateBlock v-else-if="payload" :message="$t('processDesigner.noPreviewOutputs')" />
</template>

<script setup>
import { computed } from 'vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import GraphOutputView from '~/components/process-designer/GraphOutputView.vue';
import { formatPreviewPath, graphOutputEntries } from '~/utils/processDesignerChannelOutputs.js';

// The built-in outputs channel (SPEC §28): every visible evaluated
// output of the whole-graph preview, labeled the way the canvas names
// its cards — each value rendered through the shared output view, best
// representation first.
const props = defineProps({
  payload: { type: Object, default: null },
  nodes: { type: Array, default: () => [] }
});

const entries = computed(() => (props.payload ? graphOutputEntries(props.payload, props.nodes) : []));
</script>
