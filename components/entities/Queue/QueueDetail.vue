<template>
    <div class="flex flex-col gap-8">
        <TraceChain :entity="queue" />

        <div class="flex justify-between items-start gap-4 min-w-0">
            <div class="flex flex-wrap items-start gap-4 min-w-0">
                <IdentityBlock :entity="queue" variant="header" />
                <EntityStatus :entity="queue" entity-type="queue" variant="inline" :actions="queueStatusActions" />
            </div>
            <div class="flex gap-3">
                <Button :label="$t('queue.nestingConfig')" icon="pi pi-sliders-h" severity="secondary" outlined />
            </div>
        </div>

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
                        <TraceLink v-for="artId in queue.artifacts" :key="artId" type="artifact" :id="artId" />
                    </div>
                </div>

                <!-- Job Items -->
                <div class="flex flex-col gap-4">
                    <h3 class="flex items-center gap-3">
                        <i class="pi pi-list"></i>
                        {{ $t('queue.jobComposition') }}
                    </h3>
                    <DataTable :value="queue.job?.items || []" class="border rounded overflow-hidden" responsiveLayout="scroll">
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
                </div>
            </div>

            <!-- Right: Metadata & Materials -->
            <div class="flex flex-col gap-8">
                <Panel :header="$t('requisition.lifecycleTimeline')">
                    <StatusHistory :entity="queue" entity-type="queue" />
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
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import Panel from 'primevue/panel';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Tag from 'primevue/tag';

const props = defineProps({
    queue: { type: Object, required: true }
});

const emit = defineEmits(['run-nesting']);
const { t } = useI18n();

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
