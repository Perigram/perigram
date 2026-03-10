<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <Chip>
        <div class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: standard.metadata?.color || '#ccc' }" />
        <span>{{ standard.identity?.serial || standard.code }}</span>
      </Chip>
    </template>

    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-palette" :style="{ color: standard.metadata?.color || '#ccc' }"></i>
                    <IdentityBlock :entity="standard" variant="compact" />
                </div>
                <Badge v-if="standard.category" :value="standard.category" severity="secondary" />
            </div>
        </template>
      </StandardCard>
    </template>

    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="standard" />
                <Badge v-if="standard.category" :value="standard.category" severity="secondary" />
            </div>
        </template>
        <Divider />
        <div class="flex flex-col gap-2">
            <small>{{ $t('layerStandard.defaultPen') }}</small>
            <TraceLink v-if="standard.defaultPenId" type="penTemplate" :id="standard.defaultPenId" />
            <p v-else class="italic opacity-50">{{ $t('layerStandard.noDefaultPen') }}</p>
        </div>
      </StandardCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Layer Standard View Component - v24 Standardized
 */
import Badge from 'primevue/badge';
import Chip from 'primevue/chip';
import Divider from 'primevue/divider';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';

defineProps({
  standard: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>
