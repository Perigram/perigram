<template>
  <div v-if="visibleRelations.length" class="flex flex-wrap gap-2">
    <EntityInlineRef
      v-for="relation in visibleRelations"
      :key="`${relation.path}:${relation.value}`"
      :type="relation.entityType"
      :id="relation.value"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { resolveDataPath } from '~/utils/data-display.js';

const props = defineProps({
  entity: { type: Object, required: true },
  fields: { type: Array, default: () => [] }
});

const visibleRelations = computed(() => props.fields
  .filter(field => field.display === 'entityRef' && field.entityType)
  .map(field => ({
    ...field,
    value: resolveDataPath(props.entity, field.path)
  }))
  .filter(relation => relation.value)
);
</script>
