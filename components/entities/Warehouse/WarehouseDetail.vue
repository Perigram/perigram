<template>
    <div class="flex flex-col gap-6">
        <!-- Header: Twin Identity -->
        <Panel>
            <template #header>
                <div class="flex items-center gap-4">
                    <i class="pi pi-building text-primary"></i>
                    <h2 class="text-xl font-bold m-0">{{ warehouseName }}</h2>
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
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-100 dark:border-surface-700 flex items-center justify-center text-primary">
                    <i class="pi pi-truck text-xl"></i>
                </div>
                <div class="flex flex-col">
                    <span class="text-2xl font-black">{{ warehouseStats.totalBatches || 0 }}</span>
                    <span class="text-[10px] font-black opacity-40 uppercase tracking-wider">{{ $t('warehouse.activeShipments') }}</span>
                </div>
            </div>
            <div class="p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-100 dark:border-surface-700 flex items-center justify-center text-primary">
                    <i class="pi pi-file text-xl"></i>
                </div>
                <div class="flex flex-col">
                    <span class="text-2xl font-black">{{ warehouseStats.totalSheets || 0 }}</span>
                    <span class="text-[10px] font-black opacity-40 uppercase tracking-wider">{{ $t('warehouse.rawSheets') }}</span>
                </div>
            </div>
            <div class="p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-100 dark:border-surface-700 flex items-center justify-center text-primary">
                    <i class="pi pi-undo text-xl"></i>
                </div>
                <div class="flex flex-col">
                    <span class="text-2xl font-black">{{ warehouseStats.totalRemnants || 0 }}</span>
                    <span class="text-[10px] font-black opacity-40 uppercase tracking-wider">{{ $t('warehouse.recoveredArea') }}</span>
                </div>
            </div>
        </div>

        <!-- Inventory Explorer -->
        <Tabs value="0" class="mt-4">
            <TabList>
                <Tab value="0">{{ $t('warehouse.storedBatches') }}</Tab>
                <Tab value="1">{{ $t('warehouse.availableSheets') }}</Tab>
                <Tab value="2">{{ $t('warehouse.remnants') }}</Tab>
            </TabList>
            <TabPanels>
                <TabPanel value="0">
                    <div v-if="batches.length" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 pt-4">
                        <PileCard 
                            v-for="batch in batches" 
                            :key="batch._id" 
                            :pile="batch" 
                            variant="compact"
                            @view="trace(batch, 'batch')"
                        />
                    </div>
                    <div v-else-if="!loading" class="text-center py-12 opacity-40 italic">No batches stored</div>
                </TabPanel>
                <TabPanel value="1">
                    <div v-if="sheets.length" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 pt-4">
                        <SheetCard 
                            v-for="sheet in sheets" 
                            :key="sheet._id" 
                            :sheet="sheet" 
                            variant="compact"
                            @click="trace(sheet, 'sheet')"
                        />
                    </div>
                    <div v-else-if="!loading" class="text-center py-12 opacity-40 italic">No sheets available</div>
                </TabPanel>
                <TabPanel value="2">
                    <div v-if="remnants.length" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 pt-4">
                        <RemnantCard 
                            v-for="remnant in remnants" 
                            :key="remnant._id" 
                            :remnant="remnant" 
                            variant="compact"
                            @click="trace(remnant, 'remnant')"
                        />
                    </div>
                    <div v-else-if="!loading" class="text-center py-12 opacity-40 italic">No remnants available</div>
                </TabPanel>
            </TabPanels>
        </Tabs>
    </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import Panel from 'primevue/panel';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Button from 'primevue/button';
import Card from 'primevue/card';
import EntityStatus from '~/components/entities/shared/EntityStatus.vue';
import PileCard from '~/components/entities/MaterialPile/PileCard.vue';
import SheetCard from '~/components/entities/Sheet/SheetCard.vue';
import RemnantCard from '~/components/entities/Remnant/RemnantCard.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
    warehouse: {
        type: Object,
        required: true
    }
});

defineEmits(['edit', 'trace']);

const { name: warehouseName } = useIdentity(props.warehouse);
const warehouseStats = computed(() => props.warehouse.stats || props.warehouse);

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
            $fetch(`/api/material-piles?lineage.warehouseId=${whId}`),
            $fetch(`/api/sheets?lineage.warehouseId=${whId}`),
            $fetch(`/api/remnants?lineage.warehouseId=${whId}`)
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
