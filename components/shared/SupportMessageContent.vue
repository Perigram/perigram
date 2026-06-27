<script setup>
import { computed } from 'vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';

const TOKEN_PATTERN = /\{\{entity:([^:}]+):([^}]+)\}\}/g;

const props = defineProps({
  message: { type: Object, required: true }
});

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
</script>

<template>
  <span class="inline-flex min-w-0 flex-wrap items-center gap-1 align-middle">
    <template v-for="(part, index) in parts" :key="`${part.type}-${index}-${part.id || part.value}`">
      <span v-if="part.type === 'text'" class="whitespace-pre-wrap break-words">{{ part.value }}</span>
      <EntityInlineRef
        v-else
        :type="part.entityType"
        :id="part.id"
        class="max-w-full"
      />
    </template>
    <EntityInlineRef
      v-for="ref in trailingRefs"
      :key="`${ref.type}-${ref.id}`"
      :type="ref.type"
      :id="ref.id"
      class="max-w-full"
    />
  </span>
</template>
