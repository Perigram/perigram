<script setup>
/**
 * Layer Standard View Component - v24 Standardized
 */
import Badge from 'primevue/badge';
import PenTemplateView from '../PenTemplate/PenTemplateView.vue';

const props = defineProps({
  standard: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

// Mock pen object if we only have ID
const defaultPen = computed(() => {
    if (!props.standard.defaultPenId) return null;
    return {
        _id: props.standard.defaultPenId,
        identity: { name: 'Default Pen' },
        stroke: { color: props.standard.metadata?.color || '#000', weight: 1, pattern: 'SOLID' }
    };
});
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline View -->
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full border" :style="{ backgroundColor: standard.metadata?.color || '#ccc' }"></div>
        <span class="font-bold text-xs">{{ standard.code }}</span>
      </div>
    </template>

    <!-- Compact View -->
    <template v-else-if="variant === 'compact'">
      <div class="flex items-center justify-between gap-4 p-2 border rounded-lg">
        <div class="flex items-center gap-3">
            <div class="w-6 h-6 rounded border flex items-center justify-center" :style="{ borderColor: standard.metadata?.color || '#ccc' }">
                <i class="pi pi-palette text-[10px]" :style="{ color: standard.metadata?.color || '#ccc' }"></i>
            </div>
            <div class="flex flex-col">
                <span class="text-sm font-bold">{{ standard.identity?.name }}</span>
                <span class="text-[10px] opacity-50">{{ standard.code }}</span>
            </div>
        </div>
      </div>
    </template>

    <!-- Card View -->
    <template v-else-if="variant === 'card'">
      <Card>
        <template #title>
            <div class="flex justify-between items-start">
                <div class="flex flex-col gap-1">
                    <span class="text-xl font-bold">{{ standard.identity?.name }}</span>
                    <span class="text-xs font-mono opacity-50">{{ standard.code }}</span>
                </div>
                <Badge :value="standard.category" severity="secondary" />
            </div>
        </template>
        <template #content>
            <div class="flex flex-col gap-4 mt-2">
                <div class="flex flex-col gap-2">
                    <small class="font-bold opacity-40 uppercase tracking-widest text-[10px]">Default Pen</small>
                    <PenTemplateView v-if="defaultPen" :pen="defaultPen" variant="compact" />
                    <span v-else class="text-xs italic opacity-50">No default pen assigned</span>
                </div>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>
