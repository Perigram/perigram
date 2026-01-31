<template>
    <div class="flex flex-col gap-8">
        <LineageBreadcrumbs :entity="queue" />

        <div class="flex justify-between items-center">
            <div class="flex items-center gap-6">
                <h2 class="m-0">{{ queueName }}</h2>
                <EntityStatus :entity="queue" variant="inline" />
            </div>
            <div class="flex gap-3">
                <Button :label="$t('queue.nestingConfig')" icon="pi pi-sliders-h" severity="secondary" outlined />
                <Button v-if="queueState === 'DRAFT'" :label="$t('queues.runNesting')" icon="pi pi-play" severity="success" @click="$emit('run-nesting', queue._id)" />
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
                        <div v-for="artId in queue.artifacts" :key="artId" class="p-6 border rounded">
                            <span class="opacity-50 italic">{{ artId }}</span>
                        </div>
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
                    <StatusTimeline :entity="queue" />
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
import EntityStatus from '~/components/entities/shared/EntityStatus.vue';
import StatusTimeline from '~/components/shared/status/StatusTimeline.vue';
import LineageBreadcrumbs from '~/components/entities/shared/LineageBreadcrumbs.vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useIdentity, useStatus } from '~/composables/useBlocks';

const props = defineProps({
    queue: { type: Object, required: true }
});

defineEmits(['run-nesting']);

const { name: queueName } = useIdentity(props.queue);
const { state: queueState } = useStatus(props.queue);
</script>
