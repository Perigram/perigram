<template>
    <div class="flex flex-col gap-6">
        <ActionToolbar :title="$t('project.data')">
            <template #actions>
                <Button
                    :label="$t('projectData.addMaterial')"
                    icon="pi pi-plus"
                    @click="showAddMaterialDialog = true"
                />
            </template>
        </ActionToolbar>

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
                        <StateBlock v-if="projectMaterials.length === 0" :message="$t('projectData.noMaterials')" icon="pi pi-database">
                            <template #actions>
                                <Button :label="$t('projectData.addMaterial')" icon="pi pi-plus" text size="small" @click="showAddMaterialDialog = true" />
                            </template>
                        </StateBlock>

                        <div v-else class="grid grid-cols-1 gap-6">
                            <Panel v-for="(pm, pIdx) in projectMaterials" :key="pIdx">
                                <template #header>
                                <!-- Material Header -->
                                <div class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-4">
                                    <div class="flex items-center gap-4">
                                        <div class="w-10 h-10 rounded-ui border border-content-border flex items-center justify-center">
                                            {{ pm.material.name.charAt(0) }}
                                        </div>
                                        <div class="flex flex-col">
                                            <h3 class="m-0">{{ pm.material.name }}</h3>
                                            <small>{{ pm.material.code }} • {{ pm.material.color }} • {{ pm.material.thickness }}mm</small>
                                        </div>
                                    </div>
                                    <div class="flex gap-2">
                                        <Button icon="pi pi-plus" :label="$t('projectData.addSheets')" text size="small" @click="openAddSheets(pm)" />
                                        <Button icon="pi pi-trash" severity="danger" text rounded size="small" :aria-label="$t('common.delete')" @click="confirmDeleteMaterial(pIdx)" />
                                    </div>
                                </div>
                                </template>

                                <!-- Material Content: Sheets and Waste -->
                                <div class="grid grid-cols-1 md:grid-cols-2">
                                    <!-- Sheets Column -->
                                    <div class="p-4 flex flex-col gap-3">
                                        <small>{{ $t('projectData.sheets') }}</small>
                                        <TableFrame>
                                            <DataTable :value="pm.sheets" size="small">
                                                <Column field="width" :header="$t('projectData.size')">
                                                    <template #body="slotProps">
                                                        {{ slotProps.data.width }}x{{ slotProps.data.height }}
                                                    </template>
                                                </Column>
                                                <Column field="available" :header="$t('metadata.available')" />
                                                <Column field="quantity" :header="$t('projectData.quantity')" />
                                                <Column header="" style="width: var(--ck-table-action-column-width)">
                                                    <template #body="slotProps">
                                                        <Button icon="pi pi-times" severity="danger" text rounded size="small" :aria-label="$t('common.delete')" @click="removeSheets(pm, slotProps.index)" />
                                                    </template>
                                                </Column>
                                                <template #empty>
                                                    <span class="text-muted-color">{{ $t('projectData.noSheets') }}</span>
                                                </template>
                                            </DataTable>
                                        </TableFrame>
                                    </div>

                                    <!-- Waste Polygons Column -->
                                    <div class="p-4 border-l flex flex-col gap-3">
                                        <small>{{ $t('projectData.wastePolygons') }}</small>
                                        <div v-if="pm.wastePolygons && pm.wastePolygons.length > 0" class="flex flex-wrap gap-2">
                                            <Chip v-for="(wp, wIdx) in pm.wastePolygons" :key="wIdx" :label="`${$t('projectData.wasteArea')} #${wIdx+1} (${wp.area || 0}m²)`" removable @remove="removeWaste(pm, wIdx)" />
                                        </div>
                                        <p v-else class="text-center italic py-4">{{ $t('projectData.noWastePolygons') }}</p>
                                    </div>
                                </div>
                            </Panel>
                        </div>
                    </div>
                </TabPanel>

                <!-- Cut Logs Panel -->
                <TabPanel value="1">
                    <div class="flex flex-col gap-4 py-4">
                        <TableFrame>
                            <DataTable :value="cutLogs" responsiveLayout="scroll">
                                <Column field="date" :header="$t('projectData.logDate')">
                                    <template #body="slotProps">
                                        <span class="italic">{{ formatDate(slotProps.data.date) }}</span>
                                    </template>
                                </Column>
                                <Column field="userName" :header="$t('projectData.logUser')">
                                    <template #body="slotProps">
                                        <span>{{ slotProps.data.userName || $t('admin.unknownUser') }}</span>
                                    </template>
                                </Column>
                                <Column field="queueName" :header="$t('projectData.logQueue')">
                                    <template #body="slotProps">
                                        <span>{{ slotProps.data.queueName }}</span>
                                    </template>
                                </Column>
                                <Column field="sheetsUsed" :header="$t('projectData.logSheets')" class="text-center" />
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
                        </TableFrame>
                    </div>
                </TabPanel>
            </TabPanels>
        </Tabs>

        <!-- Add Material Dialog -->
        <StandardDialog
            v-model:visible="showAddMaterialDialog"
            :header="$t('projectData.addMaterialToProject')"
            size="sm"
        >
            <div class="flex flex-col gap-4 py-4">
                <div class="flex flex-col gap-1">
                    <label>{{ $t('projectData.selectFromGlobalLibrary') }}</label>
                    <Select
                        v-model="selectedGlobalMaterialId"
                        :options="globalMaterialOptions"
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
                <StateBlock :message="$t('projectData.materialNotFound')" icon="pi pi-search">
                    <template #actions>
                        <Button :label="$t('projectData.createNewMaterial')" text size="small" @click="showCreateMaterialDialog = true" />
                    </template>
                </StateBlock>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showAddMaterialDialog = false" />
                <Button :label="$t('common.add')" @click="addMaterialToProject" :disabled="!selectedGlobalMaterialId" />
            </template>
        </StandardDialog>

        <!-- Create New Material Dialog (Global) -->
        <StandardDialog v-model:visible="showCreateMaterialDialog" :header="$t('projectData.createGlobalMaterial')" size="sm">
            <div class="grid grid-cols-1 gap-4 py-4">
                <div class="flex flex-col gap-1">
                    <label>{{ $t('common.name') }}</label>
                    <InputText v-model="newGlobalMaterial.name" :placeholder="$t('projectData.placeholders.materialName')" />
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
        </StandardDialog>

        <!-- Add Sheets Dialog -->
        <StandardDialog
            v-model:visible="showAddSheetsDialog"
            :header="$t('projectData.addSheets')"
            size="sm"
        >
            <div class="flex flex-col gap-4 py-4" v-if="activeProjectMaterial">
                <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-1">
                        <label>{{ $t('queue.width') }}</label>
                        <InputNumber v-model="sheetForm.width" :min="1" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label>{{ $t('queue.length') }}</label>
                        <InputNumber v-model="sheetForm.height" :min="1" />
                    </div>
                </div>
                <div class="flex flex-col gap-1">
                    <label>{{ $t('common.quantity') }}</label>
                    <InputNumber v-model="sheetForm.quantity" :min="1" showButtons />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showAddSheetsDialog = false" />
                <Button :label="$t('common.add')" @click="saveSheets" />
            </template>
        </StandardDialog>

        <ConfirmDialog />
    </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Panel from 'primevue/panel';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Chip from 'primevue/chip';
import ConfirmDialog from 'primevue/confirmdialog';

import { useEntity } from '~/composables/useEntity';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import { namedSelectOptions } from '~/utils/selectOptions';

definePageMeta({
    layout: 'app',
    middleware: 'auth',
});

const route = useRoute();
const projectSlug = route.params.slug;
const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();

const { fetch: fetchEntity, update: updateEntity } = useEntity('project', projectSlug);
const { list: listMaterials, create: createMaterial } = useEntity('material');

const projectMaterials = ref([]);
const cutLogs = ref([]);
const globalMaterials = ref([]);
const loading = ref(false);
const saving = ref(false);
const globalMaterialOptions = computed(() => namedSelectOptions(globalMaterials.value, t('common.name')));

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
        const data = await fetchEntity(projectSlug);
        projectMaterials.value = data.data?.projectMaterials || data.projectMaterials || [];
        cutLogs.value = data.data?.cutLogs || data.cutLogs || [];
    } catch (error) {
        console.error('Failed to fetch project data:', error);
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('errors.loadFailed'), life: 3000 });
    } finally {
        loading.value = false;
    }
};

const fetchGlobalMaterials = async () => {
    try {
        globalMaterials.value = await listMaterials();
    } catch (error) {
        console.error('Failed to fetch global materials:', error);
    }
};

const saveProjectMaterials = async (materials) => {
    await updateProject({ data: { projectMaterials: materials } });
};

const addMaterialToProject = async () => {
    const mat = globalMaterials.value.find(m => m._id === selectedGlobalMaterialId.value);
    if (!mat) return;

    if (projectMaterials.value.some(pm => pm.material.code === mat.code)) {
        toast.add({ severity: 'warn', summary: t('common.warning'), detail: t('projectData.materialAlreadyInProject'), life: 3000 });
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
        await saveProjectMaterials(newProjectMaterials);
        projectMaterials.value = newProjectMaterials;
        showAddMaterialDialog.value = false;
        selectedGlobalMaterialId.value = null;
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('projectData.materialAddedToProject'), life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('errors.saveFailed'), life: 3000 });
    }
};

const createAndAddMaterial = async () => {
    try {
        const created = await createMaterial(newGlobalMaterial.value);
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
        await saveProjectMaterials(projectMaterials.value);
        showAddSheetsDialog.value = false;
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('projectData.sheetsAdded'), life: 3000 });
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('errors.saveFailed'), life: 3000 });
    }
};

const removeSheets = async (pm, index) => {
    pm.sheets.splice(index, 1);
    await saveProjectMaterials(projectMaterials.value);
};

const removeWaste = async (pm, index) => {
    pm.wastePolygons.splice(index, 1);
    await saveProjectMaterials(projectMaterials.value);
};

const confirmDeleteMaterial = (index) => {
    confirm.require({
        message: t('projectData.confirmRemoveMaterial'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            const newMats = [...projectMaterials.value];
            newMats.splice(index, 1);
            try {
                await saveProjectMaterials(newMats);
                projectMaterials.value = newMats;
                toast.add({ severity: 'success', summary: t('common.success'), detail: t('messages.deleteSuccess'), life: 3000 });
            } catch (error) {
                console.error('Failed to delete material:', error);
            }
        }
    });
};

const updateProject = async (data) => {
    return await updateEntity(data);
};

const addWasteToInventory = async (logEntry) => {
    toast.add({ severity: 'info', summary: t('common.comingSoon'), detail: t('projectData.wasteExtractionFromArtifacts'), life: 3000 });
};

const formatDate = (date) => {
    return new Date(date).toLocaleString();
};
</script>
