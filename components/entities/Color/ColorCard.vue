<template>
  <div>
    <template v-if="variant === 'inline'">
      <Chip>
        <div class="w-3 h-3 rounded-full shrink-0" :style="swatchStyle" />
        <span>{{ color.identity?.name }}</span>
      </Chip>
    </template>

    <template v-else-if="variant === 'compact'">
      <StandardCard class="card-interactive">
        <template #title>
            <div class="flex items-center gap-4 min-w-0">
                <div class="w-6 h-6 rounded-full border shrink-0" :style="swatchStyle"></div>
                <IdentityBlock :entity="color" variant="compact" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ color.identity?.serial || hexCode || '—' }}</small>
        </template>
      </StandardCard>
    </template>

    <template v-else-if="variant === 'card'">
      <StandardCard class="card-interactive">
        <template #header>
            <div class="h-32 w-full" :style="swatchStyle"></div>
        </template>
        <template #title>
            <IdentityBlock :entity="color" />
        </template>
        <Divider />
        <div class="flex justify-between items-center gap-4">
            <small>{{ color.identity?.serial || '—' }}</small>
            <small>{{ hexCode || '—' }}</small>
        </div>
      </StandardCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Color View Component - v24 Standardized
 */
import { computed } from 'vue';
import Chip from 'primevue/chip';
import Divider from 'primevue/divider';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';

const props = defineProps({
  color: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const hexCode = computed(() => props.color.data?.visuals?.hexCode || null);
const swatchStyle = computed(() => (hexCode.value ? { backgroundColor: hexCode.value } : undefined));
</script>
