<template>
  <div>
    <EntityCard :entity="color" entity-type="color" :variant="variant" class="card-interactive" :show-trace="false" :show-status="false">
      <template #header>
        <div class="h-32 w-full" :style="swatchStyle"></div>
      </template>
      <template #before-identity>
        <div class="w-6 h-6 rounded-full border shrink-0" :style="swatchStyle"></div>
      </template>
      <template #subtitle>
        <small>{{ color.data?.code || color.identity?.serial || hexCode || '—' }}</small>
      </template>
      <Divider />
      <div class="flex justify-between items-center gap-4">
        <small class="text-muted-color">{{ $t('catalog.colorCode') }}</small>
        <span class="font-medium">{{ color.data?.code || color.identity?.serial || hexCode || '—' }}</span>
      </div>
      <div class="flex justify-between items-center gap-4 mt-2">
        <small class="text-muted-color">{{ $t('assets.color') }}</small>
        <span class="font-mono">{{ hexCode || '—' }}</span>
      </div>
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * Color View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';

const props = defineProps({
  color: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const hexCode = computed(() => props.color.data?.visuals?.hexCode || null);
const swatchStyle = computed(() => (hexCode.value ? { backgroundColor: hexCode.value } : undefined));
</script>
