<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <div class="w-4 h-4 rounded-full border" :style="{ backgroundColor: pen.stroke?.color || '#000' }"></div>
        <span>{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card class="card-interactive">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="w-6 h-6 rounded-full border" :style="{ backgroundColor: pen.stroke?.color || '#000' }"></div>
                    <span class="truncate">{{ name }}</span>
                </div>
                <Tag :value="`${pen.stroke?.weight}px`" severity="secondary" />
            </div>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card class="card-interactive">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ name }}</span>
                <div class="w-8 h-8 rounded-full border" :style="{ backgroundColor: pen.stroke?.color || '#000' }"></div>
            </div>
        </template>
        <template #content>
            <Divider />
            <div class="flex flex-col gap-2">
                <div class="flex justify-between items-center">
                    <small>Color</small>
                    <span>{{ pen.stroke?.color }}</span>
                </div>
                <div class="flex justify-between items-center">
                    <small>Weight</small>
                    <span>{{ pen.stroke?.weight }} px</span>
                </div>
                <div class="flex justify-between items-center">
                    <small>Pattern</small>
                    <span>{{ pen.stroke?.pattern }}</span>
                </div>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<script setup>
/**
 * Pen Template View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Divider from 'primevue/divider';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  pen: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name } = useIdentity(props.pen);
</script>
