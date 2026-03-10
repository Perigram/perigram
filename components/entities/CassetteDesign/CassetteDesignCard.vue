<template>
  <div>
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="design" variant="inline" icon="pi pi-pencil" />
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="design" variant="compact" />
                <Badge :value="Object.keys(design.parameters || {}).length" severity="secondary" size="small" />
            </div>
        </template>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #header>
            <TraceChain :entity="design" />
        </template>
        <template #title>
            <IdentityBlock :entity="design" />
        </template>
        <Divider />
        <div class="flex justify-center opacity-30">
            <i class="pi pi-pencil text-4xl"></i>
        </div>
      </StandardCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Cassette Design View Component - v24 Standardized
 */
import Badge from 'primevue/badge';
import Divider from 'primevue/divider';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>