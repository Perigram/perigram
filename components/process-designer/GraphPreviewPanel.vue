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
    <template v-if="channels.length">
      <section
        v-for="channel in channels"
        :key="channel.id"
        class="flex flex-col gap-2"
      >
        <span class="text-muted text-supporting">{{ channel.label }}</span>
        <PreviewChannelMount :channel="channel" :payload="payload" />
      </section>
    </template>
    <StateBlock v-else :message="$t('processDesigner.noPreviewChannels')" />
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import Message from 'primevue/message';
import PreviewChannelMount from '~/components/process-designer/PreviewChannelMount.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

// The channel-tab strip (SPEC §28 preview tabs): one read-only channel
// mount per served channel over the whole-graph evaluation the host
// hands in; the refresh control re-runs that evaluation.
defineProps({
  channels: { type: Array, default: () => [] },
  payload: { type: Object, default: null },
  running: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

defineEmits(['refresh']);
</script>
