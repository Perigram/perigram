<script setup>
/**
 * Unified Status History Component - v24 Standardized
 * Fetches and displays the audit log (status_events) for an entity.
 */
import ProgressSpinner from 'primevue/progressspinner';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStatusHistory } from '~/composables/useStatusHistory';
import { getPrimaryState } from '~/packages/core/src/index.js';

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

const { t } = useI18n();
const { events, isLoading, fetchHistory } = useStatusHistory(props.entityType, resolvedTargetId.value);
const displayEvents = computed(() => {
  if (events.value.length) return events.value;
  return fallbackEvents.value;
});
const fallbackEvents = computed(() => {
  const status = props.entity?.status || props.entity?.origin;
  if (!status?.state) return [];
  return [{
    toState: getPrimaryState(status),
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
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: props.compact ? 'short' : 'medium',
    timeStyle: 'short'
  });
};

const dateTimeAttribute = (ts) => {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const eventState = (event) => event.toStatePrimary || event.toState || getPrimaryState(event.status || event.state);

const eventNote = (event) => event.status?.metadata?.note || event.metadata?.note || '';

const actorName = (event) => {
  const userId = event.status?.userId || event.userId;
  if (userId === 'SYSTEM') return t('status.systemActor');

  return event.actor?.name
    || event.status?.actor?.name
    || event.status?.metadata?.actorName
    || event.status?.metadata?.userName
    || event.metadata?.actorName
    || event.metadata?.userName
    || userId
    || '';
};

const actorTitle = (event) => {
  const userId = event.status?.userId || event.userId;
  const name = actorName(event);
  return userId && name && userId !== name ? userId : name;
};

const eventKey = (event, index) => event._id || `${eventState(event)}-${event.timestamp}-${index}`;
</script>

<template>
  <div>
    <div v-if="isLoading" class="flex justify-center" :class="compact ? 'p-3' : 'p-10'">
      <ProgressSpinner />
    </div>

    <ol v-else-if="displayEvents.length" class="m-0 flex min-w-0 list-none flex-col p-0" :class="compact ? 'gap-2' : 'gap-3'">
      <li
        v-for="(event, index) in displayEvents"
        :key="eventKey(event, index)"
        class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2"
      >
        <div class="flex flex-col items-center pt-1">
          <span class="h-2.5 w-2.5 rounded-full bg-primary"></span>
          <span v-if="index < displayEvents.length - 1" class="mt-1 min-h-6 w-px flex-1 bg-content-border"></span>
        </div>

        <div class="min-w-0 pb-2">
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge :state="eventState(event)" />
            <small
              v-if="actorName(event)"
              class="min-w-0 truncate text-muted-color"
              :title="actorTitle(event)"
            >
              <i class="pi pi-user mr-1"></i>{{ actorName(event) }}
            </small>
            <time
              v-if="formatTime(event.timestamp)"
              class="ml-auto text-right text-xs text-muted-color"
              :datetime="dateTimeAttribute(event.timestamp)"
            >
              {{ formatTime(event.timestamp) }}
            </time>
          </div>

          <p v-if="eventNote(event)" class="m-0 mt-2 min-w-0 break-words text-sm italic">
            {{ eventNote(event) }}
          </p>
        </div>
      </li>
    </ol>
  </div>
</template>
