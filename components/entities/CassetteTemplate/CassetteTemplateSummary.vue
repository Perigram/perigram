<template>
    <div class="inline-flex items-center gap-2 p-1 pr-3 bg-[var(--p-content-background)] border rounded-full">
        <div class="w-6 h-6 rounded-full bg-pink-600 flex items-center justify-center">
            <i class="pi pi-palette text-[10px] text-white"></i>
        </div>
        <span class="text-xs font-bold">{{ template.name }}</span>
    </div>
</template>

<script setup>
defineProps({
    template: {
        type: Object,
        required: true
    }
});
</script>
