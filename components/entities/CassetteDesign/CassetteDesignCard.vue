<template>
    <div class="p-4 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
        <div class="flex justify-between items-start">
            <div class="flex flex-col">
                <h3 class="text-lg font-bold m-0">Design: {{ design._id?.toString().slice(-6) }}</h3>
                <p class="text-[10px] text-[var(--p-text-muted-color)] mt-1">From Template: {{ design.templateId?.toString().slice(-6) }}</p>
            </div>
            <i class="pi pi-pencil text-pink-600 opacity-20 text-2xl"></i>
        </div>

        <div class="flex flex-col gap-2 text-xs">
            <div v-for="(val, key) in design.dimensions" :key="key" class="flex justify-between">
                <span class="opacity-60">{{ key }}</span>
                <span class="font-bold">{{ val }}mm</span>
            </div>
        </div>

        <div class="mt-auto pt-2 flex justify-end">
            <Button label="View" icon="pi pi-eye" size="small" text @click="$emit('view', design)" />
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
