<template>
    <div class="history-timeline">
        <Timeline :value="sortedHistory" class="customized-timeline">
            <template #opposite="slotProps">
                <small class="text-[var(--p-text-muted-color)] font-mono">
                    {{ formatDate(slotProps.item.timestamp) }}
                </small>
            </template>
            <template #content="slotProps">
                <div class="flex flex-col gap-1 mb-6">
                    <div class="flex items-center gap-2">
                        <EntityStatus :entity="slotProps.item" variant="inline" />
                        <span class="text-xs font-bold">{{ slotProps.item.userId || 'System' }}</span>
                    </div>
                    <p v-if="slotProps.item.note" class="text-sm text-[var(--p-text-secondary-color)] italic m-0">
                        {{ slotProps.item.note }}
                    </p>
                </div>
            </template>
        </Timeline>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import Timeline from 'primevue/timeline';
import EntityStatus from '~/components/entities/shared/EntityStatus.vue';

const props = defineProps({
    history: {
        type: Array,
        default: () => []
    }
});

const sortedHistory = computed(() => {
    return [...props.history].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
});

const formatDate = (date) => {
    return new Date(date).toLocaleString([], { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
};
</script>

<style scoped>
.customized-timeline :deep(.p-timeline-event-opposite) {
    flex: 0;
    padding: 0 1rem 0 0;
    min-width: 100px;
}
</style>
