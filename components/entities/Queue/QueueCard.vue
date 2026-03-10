<script setup>
/**
 * QueueCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { useAuthStore } from '~/stores/auth';
import EntityCard from '~/components/shared/EntityCard.vue';

const props = defineProps({
  queue: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = () => {
    emit('view', props.queue);
};
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="queue" entity-type="queue" :variant="variant">
        <!-- Queue number prefix in compact + card title -->
        <template #before-identity v-if="queue.queueNumber">
            <small>#{{ queue.queueNumber }}</small>
        </template>

        <!-- Card body -->
        <template v-if="variant === 'card'">
            <Divider />
            <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col">
                    <small>Job Items</small>
                    <span>{{ queue.job?.items?.length || 0 }}</span>
                </div>
                <div class="flex flex-col">
                    <small>Nesting Runs</small>
                    <span>{{ queue.summary?.runCount || 0 }}</span>
                </div>
            </div>
        </template>

        <!-- Card footer -->
        <template #footer v-if="variant === 'card'">
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('queues', 'edit')" icon="pi pi-pencil" text rounded size="small" aria-label="Edit" @click="$emit('edit', queue)" />
                <Button v-if="authStore.can('queues', 'delete')" icon="pi pi-trash" text rounded size="small" severity="danger" aria-label="Delete" @click="$emit('delete', queue)" />
            </div>
        </template>
    </EntityCard>
  </div>
</template>