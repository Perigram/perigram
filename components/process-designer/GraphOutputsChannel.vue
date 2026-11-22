<template>
  <div v-if="entries.length" class="flex min-h-0 flex-col gap-2">
    <Message v-for="entry in errorEntries" :key="entry.id" severity="error">
      {{ entry.label }}: {{ entry.error }}
    </Message>
    <div v-if="flatOutputs.length" class="flex flex-col gap-2">
      <InstanceSelect
        v-model="selectedKey"
        :options="flatOutputs"
        option-label="label"
        option-value="key"
        class="w-full"
        :aria-label="$t('processDesigner.graphOutput')"
      />
      <div class="flex flex-wrap gap-1" role="tablist" :aria-label="$t('processDesigner.previewRepresentations')">
        <Button
          v-for="view in availableViews"
          :key="view.value"
          :label="view.label"
          size="small"
          :severity="activeView === view.value ? 'primary' : 'secondary'"
          :outlined="activeView !== view.value"
          @click="chooseView(view.value)"
        />
      </div>
      <div class="min-h-0 rounded-ui bg-subtle p-3">
        <GraphOutputView :value="selectedValue" :view="activeView" :alt="selectedOutput?.label || ''" />
      </div>
    </div>
    <details class="flex flex-col gap-2">
      <summary class="text-supporting text-muted">{{ $t('processDesigner.graphNodeOutputs') }}</summary>
      <section v-for="entry in entries" :key="entry.id" class="flex flex-col gap-1">
        <span v-if="entry.section" class="truncate text-muted text-supporting">{{ entry.section }}</span>
        <div class="flex min-w-0 items-center gap-1.5">
          <i v-if="entry.error" class="pi pi-exclamation-triangle shrink-0 text-status-danger" aria-hidden="true" />
          <strong class="min-w-0 flex-1 truncate text-label">{{ entry.label }}</strong>
        </div>
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
    </details>
  </div>
  <StateBlock v-else-if="payload" :message="$t('processDesigner.noPreviewOutputs')" />
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import StateBlock from '~/components/shared/StateBlock.vue';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import GraphOutputView from '~/components/shared/GraphOutputView.vue';
import { formatPreviewPath, graphOutputEntries } from '~/utils/processDesignerChannelOutputs.js';
import { graphOutputViews } from '~/utils/graphOutputViews.js';

// The built-in outputs channel (SPEC §28, §28.14): one evaluated output
// selected and rendered through the shared output view (best
// representation first, JSON an explicit choice); the per-node listing
// is the collapsed diagnostics under it. Errors stay first-plane.
const props = defineProps({
  payload: { type: Object, default: null },
  nodes: { type: Array, default: () => [] }
});

const entries = computed(() => (props.payload ? graphOutputEntries(props.payload, props.nodes) : []));
const errorEntries = computed(() => entries.value.filter(entry => entry.error));

// One selectable output per evaluated socket, labeled node · socket.
const flatOutputs = computed(() => entries.value.flatMap(entry => entry.outputs.map(output => ({
  key: `${entry.id}:${output.id}`,
  label: `${entry.label} · ${output.label}`
}))));
const selectedKey = ref('');
const activeView = ref('json');
const viewChosen = ref(false);

watch(flatOutputs, outputs => {
  if (!outputs.some(output => output.key === selectedKey.value)) {
    selectedKey.value = outputs[0]?.key || '';
    viewChosen.value = false;
  }
}, { immediate: true });
watch(selectedKey, () => { viewChosen.value = false; });

const selectedEntry = computed(() => {
  for (const entry of entries.value) {
    const output = entry.outputs.find(candidate => `${entry.id}:${candidate.id}` === selectedKey.value);
    if (output) return { entry, output };
  }
  return null;
});
const selectedOutput = computed(() => selectedEntry.value?.output || null);
const selectedValue = computed(() => (selectedOutput.value ? outputValue(selectedOutput.value.tree) : null));
const availableViews = computed(() => graphOutputViews(selectedValue.value));

function chooseView(view) {
  viewChosen.value = true;
  activeView.value = view;
}

watch(availableViews, views => {
  if (!viewChosen.value || !views.some(view => view.value === activeView.value)) {
    activeView.value = views[0]?.value || 'json';
  }
}, { immediate: true });

// A single root branch renders as its item or list; a branch structure
// renders as the branch table.
function outputValue(tree = {}) {
  const branches = Array.isArray(tree.branches) ? tree.branches : [];
  if (branches.length === 1 && (branches[0].path || []).length === 0) {
    const items = branches[0].items || [];
    return items.length === 1 ? items[0] : items;
  }
  return branches.map(branch => ({
    ...(branch.path?.length ? { path: branch.path.join('.') } : {}),
    items: branch.items
  }));
}
</script>
