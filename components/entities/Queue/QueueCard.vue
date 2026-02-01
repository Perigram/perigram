<script setup>
/**
 * QueueCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { useAuthStore } from '~/stores/auth';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import StatusEntity from '~/components/shared/blocks/StatusEntity.vue';
import LineageBlock from '~/components/shared/blocks/LineageBlock.vue';
import StandardCard from '~/components/shared/StandardCard.vue';

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
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-list"></i>
        <IdentityBlock :entity="queue" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-2">
                <small v-if="queue.data?.queueNumber">#{{ queue.data.queueNumber }}</small>
                <IdentityBlock :entity="queue" variant="compact" />
            </div>
            <StatusEntity :entity="queue" entity-type="queue" variant="inline" />
        </div>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #header>
            <LineageBlock :entity="queue" />
        </template>
        <template #title>
            <div class="flex justify-between items-start gap-4">
                <div class="flex flex-col">
                    <small v-if="queue.data?.queueNumber">#{{ queue.data.queueNumber }}</small>
                    <IdentityBlock :entity="queue" />
                </div>
                <StatusEntity :entity="queue" entity-type="queue" variant="inline" />
            </div>
        </template>
        
        <Divider />
        <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col">
                <small>Job Items</small>
                <span>{{ queue.data?.job?.items?.length || 0 }}</span>
            </div>
            <div class="flex flex-col">
                <small>Nesting Runs</small>
                <span>{{ queue.summary?.runCount || 0 }}</span>
            </div>
        </div>

        <template #footer>
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('queues', 'edit')" icon="pi pi-pencil" text rounded aria-label="Edit" @click="$emit('edit', queue)" />
                <Button v-if="authStore.can('queues', 'delete')" icon="pi pi-trash" text rounded severity="danger" aria-label="Delete" @click="$emit('delete', queue)" />
            </div>
        </template>
      </StandardCard>
    </template>
  </div>
</template>