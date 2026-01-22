<template>
    <div class="inline-flex items-center gap-2 p-1 pr-3 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-full shadow-sm">
        <div class="w-6 h-6 rounded-full bg-[var(--p-surface-100)] flex items-center justify-center">
            <i class="pi pi-undo text-[10px] text-[var(--p-text-muted-color)]"></i>
        </div>
        <span class="text-xs font-bold">{{ remnant.remnantId || remnant._id?.toString().slice(-6) }}</span>
        <Tag :value="remnant.status" severity="info" class="text-[8px] font-bold" />
    </div>
</template>

<script setup>
import Tag from 'primevue/tag';
defineProps({
    remnant: {
        type: Object,
        required: true
    }
});
</script>
