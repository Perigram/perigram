<script setup>
/**
 * Sheet Design View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>

<template>
  <div>
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="design" variant="inline" icon="pi pi-map" />
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard class="card-interactive">
        <div class="flex items-center justify-between gap-4">
            <IdentityBlock :entity="design" variant="compact" />
            <EntityStatus :entity="design" entity-type="sheet_design" variant="inline" />
        </div>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard class="card-interactive">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="design" />
                <EntityStatus :entity="design" entity-type="sheet_design" variant="inline" />
            </div>
        </template>
        <Divider />
        <SpecsBlock :entity="design" />
      </StandardCard>
    </template>
  </div>
</template>
