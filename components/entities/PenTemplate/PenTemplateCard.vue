<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <Chip>
        <div class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: pen.stroke?.color || '#000' }" />
        <span>{{ pen.identity?.name }}</span>
      </Chip>
    </template>

    <template v-else-if="variant === 'compact'">
      <StandardCard class="card-interactive">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="w-6 h-6 rounded-full border" :style="{ backgroundColor: pen.stroke?.color || '#000' }"></div>
                    <IdentityBlock :entity="pen" variant="compact" />
                </div>
                <Tag v-if="pen.stroke?.weight" :value="`${pen.stroke.weight}px`" severity="secondary" size="small" />
            </div>
        </template>
      </StandardCard>
    </template>

    <template v-else-if="variant === 'card'">
      <StandardCard class="card-interactive">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="pen" />
                <div class="w-8 h-8 rounded-full border shrink-0" :style="{ backgroundColor: pen.stroke?.color || '#000' }"></div>
            </div>
        </template>
        <Divider />
        <DataBlock :entity="pen" :fields="PEN_TEMPLATE_FIELDS" />
      </StandardCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Pen Template View Component - v24 Standardized
 */
import Tag from 'primevue/tag';
import Chip from 'primevue/chip';
import Divider from 'primevue/divider';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { PEN_TEMPLATE_FIELDS } from '~/constants/entityFields';

const props = defineProps({
  pen: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>
