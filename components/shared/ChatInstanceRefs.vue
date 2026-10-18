<template>
  <!-- The message's attached instance refs, sibling of ChatAttachments
       (the support feature README owns the contract): full mode stacks
       bordered cards on the page surface — the InstanceInlineRef compact
       card (preview band, identifier chip, state) where the type's
       compact surface carries one, a plain chip otherwise; singleLine is
       the inbox preview summary (type icon, name, overflow count). -->
  <span
    v-if="refs.length"
    :class="singleLine
      ? 'inline-flex max-w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden align-middle'
      : 'flex max-w-full flex-col items-start gap-1'"
    :data-testid="singleLine ? 'chat-instance-refs-summary' : 'chat-instance-refs'"
  >
    <template v-if="singleLine">
      <i :class="firstIcon" class="shrink-0 scale-90 text-muted" aria-hidden="true" />
      <span v-if="firstLabel" class="min-w-0 truncate text-inherit">{{ firstLabel }}</span>
      <span v-if="refs.length > 1" class="shrink-0 text-muted">+{{ refs.length - 1 }}</span>
    </template>
    <template v-else>
      <span
        v-for="ref in refs"
        :key="`${ref.type}-${ref.id}`"
        class="block w-full max-w-80 overflow-hidden rounded-ui border border-content-border bg-subtle p-1.5"
      >
        <InstanceInlineRef
          :type="ref.type"
          :id="ref.id"
          :entity="ref.instance || null"
          :fetch="canFetch(ref)"
          variant="compact"
          :allow-detail-route="!(viewerUserId && senderUserId && senderUserId !== viewerUserId && ref.chatOnlyForRecipient)"
        />
      </span>
    </template>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { useInstancesStore } from '~/stores/instances';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { instanceRecordTitle } from '~/utils/instance-shape.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';

const props = defineProps({
  refs: { type: Array, default: () => [] },
  // Recipient-scoped gating for chat-only snapshots (support README):
  // another sender's restricted refs keep their embedded snapshot and
  // lose the detail route; everything else hydrates freely.
  viewerUserId: { type: String, default: '' },
  senderUserId: { type: String, default: '' },
  singleLine: { type: Boolean, default: false }
});

const { t, te } = useI18n();
const instances = useInstancesStore();
const { typeById } = useFileTypeView();

const restrictedView = computed(() => Boolean(
  props.viewerUserId && props.senderUserId && props.senderUserId !== props.viewerUserId
));

const canFetch = (ref = {}) => !restrictedView.value || !ref.chatOnlyForRecipient;

const first = computed(() => props.refs[0] || null);
const firstIcon = computed(() => (first.value ? instances.iconFor(first.value.type) : 'pi pi-circle'));
// Naming law: the support README — empty names localize the type label.
const firstLabel = computed(() => {
  const ref = first.value || {};
  const typeView = ref.type ? typeById(ref.type) : null;
  const title = instanceRecordTitle(ref.instance || null, typeView);
  if (title) return title;
  const storedName = ref.label && ref.label !== String(ref.id) ? ref.label : '';
  return storedName || generatedEntityLabel(ref.type, { t, te });
});
</script>
