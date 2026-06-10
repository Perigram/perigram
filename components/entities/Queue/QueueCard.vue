<script setup>
/**
 * QueueCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const props = defineProps({
  queue: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const { t } = useI18n();
const queueSummaryFields = computed(() => [
    { path: 'data.job.items.length', i18n: 'queue.jobItems' },
    { path: 'summary.runCount', i18n: 'queue.nestingRuns' },
    { path: 'summary.sheetCount', i18n: 'results.sheets' },
    { path: 'summary.totalArea', i18n: 'common.area', suffix: ' m²' }
]);

const handleCardClick = () => {
    emit('view', props.queue);
};

const jobItems = computed(() => props.queue.data?.job?.items || []);
const materialPool = computed(() => props.queue.data?.job?.materialPool || []);
const totalQuantity = computed(() => jobItems.value.reduce((sum, item) => sum + Number(item.quantity || 0), 0));

const statusActions = computed(() => {
    if (!authStore.can('queues', 'delete')) return [];
    return [{
        label: t('common.delete'),
        icon: 'pi pi-trash',
        severity: 'danger',
        display: 'menu',
        command: () => emit('delete', props.queue)
    }];
});
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="queue" entity-type="queue" :variant="variant" :status-actions="statusActions">
        <!-- Queue number prefix in compact + card title -->
        <template #before-identity v-if="queue.data?.queueNumber">
            <small>#{{ queue.data.queueNumber }}</small>
        </template>
        <template #subtitle>
            <div class="flex flex-wrap gap-2">
                <Tag :value="`${jobItems.length} ${$t('queue.jobItems')}`" severity="secondary" size="small" />
                <Tag v-if="totalQuantity" :value="`${totalQuantity} ${$t('common.units')}`" severity="info" size="small" />
            </div>
        </template>
        <template #compact-content>
            <div class="mt-3 flex flex-wrap gap-2">
                <Tag v-if="materialPool.length" :value="`${materialPool.length} ${$t('nesting.inventorySources')}`" severity="secondary" size="small" />
                <Tag v-if="queue.summary?.runCount" :value="`${queue.summary.runCount} ${$t('queue.runs')}`" severity="info" size="small" />
            </div>
        </template>

        <div class="flex flex-col gap-3">
            <Divider />
            <DataBlock :entity="queue" :fields="queueSummaryFields" />
            <div v-if="materialPool.length" class="flex items-center justify-between gap-4">
                <small class="text-muted-color">{{ $t('nesting.inventorySources') }}</small>
                <span class="font-medium">{{ materialPool.length }}</span>
            </div>
        </div>

        <!-- Card footer -->
        <template #footer v-if="variant === 'card'">
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('queues', 'edit')" icon="pi pi-pencil" text rounded size="small" :aria-label="$t('common.edit')" @click="$emit('edit', queue)" />
            </div>
        </template>
    </EntityCard>
  </div>
</template>
