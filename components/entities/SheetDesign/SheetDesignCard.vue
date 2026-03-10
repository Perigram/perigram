<script setup>
/**
 * Sheet Design View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import { useIdentity, useSpecs } from '~/composables/useBlocks';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name, serial } = useIdentity(props.design);
const { formattedDimensions } = useSpecs(props.design);
</script>

<template>
  <div>
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-map"></i>
        <IdentityBlock :entity="design" variant="compact" />
      </div>
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
        <div class="flex flex-col gap-6">
            <div class="aspect-[2/1] border border-dashed rounded flex items-center justify-center opacity-20 italic">
                {{ serial }}
            </div>
            <div v-if="formattedDimensions" class="flex justify-between items-center">
                <small>{{ $t('common.dimensions') }}</small>
                <span>{{ formattedDimensions }}</span>
            </div>
        </div>
      </StandardCard>
    </template>
  </div>
</template>
