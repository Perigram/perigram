<template>
    <div class="inline-flex items-center gap-2 p-1 pr-3 bg-[var(--p-content-background)] border rounded-full">
        <div class="w-6 h-6 rounded-full bg-cyan-600 flex items-center justify-center">
            <i class="pi pi-list text-[10px] text-white"></i>
        </div>
        <span class="text-xs font-bold">{{ queue.name }}</span>
        <StatusBadge :status="queue.status" />
    </div>
</template>

<script setup>
import StatusBadge from '~/components/shared/status/StatusBadge.vue';
defineProps({
    queue: {
        type: Object,
        required: true
    }
});
</script>