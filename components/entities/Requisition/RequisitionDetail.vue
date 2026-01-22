<template>
    <div class="flex flex-col gap-6">
        <!-- Header & Breadcrumbs -->
        <div class="flex flex-col gap-4">
            <TraceChain :ancestry="ancestry" />
            
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div class="flex items-center gap-4">
                    <h2 class="text-2xl font-black m-0">#{{ requisition.requisitionNumber }}</h2>
                    <StatusBadge :status="requisition.status" />
                </div>
                <div class="flex gap-2">
                    <template v-if="authStore.isContractor && requisition.status === 'draft'">
                        <Button label="Submit" icon="pi pi-send" size="small" @click="$emit('send', requisition._id)" />
                    </template>
                    <template v-if="authStore.isManufacturer && requisition.status === 'sent'">
                        <Button label="Approve" icon="pi pi-check" severity="success" size="small" @click="$emit('approve', requisition._id)" />
                        <Button label="Reject" icon="pi pi-times" severity="danger" text size="small" @click="$emit('reject', requisition._id)" />
                    </template>
                    <template v-if="authStore.isManufacturer && requisition.status === 'approved'">
                        <Button label="Start Fulfillment" icon="pi pi-play" severity="info" size="small" @click="$emit('start-fulfillment', requisition._id)" />
                    </template>
                    <template v-if="authStore.isManufacturer && requisition.status === 'in_fulfillment'">
                        <Button label="Complete & Ship" icon="pi pi-box" severity="success" size="small" @click="$emit('fulfill', requisition._id)" />
                    </template>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div class="lg:col-span-3 flex flex-col gap-8">
                <!-- Items List -->
                <div class="flex flex-col gap-4">
                    <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                        <i class="pi pi-list"></i>
                        Order Composition
                    </h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card v-for="(item, idx) in requisition.items" :key="idx" class="border border-[var(--p-content-border-color)]">
                            <template #title>
                                <div class="flex justify-between items-center">
                                    <div class="flex items-center gap-2">
                                        <div class="w-4 h-4 rounded-full border border-[var(--p-content-border-color)] shadow-sm" :style="{ backgroundColor: item.colorFallback }"></div>
                                        <span class="text-sm font-bold">{{ item.color }}</span>
                                    </div>
                                    <span class="text-[10px] font-mono opacity-60">{{ item.colorCode }}</span>
                                </div>
                            </template>
                            <template #content>
                                <MaterialSpecs :specs="item" />
                                <div class="mt-4 flex justify-between items-center pt-2 border-t border-dashed border-[var(--p-content-border-color)]">
                                    <div class="flex flex-col">
                                        <span class="text-[10px] opacity-40 font-black uppercase">Quantity</span>
                                        <span class="text-lg font-black">{{ item.quantity }}</span>
                                    </div>
                                    <div class="flex flex-col text-right">
                                        <span class="text-[10px] opacity-40 font-black uppercase">Subtotal</span>
                                        <span class="text-sm font-bold text-primary">${{ item.totalPrice?.toFixed(2) }}</span>
                                    </div>
                                </div>
                            </template>
                        </Card>
                    </div>
                </div>

                <Fieldset legend="Internal Notes" v-if="requisition.notes" toggleable>
                    <p class="text-sm italic opacity-80 m-0">{{ requisition.notes }}</p>
                </Fieldset>
            </div>

            <!-- Sidebar -->
            <div class="flex flex-col gap-8">
                <Panel header="Lifecycle Timeline" toggleable>
                    <HistoryTimeline :history="requisition.statusHistory" />
                </Panel>

                <div v-if="relatedBatches.length > 0" class="flex flex-col gap-3">
                    <span class="text-[10px] font-black uppercase opacity-40">Linked Shipments</span>
                    <TraceLink v-for="batchId in relatedBatches" :key="batchId" type="batch" :id="batchId" />
                </div>
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
import StatusBadge from '~/components/shared/status/StatusBadge.vue';
import HistoryTimeline from '~/components/shared/status/HistoryTimeline.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import MaterialSpecs from '~/components/shared/MaterialSpecs.vue';

const props = defineProps({
    requisition: {
        type: Object,
        required: true
    }
});

defineEmits(['send', 'approve', 'reject', 'start-fulfillment', 'fulfill']);

const authStore = useAuthStore();
const entityStore = useEntityStore();
const ancestry = computed(() => entityStore.getAncestry('requisition', props.requisition));
const relatedBatches = computed(() => props.requisition.linkedBatches || []);
</script>
