<template>
    <Card class="h-full">
        <template #title>
            <div class="flex justify-between items-start gap-4">
                <span class="text-lg font-bold">{{ catalog.name }}</span>
                <i class="pi pi-palette opacity-20 text-xl"></i>
            </div>
        </template>
        <template #subtitle>
            <span class="text-xs line-clamp-1">{{ catalog.description || 'Material Color Palette' }}</span>
        </template>
        <template #content>
            <div class="flex flex-wrap gap-2 mt-2">
                <template v-for="(type, idx) in displayedSheetTypes" :key="idx">
                    <div 
                        class="w-8 h-8 rounded border border-[var(--p-content-border-color)] shadow-sm overflow-hidden" 
                        :title="type.color"
                        :style="{ backgroundColor: type.colorFallback || '#ccc' }"
                    >
                        <img v-if="type.colorThumbnail" :src="type.colorThumbnail" class="w-full h-full object-cover" />
                    </div>
                </template>
                <div v-if="catalog.sheetTypes?.length > 4" class="w-8 h-8 rounded bg-[var(--p-surface-100)] border border-[var(--p-content-border-color)] flex items-center justify-center text-[10px] font-bold">
                    +{{ catalog.sheetTypes.length - 4 }}
                </div>
            </div>
        </template>
        <template #footer>
            <div class="flex justify-between items-center">
                <span class="text-[10px] font-black uppercase opacity-40">{{ catalog.sheetTypes?.length || 0 }} Colors</span>
                <Button label="View Palette" icon="pi pi-eye" size="small" text @click="$emit('view', catalog)" />
            </div>
        </template>
    </Card>
</template>

<script setup>
import { computed } from 'vue';
import Card from 'primevue/card';
import Button from 'primevue/button';

const props = defineProps({
    catalog: {
        type: Object,
        required: true
    }
});

defineEmits(['view']);

const displayedSheetTypes = computed(() => {
    return (props.catalog.sheetTypes || []).slice(0, 4);
});
</script>