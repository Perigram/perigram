<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <div class="w-4 h-4 rounded-full border" :style="{ backgroundColor: color.visuals?.hexCode || '#ccc' }"></div>
        <span>{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card>
        <template #title>
            <div class="flex items-center gap-4">
                <div class="w-6 h-6 rounded-full border" :style="{ backgroundColor: color.visuals?.hexCode || '#ccc' }"></div>
                <span class="truncate">{{ name }}</span>
            </div>
        </template>
        <template #subtitle>
            <small>{{ color.identity?.serial }}</small>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card class="overflow-hidden">
        <template #header>
            <div class="h-32 w-full" :style="{ backgroundColor: color.visuals?.hexCode || '#ccc' }"></div>
        </template>
        <template #title>
            <span class="truncate">{{ name }}</span>
        </template>
        <template #content>
            <Divider />
            <div class="flex justify-between items-center">
                <small>{{ color.identity?.serial }}</small>
                <small>{{ color.visuals?.hexCode }}</small>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<script setup>
/**
 * Color View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Divider from 'primevue/divider';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  color: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name } = useIdentity(props.color);
</script>