<script setup>
/**
 * SheetCard - v24 Standardized
 */
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import StatusEntity from '~/components/shared/blocks/StatusEntity.vue';
import LineageBlock from '~/components/shared/blocks/LineageBlock.vue';
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
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-file"></i>
        <IdentityBlock :entity="sheet" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <div class="flex items-center justify-between gap-4">
            <IdentityBlock :entity="sheet" variant="compact" />
            <StatusEntity :entity="sheet" entity-type="sheet" variant="inline" />
        </div>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #header>
            <LineageBlock :entity="sheet" />
        </template>
        <template #title>
            <div class="flex justify-between items-start gap-4">
                <IdentityBlock :entity="sheet" />
                <StatusEntity :entity="sheet" entity-type="sheet" variant="inline" />
            </div>
        </template>
        
        <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
                <small>Dimensions</small>
                <span>{{ sheet.data?.specs?.width }} x {{ sheet.data?.specs?.length }}</span>
            </div>
        </div>
      </StandardCard>
    </template>
  </div>
</template>