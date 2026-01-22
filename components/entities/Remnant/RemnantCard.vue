<template>
    <Card>
        <template #title>
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                    <span class="text-lg font-bold">{{ remnant.remnantId || 'Remnant' }}</span>
                    <Tag :value="remnant.status" severity="info" class="text-[10px]" />
                </div>
                <i class="pi pi-undo opacity-20 text-xl"></i>
            </div>
        </template>
        <template #subtitle>
            <span class="text-xs">Source: {{ remnant.sheetId?.toString().slice(-6) }}</span>
        </template>
        <template #content>
            <div class="bg-[var(--p-surface-900)] aspect-video rounded-lg flex items-center justify-center relative overflow-hidden border border-[var(--p-content-border-color)]">
                 <div class="w-3/4 h-3/4 border-2 border-dashed border-primary/20 rotate-12"></div>
            </div>
        </template>
        <template #footer>
            <div class="flex justify-end">
                <Button label="Reuse" icon="pi pi-refresh" size="small" text @click="$emit('view', remnant)" />
            </div>
        </template>
    </Card>
</template>

<script setup>
import Card from 'primevue/card';
import Button from 'primevue/button';
import Tag from 'primevue/tag';

defineProps({
    remnant: {
        type: Object,
        required: true
    }
});

defineEmits(['view']);
</script>