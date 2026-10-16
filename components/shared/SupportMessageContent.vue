<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { renderMarkdown } from '#shared/markdown.js';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';

const TOKEN_PATTERN = /\{\{instance:([^:}]+):([^}]+)\}\}/g;

const props = defineProps({
  message: { type: Object, required: true },
  viewerUserId: { type: String, default: '' },
  // Preview mode for inbox rows: everything renders on one line and crops,
  // with text spans carrying the ellipsis.
  singleLine: { type: Boolean, default: false },
  // Agent answers render through the shared markdown pipeline (see
  // shared/markdown.js) instead of plain spans.
  markdown: { type: Boolean, default: false }
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

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;

// Preview mode (singleLine) keeps URLs as plain text: the preview row is
// itself the click target that opens the conversation, so anchors there
// would steal clicks and navigate away from the list.
const renderParts = computed(() => {
  if (props.singleLine) return parts.value;
  return parts.value.flatMap(part => {
    if (part.type !== 'text') return [part];
    // Markdown rendering is client-side (the shared pipeline renders ''
    // without a DOM); SSR paints the plain text and hydration formats it.
    if (props.markdown) {
      const html = renderMarkdown(part.value);
      if (html) return [{ type: 'html', value: html }];
    }
    return withLinks(part.value);
  });
});

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
       strings (urls, serials) push bubbles past the chat bounds. Markdown
       answers are document content, not inline chips: they render as a
       full-width block column so lists and headings lay out properly. -->
  <span
    :class="singleLine
      ? 'inline-flex max-w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden align-middle'
      : markdown
        ? 'flex w-full min-w-0 flex-col items-start gap-1 text-body'
        : 'inline-flex max-w-full min-w-0 flex-wrap items-center gap-1 align-middle'"
  >
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
      <!-- eslint-disable-next-line vue/no-v-html -- sanitized by the shared markdown pipeline -->
      <span
        v-else-if="part.type === 'html'"
        class="block w-full min-w-0 max-w-full break-words text-prose
          [&_>*:first-child]:mt-0 [&_>*:last-child]:mb-0
          [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_blockquote]:my-2 [&_table]:my-2 [&_pre]:my-2
          [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-3 [&_h4]:mt-3
          [&_h1]:mb-1.5 [&_h2]:mb-1.5 [&_h3]:mb-1.5 [&_h4]:mb-1.5
          [&_h1]:text-editor [&_h2]:text-editor
          [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5
          [&_hr]:my-3 [&_hr]:border-chrome-border
          [&_code]:text-technical [&_code]:bg-subtle [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
          [&_pre]:text-technical [&_pre]:bg-subtle [&_pre]:p-3 [&_pre]:rounded-ui [&_pre]:overflow-x-auto
          [&_pre_code]:bg-transparent [&_pre_code]:p-0
          [&_blockquote]:border-l-2 [&_blockquote]:border-chrome-border [&_blockquote]:pl-3
          [&_table]:w-full [&_table]:border-collapse
          [&_th]:border [&_th]:border-chrome-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:align-top [&_th]:bg-subtle
          [&_td]:border [&_td]:border-chrome-border [&_td]:px-2 [&_td]:py-1 [&_td]:text-left [&_td]:align-top
          [&_a]:underline [&_img]:max-w-full"
        v-html="part.value"
      />
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

