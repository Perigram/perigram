<template>
  <div>
    <EntityCard :entity="design" entity-type="cassetteDesign" :variant="variant">
      <template #compact-content>
        <Badge :value="Object.keys(design.parameters || {}).length" severity="secondary" size="small" />
      </template>
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * Cassette Design View Component - v24 Standardized
 */
import Badge from 'primevue/badge';
import EntityCard from '~/components/shared/EntityCard.vue';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>
