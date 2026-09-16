<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';

const TOKEN_PATTERN = /\{\{entity:([^:}]+):([^}]+)\}\}/g;

const props = defineProps({
  message: { type: Object, required: true },
  viewerUserId: { type: String, default: '' }
});

const { t } = useI18n();

const refsByKey = computed(() => {
  const refs = new Map();
  for (const ref of props.message.entityRefs || []) {
    if (ref?.type && ref?.id) refs.set(`${ref.type}:${ref.id}`, ref);
  }
  return refs;
});

const parts = computed(() => {
  const text = props.message.message || '';
  const result = [];
  let lastIndex = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    if (match.index > lastIndex) {
      result.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const entityType = match[1];
    const id = match[2];
    result.push({
      type: 'entity',
      entityType,
      id,
      ref: refsByKey.value.get(`${entityType}:${id}`) || { type: entityType, id }
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) result.push({ type: 'text', value: text.slice(lastIndex) });
  return result.length ? result : [{ type: 'text', value: text }];
});

const trailingRefs = computed(() => (props.message.entityRefs || [])
  .filter(ref => ref?.type && ref?.id && !props.message.message?.includes(`{{entity:${ref.type}:${ref.id}}}`)));

const voiceMessage = computed(() => props.message.attachment?.kind === 'audio');

const refNeedsHydration = (ref = {}) => {
  if (!ref.entity || typeof ref.entity !== 'object') return true;
  if (ref.type === 'cassette') {
    const data = ref.entity.data || {};
    return !data.type && !data.definition && !data.geometry && !data.layerData && !data.polygonParts;
  }
  return false;
};

const canFetchRef = (ref = {}) => {
  const isRestrictedRecipientView = Boolean(
    props.viewerUserId
    && props.message.senderUserId
    && props.message.senderUserId !== props.viewerUserId
    && ref.chatOnlyForRecipient
  );
  return !isRestrictedRecipientView && refNeedsHydration(ref);
};
</script>

<template>
  <!-- min-w-0/[overflow-wrap:anywhere] chain: the inline-flex root and its
       text items must shrink below their longest word, otherwise unbroken
       strings (urls, serials) push bubbles past the chat bounds. -->
  <span class="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1 align-middle">
    <span v-if="voiceMessage" class="inline-flex min-w-0 shrink-0 items-center gap-1">
      <i class="pi pi-microphone shrink-0" aria-hidden="true" />
      <span class="whitespace-nowrap">{{ t('support.voiceMessage') }}</span>
    </span>
    <template v-for="(part, index) in parts" :key="`${part.type}-${index}-${part.id || part.value}`">
      <span v-if="part.type === 'text'" class="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{{ part.value }}</span>
      <EntityInlineRef
        v-else
        :type="part.entityType"
        :id="part.id"
        :entity="part.ref.entity || null"
        :fetch="canFetchRef(part.ref)"
        :allow-detail-route="!(viewerUserId && message.senderUserId && message.senderUserId !== viewerUserId && part.ref.chatOnlyForRecipient)"
        class="max-w-full"
      />
    </template>
    <EntityInlineRef
      v-for="ref in trailingRefs"
      :key="`${ref.type}-${ref.id}`"
      :type="ref.type"
      :id="ref.id"
      :entity="ref.entity || null"
      :fetch="canFetchRef(ref)"
      :allow-detail-route="!(viewerUserId && message.senderUserId && message.senderUserId !== viewerUserId && ref.chatOnlyForRecipient)"
      class="max-w-full"
    />
  </span>
</template>
