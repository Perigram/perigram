<template>
    <div class="p-4 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
        <div class="flex justify-between items-start">
            <div class="flex flex-col">
                <h3 class="text-lg font-bold m-0">{{ project.name }}</h3>
                <p class="text-xs text-[var(--p-text-muted-color)] mt-1">Client: {{ project.customer || 'N/A' }}</p>
            </div>
            <i class="pi pi-folder text-blue-600 opacity-20 text-2xl"></i>
        </div>

        <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center text-xs">
                <span class="opacity-60">Production Queues</span>
                <Tag :value="project.queues?.length || 0" severity="info" class="text-[10px]" />
            </div>
            <div class="flex justify-between items-center text-xs">
                <span class="opacity-60">Total Cassettes</span>
                <span class="font-bold">{{ totalCassettes }}</span>
            </div>
        </div>

        <!-- Progress Bar for Production -->
        <div class="flex flex-col gap-1">
             <div class="flex justify-between text-[10px] font-bold uppercase opacity-40">
                <span>Production Progress</span>
                <span>{{ progress }}%</span>
            </div>
            <ProgressBar :value="progress" :showValue="false" style="height: 6px" />
        </div>

        <div class="mt-auto pt-2 flex justify-end">
            <Button label="Open Project" icon="pi pi-external-link" size="small" text @click="$emit('view', project)" />
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import ProgressBar from 'primevue/progressbar';

const props = defineProps({
    project: {
        type: Object,
        required: true
    }
});

defineEmits(['view']);

const totalCassettes = computed(() => {
    // In real app, sum from queues
    return 0; // Needs data resolving
});

const progress = computed(() => {
    return 0; // Needs data resolving
});
</script>
