<template>
    <div class="inline-flex items-center gap-2 p-1 pr-3 bg-[var(--p-content-background)] border rounded-full">
        <div class="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center">
            <i class="pi pi-box text-[10px] text-white"></i>
        </div>
        <span class="text-xs font-bold">Instance: {{ instance.instanceId || instance._id?.toString().slice(-6) }}</span>
        <StatusBadge :status="instance.status" />
    </div>
</template>

<script setup>
import StatusBadge from '~/components/shared/status/StatusBadge.vue';
defineProps({
    instance: {
        type: Object,
        required: true
    }
});
</script>