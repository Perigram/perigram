<template>
    <div class="inline-flex items-center gap-2 p-1 pr-3 bg-[var(--p-content-background)] border rounded-full">
        <div class="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
            <i class="pi pi-folder text-[10px] text-white"></i>
        </div>
        <span class="text-xs font-bold">{{ project.name }}</span>
    </div>
</template>

<script setup>
defineProps({
    project: {
        type: Object,
        required: true
    }
});
</script>