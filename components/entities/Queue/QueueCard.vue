<template>
    <div class="p-4 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
        <div class="flex justify-between items-start">
            <div class="flex flex-col">
                <div class="flex items-center gap-2">
                    <h3 class="text-lg font-bold m-0">{{ queue.name }}</h3>
                    <StatusBadge :status="queue.status" />
                </div>
                <p class="text-[10px] text-[var(--p-text-muted-color)] mt-1">Material: {{ queue.material || 'Standard' }}</p>
            </div>
            <i class="pi pi-list text-cyan-600 opacity-20 text-2xl"></i>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col">
                <span class="text-[10px] font-black opacity-40 uppercase">Components</span>
                <span class="font-bold">{{ queue.cassettes?.length || 0 }}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-[10px] font-black opacity-40 uppercase">Layouts</span>
                <span class="font-bold">{{ queue.artifacts?.length || 0 }}</span>
            </div>
        </div>

        <div class="mt-auto pt-2 flex justify-between items-center">
            <div class="text-[10px] opacity-40 font-mono">{{ queue._id?.toString().slice(-6) }}</div>
            <Button label="Process" icon="pi pi-cog" size="small" text @click="$emit('view', queue)" />
        </div>
    </div>
</template>

<script setup>
import Button from 'primevue/button';
import StatusBadge from '~/components/shared/status/StatusBadge.vue';

defineProps({
    queue: {
        type: Object,
        required: true
    }
});

defineEmits(['view']);
</script>
