<script setup>
/**
 * Pen Template View Component - v24 Standardized
 */
import Card from 'primevue/card';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  pen: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name } = useIdentity(props.pen);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: pen.stroke?.color || '#000' }"></div>
        <span class="font-bold">{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card>
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="w-4 h-4 rounded-full" :style="{ backgroundColor: pen.stroke?.color || '#000' }"></div>
              <span class="font-bold">{{ name }}</span>
            </div>
            <small>{{ pen.stroke?.weight }}px</small>
          </div>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card>
        <template #title>
          <div class="flex justify-between items-center">
            <span class="font-bold">{{ name }}</span>
            <div class="w-6 h-6 rounded-full border shadow-inner" :style="{ backgroundColor: pen.stroke?.color || '#000' }"></div>
          </div>
        </template>
        <template #content>
            <div class="flex flex-col gap-2">
                <div class="flex justify-between">
                    <span>Color</span>
                    <span class="font-mono">{{ pen.stroke?.color }}</span>
                </div>
                <div class="flex justify-between">
                    <span>Weight</span>
                    <span class="font-bold">{{ pen.stroke?.weight }} px</span>
                </div>
                <div class="flex justify-between">
                    <span>Pattern</span>
                    <span class="font-bold">{{ pen.stroke?.pattern }}</span>
                </div>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>