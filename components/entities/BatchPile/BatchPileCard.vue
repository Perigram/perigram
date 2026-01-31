<template>
    <Card class="card-interactive">
        <template #header>
            <div 
                class="h-2 w-full"
                :style="{ backgroundColor: pile.colorFallback || '#ccc' }"
            ></div>
        </template>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ pile.material }} - {{ pile.color }}</span>
                <div class="flex flex-col items-end">
                    <span class="text-xl">{{ pile.totalCount - pile.usedCount }} / {{ pile.totalCount }}</span>
                </div>
            </div>
        </template>
        <template #subtitle>
            <div class="flex justify-between items-center">
                <small>ID: {{ pile.partyId }}</small>
                <small>Remaining</small>
            </div>
        </template>
        <template #content>
            <div class="flex items-center gap-2 mt-2">
                <Tag :value="`${pile.thickness}mm`" severity="secondary" />
            </div>
        </template>
    </Card>
</template>

<script setup>
import Card from 'primevue/card';
import Tag from 'primevue/tag';

defineProps({
    pile: {
        type: Object,
        required: true
    }
});
</script>