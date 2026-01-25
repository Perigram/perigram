<script setup>
/**
 * Unified Status Timeline Component - v24 Standardized
 */
import Timeline from 'primevue/timeline';
import ProgressSpinner from 'primevue/progressspinner';
import Tag from 'primevue/tag';
import Card from 'primevue/card';
import { onMounted, watch } from 'vue';

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

const getStatusSeverity = (state) => {
    const map = {
        DRAFT: 'secondary',
        PENDING: 'warn',
        ACTIVE: 'primary',
        READY: 'success',
        CLOSED: 'info',
        ACCEPTED: 'success',
        REJECTED: 'danger'
    };
    return map[state] || 'secondary';
};
</script>

<template>
  <div>
    <div v-if="isLoading" class="flex justify-center p-8">
      <ProgressSpinner style="width: 40px; height: 40px" />
    </div>
    
    <Timeline v-else :value="events">
      <template #opposite="slotProps">
        <div class="pt-1">
            <small>{{ formatTime(slotProps.item.timestamp) }}</small>
        </div>
      </template>
      <template #content="slotProps">
        <Card class="mb-4">
          <template #title>
            <div class="flex items-center justify-between">
              <Tag :value="slotProps.item.toState" :severity="getStatusSeverity(slotProps.item.toState)" />
              <small>{{ slotProps.item.status?.userId }}</small>
            </div>
          </template>
          <template #content>
            <p v-if="slotProps.item.status?.metadata?.note" class="m-0 italic">
              "{{ slotProps.item.status.metadata.note }}"
            </p>
          </template>
        </Card>
      </template>
    </Timeline>
    
    <div v-if="!isLoading && events.length === 0" class="text-center p-8 italic">
      No history recorded yet.
    </div>
  </div>
</template>