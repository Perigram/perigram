<template>
    <div class="flex flex-col gap-8">
        <!-- Project Data Header -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex flex-col gap-1">
                <h1 class="m-0">{{ $t('project.data') }}</h1>
            </div>
            <div class="flex gap-2">
                <Button 
                    :label="$t('projectData.addMaterial')" 
                    icon="pi pi-plus" 
                    @click="showAddMaterialDialog = true"
                />
            </div>
        </div>

        <!-- Inventory and Logs Tabs -->
        <Tabs value="0">
            <TabList>
                <Tab value="0">
                    <div class="flex items-center gap-2">
                        <i class="pi pi-box"></i>
                        <span>{{ $t('metadata.materials') }}</span>
                    </div>
                </Tab>
                <Tab value="1">
                    <div class="flex items-center gap-2">
                        <i class="pi pi-history"></i>
                        <span>{{ $t('projectData.logs') }}</span>
                    </div>
                </Tab>
            </TabList>
            <TabPanels>
                <!-- Project Materials Panel -->
                <TabPanel value="0">
                    <div class="flex flex-col gap-6 py-4">
                        <div v-if="projectMaterials.length === 0" class="py-12 flex flex-col items-center justify-center text-center italic opacity-50">
                            <i class="pi pi-database text-5xl mb-4"></i>
                            <p>No materials in this project yet.</p>
                            <Button :label="$t('projectData.addMaterial')" icon="pi pi-plus" text size="small" @click="showAddMaterialDialog = true" />
                        </div>

                        <div v-else class="grid grid-cols-1 gap-6">
                            <div v-for="(pm, pIdx) in projectMaterials" :key="pIdx" 
                                class="border rounded overflow-hidden card-interactive"
                            >
                                <!-- Material Header -->
                                <div class="flex items-center justify-between p-4 border-b">
                                    <div class="flex items-center gap-4">
                                        <div class="w-10 h-10 border rounded flex items-center justify-center">
                                            {{ pm.material.name.charAt(0) }}
                                        </div>
                                        <div class="flex flex-col">
                                            <h3 class="m-0">{{ pm.material.name }}</h3>
                                            <small>{{ pm.material.code }} • {{ pm.material.color }} • {{ pm.material.thickness }}mm</small>
                                        </div>
                                    </div>
                                    <div class="flex gap-2">
                                        <Button icon="pi pi-plus" :label="$t('projectData.addSheets')" text size="small" @click="openAddSheets(pm)" />
                                        <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="confirmDeleteMaterial(pIdx)" />
                                    </div>
                                </div>

                                <!-- Material Content: Sheets and Waste -->
                                <div class="grid grid-cols-1 md:grid-cols-2">
                                    <!-- Sheets Column -->
                                    <div class="p-4 flex flex-col gap-3">
                                        <small>{{ $t('projectData.sheets') }}</small>
                                        <DataTable :value="pm.sheets" size="small">
                                            <Column field="width" :header="$t('projectData.size')">
                                                <template #body="slotProps">
                                                    {{ slotProps.data.width }}x{{ slotProps.data.height }}
                                                </template>
                                            </Column>
                                            <Column field="available" :header="$t('metadata.available')" />
                                            <Column field="quantity" :header="$t('projectData.quantity')" />
                                            <Column header="" style="width: 40px">
                                                <template #body="slotProps">
                                                    <Button icon="pi pi-times" severity="danger" text rounded size="small" @click="removeSheets(pm, slotProps.index)" />
                                                </template>
                                            </Column>
                                            <template #empty>
                                                <p class="text-center italic py-4">{{ $t('projectData.noSheets') }}</p>
                                            </template>
                                        </DataTable>
                                    </div>

                                    <!-- Waste Polygons Column -->
                                    <div class="p-4 border-l flex flex-col gap-3">
                                        <small>{{ $t('projectData.wastePolygons') }}</small>
                                        <div v-if="pm.wastePolygons && pm.wastePolygons.length > 0" class="flex flex-wrap gap-2">
                                            <Chip v-for="(wp, wIdx) in pm.wastePolygons" :key="wIdx" :label="`${$t('projectData.wasteArea')} #${wIdx+1} (${wp.area || 0}m²)`" removable @remove="removeWaste(pm, wIdx)" />
                                        </div>
                                        <p v-else class="text-center italic py-4">No waste polygons available.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </TabPanel>

                <!-- Cut Logs Panel -->
                <TabPanel value="1">
                    <div class="flex flex-col gap-4 py-4">
                        <DataTable :value="cutLogs" class="border rounded" responsiveLayout="scroll">
                            <Column field="date" :header="$t('projectData.logDate')">
                                <template #body="slotProps">
                                    <span class="italic">{{ formatDate(slotProps.data.date) }}</span>
                                </template>
                            </Column>
                            <column field="userName" :header="$t('projectData.logUser')">
                                <template #body="slotProps">
                                    <span>{{ slotProps.data.userName || $t('admin.unknownUser') }}</span>
                                </template>
                            </column>
                            <column field="queueName" :header="$t('projectData.logQueue')">
                                <template #body="slotProps">
                                    <span>{{ slotProps.data.queueName }}</span>
                                </template>
                            </column>
                            <column field="sheetsUsed" :header="$t('projectData.logSheets')" class="text-center" />
                            <Column field="utilization" :header="$t('projectData.logUtilization')" class="text-center">
                                <template #body="slotProps">
                                    <span>{{ (slotProps.data.utilization * 100).toFixed(1) }}%</span>
                                </template>
                            </Column>
                            <Column field="wasteArea" :header="$t('projectData.logWaste')">
                                <template #body="slotProps">
                                    <div class="flex items-center justify-between gap-2">
                                        <span>{{ (slotProps.data.wasteArea || 0).toFixed(2) }} m²</span>
                                        <Button 
                                            v-if="slotProps.data.hasWastePolygons"
                                            icon="pi pi-plus-circle" 
                                            severity="secondary" 
                                            text 
                                            rounded 
                                            size="small" 
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

        <!-- Add Material Dialog -->
        <Dialog 
            v-model:visible="showAddMaterialDialog" 
            :header="$t('projectData.addMaterialToProject')" 
            modal 
        >
            <div class="flex flex-col gap-4 py-4">
                <div class="flex flex-col gap-1">
                    <label>Select from Global Library</label>
                    <Select 
                        v-model="selectedGlobalMaterialId" 
                        :options="globalMaterials" 
                        optionLabel="name"
                        optionValue="_id"
                        class="w-full"
                        :placeholder="$t('projectData.chooseMaterial')"
                    >
                        <template #option="slotProps">
                            <div class="flex flex-col">
                                <span>{{ slotProps.option.name }}</span>
                                <small>{{ slotProps.option.code }} • {{ slotProps.option.thickness }}mm</small>
                            </div>
                        </template>
                    </Select>
                </div>
                <div class="p-4 border border-dashed rounded text-center">
                    <small>Material not found?</small>
                    <Button :label="$t('projectData.createNewMaterial')" text size="small" @click="showCreateMaterialDialog = true" />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showAddMaterialDialog = false" />
                <Button :label="$t('common.add')" @click="addMaterialToProject" :disabled="!selectedGlobalMaterialId" />
            </template>
        </Dialog>

        <!-- Create New Material Dialog (Global) -->
        <Dialog v-model:visible="showCreateMaterialDialog" :header="$t('projectData.createGlobalMaterial')" modal>
            <div class="grid grid-cols-1 gap-4 py-4">
                <div class="flex flex-col gap-1">
                    <label>{{ $t('common.name') }}</label>
                    <InputText v-model="newGlobalMaterial.name" placeholder="e.g. Alucobond" />
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-1">
                        <label>{{ $t('projectData.placeholders.code') }}</label>
                        <InputText v-model="newGlobalMaterial.code" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label>{{ $t('projectData.type') }}</label>
                        <Select v-model="newGlobalMaterial.type" :options="['ACP', 'STEEL', 'ALU', 'WOOD']" />
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-1">
                        <label>{{ $t('projectData.placeholders.color') }}</label>
                        <InputText v-model="newGlobalMaterial.color" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label>{{ $t('metadata.thickness') }} (mm)</label>
                        <InputNumber v-model="newGlobalMaterial.thickness" :min="0.1" :step="0.1" />
                    </div>
                </div>
                <div class="flex flex-col gap-1">
                    <label>{{ $t('requisition.manufacturer') }}</label>
                    <InputText v-model="newGlobalMaterial.manufacturer" />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showCreateMaterialDialog = false" />
                <Button :label="$t('projectData.createAndAdd')" @click="createAndAddMaterial" />
            </template>
        </Dialog>

        <!-- Add Sheets Dialog -->
        <Dialog 
            v-model:visible="showAddSheetsDialog" 
            :header="$t('projectData.addSheets')" 
            modal 
        >
            <div class="flex flex-col gap-4 py-4" v-if="activeProjectMaterial">
                <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-1">
                        <label>Width (mm)</label>
                        <InputNumber v-model="sheetForm.width" :min="1" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label>Height (mm)</label>
                        <InputNumber v-model="sheetForm.height" :min="1" />
                    </div>
                </div>
                <div class="flex flex-col gap-1">
                    <label>Quantity</label>
                    <InputNumber v-model="sheetForm.quantity" :min="1" showButtons />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showAddSheetsDialog = false" />
                <Button :label="$t('common.add')" @click="saveSheets" />
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
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Chip from 'primevue/chip';
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

const projectMaterials = ref([]);
const cutLogs = ref([]);
const globalMaterials = ref([]);
const loading = ref(false);
const saving = ref(false);

const showAddMaterialDialog = ref(false);
const showCreateMaterialDialog = ref(false);
const showAddSheetsDialog = ref(false);

const selectedGlobalMaterialId = ref(null);
const newGlobalMaterial = ref({
    name: '',
    code: '',
    type: 'ACP',
    color: '',
    thickness: 4,
    manufacturer: ''
});

const activeProjectMaterial = ref(null);
const sheetForm = ref({
    width: 2440,
    height: 1220,
    quantity: 10
});

onMounted(async () => {
    await Promise.all([
        fetchProjectData(),
        fetchGlobalMaterials()
    ]);
});

const fetchProjectData = async () => {
    loading.value = true;
    try {
        const data = await $fetch(`/api/project/${projectSlug}`);
        projectMaterials.value = data.projectMaterials || [];
        cutLogs.value = data.cutLogs || [];
    } catch (error) {
        console.error('Failed to fetch project data:', error);
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('errors.loadFailed'), life: 3000 });
    } finally {
        loading.value = false;
    }
};

const fetchGlobalMaterials = async () => {
    try {
        globalMaterials.value = await $fetch('/api/materials');
    } catch (error) {
        console.error('Failed to fetch global materials:', error);
    }
};

const addMaterialToProject = async () => {
    const mat = globalMaterials.value.find(m => m._id === selectedGlobalMaterialId.value);
    if (!mat) return;

    if (projectMaterials.value.some(pm => pm.material.code === mat.code)) {
        toast.add({ severity: 'warn', summary: 'Warning', detail: 'Material already in project', life: 3000 });
        return;
    }

    const newProjectMaterials = [
        ...projectMaterials.value,
        {
            materialId: mat._id,
            material: mat,
            sheets: [],
            wastePolygons: []
        }
    ];

    try {
        await updateProject({ projectMaterials: newProjectMaterials });
        projectMaterials.value = newProjectMaterials;
        showAddMaterialDialog.value = false;
        selectedGlobalMaterialId.value = null;
        toast.add({ severity: 'success', summary: t('common.success'), detail: 'Material added to project', life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('errors.saveFailed'), life: 3000 });
    }
};

const createAndAddMaterial = async () => {
    try {
        const created = await $fetch('/api/materials', {
            method: 'POST',
            body: newGlobalMaterial.value
        });
        globalMaterials.value.push(created);
        selectedGlobalMaterialId.value = created._id;
        await addMaterialToProject();
        showCreateMaterialDialog.value = false;
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('errors.saveFailed'), life: 3000 });
    }
};

const openAddSheets = (pm) => {
    activeProjectMaterial.value = pm;
    showAddSheetsDialog.value = true;
};

const saveSheets = async () => {
    if (!activeProjectMaterial.value) return;
    
    const pm = activeProjectMaterial.value;
    const existing = pm.sheets.find(s => s.width === sheetForm.value.width && s.height === sheetForm.value.height);
    
    if (existing) {
        existing.quantity += sheetForm.value.quantity;
        existing.available += sheetForm.value.quantity;
    } else {
        pm.sheets.push({
            ...sheetForm.value,
            available: sheetForm.value.quantity
        });
    }

    try {
        await updateProject({ projectMaterials: projectMaterials.value });
        showAddSheetsDialog.value = false;
        toast.add({ severity: 'success', summary: t('common.success'), detail: 'Sheets added', life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('errors.saveFailed'), life: 3000 });
    }
};

const removeSheets = async (pm, index) => {
    pm.sheets.splice(index, 1);
    await updateProject({ projectMaterials: projectMaterials.value });
};

const removeWaste = async (pm, index) => {
    pm.wastePolygons.splice(index, 1);
    await updateProject({ projectMaterials: projectMaterials.value });
};

const confirmDeleteMaterial = (index) => {
    confirm.require({
        message: 'Remove material from project?',
        header: 'Confirmation',
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            const newMats = [...projectMaterials.value];
            newMats.splice(index, 1);
            try {
                await updateProject({ projectMaterials: newMats });
                projectMaterials.value = newMats;
                toast.add({ severity: 'success', summary: t('common.success'), detail: t('messages.deleteSuccess'), life: 3000 });
            } catch (error) {
                console.error('Failed to delete material:', error);
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
    toast.add({ severity: 'info', summary: 'Coming Soon', detail: 'Waste extraction from artifacts', life: 3000 });
};

const formatDate = (date) => {
    return new Date(date).toLocaleString();
};
</script>