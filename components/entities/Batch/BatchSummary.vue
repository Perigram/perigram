<template>
    <div class="inline-flex items-center gap-2 p-1 pr-3 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-full shadow-sm">
        <div class="w-6 h-6 rounded-full bg-[var(--p-surface-100)] flex items-center justify-center">
            <i class="pi pi-truck text-[10px] text-[var(--p-text-muted-color)]"></i>
        </div>
        <span class="text-xs font-bold">{{ batch.batchNumber }}</span>
        <StatusBadge :status="batch.status" />
    </div>
</template>

<script setup>
import StatusBadge from '~/components/shared/status/StatusBadge.vue';
defineProps({
    batch: {
        type: Object,
        required: true
    }
});
</script>
