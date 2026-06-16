<template>
    <EntityPage :entity="queue" entity-type="queue">
        <template #actions>
                <Button :label="$t('queue.nestingConfig')" icon="pi pi-sliders-h" severity="secondary" outlined />
                <Button
                  v-if="queueStatusActions.length"
                  :label="queueStatusActions[0].label"
                  :icon="queueStatusActions[0].icon"
                  :severity="queueStatusActions[0].severity || 'secondary'"
                  outlined
                  @click="queueStatusActions[0].command?.()"
                />
        </template>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-10">
             <!-- Left: Components & Layouts -->
            <div class="lg:col-span-3 flex flex-col gap-10">
                 <!-- Artifacts (Nesting Layouts) -->
                <div v-if="queue.artifacts?.length" class="flex flex-col gap-4">
                    <h3 class="flex items-center gap-3">
                        <i class="pi pi-map"></i>
                        {{ $t('queues.artifacts') }}
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <EntityInlineRef v-for="artId in queue.artifacts" :key="artId" type="artifact" :id="artId" />
                    </div>
                </div>

                <!-- Job Items -->
                <div class="flex flex-col gap-4">
                    <h3 class="flex items-center gap-3">
                        <i class="pi pi-list"></i>
                        {{ $t('queue.jobComposition') }}
                    </h3>
                    <TableFrame>
                    <DataTable :value="queue.data?.job?.items || []" responsiveLayout="scroll">
                        <Column :header="$t('file.type')">
                            <template #body="{ data }">
                                <Tag :value="data.type" severity="secondary" />
                            </template>
                        </Column>
                        <Column field="id" :header="$t('queue.entryId')">
                             <template #body="{ data }">
                                <span class="opacity-60 italic">{{ data.id }}</span>
                            </template>
                        </Column>
                        <Column field="quantity" :header="$t('common.quantity')" />
                        <Column :header="$t('queue.dimensions')">
                             <template #body="{ data }">
                                <div class="flex flex-wrap gap-1.5">
                                    <Tag v-for="(val, key) in data.parameters" :key="key" :value="`${key}: ${val}`" text />
                                </div>
                            </template>
                        </Column>
                    </DataTable>
                    </TableFrame>
                </div>
            </div>

            <!-- Right: Metadata & Materials -->
            <div class="flex flex-col gap-8">
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

                 <Panel :header="$t('project.overview')">
                    <div class="flex flex-col gap-4 py-2">
                        <div class="flex justify-between items-center">
                            <span class="opacity-60">{{ $t('queue.runs') }}</span>
                            <span class="text-xl">{{ queue.summary?.runCount || 0 }}</span>
                        </div>
                    </div>
                </Panel>
            </div>
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
import EntityPage from '~/components/shared/EntityPage.vue';

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

function materialSourceEntityType(source = {}) {
    if (source.type === 'PILE') return 'materialPile';
    if (source.type === 'SHEET') return 'sheet';
    if (source.type === 'REMNANT') return 'remnant';
    return null;
}

const queueStatusActions = computed(() => {
    if (props.queue.status?.state !== 'DRAFT') return [];
    return [{
        label: t('queues.runNesting'),
        icon: 'pi pi-play',
        severity: 'success',
        command: () => emit('run-nesting', props.queue._id)
    }];
});
</script>
