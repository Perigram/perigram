<template>
    <div class="inline-flex items-center gap-3 p-2 rounded-lg border border-[var(--p-surface-200)] bg-[var(--p-surface-50)]">
        <i class="pi pi-folder text-[var(--p-primary-color)]"></i>
        <div class="flex flex-col">
            <span class="text-[10px] font-black uppercase leading-none opacity-60">Project</span>
            <span class="text-xs font-mono font-bold">{{ data.name }}</span>
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
