<template>
  <div>
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="design" variant="inline" icon="pi pi-clone" />
    </template>

    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
          <div class="flex items-center justify-between gap-4">
            <IdentityBlock :entity="design" variant="compact" />
            <Badge :value="Object.keys(design.parameters || {}).length" severity="secondary" size="small" />
          </div>
        </template>
      </StandardCard>
    </template>

    <template v-else>
      <StandardCard>
        <template #title>
          <div class="flex items-center justify-between gap-4">
            <IdentityBlock :entity="design" />
            <Badge :value="Object.keys(design.parameters || {}).length" severity="secondary" size="small" />
          </div>
        </template>
      </StandardCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Cassette Design View Component - v24 Standardized
 * CassetteDesign has no status — uses StandardCard, not EntityCard.
 */
import Badge from 'primevue/badge';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>
