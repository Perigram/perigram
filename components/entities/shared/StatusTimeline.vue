<script setup>
/**
 * Unified Status Timeline Component - v24 Standardized
 * Renders the history log from status_events
 */
const props = defineProps({
  entityType: { type: String, required: true },
  targetId: { type: String, required: true }
});

const { events, isLoading, fetchHistory } = useStatusHistory(props.entityType, props.targetId);

onMounted(() => {
  fetchHistory();
});

const formatTime = (ts) => {
  return new Date(ts).toLocaleString();
};
</script>

<template>
  <div class="status-timeline-container">
    <div v-if="isLoading" class="flex justify-center p-8">
      <ProgressSpinner style="width: 40px; height: 40px" strokeWidth="4" />
    </div>
    
    <Timeline v-else :value="events" class="custom-timeline">
      <template #opposite="slotProps">
        <small class="text-surface-500">{{ formatTime(slotProps.item.timestamp) }}</small>
      </template>
      <template #content="slotProps">
        <div class="flex flex-col gap-1 mb-6">
          <div class="flex items-center gap-2">
            <span class="font-bold text-surface-900">{{ slotProps.item.toState }}</span>
            <span class="text-xs text-surface-400">by {{ slotProps.item.status?.userId }}</span>
          </div>
          <p v-if="slotProps.item.status?.metadata?.note" class="text-sm text-surface-600 italic">
            "{{ slotProps.item.status.metadata.note }}"
          </p>
        </div>
      </template>
    </Timeline>
    
    <div v-if="!isLoading && events.length === 0" class="text-center p-8 text-surface-400 italic">
      No history recorded yet.
    </div>
  </div>
</template>

<style scoped>
.custom-timeline {
  @apply px-4;
}
</style>
