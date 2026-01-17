<template>
    <div>
        <!-- Batch Header with Status -->
        <div class="flex items-center gap-4 mb-6">
            <Tag :value="$t(`batch.batchStatus.${batch.status}`)" :severity="getStatusSeverity(batch.status)" />
            <span>{{ entries.length }} {{ $t('batches.entries') }}</span>
            <Button 
                v-if="batch.status === 'NESTED' || batch.status === 'COMPLETE'"
                :label="$t('batches.markComplete')"
                icon="pi pi-check"
                severity="success"
                @click="markComplete"
                class="ml-auto"
            />
            <Button 
                v-if="batch.status === 'FAILED' || batch.status === 'NESTING'"
                :label="$t('batch.resetToDraft')"
                icon="pi pi-refresh"
                severity="warning"
                @click="resetToDraft"
                :class="batch.status === 'FAILED' || batch.status === 'NESTING' ? 'ml-auto' : ''"
            />
        </div>

        <!-- Accordion Panels -->
        <Accordion :multiple="true" :activeIndex="[0, 1]">
            <!-- Nesting Options Panel -->
            <AccordionTab :header="$t('nesting.settings')">
                <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 items-end">
                    <div class="flex flex-col gap-2">
                        <label for="toolSelect">{{ $t('nesting.tool') }}</label>
                        <Select 
                            id="toolSelect" 
                            v-model="nestingOptions.toolId" 
                            :options="tools"
                            optionLabel="name"
                            optionValue="_id"
                            :placeholder="$t('nesting.selectTool')"
                        />
                    </div>
                    <div class="flex flex-col gap-2">
                        <label for="plateWidth">{{ $t('nesting.plateWidth') }} (mm)</label>
                        <InputNumber id="plateWidth" v-model="nestingOptions.width" :min="0" />
                    </div>
                    <div class="flex flex-col gap-2">
                        <label for="plateHeight">{{ $t('nesting.plateHeight') }} (mm)</label>
                        <InputNumber id="plateHeight" v-model="nestingOptions.height" :min="0" />
                    </div>
                    <div>
                        <Button 
                            :label="$t('batches.runNesting')"
                            icon="pi pi-play"
                            severity="success"
                            @click="runNesting"
                            :disabled="batch.status !== 'DRAFT' || entries.length === 0"
                            :loading="nestingInProgress"
                            class="w-full"
                        />
                    </div>
                </div>
            </AccordionTab>

            <!-- Cassettes DataTable Panel -->
            <AccordionTab :header="$t('batches.cassettes')">
                <DataTable 
                    v-model:editingRows="editingRows"
                    :value="entries"
                    :editMode="batch.status === 'DRAFT' ? 'cell' : null"
                    dataKey="_id"
                    @cell-edit-complete="onRowEditSave"
                    :paginator="entries.length > 10"
                    :rows="10"
                    responsiveLayout="scroll"
                >
                    <!-- Cassette Template Column -->
                    <Column field="cassetteTemplateId" :header="$t('batches.cassette')" style="width: 25%">
                        <template #body="slotProps">
                            <span>{{ getCassetteName(slotProps.data.cassetteTemplateId) }}</span>
                        </template>
                        <template #editor="{ data }">
                            <Dropdown 
                                v-model="data.cassetteTemplateId"
                                :options="cassettes"
                                optionLabel="name"
                                optionValue="_id"
                                :placeholder="$t('batches.selectCassette')"
                                @change="onCassetteChange(data)"
                            />
                        </template>
                    </Column>

                    <!-- Quantity Column -->
                    <Column field="quantity" :header="$t('batches.quantity')" style="width: 10%">
                        <template #editor="{ data }">
                            <InputNumber v-model="data.quantity" :min="1" :max="1000" showButtons class="w-full" />
                        </template>
                    </Column>

                    <!-- Dimensions Columns (Dynamic based on parameters) -->
                    <Column 
                        v-for="param in allParameters" 
                        :key="param"
                        :field="`dimensions.${param}`"
                        :header="param"
                    >
                        <template #body="slotProps">
                            <span>{{ slotProps.data.dimensions?.[param] || '-' }}</span>
                        </template>
                        <template #editor="{ data }">
                            <InputNumber 
                                v-model="data.dimensions[param]"
                            />
                        </template>
                    </Column>

                    <!-- Options Columns (Dynamic based on cassette options) -->
                    <Column
                        v-for="option in allOptions"
                        :key="option"
                        :field="`options.${option}`"
                        :header="option"
                    >
                        <template #body="slotProps">
                            <i v-if="slotProps.data.options?.[option]" class="pi pi-check-circle text-green-500"></i>
                            <i v-else class="pi pi-times-circle text-red-500"></i>
                        </template>
                        <template #editor="{ data }">
                            <ToggleSwitch v-model="data.options[option]" v-if="data.options" />
                        </template>
                    </Column>

                    <!-- Actions Column -->
                    <Column :header="$t('common.actions')" style="width: 10%">
                        <template #body="slotProps">
                            <Button 
                                icon="pi pi-trash"
                                severity="danger"
                                text
                                @click="confirmDelete(slotProps.data)"
                                :disabled="batch.status !== 'DRAFT'"
                            />
                        </template>
                    </Column>

                    <template #empty>
                        <div class="text-center py-12">
                            <i class="pi pi-inbox text-5xl mb-4 opacity-50"></i>
                            <p>{{ $t('batches.noEntries') }}</p>
                        </div>
                    </template>
                </DataTable>

                <!-- Add Cassette Buttons -->
                <div class="flex gap-2 mt-4">
                    <Button 
                        :label="$t('batches.addFromTemplate')"
                        icon="pi pi-plus"
                        severity="secondary"
                        @click="showAddDialog = true"
                        :disabled="batch.status !== 'DRAFT'"
                    />
                    <Button 
                        :label="$t('batches.uploadCassette')"
                        icon="pi pi-upload"
                        severity="secondary"
                        @click="showUploadDialog = true"
                        :disabled="batch.status !== 'DRAFT'"
                    />
                </div>
            </AccordionTab>

            <!-- Artifacts Panel -->
            <AccordionTab v-if="artifacts?.length > 0" :header="$t('batches.artifacts')">
                <DataView :value="artifacts" layout="grid">
                    <template #grid="slotProps">
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                            <div v-for="artifact in slotProps.items" :key="artifact._id" class="flex items-center gap-4 p-4 border rounded">
                                <div class="text-2xl">
                                    <i class="pi pi-file"></i>
                                </div>
                                <div class="flex-1 flex flex-col">
                                    <span class="font-semibold">{{ artifact.type }}</span>
                                    <span :class="artifact.status">{{ artifact.status }}</span>
                                    <span class="text-sm">{{ formatDate(artifact.createdAt) }}</span>
                                </div>
                                <div class="flex gap-2">
                                    <Button 
                                        icon="pi pi-download"
                                        severity="secondary"
                                        size="small"
                                        :disabled="artifact.status !== 'READY'"
                                        @click="downloadArtifact(artifact)"
                                    />
                                    <Button 
                                        icon="pi pi-trash"
                                        severity="danger"
                                        size="small"
                                        text
                                        @click="deleteArtifact(artifact)"
                                    />
                                </div>
                            </div>
                        </div>
                    </template>
                </DataView>
            </AccordionTab>
        </Accordion>

        <!-- Add Entry Dialog -->
        <Dialog 
            v-model:visible="showAddDialog"
            :header="$t('batches.addEntry')"
            :modal="true"
            :style="{ width: '500px' }"
        >
            <div>
                <div class="mb-4">
                    <label class="block mb-2">{{ $t('batches.cassette') }}</label>
                    <Dropdown 
                        v-model="newEntry.cassetteTemplateId"
                        :options="cassettes"
                        optionLabel="name"
                        optionValue="_id"
                        :placeholder="$t('batches.selectCassette')"
                        class="w-full"
                        @change="onNewCassetteChange"
                        @show="() => console.log('[BatchEditor] Dropdown opened, cassettes:', cassettes)"
                    />
                    <small v-if="cassettes.length === 0" class="text-red-500">{{ $t('batches.noCassettes') }}</small>
                </div>
                <div class="mb-4">
                    <label class="block mb-2">{{ $t('batches.quantity') }}</label>
                    <InputNumber v-model="newEntry.quantity" :min="1" showButtons class="w-full" />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" severity="secondary" @click="showAddDialog = false" />
                <Button 
                    :label="$t('common.add')" 
                    @click="addEntry"
                    :disabled="!newEntry.cassetteTemplateId"
                />
            </template>
        </Dialog>

        <!-- Upload Cassette Dialog -->
        <Dialog 
            v-model:visible="showUploadDialog"
            :header="$t('batches.uploadNewCassette')"
            :modal="true"
            :style="{ width: '600px' }"
        >
            <p>{{ $t('batches.uploadNote') }}</p>
            <CassetteEditorDialog v-if="showUploadDialog" @saved="onCassetteUploaded" />
        </Dialog>

        <!-- Delete Confirmation Dialog -->
        <ConfirmDialog />
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useCassettesStore } from '~/stores/cassettes';
import { useToolProfilesStore } from '~/stores/toolProfiles';
import { useArtifactsStore } from '~/stores/artifacts';
import { useBatchesStore } from '~/stores/batches';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Dropdown from 'primevue/dropdown';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
import Dialog from 'primevue/dialog';
import DataView from 'primevue/dataview';
import ConfirmDialog from 'primevue/confirmdialog';
import Select from 'primevue/select';
import Accordion from 'primevue/accordion';
import AccordionTab from 'primevue/accordiontab';
import CassetteEditorDialog from './CassetteEditorDialog.vue';

const props = defineProps({
    batch: {
        type: Object,
        required: true
    },
    projectSlug: {
        type: String,
        required: true
    }
});

const emit = defineEmits(['updated']);

const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();

// Stores
const batchesStore = useBatchesStore();
const cassettesStore = useCassettesStore();
const artifactsStore = useArtifactsStore();
const toolProfilesStore = useToolProfilesStore();

// State
const entries = ref([]);
const editingRows = ref([]);
const { artifacts } = storeToRefs(artifactsStore);
const nestingInProgress = ref(false);
const showAddDialog = ref(false);
const showUploadDialog = ref(false);
const cassettes = ref([]);
const { tools } = storeToRefs(toolProfilesStore);

const nestingOptions = ref({
    width: 2440,
    height: 1220,
    toolId: null
});

// New entry form
const newEntry = ref({
    cassetteTemplateId: null,
    entryId: '',
    quantity: 1,
    dimensions: {},
    options: {}
});
const newEntryParameters = ref([]);

onMounted(async () => {
    console.log('[BatchEditor] Mounted, loading cassettes and tools...');
    const cassetteResult = await cassettesStore.fetchCassettes();
    cassettes.value = cassetteResult || [];
    
    // Load tools
    await toolProfilesStore.fetchTools();
    
    console.log('[BatchEditor] Cassettes loaded:', cassettes.value.length);
    console.log('[BatchEditor] Tools loaded:', tools.value.length);
    loadBatchData();
});

onUnmounted(() => {
    batchesStore.stopPolling(props.batch._id);
});

watch(() => props.batch, () => {
    loadBatchData();
}, { deep: true });

const loadBatchData = () => {
    entries.value = [...(props.batch.entries || [])];
    loadArtifacts();
};

const loadArtifacts = async () => {
    try {
        console.log('[BatchEditor] Loading artifacts for batch:', props.batch._id);
        await artifactsStore.fetchArtifacts(props.batch._id);
    } catch (error) {
        console.error('[BatchEditor] Failed to load artifacts:', error);
    }
};

// Get all unique parameters from all entries based on their cassettes
const allParameters = computed(() => {
    const params = new Set();
    console.log('[BatchEditor] Computing parameters for entries:', entries.value.length);
    entries.value.forEach(entry => {
        const cassette = cassettes.value.find(c => c._id === entry.cassetteTemplateId);
        console.log('[BatchEditor] Entry cassette:', entry.cassetteTemplateId, 'found:', cassette?.name, 'params:', cassette?.parameters);
        if (cassette?.parameters) {
            cassette.parameters.forEach(param => params.add(param));
        }
        // Also include any existing dimensions that might not be in cassette parameters
        if (entry.dimensions) {
            Object.keys(entry.dimensions).forEach(key => params.add(key));
        }
    });
    const result = Array.from(params).sort();
    console.log('[BatchEditor] All parameters:', result);
    return result;
});

// Get all unique options from all entries based on their cassettes
const allOptions = computed(() => {
    const options = new Set();
    entries.value.forEach(entry => {
        const cassette = cassettes.value.find(c => c._id === entry.cassetteTemplateId);
        if (cassette?.options) {
            Object.keys(cassette.options).forEach(option => options.add(option));
        }
        // Also include any existing options on the entry itself
        if (entry.options) {
            Object.keys(entry.options).forEach(key => options.add(key));
        }
    });
    return Array.from(options).sort();
});

const getCassetteName = (id) => {
    const cassette = cassettes.value.find(c => c._id === id);
    return cassette?.name || t('batch.unknownCassette');
};

const getStatusSeverity = (status) => {
    const map = {
        'DRAFT': 'info',
        'READY': 'info',
        'NESTING': 'warning',
        'NESTED': 'success',
        'COMPLETE': 'success',
        'FAILED': 'danger'
    };
    return map[status] || 'info';
};

const formatDate = (date) => {
    return new Date(date).toLocaleString();
};

// When cassette changes, update dimensions and options based on cassette template
const onCassetteChange = (entry) => {
    const cassette = cassettes.value.find(c => c._id === entry.cassetteTemplateId);
    
    // Initialize dimensions
    if (cassette?.parameters) {
        entry.dimensions = entry.dimensions || {};
        cassette.parameters.forEach(param => {
            if (!(param in entry.dimensions)) {
                entry.dimensions[param] = 0;
            }
        });
    }
    
    // Initialize options from cassette defaults
    if (cassette?.options) {
        entry.options = entry.options || {};
        Object.keys(cassette.options).forEach(option => {
            if (!(option in entry.options)) {
                entry.options[option] = cassette.options[option];
            }
        });
    }
};

const onNewCassetteChange = () => {
    const cassette = cassettes.value.find(c => c._id === newEntry.value.cassetteTemplateId);
    if (cassette?.parameters) {
        newEntryParameters.value = cassette.parameters;
        newEntry.value.dimensions = {};
        cassette.parameters.forEach(param => {
            newEntry.value.dimensions[param] = 0;
        });
    } else {
        newEntryParameters.value = [];
        newEntry.value.dimensions = {};
    }
    
    // Initialize options from cassette defaults
    if (cassette?.options) {
        newEntry.value.options = { ...cassette.options };
    } else {
        newEntry.value.options = {};
    }
};

const addEntry = async () => {
    const cassette = cassettes.value.find(c => c._id === newEntry.value.cassetteTemplateId);
    
    // Initialize dimensions from cassette parameters with default values of 0
    const dimensions = {};
    if (cassette?.parameters) {
        cassette.parameters.forEach(param => {
            dimensions[param] = 0;
        });
    }
    
    // Initialize options from cassette defaults
    const options = {};
    if (cassette?.options) {
        Object.keys(cassette.options).forEach(option => {
            options[option] = cassette.options[option];
        });
    }
    
    const entry = {
        ...newEntry.value,
        _id: `temp_${Date.now()}`,
        entryId: `Entry-${entries.value.length + 1}`,
        dimensions,
        options
    };
    
    entries.value.push(entry);
    await saveBatch();
    
    // Reset form
    newEntry.value = {
        cassetteTemplateId: null,
        entryId: '',
        quantity: 1,
        dimensions: {},
        options: {}
    };
    newEntryParameters.value = [];
    showAddDialog.value = false;
};

const onRowEditSave = async () => {
    await saveBatch();
};

const onRowEditCancel = () => {
    // Reset to original data if needed
};

const confirmDelete = (entry) => {
    confirm.require({
        message: t('batches.confirmDeleteEntry'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: () => deleteEntry(entry)
    });
};

const deleteEntry = async (entry) => {
    const index = entries.value.findIndex(e => e._id === entry._id);
    if (index > -1) {
        entries.value.splice(index, 1);
        await saveBatch();
    }
};

const saveBatch = async () => {
    try {
        await $fetch(`/api/batch/${props.batch._id}`, {
            method: 'PUT',
            body: {
                entries: entries.value
            }
        });
        emit('updated');
    } catch (error) {
        console.error('Failed to save batch:', error);
        alert(t('batches.saveFailed'));
    }
};

const runNesting = async () => {
    if (entries.value.length === 0) {
        alert(t('batches.noEntriesToNest'));
        return;
    }

    nestingInProgress.value = true;
    try {
        await batchesStore.startNesting(props.batch._id, nestingOptions.value);
        toast.add({ severity: 'info', summary: t('batches.nestingStarted'), detail: t('batches.nestingInitiated'), life: 3000 });
    } catch (error) {
        console.error('Failed to run nesting:', error);
        const errorMessage = error.data?.message || error.message || t('common.error');
        alert(`${t('batches.nestingFailed')}: ${errorMessage}`);
    } finally {
        nestingInProgress.value = false;
    }
};

const markComplete = async () => {
    try {
        await $fetch(`/api/batch/${props.batch._id}`, {
            method: 'PUT',
            body: { status: 'COMPLETE' }
        });
        emit('updated');
    } catch (error) {
        console.error('Failed to mark as complete:', error);
        alert(t('batches.markCompleteFailed'));
    }
};

const resetToDraft = async () => {
    confirm.require({
        message: t('batches.confirmResetMessage'),
        header: t('batches.confirmResetTitle'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            try {
                await batchesStore.resetStatus(props.batch._id);
                toast.add({ severity: 'success', summary: t('common.success'), detail: t('batch.resetSuccess'), life: 3000 });
                emit('updated');
            } catch (error) {
                console.error('Failed to reset batch:', error);
                toast.add({ severity: 'error', summary: t('common.error'), detail: t('batch.resetFailed'), life: 3000 });
            }
        }
    });
};

const downloadArtifact = async (artifact) => {
    try {
        console.log('[BatchEditor] Downloading artifact:', artifact);
        
        // Fetch the file as a blob
        const response = await fetch(`/api/artifacts/${artifact._id}`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `HTTP error! status: ${response.status}`);
        }
        
        // Get the blob
        const blob = await response.blob();
        
        // Create object URL and download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = artifact.name || `artifact_${artifact._id}`;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
    } catch (error) {
        console.error('[BatchEditor] Failed to download artifact:', error);
        alert(`${t('artifacts.downloadFailed')}: ${error.message}`);
    }
};

const deleteArtifact = async (artifact) => {
    confirm.require({
        message: t('batches.confirmDeleteArtifact'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            try {
                await $fetch(`/api/artifacts/${artifact._id}`, {
                    method: 'DELETE'
                });
                await loadArtifacts();
            } catch (error) {
                console.error('Failed to delete artifact:', error);
                alert(t('batches.deleteFailed'));
            }
        }
    });
};

const onCassetteUploaded = async () => {
    showUploadDialog.value = false;
    const result = await cassettesStore.fetchCassettes();
    cassettes.value = result || [];
};
</script>


