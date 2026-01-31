<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline View -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <div class="w-3.5 h-3.5 rounded-full border" :style="{ backgroundColor: standard.metadata?.color || '#ccc' }"></div>
        <span>{{ standard.code }}</span>
      </div>
    </template>

    <!-- Compact View -->
    <template v-else-if="variant === 'compact'">
      <Card>
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-palette" :style="{ color: standard.metadata?.color || '#ccc' }"></i>
                    <span class="truncate">{{ standard.identity?.name }}</span>
                </div>
                <Badge :value="standard.category" severity="secondary" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ standard.code }}</small>
        </template>
      </Card>
    </template>

    <!-- Card View -->
    <template v-else-if="variant === 'card'">
      <Card>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ standard.identity?.name }}</span>
                <Badge :value="standard.category" severity="secondary" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ standard.code }}</small>
        </template>
        <template #content>
            <Divider />
            <div class="flex flex-col gap-2">
                <small>Default Pen</small>
                <PenTemplateCard v-if="defaultPen" :pen="defaultPen" variant="compact" />
                <p v-else class="italic">No default pen assigned</p>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<script setup>
/**
 * Layer Standard View Component - v24 Standardized
 */
import { computed } from 'vue';
import Card from 'primevue/card';
import Badge from 'primevue/badge';
import Divider from 'primevue/divider';
import PenTemplateCard from '../PenTemplate/PenTemplateCard.vue';

const props = defineProps({
  standard: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const defaultPen = computed(() => {
    if (!props.standard.defaultPenId) return null;
    return {
        _id: props.standard.defaultPenId,
        identity: { name: 'Default Pen' },
        stroke: { color: props.standard.metadata?.color || '#000', weight: 1, pattern: 'SOLID' }
    };
});
</script>