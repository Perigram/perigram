<template>
    <EntityPage :entity="queue" entity-type="queue">
        <template #actions>
            <Button :label="$t('queue.nestingConfig')" icon="pi pi-sliders-h" severity="secondary" outlined />
            <Button
                v-if="queueCommandActions.length"
                :label="queueCommandActions[0].label"
                :icon="queueCommandActions[0].icon"
                :severity="queueCommandActions[0].severity || 'secondary'"
                outlined
                @click="queueCommandActions[0].command?.()"
            />
        </template>

        <template #sidebar>
            <Panel :header="$t('requisition.lifecycleTimeline')">
                <StatusHistory :entity="queue" entity-type="queue" />
            </Panel>

            <Panel v-if="materialConsumption.length" :header="$t('queue.materialConsumption')">
                <div class="flex flex-col gap-3">
                    <div
                        v-for="item in materialConsumption"
                        :key="`${item.type}-${item.id}`"
                        class="flex items-center justify-between gap-3"
                    >
                        <EntityInlineRef v-if="item.entityType" :type="item.entityType" :id="item.id" />
                        <span v-else>{{ item.id }}</span>
                        <Tag :value="item.count" severity="warn" size="small" />
                    </div>
                </div>
            </Panel>

            <MetricPanel :metrics="overviewMetrics" />
        </template>

        <div class="flex flex-col gap-8">
            <template v-if="queue.artifacts?.length">
                <ActionToolbar :title="$t('queues.artifacts')" :level="2" />
                <ResponsiveGrid variant="bounded" responsive-context="container">
                    <EntityInlineRef v-for="artId in queue.artifacts" :key="artId" type="artifact" :id="artId" />
                </ResponsiveGrid>
            </template>

            <ActionToolbar :title="$t('queue.jobComposition')" :level="2" />
            <TableFrame>
                <DataTable :value="queue.relations?.cassettes || []">
                    <Column :header="$t('file.type')">
                        <template #body="{ data }">
                            <Tag :value="data.type" severity="secondary" />
                        </template>
                    </Column>
                    <Column field="id" :header="$t('queue.entryId')">
                        <template #body="{ data }">
                            <span class="italic text-muted">{{ data.id }}</span>
                        </template>
                    </Column>
                </DataTable>
            </TableFrame>
        </div>
    </EntityPage>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import Panel from 'primevue/panel';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import TableFrame from '~/components/shared/TableFrame.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import MetricPanel from '~/components/shared/MetricPanel.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';

const props = defineProps({
    queue: { type: Object, required: true }
});

const emit = defineEmits(['run-nesting']);
const { t } = useI18n();

const materialConsumption = computed(() => (props.queue.data?.materialConsumption?.sources || [])
    .map(source => ({
        ...source,
        entityType: materialSourceEntityType(source)
    })));

const overviewMetrics = computed(() => [
    { key: 'runs', label: t('queue.runs'), value: props.queue.summary?.runCount || 0 }
]);

function materialSourceEntityType(source = {}) {
    if (source.type === 'PILE') return 'materialPile';
    if (source.type === 'SHEET') return 'sheet';
    if (source.type === 'REMNANT') return 'remnant';
    return null;
}

const queueCommandActions = computed(() => {
    return [{
        label: t('queues.runNesting'),
        icon: 'pi pi-play',
        severity: 'success',
        command: () => emit('run-nesting', props.queue._id)
    }];
});
</script>
