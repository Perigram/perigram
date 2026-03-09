<script setup>
/**
 * Unified Status History Component - v24 Standardized
 * Fetches and displays the audit log (status_events) for an entity.
 */
import Timeline from 'primevue/timeline';
import Divider from 'primevue/divider';
import ProgressSpinner from 'primevue/progressspinner';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import { onMounted, watch } from 'vue';
import { useStatusHistory } from '~/composables/useStatusHistory';

const props = defineProps({
  entityType: { type: String, required: true },
  targetId: { type: String, required: true },
  mockEvents: { type: Array, default: null }
});

const { events, isLoading, fetchHistory } = useStatusHistory(props.entityType, props.targetId);

onMounted(() => {
  if (props.mockEvents) {
    events.value = props.mockEvents;
  } else {
    fetchHistory();
  }
});

watch(() => props.mockEvents, (newVal) => {
    if (newVal) events.value = newVal;
}, { deep: true });

const formatTime = (ts) => {
  return new Date(ts).toLocaleString();
};
</script>

<template>
  <div>
    <div v-if="isLoading" class="flex justify-center p-10">
      <ProgressSpinner />
    </div>
    
    <Timeline v-else :value="events" class="customized-timeline">
      <template #opposite="slotProps">
        <small>{{ formatTime(slotProps.item.timestamp) }}</small>
      </template>
      <template #content="slotProps">
        <div class="flex flex-col gap-2 mb-8">
            <div class="flex items-center justify-between">
              <StatusBadge :state="slotProps.item.toState" />
              <small>{{ slotProps.item.status?.userId }}</small>
            </div>
            <p v-if="slotProps.item.status?.metadata?.note" class="m-0 italic text-sm">
              "{{ slotProps.item.status.metadata.note }}"
            </p>
            <Divider />
        </div>
      </template>
    </Timeline>
    
    <div v-if="!isLoading && events.length === 0" class="text-center p-10 italic">
      No history recorded yet.
    </div>
  </div>
</template>

<style scoped>
.customized-timeline :deep(.p-timeline-event-opposite) {
    flex: 0;
    min-width: 140px;
    text-align: right;
    padding-right: 1.5rem;
}
</style>