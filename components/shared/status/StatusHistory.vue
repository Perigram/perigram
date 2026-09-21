<script setup>
/**
 * Unified Status History Component - v24 Standardized
 * Fetches and displays the audit log (status_events) for an entity.
 */
import ProgressSpinner from 'primevue/progressspinner';
import Button from 'primevue/button';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStatusHistory } from '~/composables/useStatusHistory';
import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState';
import { getPrimaryState } from '~/packages/core/src/index.js';

const props = defineProps({
  entity: { type: Object, default: null },
  typeId: { type: String, required: true },
  targetId: { type: String, default: null },
  mockEvents: { type: Array, default: null },
  compact: { type: Boolean, default: false }
});

const resolvedTargetId = computed(
  () => props.targetId || props.entity?._id?.toString() || props.entity?.id?.toString()
);

const { t } = useI18n();
const { events, isLoading, fetchHistory } = useStatusHistory(props.typeId, resolvedTargetId.value);
const supportDialog = useSupportDialog();
const supportChatTarget = useSupportChatTarget();
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

const eventDisplay = (event) => event.status?.metadata?.display || event.metadata?.display || null;

const eventNote = (event) => event.status?.metadata?.note || event.metadata?.note || '';

const eventAttachments = (event) => Object.entries(event.status?.lifecycle?.attachments || {})
  .flatMap(([slot, value]) => (Array.isArray(value) ? value : [value]).filter(Boolean).map(item => ({
    slot,
    label: item.name || item.fileId || slot,
    url: item.url || (item.fileId ? `/api/files/download/${item.fileId}?bucket=${item.bucketName || 'uploads'}` : '')
  })));

const eventSnapshots = (event) => Object.entries(event.status?.lifecycle?.data?.snapshots || {})
  .map(([key, value]) => ({
    key,
    label: value?.label || key,
    count: value?.count ?? value?.refs?.length ?? 0
  }));

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

const actorUserId = (event) => {
  const userId = event.actor?.userId || event.status?.userId || event.userId;
  return userId && userId !== 'SYSTEM' ? userId : '';
};

const openActorChat = (event) => {
  const userId = actorUserId(event);
  if (!userId) return;
  supportChatTarget.value = {
    userId,
    name: actorName(event),
    draftEntityRefs: resolvedTargetId.value
      ? [{
          type: props.typeId,
          id: resolvedTargetId.value,
          label: props.entity?.identity?.name || props.entity?.identity?.serial || resolvedTargetId.value,
          entity: props.entity || null
        }]
      : []
  };
  supportDialog.value = true;
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
            <StatusBadge :state="eventState(event)" :display="eventDisplay(event)" />
            <span v-if="actorUserId(event)" class="inline-flex min-w-0 items-center gap-1" :title="actorTitle(event)">
              <EntityInlineRef type="user" :id="actorUserId(event)" :entity="{ _id: actorUserId(event), identity: { name: actorName(event) }, data: {} }" />
              <Button
                icon="pi pi-comments"
                text
                rounded
                size="small"
                :aria-label="$t('support.openChat')"
                @click="openActorChat(event)"
              />
            </span>
            <small v-else-if="actorName(event)" class="min-w-0 truncate text-muted" :title="actorTitle(event)">
              <i class="pi pi-user mr-1"></i>{{ actorName(event) }}
            </small>
            <time
              v-if="formatTime(event.timestamp)"
              class="ml-auto text-right text-muted text-supporting"
              :datetime="dateTimeAttribute(event.timestamp)"
            >
              {{ formatTime(event.timestamp) }}
            </time>
          </div>

          <p v-if="eventNote(event)" class="m-0 mt-2 min-w-0 break-words italic text-body">
            {{ eventNote(event) }}
          </p>

          <div v-if="eventAttachments(event).length" class="mt-2 flex min-w-0 flex-wrap gap-2">
            <a
              v-for="attachment in eventAttachments(event)"
              :key="`${eventKey(event, index)}-${attachment.slot}-${attachment.label}`"
              :href="attachment.url"
              target="_blank"
              rel="noopener"
              class="inline-flex min-w-0 items-center gap-1 text-[var(--ck-primary-ink)] no-underline text-body"
            >
              <i class="pi pi-paperclip shrink-0"></i>
              <span class="truncate">{{ attachment.label }}</span>
            </a>
          </div>

          <div v-if="eventSnapshots(event).length" class="mt-2 flex min-w-0 flex-wrap gap-2">
            <small
              v-for="snapshot in eventSnapshots(event)"
              :key="`${eventKey(event, index)}-${snapshot.key}`"
              class="inline-flex min-w-0 items-center gap-1 text-muted"
            >
              <i class="pi pi-camera shrink-0"></i>
              <span class="truncate">{{ snapshot.label }}: {{ snapshot.count }}</span>
            </small>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>
