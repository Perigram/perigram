<template>
  <div class="flex flex-col gap-8">
    <!-- Warehouse Switcher -->
    <Panel>
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div class="flex items-center gap-6">
                <div class="w-16 h-16 border rounded flex items-center justify-center">
                    <i class="pi pi-building text-3xl"></i>
                </div>
                <div class="flex flex-col gap-1">
                    <small>{{ $t('warehouse.activeWarehouse') }}</small>
                    <Select 
                        v-model="selectedWarehouseId" 
                        :options="warehouses" 
                        optionLabel="name" 
                        optionValue="_id" 
                        class="border-none bg-transparent p-0 shadow-none text-2xl"
                        pt:label:class="p-0"
                    />
                </div>
            </div>
            <div class="flex gap-2">
                <Button v-if="authStore.can('warehouses', 'create')" :label="$t('common.create')" icon="pi pi-plus" outlined @click="showDialog = true" />
            </div>
        </div>
    </Panel>

    <!-- Hub Content -->
    <div v-if="selectedWarehouse" class="flex flex-col gap-10">
        <WarehouseDetail :warehouse="selectedWarehouse" :warehouseStats="warehouseStats" />
        
        <Tabs value="0">
            <TabList>
                <Tab value="0">{{ $t('metadata.materials') }}</Tab>
                <Tab value="1">{{ $t('sheets.title') }}</Tab>
                <Tab value="2">{{ $t('remnants.title') }}</Tab>
            </TabList>
            <TabPanels>
                <TabPanel value="0"><PilesTab :piles="inventory.piles" :loading="loading" /></TabPanel>
                <TabPanel value="1"><SheetsTab :sheets="inventory.sheets" :loading="loading" /></TabPanel>
                <TabPanel value="2"><RemnantsTab :remnants="inventory.remnants" :loading="loading" /></TabPanel>
            </TabPanels>
        </Tabs>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '~/stores/auth';
import Panel from 'primevue/panel';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import WarehouseDetail from '~/components/entities/Warehouse/WarehouseDetail.vue';
import PilesTab from './PilesTab.vue';
import SheetsTab from './SheetsTab.vue';
import RemnantsTab from './RemnantsTab.vue';

const authStore = useAuthStore();
const warehouses = ref([]);
const selectedWarehouseId = ref(null);
const inventory = ref({ piles: [], sheets: [], remnants: [] });
const warehouseStats = ref({});
const loading = ref(false);

const selectedWarehouse = computed(() => warehouses.value.find(w => w._id === selectedWarehouseId.value));

const loadWarehouses = async () => {
    loading.value = true;
    try {
        warehouses.value = await $fetch('/api/warehouses');
        if (warehouses.value.length > 0 && !selectedWarehouseId.value) {
            selectedWarehouseId.value = warehouses.value[0]._id;
        }
    } catch (e) { console.error(e); }
    finally { loading.value = false; }
};

const loadInventory = async (whId) => {
    if (!whId) return;
    loading.value = true;
    try {
        const [piles, sheets, remnants, stats] = await Promise.all([
            $fetch(`/api/material-piles?lineage.warehouseId=${whId}`),
            $fetch(`/api/sheets?lineage.warehouseId=${whId}`),
            $fetch(`/api/remnants?lineage.warehouseId=${whId}`),
            $fetch(`/api/warehouses/${whId}/stats`)
        ]);
        inventory.value = { piles, sheets, remnants };
        warehouseStats.value = stats;
    } catch (e) { console.error(e); }
    finally { loading.value = false; }
};

watch(selectedWarehouseId, (newId) => loadInventory(newId));
onMounted(loadWarehouses);
</script>