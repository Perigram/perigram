<template>
  <div>
    <template v-if="variant === 'inline'">
      <Chip>
        <div class="w-3 h-3 rounded-full shrink-0" :style="swatchStyle" />
        <IdentityBlock :entity="color" variant="compact" />
      </Chip>
    </template>

    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="color" entity-type="color" variant="compact" class="card-interactive" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex items-center gap-4 min-w-0">
                <div class="w-6 h-6 rounded-full border shrink-0" :style="swatchStyle"></div>
                <IdentityBlock :entity="color" variant="compact" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ color.serial || hexCode || '—' }}</small>
        </template>
      </EntityCard>
    </template>

    <template v-else-if="variant === 'card'">
      <EntityCard :entity="color" entity-type="color" variant="card" class="card-interactive" :show-trace="false" :show-status="false">
        <template #header>
            <div class="h-32 w-full" :style="swatchStyle"></div>
        </template>
        <template #title>
            <IdentityBlock :entity="color" />
        </template>
        <Divider />
        <div class="flex justify-end items-center gap-4">
            <small>{{ hexCode || '—' }}</small>
        </div>
      </EntityCard>
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
import EntityCard from '~/components/shared/EntityCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';

const props = defineProps({
  color: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const hexCode = computed(() => props.color.data?.visuals?.hexCode || null);
const swatchStyle = computed(() => (hexCode.value ? { backgroundColor: hexCode.value } : undefined));
</script>
