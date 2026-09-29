<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';

const TOKEN_PATTERN = /\{\{instance:([^:}]+):([^}]+)\}\}/g;

const props = defineProps({
  message: { type: Object, required: true },
  viewerUserId: { type: String, default: '' },
  // Preview mode for inbox rows: everything renders on one line and crops,
  // with text spans carrying the ellipsis.
  singleLine: { type: Boolean, default: false }
});

const { t } = useI18n();

const refsByKey = computed(() => {
  const refs = new Map();
  for (const ref of props.message.instanceRefs || []) {
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
    const typeId = match[1];
    const id = match[2];
    result.push({
      type: 'instance',
      typeId,
      id,
      ref: refsByKey.value.get(`${typeId}:${id}`) || { type: typeId, id }
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) result.push({ type: 'text', value: text.slice(lastIndex) });
  return result.length ? result : [{ type: 'text', value: text }];
});

const trailingRefs = computed(() => (props.message.instanceRefs || [])
  .filter(ref => ref?.type && ref?.id && !props.message.message?.includes(`{{instance:${ref.type}:${ref.id}}}`)));

const voiceMessage = computed(() => props.message.attachment?.kind === 'audio');

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;

const renderParts = computed(() => parts.value.flatMap(part => (
  part.type === 'text' ? withLinks(part.value) : [part]
)));

/**
 * Text parts split into plain spans and safe http(s) anchors; trailing
 * punctuation peels off the link and stays text.
 */
const withLinks = (text) => {
  const result = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const url = raw.replace(/[.,;:!?)\]]+$/, '');
    if (match.index > lastIndex) result.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    if (url) result.push({ type: 'link', value: url });
    const trailing = raw.length - url.length;
    if (trailing > 0) result.push({ type: 'text', value: raw.slice(url.length) });
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) result.push({ type: 'text', value: text.slice(lastIndex) });
  return result;
};

const refNeedsHydration = (ref = {}) => {
  if (!ref.instance || typeof ref.instance !== 'object') return true;
  if (ref.type === 'cassette') {
    const data = ref.instance.data || {};
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
  <span
    :class="singleLine
      ? 'inline-flex max-w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden align-middle'
      : 'inline-flex max-w-full min-w-0 flex-wrap items-center gap-1 align-middle'"
  >
    <span v-if="voiceMessage" class="inline-flex min-w-0 shrink-0 items-center gap-1">
      <i class="pi pi-microphone shrink-0" aria-hidden="true" />
    </span>
    <template v-for="(part, index) in renderParts" :key="`${part.type}-${index}-${part.id || part.value}`">
      <a
        v-if="part.type === 'link'"
        :href="part.value"
        target="_blank"
        rel="noopener noreferrer"
        :class="singleLine
          ? 'min-w-0 truncate text-inherit underline'
          : 'min-w-0 break-all text-inherit underline [overflow-wrap:anywhere] hover:opacity-80'"
      >{{ part.value }}</a>
      <span
        v-else-if="part.type === 'text'"
        :class="singleLine
          ? 'min-w-0 truncate'
          : 'min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]'"
      >{{ part.value }}</span>
      <InstanceInlineRef
        v-else
        :type="part.typeId"
        :id="part.id"
        :entity="part.ref.instance || null"
        :fetch="canFetchRef(part.ref)"
        :allow-detail-route="!(viewerUserId && message.senderUserId && message.senderUserId !== viewerUserId && part.ref.chatOnlyForRecipient)"
        class="max-w-full"
      />
    </template>
    <InstanceInlineRef
      v-for="ref in trailingRefs"
      :key="`${ref.type}-${ref.id}`"
      :type="ref.type"
      :id="ref.id"
      :entity="ref.instance || null"
      :fetch="canFetchRef(ref)"
      :allow-detail-route="!(viewerUserId && message.senderUserId && message.senderUserId !== viewerUserId && ref.chatOnlyForRecipient)"
      class="max-w-full"
    />
  </span>
</template>
