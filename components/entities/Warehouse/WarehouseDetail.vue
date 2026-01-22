<template>
    <div class="flex flex-col gap-6">
        <!-- Header: Twin Identity -->
        <Panel>
            <template #header>
                <div class="flex items-center gap-4">
                    <i class="pi pi-building text-primary"></i>
                    <h2 class="text-xl font-bold m-0">{{ warehouse.name }}</h2>
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2">
                    <Button :label="$t('warehouse.editFacility')" icon="pi pi-pencil" text size="small" severity="secondary" @click="$emit('edit', warehouse)" />
                    <Button :label="$t('warehouse.inventorySnapshot')" icon="pi pi-file-pdf" text size="small" />
                </div>
            </template>
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2 opacity-70">
                    <i class="pi pi-map-marker text-xs"></i>
                    <span class="text-sm">{{ warehouse.address }}</span>
                </div>
                <div class="flex items-center gap-2 opacity-70">
                    <i class="pi pi-user text-xs"></i>
                    <span class="text-sm">{{ $t('warehouse.manager') }}: {{ warehouse.contactPerson || $t('warehouse.notAssigned') }}</span>
                </div>
            </div>
        </Panel>

        <!-- Operational Stock -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
                <template #content>
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-[var(--p-surface-100)] border border-[var(--p-content-border-color)] flex items-center justify-center text-primary">
                            <i class="pi pi-truck text-xl"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-2xl font-black">{{ warehouse.totalBatches || 0 }}</span>
                            <span class="text-[10px] font-black opacity-40 uppercase tracking-wider">{{ $t('warehouse.activeShipments') }}</span>
                        </div>
                    </div>
                </template>
            </Card>
            <Card>
                <template #content>
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-[var(--p-surface-100)] border border-[var(--p-content-border-color)] flex items-center justify-center text-primary">
                            <i class="pi pi-file text-xl"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-2xl font-black">{{ warehouse.totalSheets || 0 }}</span>
                            <span class="text-[10px] font-black opacity-40 uppercase tracking-wider">{{ $t('warehouse.rawSheets') }}</span>
                        </div>
                    </div>
                </template>
            </Card>
            <Card>
                <template #content>
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-[var(--p-surface-100)] border border-[var(--p-content-border-color)] flex items-center justify-center text-primary">
                            <i class="pi pi-undo text-xl"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-2xl font-black">{{ warehouse.totalRemnants || 0 }}</span>
                            <span class="text-[10px] font-black opacity-40 uppercase tracking-wider">{{ $t('warehouse.recoveredArea') }}</span>
                        </div>
                    </div>
                </template>
            </Card>
        </div>

        <!-- Inventory Explorer -->
        <TabView class="mt-4">
            <TabPanel :header="$t('warehouse.storedBatches')">
                <DataTable :value="batches" :loading="loading" stripedRows size="small">
                    <Column field="batchNumber" :header="$t('project.title') + ' #'" />
                    <Column :header="$t('project.status')">
                        <template #body="{ data }"><StatusBadge :status="data.status" /></template>
                    </Column>
                    <Column field="receiptId" :header="$t('project.overview')" />
                    <Column :header="$t('common.actions.title')" class="text-right">
                        <template #body="{ data }">
                            <Button icon="pi pi-eye" text @click="trace(data, 'batch')" />
                        </template>
                    </Column>
                </DataTable>
            </TabPanel>
            <TabPanel :header="$t('warehouse.availableSheets')">
                <DataTable :value="sheets" :loading="loading" stripedRows size="small">
                    <Column field="sheetId" header="ID" />
                    <Column field="color" :header="$t('assets.color')" />
                    <Column :header="$t('projectData.size')">
                        <template #body="{ data }">{{ data.width }}x{{ data.height }}mm</template>
                    </Column>
                    <Column :header="$t('common.actions.title')" class="text-right">
                        <template #body="{ data }">
                            <Button icon="pi pi-eye" text @click="trace(data, 'sheet')" />
                        </template>
                    </Column>
                </DataTable>
            </TabPanel>
            <TabPanel :header="$t('warehouse.remnants')">
                <DataTable :value="remnants" :loading="loading" stripedRows size="small">
                    <Column field="remnantId" header="ID" />
                    <Column field="status" :header="$t('project.status')" />
                    <Column :header="$t('common.actions.title')" class="text-right">
                        <template #body="{ data }">
                            <Button icon="pi pi-eye" text @click="trace(data, 'remnant')" />
                        </template>
                    </Column>
                </DataTable>
            </TabPanel>
        </TabView>
    </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import Panel from 'primevue/panel';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Card from 'primevue/card';
import StatusBadge from '~/components/shared/status/StatusBadge.vue';

const props = defineProps({
    warehouse: {
        type: Object,
        required: true
    }
});

defineEmits(['edit', 'trace']);

const batches = ref([]);
const sheets = ref([]);
const remnants = ref([]);
const loading = ref(false);

const loadInventory = async () => {
    if (!props.warehouse?._id) return;
    loading.value = true;
    try {
        const whId = props.warehouse._id;
        const [b, s, r] = await Promise.all([
            $fetch(`/api/material-batches?warehouseId=${whId}`),
            $fetch(`/api/sheets?warehouseId=${whId}`),
            $fetch(`/api/remnants?warehouseId=${whId}`)
        ]);
        batches.value = b;
        sheets.value = s;
        remnants.value = r;
    } catch (e) {
        console.error('Failed to load warehouse inventory:', e);
    } finally {
        loading.value = false;
    }
};

watch(() => props.warehouse?._id, () => loadInventory());
onMounted(() => loadInventory());

const trace = (item, type) => {
    // Navigate logic
};
</script>