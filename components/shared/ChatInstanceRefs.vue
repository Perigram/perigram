<template>
  <!-- The message's attached instance refs, sibling of ChatAttachments
       (the support feature README owns the contract): full mode renders
       the refs as inline-ref chips in a wrapping row on the page
       surface — never inside a contrast bubble; singleLine is the inbox
       preview summary (type icon, name, overflow count). -->
  <span
    v-if="refs.length"
    :class="singleLine
      ? 'inline-flex max-w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden align-middle'
      : 'flex max-w-full flex-wrap items-center gap-1'"
    :data-testid="singleLine ? 'chat-instance-refs-summary' : 'chat-instance-refs'"
  >
    <template v-if="singleLine">
      <i :class="firstIcon" class="shrink-0 text-muted" aria-hidden="true" />
      <span v-if="firstLabel" class="min-w-0 truncate text-inherit">{{ firstLabel }}</span>
      <span v-if="refs.length > 1" class="shrink-0 text-muted">+{{ refs.length - 1 }}</span>
    </template>
    <template v-else>
      <InstanceInlineRef
        v-for="ref in refs"
        :key="`${ref.type}-${ref.id}`"
        :type="ref.type"
        :id="ref.id"
        :entity="ref.instance || null"
        :fetch="canFetch(ref)"
        :allow-detail-route="!(viewerUserId && senderUserId && senderUserId !== viewerUserId && ref.chatOnlyForRecipient)"
      />
    </template>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { useInstancesStore } from '~/stores/instances';

const props = defineProps({
  refs: { type: Array, default: () => [] },
  // Recipient-scoped gating for chat-only snapshots (support README):
  // another sender's restricted refs keep their embedded snapshot and
  // lose the detail route; everything else hydrates freely.
  viewerUserId: { type: String, default: '' },
  senderUserId: { type: String, default: '' },
  singleLine: { type: Boolean, default: false }
});

const instances = useInstancesStore();

const restrictedView = computed(() => Boolean(
  props.viewerUserId && props.senderUserId && props.senderUserId !== props.viewerUserId
));

const canFetch = (ref = {}) => !restrictedView.value || !ref.chatOnlyForRecipient;

const first = computed(() => props.refs[0] || null);
const firstIcon = computed(() => (first.value ? instances.iconFor(first.value.type) : 'pi pi-circle'));
const firstLabel = computed(() => first.value?.instance?.identity?.name
  || first.value?.label
  || '');
</script>
