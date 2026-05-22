<script setup>
/**
 * Unified Status History Component - v24 Standardized
 * Fetches and displays the audit log (status_events) for an entity.
 */
import Timeline from 'primevue/timeline';
import Divider from 'primevue/divider';
import ProgressSpinner from 'primevue/progressspinner';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import { computed, onMounted, watch } from 'vue';
import { useStatusHistory } from '~/composables/useStatusHistory';

const props = defineProps({
  entity: { type: Object, default: null },
  entityType: { type: String, required: true },
  targetId: { type: String, default: null },
  mockEvents: { type: Array, default: null },
  compact: { type: Boolean, default: false }
});

const resolvedTargetId = computed(
  () => props.targetId || props.entity?._id?.toString() || props.entity?.id?.toString()
);

const { events, isLoading, fetchHistory } = useStatusHistory(props.entityType, resolvedTargetId.value);
const displayEvents = computed(() => {
  if (events.value.length) return events.value;
  return fallbackEvents.value;
});
const fallbackEvents = computed(() => {
  const status = props.entity?.status || props.entity?.origin;
  if (!status?.state) return [];
  return [{
    toState: status.state,
    timestamp: status.timestamp || status.createdAt || props.entity?.updatedAt || props.entity?.createdAt || new Date(),
    status
  }];
});

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
    <div v-if="isLoading" class="flex justify-center" :class="compact ? 'p-3' : 'p-10'">
      <ProgressSpinner />
    </div>
    
    <Timeline v-else-if="displayEvents.length" :value="displayEvents" class="customized-timeline" :class="{ 'compact-timeline': compact }">
      <template #opposite="slotProps">
        <small>{{ formatTime(slotProps.item.timestamp) }}</small>
      </template>
      <template #content="slotProps">
        <div class="flex flex-col gap-2" :class="compact ? 'mb-3' : 'mb-8'">
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
  </div>
</template>

<style scoped>
.customized-timeline :deep(.p-timeline-event-opposite) {
    flex: 0;
    min-width: 140px;
    text-align: right;
    padding-right: 1.5rem;
}

.compact-timeline :deep(.p-timeline-event-opposite) {
    min-width: 84px;
    padding-right: 0.75rem;
}
</style>
