<script setup>
/**
 * Unified Status History Component - v24 Standardized
 * Fetches and displays the audit log (status_events) for an instance as a
 * vertical stepper feed of states: each step is one state, ordered newest →
 * oldest (the latest state leads), carrying the events recorded under it —
 * transitions, field edits, payload revisions, notes, attachments,
 * snapshots. Each event row shows its actor and time; clicking a step header
 * expands its evidence panel (one panel open at a time, the stepper's own
 * accordion).
 */
import Stepper from 'primevue/stepper';
import StepItem from 'primevue/stepitem';
import Step from 'primevue/step';
import StepPanel from 'primevue/steppanel';
import ProgressSpinner from 'primevue/progressspinner';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import StateTag from '~/components/ui-mapping/StateTag.vue';
import { useStatePolicy } from '~/composables/useStatePolicy';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStateHistory } from '~/composables/useStateHistory';
import { useSupportChatTarget, useSupportDialog } from '~/composables/useModalState';
import { getPrimaryState } from '#packages/core';

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

const { t, locale } = useI18n();
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
  return date.toLocaleString(locale.value, {
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

// Field-change events (SPEC UI): the audit trail's "who changed what" —
// each step lists the changed leaves with from → to values.
const isFieldChange = (event) => event.operation?.kind === 'field_change';
const fieldChangesOf = (event) => (isFieldChange(event) ? event.operation.changes || [] : []);

// Payload-revision events (SPEC §24): the audit trail's "who minted
// which version" — reason, version, and the prior version a restore
// re-entered. Labels ride the revision surface's own keys.
const isPayloadRevision = (event) => event.operation?.kind === 'payload_revision';
const payloadRevisionOf = (event) => (isPayloadRevision(event) ? event.operation : null);
const PAYLOAD_REASON_KEYS = {
  'payload-replaced': 'revision.reasonReplaced',
  'rederived': 'revision.reasonRederived',
  'payload-restored': 'revision.reasonRestored'
};
const payloadReasonLabel = (operation) => (PAYLOAD_REASON_KEYS[operation?.reason]
  ? t(PAYLOAD_REASON_KEYS[operation.reason])
  : operation?.reason || '');
const formatChangeValue = (value) => {
  const text = value === null || value === undefined || value === ''
    ? '—'
    : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
};
const fieldChangeLabel = (name) => String(name).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());

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

// A legacy actor whose user record is gone resolves to its raw id; the
// surface names the unknown principal instead of exposing the id.
const actorDisplayName = (event) => {
  const name = actorName(event);
  const id = event.actor?.id || event.status?.userId || event.userId || '';
  return id && name === id ? t('common.unknownUser') : name;
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
// API serves newest-first. Events that did not move the state — field
// edits, payload revisions — sit inside the step of the state they
// occurred in, so a step is one state and its entries are the events
// recorded under it.
const orderedEvents = computed(() => displayEvents.value);
const stepKey = (event, index) => eventKey(event, index);
const stateSteps = computed(() => {
  const steps = [];
  orderedEvents.value.forEach((event, index) => {
    const state = eventState(event) || null;
    const entry = { event, key: stepKey(event, index) };
    const newest = steps[steps.length - 1];
    if (newest && newest.state === state) newest.entries.push(entry);
    else steps.push({ state, key: entry.key, entries: [entry] });
  });
  return steps;
});
// The newest step opens with its evidence panel expanded.
const activeStep = computed(() => stateSteps.value[0]?.key || null);
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
      v-else-if="stateSteps.length"
      v-model:value="activeStepRef"
      class="min-w-72"
    >
      <StepItem v-for="(step, stepIndex) in stateSteps" :key="step.key" :value="step.key">
        <Step :pt="stepPt">
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-1 text-left">
            <StateTag v-if="step.state" :value="step.state" :policy="policyByValue" />
          </div>
        </Step>
        <StepPanel :value="step.key" v-slot="{ activateCallback }">
          <div class="flex min-w-0 flex-col gap-3 pb-3 pl-1">
            <div
              v-for="(entry, entryIndex) in step.entries"
              :key="entry.key"
              class="flex min-w-0 flex-col gap-1"
              :class="entryIndex > 0 ? 'border-t border-solid border-[var(--p-content-border-color)] pt-2' : ''"
              :data-history-event="entry.event.operation?.kind || 'transition'"
            >
              <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <i v-if="isFieldChange(entry.event)" class="pi pi-pencil text-muted text-[0.75rem]" aria-hidden="true"></i>
                <i v-else-if="isPayloadRevision(entry.event)" class="pi pi-history text-muted text-[0.75rem]" aria-hidden="true"></i>
                <span v-if="actorDisplayName(entry.event)" class="inline-flex min-w-0 items-center gap-1" :title="actorTitle(entry.event)">
                  <span class="truncate text-muted">{{ actorDisplayName(entry.event) }}</span>
                  <Button
                    v-if="actorUserId(entry.event)"
                    icon="pi pi-comments"
                    text
                    rounded
                    size="small"
                    :aria-label="$t('support.openChat')"
                    @click.stop="openActorChat(entry.event)"
                  />
                </span>
                <time
                  v-if="formatTime(entry.event.timestamp)"
                  class="ml-auto text-right text-muted text-supporting"
                  :datetime="dateTimeAttribute(entry.event.timestamp)"
                >
                  {{ formatTime(entry.event.timestamp) }}
                </time>
              </div>
              <div
                v-if="eventNote(entry.event) || eventAttachments(entry.event).length || eventSnapshots(entry.event).length || fieldChangesOf(entry.event).length || payloadRevisionOf(entry.event)"
                class="min-w-0"
              >
                <div v-if="payloadRevisionOf(entry.event)" class="flex min-w-0 flex-wrap items-center gap-2">
                  <small class="text-muted">{{ payloadReasonLabel(payloadRevisionOf(entry.event)) }}</small>
                  <Tag v-if="payloadRevisionOf(entry.event).revision?.number != null" :value="`v${payloadRevisionOf(entry.event).revision.number}`" />
                  <small v-if="payloadRevisionOf(entry.event).restoredFrom?.number != null" class="text-muted">
                    {{ $t('revision.restoredFrom', { n: payloadRevisionOf(entry.event).restoredFrom.number }) }}
                  </small>
                </div>
                <div v-if="fieldChangesOf(entry.event).length" class="flex min-w-0 flex-col gap-1">
                  <small
                    v-for="change in fieldChangesOf(entry.event)"
                    :key="`${entry.key}-${change.field}`"
                    class="inline-flex min-w-0 flex-wrap items-baseline gap-1 text-muted"
                  >
                    <span class="text-body">{{ fieldChangeLabel(change.field) }}</span>
                    <span class="text-muted">{{ formatChangeValue(change.from) }}</span>
                    <i class="pi pi-arrow-right text-[0.6rem]" aria-hidden="true"></i>
                    <span class="text-body">{{ formatChangeValue(change.to) }}</span>
                  </small>
                </div>
                <p v-if="eventNote(entry.event)" class="m-0 min-w-0 break-words italic text-body">
                  {{ eventNote(entry.event) }}
                </p>

                <div v-if="eventAttachments(entry.event).length" class="mt-2 flex min-w-0 flex-wrap gap-2">
                  <a
                    v-for="attachment in eventAttachments(entry.event)"
                    :key="`${entry.key}-${attachment.slot}-${attachment.label}`"
                    :href="attachment.url"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex min-w-0 items-center gap-1 text-[var(--ck-primary-ink)] no-underline text-body"
                  >
                    <i class="pi pi-paperclip shrink-0"></i>
                    <span class="truncate">{{ attachment.label }}</span>
                  </a>
                </div>

                <div v-if="eventSnapshots(entry.event).length" class="mt-2 flex min-w-0 flex-wrap gap-2">
                  <small
                    v-for="snapshot in eventSnapshots(entry.event)"
                    :key="`${entry.key}-${snapshot.key}`"
                    class="inline-flex min-w-0 items-center gap-1 text-muted"
                  >
                    <i class="pi pi-camera shrink-0"></i>
                    <span class="truncate">{{ snapshot.label }}: {{ snapshot.count }}</span>
                  </small>
                </div>
              </div>
            </div>
          </div>
          <div v-if="stateSteps.length > 1" class="flex items-center justify-end gap-1 pb-2 pl-1">
            <Button
              icon="pi pi-chevron-up"
              text
              rounded
              size="small"
              severity="secondary"
              :disabled="stepIndex === 0"
              :aria-label="$t('common.next')"
              data-history-nav="newer"
              @click.stop="activateCallback(stateSteps[stepIndex - 1].key)"
            />
            <Button
              icon="pi pi-chevron-down"
              text
              rounded
              size="small"
              severity="secondary"
              :disabled="stepIndex === stateSteps.length - 1"
              :aria-label="$t('common.back')"
              data-history-nav="older"
              @click.stop="activateCallback(stateSteps[stepIndex + 1].key)"
            />
          </div>
        </StepPanel>
      </StepItem>
    </Stepper>
  </div>
</template>
