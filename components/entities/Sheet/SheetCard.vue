<script setup>
/**
 * SheetCard - v24 Standardized
 */
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import StandardCard from '~/components/shared/StandardCard.vue';

const props = defineProps({
  sheet: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>

<template>
  <div class="h-full">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="sheet" variant="inline" icon="pi pi-file" />
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <div class="flex items-center justify-between gap-4">
            <IdentityBlock :entity="sheet" variant="compact" />
            <EntityStatus :entity="sheet" entity-type="sheet" variant="inline" />
        </div>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #header>
            <TraceChain :entity="sheet" />
        </template>
        <template #title>
            <div class="flex justify-between items-start gap-4">
                <IdentityBlock :entity="sheet"  />
                <EntityStatus :entity="sheet" entity-type="sheet" variant="inline" />
            </div>
        </template>
        
        <SpecsBlock :entity="sheet" />
      </StandardCard>
    </template>
  </div>
</template>