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
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';

const props = defineProps({
  queue: { type: Object, required: true },
  variant: { type: String, default: 'card' },
  statusActions: { type: Array, default: () => [] },
  showDelete: { type: Boolean, default: true },
  showSummary: { type: Boolean, default: true },
  showFooterActions: { type: Boolean, default: true },
  expandable: { type: Boolean, default: true },
  density: { type: String, default: 'default' }
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

const FORM_CONTROL_SELECTOR = 'a[href],button,input,select,textarea,[contenteditable="true"]';

const handleCardClick = (event) => {
    if (!props.expandable) {
        if (event?.target?.closest?.(FORM_CONTROL_SELECTOR)) return;
        emit('view', props.queue);
        return;
    }
    if (isInteractiveEventTarget(event)) return;
    emit('view', props.queue);
};

const jobItems = computed(() => props.queue.data?.job?.items || []);
const totalQuantity = computed(() => jobItems.value.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
const commandActions = computed(() => [
    ...props.statusActions,
    ...(props.showDelete && authStore.can('queues', 'delete') ? [{
        label: t('common.delete'),
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => emit('delete', props.queue)
    }] : [])
]);
</script>

<template>
  <div class="cursor-pointer" @click="handleCardClick">
    <EntityCard
        :entity="queue"
        entity-type="queue"
        :variant="variant"
        :expandable="expandable"
        :density="density"
    >
        <template #before-identity v-if="variant === 'card' && queue.data?.queueNumber">
            <small>#{{ queue.data.queueNumber }}</small>
        </template>
        <template #subtitle v-if="variant !== 'card' && showSummary">
            <div class="flex flex-wrap gap-2">
                <Tag :value="`${jobItems.length} ${$t('queue.jobItems')}`" severity="secondary" size="small" />
                <Tag v-if="totalQuantity" :value="`${totalQuantity} ${$t('common.units')}`" severity="info" size="small" />
            </div>
        </template>
        <template #compact-content v-if="showSummary">
            <div class="mt-3 flex flex-wrap items-center gap-2">
                <Tag v-if="queue.summary?.runCount" :value="`${queue.summary.runCount} ${$t('queue.runs')}`" severity="info" size="small" />
            </div>
        </template>

        <div v-if="variant !== 'card' && commandActions.length" class="mt-3 flex flex-wrap gap-2" @click.stop>
            <Button
                v-for="action in commandActions"
                :key="action.label"
                :label="action.label"
                :icon="action.icon"
                :severity="action.severity || 'secondary'"
                size="small"
                text
                @click.stop="action.command?.()"
            />
        </div>

        <div class="flex flex-col gap-3">
            <Divider />
            <DataBlock entity-type="queue" :entity="queue" :fields="queueSummaryFields" />
        </div>

        <!-- Card footer -->
        <template #footer v-if="variant === 'card' && showFooterActions">
            <div class="flex justify-end gap-2" @click.stop>
                <Button
                    v-for="action in commandActions"
                    :key="action.label"
                    :label="action.label"
                    :icon="action.icon"
                    :severity="action.severity || 'secondary'"
                    size="small"
                    text
                    @click.stop="action.command?.()"
                />
                <Button v-if="authStore.can('queues', 'edit')" icon="pi pi-pencil" text rounded size="small" :aria-label="$t('common.edit')" @click="$emit('edit', queue)" />
            </div>
        </template>
    </EntityCard>
  </div>
</template>
