<template>
    <div class="p-4 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
        <div class="flex justify-between items-start">
            <div class="flex flex-col">
                <h3 class="text-lg font-bold m-0">{{ design.name || 'Nesting Layout' }}</h3>
                <p class="text-[10px] text-[var(--p-text-muted-color)] mt-1">Queue: {{ design.queueId?.toString().slice(-6) }}</p>
            </div>
            <i class="pi pi-map text-purple-600 opacity-20 text-2xl"></i>
        </div>

        <!-- SVG Preview Placeholder -->
        <div class="aspect-video bg-[var(--p-surface-900)] rounded-lg border flex items-center justify-center overflow-hidden">
             <i class="pi pi-images text-2xl text-white/20"></i>
        </div>

        <div class="flex justify-between items-center text-xs mt-auto pt-2 border-t">
            <div class="flex items-center gap-1">
                <span class="opacity-60">Utilization:</span>
                <span class="font-bold text-green-600">{{ design.utilization || 0 }}%</span>
            </div>
            <Button label="View DXF" icon="pi pi-download" size="small" text />
        </div>
    </div>
</template>

<script setup>
import Button from 'primevue/button';

defineProps({
    design: {
        type: Object,
        required: true
    }
});

defineEmits(['view']);
</script>
