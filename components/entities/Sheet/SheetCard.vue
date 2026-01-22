<template>
    <Card>
        <template #title>
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                    <span class="text-lg font-bold">{{ sheet.sheetId || 'Physical Sheet' }}</span>
                    <StatusBadge :status="sheet.status" />
                </div>
                <div 
                    class="w-6 h-6 rounded border border-[var(--p-content-border-color)] shadow-sm"
                    :style="{ backgroundColor: sheet.colorFallback || '#ccc' }"
                ></div>
            </div>
        </template>
        <template #subtitle>
            <span class="text-xs">{{ sheet.material }} ({{ sheet.thickness }}mm)</span>
        </template>
        <template #content>
            <div class="flex flex-col gap-1 text-xs opacity-80">
                <div class="flex justify-between">
                    <span>Dimensions:</span>
                    <span class="font-bold">{{ sheet.width }}x{{ sheet.height }}mm</span>
                </div>
                <div class="flex justify-between">
                    <span>Batch:</span>
                    <span class="font-mono text-[10px]">{{ sheet.batchId?.toString().slice(-6) }}</span>
                </div>
            </div>
        </template>
        <template #footer>
            <div class="flex justify-end">
                <Button label="Trace" icon="pi pi-search-plus" size="small" text @click="$emit('view', sheet)" />
            </div>
        </template>
    </Card>
</template>

<script setup>
import Card from 'primevue/card';
import Button from 'primevue/button';
import StatusBadge from '~/components/shared/status/StatusBadge.vue';

defineProps({
    sheet: {
        type: Object,
        required: true
    }
});

defineEmits(['view']);
</script>