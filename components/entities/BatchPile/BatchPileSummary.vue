<template>
    <div class="inline-flex items-center gap-3 p-2 rounded-lg border border-[var(--p-surface-200)] bg-[var(--p-content-background)]">
        <i class="pi pi-clone text-[var(--p-primary-color)]"></i>
        <div class="flex flex-col">
            <span class="text-[10px] font-black uppercase leading-none opacity-60">Pile</span>
            <span class="text-xs font-mono font-bold">{{ data.partyId || data._id.toString().slice(-6) }}</span>
        </div>
        <div class="flex gap-1">
            <span class="text-[9px] font-bold px-1 bg-[var(--p-surface-200)] rounded">{{ data.thickness }}mm</span>
            <span class="text-[9px] font-bold px-1 bg-[var(--p-surface-200)] rounded">{{ data.color }}</span>
        </div>
    </div>
</template>

<script setup>
defineProps({
    data: {
        type: Object,
        required: true
    }
});
</script>
