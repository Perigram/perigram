<template>
  <template v-for="(block, index) in blocks" :key="index">
    <div v-if="block.type === 'markdown'" class="ck-markdown-body" v-html="renderedOf(block)" />
    <ViewEmbed
      v-else
      :view-id="block.id || ''"
      :type-id="block.typeId || ''"
      :fallback-name="block.name"
    />
  </template>
</template>

<script setup>
// The read presentation of authored markdown (SPEC §26): the one
// pipeline renders the prose, live view embeds compose the view fences —
// every authored surface reads through this composition.
import { computed } from 'vue';
import { renderMarkdown, splitViewEmbeds } from '#shared/markdown.js';
import ViewEmbed from './ViewEmbed.vue';

const props = defineProps({
  source: { type: String, default: '' }
});

const blocks = computed(() => splitViewEmbeds(props.source));
const renderedOf = block => renderMarkdown(block.text);
</script>
