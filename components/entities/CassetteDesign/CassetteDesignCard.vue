<template>
  <div>
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-pencil"></i>
        <IdentityBlock :entity="design" variant="compact" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="design" variant="compact" />
                <Badge :value="Object.keys(design.parameters || {}).length" severity="secondary" />
            </div>
        </template>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="design" />
                <small>Baked Design</small>
            </div>
        </template>
        <Divider />
        <div class="flex justify-center">
            <i class="pi pi-pencil"></i>
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

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>