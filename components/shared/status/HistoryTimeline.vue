<template>
    <div>
        <Timeline :value="sortedHistory">
            <template #opposite="slotProps">
                <small>
                    {{ formatDate(slotProps.item.timestamp) }}
                </small>
            </template>
            <template #content="slotProps">
                <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2">
                        <EntityStatus :entity="slotProps.item" variant="inline" />
                        <span>{{ slotProps.item.userId || 'System' }}</span>
                    </div>
                    <p v-if="slotProps.item.note" class="m-0 italic">
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