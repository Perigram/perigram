<template>
    <Card>
        <template #title>
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                    <span class="text-lg font-bold">{{ batch.batchNumber }}</span>
                    <StatusBadge :status="batch.status" />
                </div>
                <i class="pi pi-truck opacity-20 text-xl"></i>
            </div>
        </template>
        <template #subtitle>
            <span class="text-xs">Receipt: {{ batch.receiptId || 'N/A' }}</span>
        </template>
        <template #content>
            <div class="flex flex-wrap gap-1 mt-1">
                <div 
                    v-for="(pile, idx) in batch.piles?.slice(0, 4)" 
                    :key="idx"
                    class="w-6 h-6 rounded border border-[var(--p-content-border-color)] shadow-sm"
                    :style="{ backgroundColor: pile.colorFallback || '#ccc' }"
                    :title="`${pile.material} (${pile.color})`"
                ></div>
                <div v-if="batch.piles?.length > 4" class="w-6 h-6 rounded bg-[var(--p-surface-100)] border border-[var(--p-content-border-color)] flex items-center justify-center text-[8px] font-bold">
                    +{{ batch.piles.length - 4 }}
                </div>
            </div>
        </template>
        <template #footer>
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-1 opacity-60">
                    <i class="pi pi-building text-[10px]"></i>
                    <span class="text-[10px] truncate max-w-[100px]">{{ batch.warehouseId?.toString().slice(-6) }}</span>
                </div>
                <Button label="View" icon="pi pi-eye" size="small" text @click="$emit('view', batch)" />
            </div>
        </template>
    </Card>
</template>

<script setup>
import Card from 'primevue/card';
import Button from 'primevue/button';
import StatusBadge from '~/components/shared/status/StatusBadge.vue';

defineProps({
    batch: {
        type: Object,
        required: true
    }
});

defineEmits(['view']);
</script>