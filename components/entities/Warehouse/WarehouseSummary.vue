<template>
    <div class="inline-flex items-center gap-2 p-1 pr-3 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-full">
        <div class="w-6 h-6 rounded-full bg-[var(--p-surface-100)] flex items-center justify-center">
            <i class="pi pi-building text-[10px] text-[var(--p-text-muted-color)]"></i>
        </div>
        <span class="text-xs font-bold">{{ warehouse.name }}</span>
    </div>
</template>

<script setup>
defineProps({
    warehouse: {
        type: Object,
        required: true
    }
});
</script>