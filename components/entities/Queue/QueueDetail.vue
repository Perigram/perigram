<template>
    <div class="flex flex-col gap-6">
        <LineageBreadcrumbs :entity="queue" />

        <div class="flex justify-between items-center">
            <div class="flex items-center gap-4">
                <h2 class="text-2xl font-black m-0">{{ queueName }}</h2>
                <EntityStatus :entity="queue" variant="inline" />
            </div>
            <div class="flex gap-2">
                <Button :label="$t('queue.nestingConfig')" icon="pi pi-sliders-h" severity="secondary" size="small" />
                <Button v-if="queueState === 'DRAFT'" :label="$t('queues.runNesting')" icon="pi pi-play" size="small" severity="success" @click="$emit('run-nesting', queue._id)" />
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
             <!-- Left: Components & Layouts -->
            <div class="lg:col-span-3 flex flex-col gap-8">
                 <!-- Artifacts (Nesting Layouts) -->
                <div v-if="queue.artifacts?.length" class="flex flex-col gap-4">
                    <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                        <i class="pi pi-map"></i>
                        {{ $t('queues.artifacts') }}
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div v-for="artId in queue.artifacts" :key="artId" class="p-4 border rounded-xl bg-surface-0 dark:bg-surface-900">
                            <!-- artifact detail might need better handling -->
                            <span class="font-mono text-xs opacity-50">{{ artId }}</span>
                        </div>
                    </div>
                </div>

                <!-- Job Items -->
                <div class="flex flex-col gap-4">
                    <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                        <i class="pi pi-list"></i>
                        {{ $t('queue.jobComposition') }}
                    </h3>
                    <DataTable :value="queue.job?.items || []" class="p-datatable-sm border rounded-xl overflow-hidden shadow-sm">
                        <Column :header="$t('file.type')">
                            <template #body="{ data }">
                                <Tag :value="data.type" severity="secondary" class="text-[10px]" />
                            </template>
                        </Column>
                        <Column field="id" :header="$t('queue.entryId')">
                             <template #body="{ data }">
                                <span class="font-mono text-xs opacity-60">{{ data.id }}</span>
                            </template>
                        </Column>
                        <Column field="quantity" :header="$t('common.quantity')" />
                        <Column :header="$t('queue.dimensions')">
                             <template #body="{ data }">
                                <div class="flex flex-wrap gap-1">
                                    <Tag v-for="(val, key) in data.parameters" :key="key" :value="`${key}: ${val}`" text class="text-[10px]" />
                                </div>
                            </template>
                        </Column>
                    </DataTable>
                </div>
            </div>

            <!-- Right: Metadata & Materials -->
            <div class="flex flex-col gap-6">
                <!-- Status History -->
                <div class="p-4 bg-surface-0 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 flex flex-col gap-4">
                    <h4 class="text-xs font-black uppercase opacity-40 m-0">{{ $t('requisition.lifecycleTimeline') }}</h4>
                    <StatusTimeline :entity="queue" />
                </div>

                 <div class="p-4 bg-surface-0 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 flex flex-col gap-4">
                    <h4 class="text-xs font-black uppercase opacity-40 m-0">{{ $t('project.overview') }}</h4>
                    <div class="flex flex-col gap-2 text-sm text-surface-600 dark:text-surface-400">
                        <div class="flex justify-between">
                            <span class="opacity-60">{{ $t('queue.runs') }}</span>
                            <span class="font-bold text-surface-900 dark:text-surface-0">{{ queue.summary?.runCount || 0 }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import EntityStatus from '~/components/entities/shared/EntityStatus.vue';
import StatusTimeline from '~/components/shared/status/StatusTimeline.vue';
import LineageBreadcrumbs from '~/components/entities/shared/LineageBreadcrumbs.vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useIdentity, useStatus } from '~/composables/useBlocks';

const props = defineProps({
    queue: {
        type: Object,
        required: true
    }
});

defineEmits(['run-nesting']);

const { name: queueName } = useIdentity(props.queue);
const { state: queueState } = useStatus(props.queue);

</script>