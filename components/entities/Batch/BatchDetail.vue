<template>
    <div class="flex flex-col gap-6">
        <LineageBreadcrumbs :entity="batch" />

        <Panel>
            <template #header>
                <div class="flex items-center gap-4">
                    <i class="pi pi-truck text-primary"></i>
                    <h2 class="text-xl font-bold m-0">{{ batchName }}</h2>
                    <EntityStatus :entity="batch" />
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2">
                    <Button icon="pi pi-qrcode" severity="secondary" text size="small" />
                </div>
            </template>
            
            <div class="flex flex-col gap-4">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="flex flex-col gap-1">
                        <span class="text-[10px] opacity-40 font-black uppercase">Reference</span>
                        <span class="font-bold">{{ batch.identity?.reference || 'N/A' }}</span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-[10px] opacity-40 font-black uppercase">Warehouse ID</span>
                        <span class="font-mono text-xs">{{ batch.lineage?.warehouseId }}</span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-[10px] opacity-40 font-black uppercase">Created</span>
                        <span class="font-bold">{{ new Date(batch.createdAt).toLocaleDateString() }}</span>
                    </div>
                </div>
            </div>
        </Panel>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div class="lg:col-span-3 flex flex-col gap-6">
                <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                    <i class="pi pi-clone"></i>
                    Material Specifications
                </h3>

                <Card class="border border-[var(--p-content-border-color)]">
                    <template #content>
                        <div class="flex flex-col gap-6">
                            <MaterialSpecs :specs="batch.specs" />
                            
                            <div class="flex flex-col gap-2 p-4 bg-[var(--p-surface-100)] rounded-xl">
                                <div class="flex justify-between text-[10px] font-black uppercase opacity-60">
                                    <span>Stock Level</span>
                                    <span>{{ availableStock }} / {{ totalStock }} sheets</span>
                                </div>
                                <ProgressBar :value="stockPercentage" :showValue="false" style="height: 8px" />
                                <div class="flex justify-between text-[10px] font-bold opacity-40">
                                    <span>Used: {{ usedStock }}</span>
                                    <span>Available: {{ availableStock }}</span>
                                </div>
                            </div>
                        </div>
                    </template>
                </Card>
            </div>

            <div class="flex flex-col gap-6">
                <Panel header="Status Timeline" toggleable>
                    <StatusTimeline :entity="batch" />
                </Panel>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import Card from 'primevue/card';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import EntityStatus from '~/components/entities/shared/EntityStatus.vue';
import StatusTimeline from '~/components/shared/status/StatusTimeline.vue';
import LineageBreadcrumbs from '~/components/entities/shared/LineageBreadcrumbs.vue';
import MaterialSpecs from '~/components/shared/MaterialSpecs.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
    batch: {
        type: Object,
        required: true
    }
});

const authStore = useAuthStore();
const { name: batchName } = useIdentity(props.batch);

const totalStock = computed(() => props.batch.stock?.total || 0);
const usedStock = computed(() => props.batch.stock?.used || 0);
const availableStock = computed(() => totalStock.value - usedStock.value);
const stockPercentage = computed(() => totalStock.value > 0 ? (usedStock.value / totalStock.value) * 100 : 0);

</script>