<template>
    <div class="batch-editor">
        <!-- Batch Header with Actions -->
        <div class="batch-header">
            <div class="batch-info">
                <Tag :value="batch.status" :severity="getStatusSeverity(batch.status)" />
                <span class="batch-count">{{ entries.length }} {{ $t('batches.entries') }}</span>
            </div>
            <div class="batch-actions">
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
                <Button 
                    :label="$t('batches.runNesting')"
                    icon="pi pi-play"
                    severity="success"
                    @click="runNesting"
                    :disabled="batch.status !== 'DRAFT' || entries.length === 0"
                    :loading="nestingInProgress"
                />
                <Button 
                    v-if="batch.status === 'NESTED'"
                    :label="$t('batches.markComplete')"
                    icon="pi pi-check"
                    severity="success"
                    @click="markComplete"
                />
            </div>
        </div>

        <!-- Entries DataTable -->
        <DataTable 
            v-model:editingRows="editingRows"
            :value="entries"
            editMode="row"
            dataKey="_id"
            @row-edit-save="onRowEditSave"
            @row-edit-cancel="onRowEditCancel"
            :paginator="entries.length > 10"
            :rows="10"
            responsiveLayout="scroll"
            class="entries-table"
        >
            <Column 
                v-if="batch.status === 'DRAFT'"
                :rowEditor="true" 
                style="width: 5%; min-width: 4rem" 
                bodyStyle="text-align:center" 
            />
            
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
                        class="w-full"
                        @change="onCassetteChange(data)"
                    />
                </template>
            </Column>

            <!-- Entry ID Column -->
            <Column field="entryId" :header="$t('batches.entryId')" style="width: 15%">
                <template #body="slotProps">
                    <span>{{ slotProps.data.entryId || '-' }}</span>
                </template>
                <template #editor="{ data }">
                    <InputText v-model="data.entryId" class="w-full" />
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
                style="width: 10%"
            >
                <template #body="slotProps">
                    <span>{{ slotProps.data.dimensions?.[param] || '-' }}</span>
                </template>
                <template #editor="{ data }">
                    <InputNumber 
                        v-model="data.dimensions[param]"
                        :minFractionDigits="2"
                        :maxFractionDigits="2"
                        :min="0"
                        class="w-full"
                    />
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
                <div class="empty-entries">
                    <i class="pi pi-inbox"></i>
                    <p>{{ $t('batches.noEntries') }}</p>
                </div>
            </template>
        </DataTable>

        <!-- Artifacts Section -->
        <div v-if="artifacts.length > 0" class="artifacts-section">
            <h3>{{ $t('batches.artifacts') }}</h3>
            <DataView :value="artifacts" layout="grid">
                <template #grid="slotProps">
                    <div class="artifact-card">
                        <div class="artifact-preview">
                            <i class="pi pi-file"></i>
                        </div>
                        <div class="artifact-info">
                            <span class="artifact-type">{{ slotProps.data.type }}</span>
                            <span class="artifact-date">{{ formatDate(slotProps.data.createdAt) }}</span>
                        </div>
                        <div class="artifact-actions">
                            <Button 
                                icon="pi pi-download"
                                severity="secondary"
                                size="small"
                                @click="downloadArtifact(slotProps.data)"
                            />
                        </div>
                    </div>
                </template>
            </DataView>
        </div>

        <!-- Add Entry Dialog -->
        <Dialog 
            v-model:visible="showAddDialog"
            :header="$t('batches.addEntry')"
            :modal="true"
            :style="{ width: '500px' }"
        >
            <div class="add-entry-form">
                <div class="field">
                    <label>{{ $t('batches.cassette') }}</label>
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
                    <small v-if="cassettes.length === 0" style="color: red">No cassettes available. Please upload a cassette first.</small>
                </div>
                <div class="field">
                    <label>{{ $t('batches.quantity') }}</label>
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
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { cassettesStore } from '~/composables/cassettes';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Dropdown from 'primevue/dropdown';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Dialog from 'primevue/dialog';
import DataView from 'primevue/dataview';
import ConfirmDialog from 'primevue/confirmdialog';
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

// State
const entries = ref([]);
const editingRows = ref([]);
const artifacts = ref([]);
const nestingInProgress = ref(false);
const showAddDialog = ref(false);
const showUploadDialog = ref(false);
const cassettes = ref([]);

// New entry form
const newEntry = ref({
    cassetteTemplateId: null,
    entryId: '',
    quantity: 1,
    dimensions: {}
});
const newEntryParameters = ref([]);

onMounted(async () => {
    console.log('[BatchEditor] Mounted, loading cassettes...');
    const result = await cassettesStore.actions.fetchCassettes();
    cassettes.value = result || [];
    console.log('[BatchEditor] Cassettes loaded:', cassettes.value.length, cassettes.value);
    loadBatchData();
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
        artifacts.value = await $fetch(`/api/batch/${props.batch._id}/artifacts`);
    } catch (error) {
        console.error('Failed to load artifacts:', error);
        artifacts.value = [];
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

const getCassetteName = (id) => {
    const cassette = cassettes.value.find(c => c._id === id);
    return cassette?.name || 'Unknown';
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

// When cassette changes, update dimensions based on parameters
const onCassetteChange = (entry) => {
    const cassette = cassettes.value.find(c => c._id === entry.cassetteTemplateId);
    if (cassette?.parameters) {
        entry.dimensions = entry.dimensions || {};
        cassette.parameters.forEach(param => {
            if (!(param in entry.dimensions)) {
                entry.dimensions[param] = 0;
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
    
    const entry = {
        ...newEntry.value,
        _id: `temp_${Date.now()}`,
        entryId: `Entry-${entries.value.length + 1}`,
        dimensions
    };
    
    entries.value.push(entry);
    await saveBatch();
    
    // Reset form
    newEntry.value = {
        cassetteTemplateId: null,
        entryId: '',
        quantity: 1,
        dimensions: {}
    };
    newEntryParameters.value = [];
    showAddDialog.value = false;
};

const onRowEditSave = async (event) => {
    const { newData, index } = event;
    entries.value[index] = newData;
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
        await $fetch(`/api/batch/${props.batch._id}/nest`, {
            method: 'POST'
        });
        emit('updated');
        await loadArtifacts();
    } catch (error) {
        console.error('Failed to run nesting:', error);
        alert(t('batches.nestingFailed'));
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

const downloadArtifact = async (artifact) => {
    try {
        const response = await $fetch(`/api/artifacts/${artifact._id}`, {
            responseType: 'blob'
        });
        const url = window.URL.createObjectURL(response);
        const link = document.createElement('a');
        link.href = url;
        link.download = artifact.filename || `artifact_${artifact._id}`;
        link.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Failed to download artifact:', error);
    }
};

const onCassetteUploaded = async () => {
    showUploadDialog.value = false;
    const result = await cassettesStore.actions.fetchCassettes();
    cassettes.value = result || [];
};
</script>

<style scoped lang="scss">
.batch-editor {
    .batch-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        padding: 1rem;
        background: var(--surface-card);
        border-radius: var(--border-radius);
        
        .batch-info {
            display: flex;
            align-items: center;
            gap: 1rem;
            
            .batch-count {
                color: var(--text-color-secondary);
            }
        }
        
        .batch-actions {
            display: flex;
            gap: 0.5rem;
        }
    }
    
    .entries-table {
        margin-bottom: 2rem;
        
        .empty-entries {
            text-align: center;
            padding: 3rem;
            color: var(--text-color-secondary);
            
            i {
                font-size: 3rem;
                margin-bottom: 1rem;
                opacity: 0.5;
            }
        }
    }
    
    .artifacts-section {
        margin-top: 2rem;
        
        h3 {
            margin-bottom: 1rem;
        }
        
        .artifact-card {
            padding: 1rem;
            border: 1px solid var(--surface-border);
            border-radius: var(--border-radius);
            display: flex;
            align-items: center;
            gap: 1rem;
            
            .artifact-preview {
                font-size: 2rem;
                color: var(--text-color-secondary);
            }
            
            .artifact-info {
                flex: 1;
                display: flex;
                flex-direction: column;
                
                .artifact-type {
                    font-weight: 600;
                }
                
                .artifact-date {
                    font-size: 0.875rem;
                    color: var(--text-color-secondary);
                }
            }
        }
    }
    
    .add-entry-form {
        .field {
            margin-bottom: 1rem;
            
            label {
                display: block;
                margin-bottom: 0.5rem;
                font-weight: 500;
            }
        }
        
        .dimensions-section {
            margin-top: 1.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid var(--surface-border);
            
            h4 {
                margin-bottom: 1rem;
            }
        }
    }
}
</style>
