<script setup>
import { computed } from 'vue';
import { renderMarkdown } from '#shared/markdown.js';
import { stripInstanceTokens } from '#shared/instance-tokens.js';

const props = defineProps({
  message: { type: Object, required: true },
  // Preview mode for inbox rows: everything renders on one line and crops,
  // with text spans carrying the ellipsis.
  singleLine: { type: Boolean, default: false },
  // Agent answers render through the shared markdown pipeline (see
  // shared/markdown.js) instead of plain spans.
  markdown: { type: Boolean, default: false }
});

const text = computed(() => stripInstanceTokens(props.message.message || ''));

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;

// Preview mode keeps URLs as plain text: the preview row is itself the
// click target that opens the conversation, so anchors there would steal
// clicks and navigate away from the list.
const renderParts = computed(() => {
  if (props.singleLine) return [{ type: 'text', value: text.value }];
  if (props.markdown) {
    const html = renderMarkdown(text.value);
    // The shared pipeline renders '' without a DOM: SSR paints the plain
    // text and hydration swaps in the formatted document.
    if (html) return [{ type: 'html', value: html }];
    return withLinks(text.value);
  }
  return withLinks(text.value);
});

/**
 * Text parts split into plain spans and safe http(s) anchors; trailing
 * punctuation peels off the link and stays text.
 */
function withLinks(value) {
  const result = [];
  let lastIndex = 0;
  for (const match of value.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const url = raw.replace(/[.,;:!?)\]]+$/, '');
    if (match.index > lastIndex) result.push({ type: 'text', value: value.slice(lastIndex, match.index) });
    if (url) result.push({ type: 'link', value: url });
    const trailing = raw.length - url.length;
    if (trailing > 0) result.push({ type: 'text', value: raw.slice(url.length) });
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < value.length) result.push({ type: 'text', value: value.slice(lastIndex) });
  return result;
}
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
    <template v-for="(part, index) in renderParts" :key="`${part.type}-${index}`">
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
        class="ck-markdown block w-full min-w-0 max-w-full break-words text-prose"
        v-html="part.value"
      />
    </template>
  </span>
</template>
