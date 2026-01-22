<template>
    <div class="p-4 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
        <div class="flex justify-between items-start">
            <div class="flex flex-col">
                <h3 class="text-lg font-bold m-0">{{ warehouse.name }}</h3>
                <p class="text-[10px] text-[var(--p-text-muted-color)] mt-1 truncate max-w-[150px]">{{ warehouse.address || 'No address' }}</p>
            </div>
            <i class="pi pi-building text-indigo-500 opacity-20 text-2xl"></i>
        </div>

        <div class="grid grid-cols-3 gap-2 py-2 border-y border-dashed">
            <div class="flex flex-col items-center">
                <span class="text-[10px] font-black opacity-40">BATCHES</span>
                <span class="font-bold text-sm">{{ warehouse.totalBatches || 0 }}</span>
            </div>
            <div class="flex flex-col items-center border-x">
                <span class="text-[10px] font-black opacity-40">SHEETS</span>
                <span class="font-bold text-sm text-green-600">{{ warehouse.totalSheets || 0 }}</span>
            </div>
            <div class="flex flex-col items-center">
                <span class="text-[10px] font-black opacity-40">REMNANTS</span>
                <span class="font-bold text-sm text-orange-600">{{ warehouse.totalRemnants || 0 }}</span>
            </div>
        </div>

        <div class="mt-auto pt-2 flex justify-end">
            <Button label="Manage Stock" icon="pi pi-box" size="small" text @click="$emit('view', warehouse)" />
        </div>
    </div>
</template>

<script setup>
import Button from 'primevue/button';

defineProps({
    warehouse: {
        type: Object,
        required: true
    }
});

defineEmits(['view']);
</script>
