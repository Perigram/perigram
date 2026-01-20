<template>
    <div class="inline-flex items-center gap-3 p-2 rounded-lg border border-[var(--p-surface-200)] bg-[var(--p-surface-50)]">
        <i class="pi pi-list text-[var(--p-primary-color)]"></i>
        <div class="flex flex-col">
            <span class="text-[10px] font-black uppercase leading-none opacity-60">Queue</span>
            <span class="text-xs font-mono font-bold">{{ data.name || data.queueNumber }}</span>
        </div>
        <StatusBadge :status="data.status" />
    </div>
</template>

<script setup>
import StatusBadge from '~/components/shared/status/StatusBadge.vue';

defineProps({
    data: {
        type: Object,
        required: true
    }
});
</script>
