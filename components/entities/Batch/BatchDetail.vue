<template>
    <div class="flex flex-col gap-6">
        <TraceChain :ancestry="ancestry" />

        <Panel>
            <template #header>
                <div class="flex items-center gap-4">
                    <i class="pi pi-truck text-primary"></i>
                    <h2 class="text-xl font-bold m-0">{{ batch.batchNumber }}</h2>
                    <StatusBadge :status="batch.status" />
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2">
                    <template v-if="authStore.isManufacturer">
                        <Button v-if="batch.status === 'requested'" label="Assemble" icon="pi pi-briefcase" size="small" @click="updateStatus('assembled')" />
                        <Button v-if="batch.status === 'assembled'" label="Ship" icon="pi pi-send" size="small" @click="updateStatus('sent')" />
                    </template>
                    <template v-if="authStore.isContractor">
                        <Button v-if="batch.status === 'sent'" label="Confirm Arrival" icon="pi pi-map-marker" severity="success" size="small" @click="updateStatus('arrived')" />
                        <Button v-if="batch.status === 'arrived'" label="Put into Stock" icon="pi pi-home" severity="success" size="small" @click="updateStatus('in_stock')" />
                    </template>
                </div>
            </template>
            
            <div class="flex flex-col gap-4">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="flex flex-col gap-1">
                        <span class="text-[10px] opacity-40 font-black uppercase">Receipt ID</span>
                        <span class="font-bold">{{ batch.receiptId || 'N/A' }}</span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-[10px] opacity-40 font-black uppercase">Warehouse</span>
                        <TraceLink type="warehouse" :id="batch.warehouseId" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-[10px] opacity-40 font-black uppercase">Created</span>
                        <span class="font-bold">{{ new Date(batch.createdAt).toLocaleDateString() }}</span>
                    </div>
                </div>
                <Fieldset legend="Notes" v-if="batch.notes" toggleable>
                    <p class="m-0 italic text-sm opacity-80">{{ batch.notes }}</p>
                </Fieldset>
            </div>
        </Panel>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div class="lg:col-span-3 flex flex-col gap-6">
                <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                    <i class="pi pi-clone"></i>
                    Stored Material Piles
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card v-for="(pile, idx) in batch.piles" :key="idx" class="border border-[var(--p-content-border-color)]">
                        <template #title>
                            <div class="flex justify-between items-center">
                                <div class="flex items-center gap-2">
                                    <div class="w-4 h-4 rounded-full border border-[var(--p-content-border-color)] shadow-sm" :style="{ backgroundColor: pile.colorFallback }"></div>
                                    <span class="text-sm font-bold">{{ pile.color }}</span>
                                </div>
                                <span class="text-[10px] font-mono opacity-60">{{ pile.partyId }}</span>
                            </div>
                        </template>
                        <template #content>
                            <div class="flex flex-col gap-4">
                                <MaterialSpecs :specs="pile" />
                                
                                <div class="flex flex-col gap-1">
                                    <div class="flex justify-between text-[10px] font-bold uppercase opacity-60">
                                        <span>Stock Level</span>
                                        <span>{{ pile.totalCount - pile.usedCount }} / {{ pile.totalCount }} sheets</span>
                                    </div>
                                    <ProgressBar :value="(pile.usedCount / pile.totalCount) * 100" :showValue="false" style="height: 4px" />
                                </div>
                            </div>
                        </template>
                    </Card>
                </div>
            </div>

            <div class="flex flex-col gap-6">
                <Panel header="Status History" toggleable>
                    <HistoryTimeline :history="batch.statusHistory" />
                </Panel>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { useEntityStore } from '~/stores/entities';
import Card from 'primevue/card';
import Panel from 'primevue/panel';
import Fieldset from 'primevue/fieldset';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import StatusBadge from '~/components/shared/status/StatusBadge.vue';
import HistoryTimeline from '~/components/shared/status/HistoryTimeline.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import MaterialSpecs from '~/components/shared/MaterialSpecs.vue';

const props = defineProps({
    batch: {
        type: Object,
        required: true
    }
});

const emit = defineEmits(['update-status']);

const authStore = useAuthStore();
const entityStore = useEntityStore();
const ancestry = computed(() => entityStore.getAncestry('batch', props.batch));

const updateStatus = (status) => {
    emit('update-status', { id: props.batch._id, status });
};
</script>
