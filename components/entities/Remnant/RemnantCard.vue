<script setup>
/**
 * RemnantCard - v24 Standardized
 */
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import StandardCard from '~/components/shared/StandardCard.vue';
import { useSpecs } from '~/composables/useBlocks';

const props = defineProps({
  remnant: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { formattedArea } = useSpecs(props.remnant);
</script>

<template>
  <div class="h-full">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="remnant" variant="inline" icon="pi pi-undo" />
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col gap-1 min-w-0">
                <IdentityBlock :entity="remnant" variant="compact" />
                <small>{{ formattedArea }}</small>
            </div>
            <EntityStatus :entity="remnant" entity-type="remnant" variant="inline" />
        </div>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #header>
            <TraceChain :entity="remnant" />
        </template>
        <template #title>
            <div class="flex justify-between items-start gap-4">
                <IdentityBlock :entity="remnant"  />
                <EntityStatus :entity="remnant" entity-type="remnant" variant="inline" />
            </div>
        </template>
        
        <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
                <small>Area</small>
                <span>{{ formattedArea }}</span>
            </div>
        </div>
      </StandardCard>
    </template>
  </div>
</template>