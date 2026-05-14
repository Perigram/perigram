<script setup>
/**
 * QueueCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const props = defineProps({
  queue: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const queueSummaryFields = computed(() => [
    { path: 'data.job.items.length', i18n: 'queue.jobItems' },
    { path: 'summary.runCount', i18n: 'queue.nestingRuns' },
    { path: 'summary.sheetCount', i18n: 'results.sheets' },
    { path: 'summary.totalArea', i18n: 'common.area', suffix: ' m²' }
]);

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
            <DataBlock :entity="queue" :fields="queueSummaryFields" />
        </template>

        <!-- Card footer -->
        <template #footer v-if="variant === 'card'">
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('queues', 'edit')" icon="pi pi-pencil" text rounded size="small" :aria-label="$t('common.edit')" @click="$emit('edit', queue)" />
                <Button v-if="authStore.can('queues', 'delete')" icon="pi pi-trash" text rounded size="small" severity="danger" :aria-label="$t('common.delete')" @click="$emit('delete', queue)" />
            </div>
        </template>
    </EntityCard>
  </div>
</template>
