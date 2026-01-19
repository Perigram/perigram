<template>
    <div class="flex flex-col gap-8 p-1">
        <!-- Project Data Header -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex flex-col gap-1">
                <h2 class="text-xl font-black text-[var(--p-text-color)] m-0 uppercase tracking-widest">{{ $t('project.data') }}</h2>
                <p class="text-xs font-bold text-[var(--p-text-muted-color)] uppercase tracking-tight">{{ projectSlug }}</p>
            </div>
            <div class="flex gap-2">
                <Button 
                    :label="$t('projectData.addSheets')" 
                    icon="pi pi-plus" 
                    @click="showAddSheetsDialog = true"
                    class="h-[42px]"
                />
            </div>
        </div>

        <!-- Inventory and Logs Tabs -->
        <Tabs value="0">
            <TabList>
                <Tab value="0">
                    <div class="flex items-center gap-2">
                        <i class="pi pi-box"></i>
                        <span class="font-bold uppercase tracking-wider text-xs">{{ $t('projectData.sheets') }}</span>
                    </div>
                </Tab>
                <Tab value="1">
                    <div class="flex items-center gap-2">
                        <i class="pi pi-history"></i>
                        <span class="font-bold uppercase tracking-wider text-xs">{{ $t('projectData.logs') }}</span>
                    </div>
                </Tab>
            </TabList>
            <TabPanels>
                <!-- Sheets Inventory Panel -->
                <TabPanel value="0">
                    <div class="flex flex-col gap-4 py-4">
                        <DataTable :value="sheets" class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden" responsiveLayout="scroll">
                            <Column field="material.name" :header="$t('projectData.material')">
                                <template #body="slotProps">
                                    <div class="flex flex-col">
                                        <span class="font-bold text-sm">{{ slotProps.data.material.name }}</span>
                                        <span class="text-[10px] text-[var(--p-text-muted-color)] uppercase font-bold">{{ slotProps.data.material.color }}</span>
                                    </div>
                                </template>
                            </Column>
                            <Column field="width" :header="$t('projectData.size')">
                                <template #body="slotProps">
                                    <span class="font-medium">{{ slotProps.data.width }} x {{ slotProps.data.height }} mm</span>
                                </template>
                            </Column>
                            <Column field="quantity" :header="$t('projectData.totalSheets')" style="width: 120px" class="text-center font-bold" />
                            <Column field="available" :header="$t('projectData.availableSheets')" style="width: 120px" class="text-center">
                                <template #body="slotProps">
                                    <Tag :value="slotProps.data.available" :severity="getAvailableSeverity(slotProps.data)" class="font-black" />
                                </template>
                            </Column>
                            <Column :header="$t('common.actions')" style="width: 80px" class="text-right">
                                <template #body="slotProps">
                                    <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="confirmDeleteSheet(slotProps.index)" />
                                </template>
                            </Column>
                            <template #empty>
                                <div class="py-12 flex flex-col items-center justify-center text-center opacity-60">
                                    <i class="pi pi-inbox text-5xl mb-4"></i>
                                    <p class="font-bold uppercase tracking-widest text-xs">{{ $t('projectData.noSheets') }}</p>
                                    <Button :label="$t('projectData.addFirstSheets')" icon="pi pi-plus" text size="small" @click="showAddSheetsDialog = true" />
                                </div>
                            </template>
                        </DataTable>
                    </div>
                </TabPanel>

                <!-- Cut Logs Panel -->
                <TabPanel value="1">
                    <div class="flex flex-col gap-4 py-4">
                        <DataTable :value="cutLogs" class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden" responsiveLayout="scroll">
                            <Column field="date" :header="$t('projectData.logDate')">
                                <template #body="slotProps">
                                    <span class="text-xs font-medium">{{ formatDate(slotProps.data.date) }}</span>
                                </template>
                            </Column>
                            <Column field="userName" :header="$t('projectData.logUser')">
                                <template #body="slotProps">
                                    <span class="text-xs font-bold uppercase tracking-tight">{{ slotProps.data.userName || $t('admin.unknownUser') }}</span>
                                </template>
                            </Column>
                            <Column field="batchName" :header="$t('projectData.logBatch')">
                                <template #body="slotProps">
                                    <span class="font-medium">{{ slotProps.data.batchName }}</span>
                                </template>
                            </Column>
                            <Column field="sheetsUsed" :header="$t('projectData.logSheets')" style="width: 100px" class="text-center" />
                            <Column field="utilization" :header="$t('projectData.logUtilization')" style="width: 120px" class="text-center">
                                <template #body="slotProps">
                                    <span class="font-black text-[var(--p-primary-color)]">{{ (slotProps.data.utilization * 100).toFixed(1) }}%</span>
                                </template>
                            </Column>
                            <Column field="wasteArea" :header="$t('projectData.logWaste')" style="width: 120px">
                                <template #body="slotProps">
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="text-xs">{{ (slotProps.data.wasteArea || 0).toFixed(2) }} m²</span>
                                        <Button 
                                            v-if="slotProps.data.hasWastePolygons"
                                            icon="pi pi-plus-circle" 
                                            severity="secondary" 
                                            text 
                                            rounded 
                                            size="small" 
                                            v-tooltip.top="$t('projectData.addWasteToInventory')" 
                                            @click="addWasteToInventory(slotProps.data)"
                                        />
                                    </div>
                                </template>
                            </Column>
                        </DataTable>
                    </div>
                </TabPanel>
            </TabPanels>
        </Tabs>

        <!-- Add Sheets Dialog -->
        <Dialog 
            v-model:visible="showAddSheetsDialog" 
            :header="$t('projectData.addSheets')" 
            modal 
            :style="{ width: '95vw', maxWidth: '500px' }"
        >
            <div class="flex flex-col gap-6 py-4">
                <div class="flex flex-col gap-2">
                    <label class="text-sm font-bold uppercase tracking-wider text-[var(--p-text-muted-color)]">{{ $t('projectData.material') }}</label>
                    <Select 
                        v-model="newSheet.material" 
                        :options="materialOptions" 
                        optionLabel="name"
                        class="w-full"
                        :placeholder="$t('projectData.material')"
                    >
                        <template #option="slotProps">
                            <div class="flex flex-col">
                                <span class="font-bold text-sm">{{ slotProps.option.name }}</span>
                                <span class="text-[10px] text-[var(--p-text-muted-color)] uppercase font-bold">{{ slotProps.option.color }}</span>
                            </div>
                        </template>
                    </Select>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-2">
                        <label class="text-sm font-bold uppercase tracking-wider text-[var(--p-text-muted-color)]">Width (mm)</label>
                        <InputNumber v-model="newSheet.width" :min="1" class="w-full" />
                    </div>
                    <div class="flex flex-col gap-2">
                        <label class="text-sm font-bold uppercase tracking-wider text-[var(--p-text-muted-color)]">Height (mm)</label>
                        <InputNumber v-model="newSheet.height" :min="1" class="w-full" />
                    </div>
                </div>

                <div class="flex flex-col gap-2">
                    <label class="text-sm font-bold uppercase tracking-wider text-[var(--p-text-muted-color)]">{{ $t('projectData.quantity') }}</label>
                    <InputNumber v-model="newSheet.quantity" :min="1" showButtons class="w-full" />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showAddSheetsDialog = false" />
                <Button :label="$t('common.add')" @click="addSheets" :loading="saving" />
            </template>
        </Dialog>

        <ConfirmDialog />
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import InputNumber from 'primevue/inputnumber';
import ConfirmDialog from 'primevue/confirmdialog';

definePageMeta({
    layout: 'app',
    middleware: 'auth',
});

const route = useRoute();
const projectSlug = route.params.slug;
const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();

const sheets = ref([]);
const cutLogs = ref([]);
const loading = ref(false);
const saving = ref(false);
const showAddSheetsDialog = ref(false);

const materialOptions = ref([
    { name: t('projectData.materials.composite'), color: 'Silver/Silver', code: 'ACP-01', manufacturer: 'Alucobond' },
    { name: t('projectData.materials.composite'), color: 'White/White', code: 'ACP-02', manufacturer: 'Dibond' },
    { name: t('projectData.materials.aluminum'), color: 'Mill Finish', code: 'AL-01', manufacturer: 'Norsk Hydro' },
    { name: t('projectData.materials.steel'), color: 'Galvanized', code: 'ST-01', manufacturer: 'Tata Steel' }
]);

const newSheet = ref({
    material: materialOptions.value[0],
    width: 2440,
    height: 1220,
    quantity: 10
});

onMounted(async () => {
    await fetchProjectData();
});

const fetchProjectData = async () => {
    loading.value = true;
    try {
        const data = await $fetch(`/api/project/${projectSlug}`);
        sheets.value = data.sheets || [];
        cutLogs.value = data.cutLogs || [];
    } catch (error) {
        console.error('Failed to fetch project data:', error);
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('errors.loadFailed'), life: 3000 });
    } finally {
        loading.value = false;
    }
};

const addSheets = async () => {
    saving.value = true;
    try {
        const newSheets = [...sheets.value];
        // Check if same sheet exists
        const existingIndex = newSheets.findIndex(s => 
            s.width === newSheet.value.width && 
            s.height === newSheet.value.height && 
            s.material.code === newSheet.value.material.code
        );

        if (existingIndex > -1) {
            newSheets[existingIndex].quantity += newSheet.value.quantity;
            newSheets[existingIndex].available += newSheet.value.quantity;
        } else {
            newSheets.push({
                ...newSheet.value,
                available: newSheet.value.quantity,
                createdAt: new Date()
            });
        }

        await updateProject({ sheets: newSheets });
        sheets.value = newSheets;
        showAddSheetsDialog.value = false;
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('messages.saveSuccess'), life: 3000 });
    } catch (error) {
        console.error('Failed to add sheets:', error);
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('errors.saveFailed'), life: 3000 });
    } finally {
        saving.value = false;
    }
};

const confirmDeleteSheet = (index) => {
    confirm.require({
        message: t('messages.confirmDelete'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            const newSheets = [...sheets.value];
            newSheets.splice(index, 1);
            try {
                await updateProject({ sheets: newSheets });
                sheets.value = newSheets;
                toast.add({ severity: 'success', summary: t('common.success'), detail: t('messages.deleteSuccess'), life: 3000 });
            } catch (error) {
                console.error('Failed to delete sheet:', error);
            }
        }
    });
};

const updateProject = async (data) => {
    return await $fetch(`/api/project/${projectSlug}`, {
        method: 'PATCH',
        body: data
    });
};

const addWasteToInventory = async (logEntry) => {
    // In real implementation, this would extract polygons from artifacts and add to inventory
    toast.add({ severity: 'info', summary: 'Coming Soon', detail: 'Waste polygon tracking is being implemented', life: 3000 });
};

const getAvailableSeverity = (sheet) => {
    const ratio = sheet.available / sheet.quantity;
    if (ratio < 0.2) return 'danger';
    if (ratio < 0.5) return 'warning';
    return 'success';
};

const formatDate = (date) => {
    return new Date(date).toLocaleString();
};
</script>

<style scoped>
:deep(.p-tabview-nav) {
    border-bottom: 1px solid var(--p-content-border-color);
}
:deep(.p-tabview-nav-link) {
    padding: 1rem 1.5rem;
}
</style>