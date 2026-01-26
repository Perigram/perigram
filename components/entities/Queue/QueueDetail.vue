<template>
    <div class="flex flex-col gap-6">
        <TraceChain :ancestry="ancestry" />

        <div class="flex justify-between items-center">
            <div class="flex items-center gap-4">
                <h2 class="text-3xl font-black m-0">{{ queue.name }}</h2>
                <EntityStatus :entity="queue" variant="inline" />
            </div>
            <div class="flex gap-2">
                <Button label="Nesting Config" icon="pi pi-sliders-h" severity="secondary" size="small" />
                <Button v-if="queue.status === 'DRAFT'" label="Run Nesting" icon="pi pi-play" size="small" severity="success" @click="$emit('run-nesting', queue._id)" />
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
             <!-- Left: Components & Layouts -->
            <div class="lg:col-span-3 flex flex-col gap-8">
                 <!-- Artifacts (Nesting Layouts) -->
                <div v-if="queue.artifacts?.length" class="flex flex-col gap-4">
                    <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                        <i class="pi pi-map"></i>
                        Nesting Layouts (Artifacts)
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div v-for="artId in queue.artifacts" :key="artId" class="p-4 border rounded-xl bg-[var(--p-content-background)]">
                            <TraceLink type="artifact" :id="artId" />
                        </div>
                    </div>
                </div>

                <!-- Cassette Components -->
                <div class="flex flex-col gap-4">
                    <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                        <i class="pi pi-pencil"></i>
                        Cassette Components
                    </h3>
                    <DataTable :value="queue.cassettes" class="p-datatable-sm border rounded-xl overflow-hidden shadow-sm">
                        <Column field="name" header="Cassette Name" />
                        <Column field="count" header="Quantity" />
                        <Column header="Material">
                            <template #body="{ data }">
                                <span class="text-xs opacity-60">{{ data.material }}</span>
                            </template>
                        </Column>
                        <Column header="Dimensions">
                             <template #body="{ data }">
                                <span class="text-xs">{{ data.width }}x{{ data.height }}mm</span>
                            </template>
                        </Column>
                    </DataTable>
                </div>
            </div>

            <!-- Right: Metadata & Materials -->
            <div class="flex flex-col gap-6">
                <!-- Status History -->
                <div class="p-4 bg-[var(--p-content-background)] rounded-xl border flex flex-col gap-4">
                    <h4 class="text-xs font-black uppercase opacity-40 m-0">Status History</h4>
                    <StatusTimeline collection="queues" :entityId="queue._id?.toString()" />
                </div>

                 <div class="p-4 bg-[var(--p-content-background)] rounded-xl border flex flex-col gap-4">
                    <h4 class="text-xs font-black uppercase opacity-40 m-0">Nesting Statistics</h4>
                    <div class="flex flex-col gap-2 text-sm">
                        <div class="flex justify-between">
                            <span class="opacity-60">Total Area</span>
                            <span class="font-bold">12.4 m²</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="opacity-60">Used Sheets</span>
                            <span class="font-bold">4</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="opacity-60">Efficiency</span>
                            <span class="font-bold text-green-600">82%</span>
                        </div>
                    </div>
                </div>

                <div class="p-4 border rounded-xl flex flex-col gap-4">
                    <h4 class="text-xs font-black uppercase opacity-40 m-0">Material Requirements</h4>
                    <div class="flex items-center gap-2 text-xs">
                        <div class="w-4 h-4 rounded bg-primary"></div>
                        <span>ALU 4.0mm - RAL 9005</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useEntityStore } from '~/stores/entities';
import EntityStatus from '~/components/entities/shared/EntityStatus.vue';
import StatusTimeline from '~/components/shared/status/StatusTimeline.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';

const props = defineProps({
    queue: {
        type: Object,
        required: true
    }
});

defineEmits(['run-nesting']);

const entityStore = useEntityStore();
const ancestry = computed(() => entityStore.getAncestry('queue', props.queue));
</script>
