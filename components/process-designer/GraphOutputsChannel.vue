<template>
  <div class="flex h-full min-h-0 flex-col gap-2">
    <Message v-if="error" severity="error" class="shrink-0">{{ error }}</Message>
    <div v-if="showControls" class="flex min-w-0 flex-wrap items-center gap-1">
      <InstanceSelect
        v-if="flatOutputs.length > 1"
        v-model="selectedKey"
        :options="flatOutputs"
        option-label="label"
        option-value="key"
        class="min-w-40 flex-1"
        :aria-label="$t('processDesigner.graphOutput')"
      />
      <div v-if="availableViews.length > 1" class="flex flex-wrap gap-1" role="tablist" :aria-label="$t('processDesigner.previewRepresentations')">
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
    </div>
    <div class="relative min-h-0 flex-1 overflow-hidden rounded-ui bg-subtle">
      <div v-if="!entries.length || (!selectedOutput && !activeChannel)" class="grid h-full place-items-center">
        <StateBlock v-if="payload || error" :message="$t('processDesigner.noPreviewOutputs')" />
      </div>
      <template v-else>
        <PreviewChannelMount
          v-if="activeChannel"
          :channel="activeChannel"
          :payload="payload"
        />
        <GraphOutputView
          v-else
          :value="selectedValue"
          :view="activeView"
          :representation="selectedOutput?.representation || ''"
          :alt="selectedOutput?.label || ''"
          fill
        />
      </template>
      <Button
        icon="pi pi-refresh"
        size="small"
        text
        :loading="running"
        :aria-label="$t('processDesigner.refreshPreview')"
        class="absolute right-2 top-2 z-10"
        @click="$emit('refresh')"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import StateBlock from '~/components/shared/StateBlock.vue';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import PreviewChannelMount from '~/components/process-designer/PreviewChannelMount.vue';
import GraphOutputView from '~/components/shared/GraphOutputView.vue';
import { graphOutputEntries } from '~/utils/processDesignerChannelOutputs.js';
import { isDocumentsPreviewValue } from '~/utils/documents-preview.js';
import { graphOutputViews } from '~/utils/graphOutputViews.js';

const props = defineProps({
  payload: { type: Object, default: null },
  nodes: { type: Array, default: () => [] },
  channels: { type: Array, default: () => [] },
  running: { type: Boolean, default: false },
  error: { type: String, default: '' }
});
defineEmits(['refresh']);

const entries = computed(() => (props.payload ? graphOutputEntries(props.payload, props.nodes) : []));

// One selectable output per evaluated socket, labeled node · socket.
const flatOutputs = computed(() => entries.value.flatMap(entry => entry.outputs.map(output => ({
  key: `${entry.id}:${output.id}`,
  label: `${entry.label} · ${output.label}`,
  representation: output.representation,
  value: outputValue(output.tree)
}))));
const selectedKey = ref('');
const activeView = ref('json');
const viewChosen = ref(false);

watch(flatOutputs, outputs => {
  if (!outputs.some(output => output.key === selectedKey.value)) {
    const scene = outputs.find(output => ['perigram.scene-3d', 'perigram.scene-2d']
      .includes(output.representation || output.value?.representation));
    selectedKey.value = scene?.key || outputs[0]?.key || '';
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
const activeChannel = computed(() => props.channels.find(channel => `channel:${channel.id}` === activeView.value) || null);
const availableViews = computed(() => {
  const views = graphOutputViews(selectedValue.value, {
    representation: selectedOutput.value?.representation || ''
  });
  for (const channel of props.channels) views.push({ value: `channel:${channel.id}`, label: channel.label });
  return views;
});
const showControls = computed(() => flatOutputs.value.length > 0
  && (flatOutputs.value.length > 1 || availableViews.value.length > 1));

function chooseView(view) {
  viewChosen.value = true;
  activeView.value = view;
}

watch(availableViews, views => {
  const documentsChannel = props.channels.find(channel => channel.id === 'documents');
  const preferred = isDocumentsPreviewValue(selectedValue.value) && documentsChannel
    ? `channel:${documentsChannel.id}`
    : '';
  if (preferred && views.some(view => view.value === preferred)) activeView.value = preferred;
  else if (!viewChosen.value || !views.some(view => view.value === activeView.value)) {
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
