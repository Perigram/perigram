<script setup>
/**
 * Unified Status History Component - v24 Standardized
 * Fetches and displays the audit log (status_events) for an instance as a
 * vertical stepper feed: each event is one step, ordered newest → oldest
 * (the latest event leads), with the newest step's evidence panel open by
 * default — clicking a step header expands that event's note,
 * attachments, and snapshots (one panel open at a time, the stepper's own
 * accordion).
 */
import Stepper from 'primevue/stepper';
import StepItem from 'primevue/stepitem';
import Step from 'primevue/step';
import StepPanel from 'primevue/steppanel';
import ProgressSpinner from 'primevue/progressspinner';
import Button from 'primevue/button';
import StateTag from '~/components/ui-mapping/StateTag.vue';
import { useStatePolicy } from '~/composables/useStatePolicy';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStateHistory } from '~/composables/useStateHistory';
import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState';
import { getPrimaryState } from '~/packages/core/src/index.js';

const props = defineProps({
  instance: { type: Object, default: null },
  typeId: { type: String, required: true },
  targetId: { type: String, default: null },
  mockEvents: { type: Array, default: null },
  compact: { type: Boolean, default: false }
});

const resolvedTargetId = computed(
  () => props.targetId || props.instance?._id?.toString() || props.instance?.id?.toString()
);

const { t } = useI18n();
const { events, isLoading, fetchHistory } = useStateHistory(props.typeId, resolvedTargetId.value);
const supportDialog = useSupportDialog();
const supportChatTarget = useSupportChatTarget();
const displayEvents = computed(() => {
  if (events.value.length) return events.value;
  return fallbackEvents.value;
});
const fallbackEvents = computed(() => []);

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

// Step badges resolve through the flat state contract: the type's policy
// map drives each historical value's label/severity/icon via the one
// materialization (StateTag).
const { policyFor } = useStatePolicy();
const policyByValue = policyFor(() => props.typeId);

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

// Actor display uses the event's first-class stamp `actor` when present
// (persisted `id`/`label`/`principalType`, merged with the display
// projection `userId`/`name` by the states feature service); legacy
// events predate the stamp and keep the status-block fallbacks.
const actorName = (event) => {
  const userId = event.status?.userId || event.userId;
  if (isSystemActor(event, userId)) return t('status.systemActor');

  return event.actor?.label
    || event.actor?.name
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
  if (isSystemActor(event, event.status?.userId || event.userId)) return '';
  const principalType = event.actor?.principalType;
  if (principalType && principalType !== 'user') return '';
  return event.actor?.id || event.actor?.userId || event.status?.userId || event.userId || '';
};

function isSystemActor(event, userId) {
  if (event.actor?.principalType === 'SYSTEM' || event.actor?.type === 'system') return true;
  return (!event.actor?.principalType && !event.actor?.type) && userId === 'SYSTEM';
}

const openActorChat = (event) => {
  const userId = actorUserId(event);
  if (!userId) return;
  supportChatTarget.value = {
    userId,
    name: actorName(event),
    draftInstanceRefs: resolvedTargetId.value
      ? [{
          type: props.typeId,
          id: resolvedTargetId.value,
          label: props.instance?.identity?.name || props.instance?.identity?.serial || resolvedTargetId.value,
          instance: props.instance || null
        }]
      : []
  };
  supportDialog.value = true;
};

const eventKey = (event, index) => event._id || `${eventState(event)}-${event.timestamp}-${index}`;

// The trail reads newest → oldest (a feed: the latest event leads); the
// API serves newest-first. A run of consecutive steps by one principal
// carries the actor once, on the run's first step.
const actorStartsRun = (index) => {
  if (index === 0) return true;
  return actorUserId(orderedEvents.value[index - 1]) !== actorUserId(orderedEvents.value[index]);
};

// The newest step opens with its evidence panel expanded.
const orderedEvents = computed(() => displayEvents.value);
const activeStep = computed(() => (orderedEvents.value.length
  ? stepKey(orderedEvents.value[0], 0)
  : null));
const stepKey = (event, index) => eventKey(event, index);
// Step index bubbles would count the audit trail; the state badge is the
// marker, so the number stays hidden.
const stepPt = { number: { class: 'hidden' } };
const activeStepRef = ref(null);
watch(activeStep, value => { activeStepRef.value = value; }, { immediate: true });
</script>

<template>
  <div>
    <div v-if="isLoading" class="flex justify-center" :class="compact ? 'p-3' : 'p-10'">
      <ProgressSpinner />
    </div>

    <Stepper
      v-else-if="orderedEvents.length"
      v-model:value="activeStepRef"
      class="min-w-72"
    >
      <StepItem v-for="(event, index) in orderedEvents" :key="stepKey(event, index)" :value="stepKey(event, index)">
        <Step :pt="stepPt">
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-1 text-left">
            <StateTag :value="eventState(event)" :policy="policyByValue" />
            <span v-if="actorUserId(event) && actorStartsRun(index)" class="inline-flex min-w-0 items-center gap-1" :title="actorTitle(event)">
              <InstanceInlineRef type="user" :id="actorUserId(event)" :entity="{ _id: actorUserId(event), identity: { name: actorName(event) }, data: {} }" />
              <Button
                icon="pi pi-comments"
                text
                rounded
                size="small"
                :aria-label="$t('support.openChat')"
                @click.stop="openActorChat(event)"
              />
            </span>
            <small v-else-if="actorName(event) && actorStartsRun(index)" class="min-w-0 truncate text-muted" :title="actorTitle(event)">
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
        </Step>
        <StepPanel :value="stepKey(event, index)" v-slot="{ activateCallback }">
          <div v-if="eventNote(event) || eventAttachments(event).length || eventSnapshots(event).length" class="min-w-0 pb-3 pl-1">
            <p v-if="eventNote(event)" class="m-0 min-w-0 break-words italic text-body">
              {{ eventNote(event) }}
            </p>

            <div v-if="eventAttachments(event).length" class="mt-2 flex min-w-0 flex-wrap gap-2">
              <a
                v-for="attachment in eventAttachments(event)"
                :key="`${stepKey(event, index)}-${attachment.slot}-${attachment.label}`"
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
                :key="`${stepKey(event, index)}-${snapshot.key}`"
                class="inline-flex min-w-0 items-center gap-1 text-muted"
              >
                <i class="pi pi-camera shrink-0"></i>
                <span class="truncate">{{ snapshot.label }}: {{ snapshot.count }}</span>
              </small>
            </div>
          </div>
          <div v-if="orderedEvents.length > 1" class="flex items-center justify-end gap-1 pb-2 pl-1">
            <Button
              icon="pi pi-chevron-up"
              text
              rounded
              size="small"
              severity="secondary"
              :disabled="index === 0"
              :aria-label="$t('common.next')"
              data-history-nav="newer"
              @click.stop="activateCallback(stepKey(orderedEvents[index - 1], index - 1))"
            />
            <Button
              icon="pi pi-chevron-down"
              text
              rounded
              size="small"
              severity="secondary"
              :disabled="index === orderedEvents.length - 1"
              :aria-label="$t('common.back')"
              data-history-nav="older"
              @click.stop="activateCallback(stepKey(orderedEvents[index + 1], index + 1))"
            />
          </div>
        </StepPanel>
      </StepItem>
    </Stepper>
  </div>
</template>
