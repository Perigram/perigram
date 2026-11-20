<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <span class="text-label">{{ $t('processDesigner.previewChannels') }}</span>
      <Button
        icon="pi pi-refresh"
        size="small"
        text
        :loading="running"
        :aria-label="$t('processDesigner.refreshPreview')"
        @click="$emit('refresh')"
      />
    </div>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <StateBlock v-if="running && !payload" state="loading" :message="$t('common.loading')" />
    <section class="flex flex-col gap-2">
      <span class="text-muted text-supporting">{{ $t('processDesigner.previewOutputsChannel') }}</span>
      <GraphOutputsChannel :payload="payload" :nodes="nodes" />
    </section>
    <section v-for="channel in channels" :key="channel.id" class="flex flex-col gap-2">
      <span class="text-muted text-supporting">{{ channel.label }}</span>
      <PreviewChannelMount :channel="channel" :payload="payload" />
    </section>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import Message from 'primevue/message';
import StateBlock from '~/components/shared/StateBlock.vue';
import GraphOutputsChannel from '~/components/process-designer/GraphOutputsChannel.vue';
import PreviewChannelMount from '~/components/process-designer/PreviewChannelMount.vue';

// The channel-tab strip (SPEC §28 preview tabs): the built-in outputs
// channel first, then one read-only channel mount per served channel,
// all over the whole-graph evaluation the host hands in; the refresh
// control re-runs that evaluation.
defineProps({
  channels: { type: Array, default: () => [] },
  payload: { type: Object, default: null },
  nodes: { type: Array, default: () => [] },
  running: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

defineEmits(['refresh']);
</script>
