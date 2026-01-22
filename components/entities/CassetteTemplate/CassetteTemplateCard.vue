<template>
    <div class="p-4 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
        <div class="flex justify-between items-start">
            <div class="flex flex-col">
                <h3 class="text-lg font-bold m-0">{{ template.name }}</h3>
                <p class="text-[10px] text-[var(--p-text-muted-color)] mt-1">Layers: {{ template.layers?.length || 0 }}</p>
            </div>
            <i class="pi pi-palette text-pink-600 opacity-20 text-2xl"></i>
        </div>

        <div class="aspect-square bg-[var(--p-surface-900)] rounded-lg border flex items-center justify-center overflow-hidden">
             <!-- Cassette SVG Preview -->
             <div class="w-1/2 h-1/2 border-2 border-pink-500/40 relative">
                 <div class="absolute -top-1 -left-1 w-2 h-2 bg-pink-500 rounded-full"></div>
                 <div class="absolute -top-1 -right-1 w-2 h-2 bg-pink-500 rounded-full"></div>
                 <div class="absolute -bottom-1 -left-1 w-2 h-2 bg-pink-500 rounded-full"></div>
                 <div class="absolute -bottom-1 -right-1 w-2 h-2 bg-pink-500 rounded-full"></div>
             </div>
        </div>

        <div class="mt-auto pt-2 flex justify-between items-center text-xs">
            <span class="opacity-40 uppercase font-black">Parametric</span>
            <Button label="Edit" icon="pi pi-pencil" size="small" text @click="$emit('edit', template)" />
        </div>
    </div>
</template>

<script setup>
import Button from 'primevue/button';

defineProps({
    template: {
        type: Object,
        required: true
    }
});

defineEmits(['edit']);
</script>
