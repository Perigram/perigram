<template>
    <div class="inline-flex items-center gap-2 p-1 pr-3 bg-[var(--p-content-background)] border rounded-full">
        <div class="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
            <i class="pi pi-map text-[10px] text-white"></i>
        </div>
        <span class="text-xs font-bold">{{ design.name || 'Layout' }}</span>
    </div>
</template>

<script setup>
defineProps({
    design: {
        type: Object,
        required: true
    }
});
</script>
