<script setup>
/**
 * Color View Component - v24 Standardized
 */
import Card from 'primevue/card';

const props = defineProps({
  color: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name, reference } = useIdentity(props.color);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full border border-surface" :style="{ backgroundColor: color.visuals?.hexCode || '#ccc' }"></div>
        <span class="text-xs font-bold">{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <div class="flex items-center gap-3 p-2 border rounded-full bg-surface-0 dark:bg-surface-900 pr-4">
        <div class="w-6 h-6 rounded-full border" :style="{ backgroundColor: color.visuals?.hexCode || '#ccc' }"></div>
        <div class="flex flex-col">
            <span class="text-xs font-bold leading-none">{{ name }}</span>
            <small class="text-[9px] opacity-50 uppercase tracking-tighter">{{ color.identity?.serial }}</small>
        </div>
      </div>
    </template>

    <template v-else-if="variant === 'card'">
      <Card class="overflow-hidden">
        <template #header>
            <div class="h-24 w-full" :style="{ backgroundColor: color.visuals?.hexCode || '#ccc' }"></div>
        </template>
        <template #content>
            <div class="flex flex-col gap-1">
                <span class="font-bold text-lg">{{ name }}</span>
                <div class="flex justify-between items-center">
                    <span class="text-xs opacity-50 font-mono">{{ color.identity?.serial }}</span>
                    <span class="text-xs font-bold opacity-50">{{ color.visuals?.hexCode }}</span>
                </div>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>
