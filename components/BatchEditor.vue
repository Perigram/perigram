<template>
    <div class="flex flex-col gap-6">
        <!-- Batch Header with Status -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-4 bg-[var(--p-content-background)] p-4 rounded-xl border border-[var(--p-content-border-color)]">
            <div class="flex items-center gap-3">
                <Tag :value="$t(`batch.batchStatus.${batch.status}`)" :severity="getStatusSeverity(batch.status)" />
                <span class="text-sm font-medium text-[var(--p-text-muted-color)]">{{ entries.length }} {{ $t('batches.entries') }}</span>
            </div>
            <div class="flex flex-wrap gap-2 sm:ml-auto">
                <Button 
                    v-if="batch.status === 'DRAFT' && batch.chosenRunId"
                    :label="$t('batch.markCut')"
                    icon="pi pi-scissors"
                    severity="success"
                    @click="markCutHandler"
                />
                <Button 
                    v-if="batch.status !== 'DRAFT'"
                    :label="$t('batch.resetToDraft')"
                    icon="pi pi-refresh"
                    severity="warning"
                    @click="resetToDraft"
                />
            </div>
        </div>

        <!-- Accordion Panels -->
        <Accordion :multiple="true" :activeIndex="[0, 1]" class="flex flex-col gap-4">
            <!-- Runs Panel -->
            <AccordionTab v-if="batch.runs && batch.runs.length > 0" :header="`${$t('batch.runs')} (${batch.runs.length})`">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    <div 
                        v-for="run in batch.runs" 
                        :key="run._id"
                        class="p-4 border-2 rounded-xl transition-all cursor-pointer flex flex-col gap-2 relative h-48 overflow-hidden group"
                        :class="[
                            run._id.toString() === selectedRunId 
                                ? 'border-[var(--p-primary-color)] shadow-md' 
                                : (run._id.toString() === batch.chosenRunId?.toString() 
                                    ? 'border-[var(--p-primary-300)] bg-[var(--p-primary-50)]/30' 
                                    : 'border-[var(--p-content-border-color)] bg-[var(--p-content-background)] hover:border-[var(--p-primary-200)]')
                        ]"
                        @click="selectedRunId = run._id.toString()"
                    >
                        <!-- Delete button on hover -->
                        <Button 
                            icon="pi pi-trash" 
                            severity="danger" 
                            text 
                            rounded 
                            size="small"
                            class="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            @click.stop="deleteRunHandler(run._id)"
                        />

                        <div class="flex items-start justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <span class="text-lg font-black text-[var(--p-text-color)]">#{{ run.runNumber }}</span>
                                <Tag 
                                    :value="$t(`batch.runStatus.${run.status}`)" 
                                    :severity="getRunStatusSeverity(run.status)"
                                    class="text-[9px] uppercase font-bold"
                                />
                            </div>
                            <div v-if="run._id.toString() === batch.chosenRunId?.toString()" class="flex items-center gap-1 text-[var(--p-primary-color)]">
                                <i class="pi pi-check-circle text-xl"></i>
                                <span v-if="batch.status === 'CUT'" class="text-[9px] font-black uppercase tracking-tighter">{{ $t('results.sheetStatus.cut') }}</span>
                            </div>
                        </div>

                        <div v-if="run.error" class="p-2 bg-red-500/5 border border-red-500/10 rounded-lg text-[10px] text-red-500 font-medium leading-relaxed overflow-y-auto custom-scrollbar flex-1">
                            <i class="pi pi-exclamation-circle mr-1"></i>
                            {{ run.error }}
                        </div>

                        <div v-else class="flex flex-col gap-2 flex-1">
                            <div v-if="run.status === 'COMPLETE' || run.status === 'CHOSEN'" class="flex items-center gap-2 text-[var(--p-text-muted-color)]">
                                <i class="pi pi-clone text-xs"></i>
                                <span class="text-xs font-bold">{{ run.layoutCount || 0 }} {{ $t('results.sheets') }}</span>
                            </div>
                            
                            <!-- Artifacts for this run -->
                            <div v-if="(run.status === 'COMPLETE' || run.status === 'CHOSEN') && getRunArtifacts(run._id).length > 0" class="flex flex-wrap gap-1">
                                <Tag 
                                    v-for="artifact in getRunArtifacts(run._id)" 
                                    :key="artifact._id"
                                    :value="mapArtifactType(artifact.type)"
                                    :severity="artifact.status === 'READY' ? 'success' : 'secondary'"
                                    class="text-[7px] px-1 py-0 font-black"
                                />
                            </div>
                        </div>

                        <div class="flex items-center justify-between mt-auto pt-2 border-t border-[var(--p-content-border-color)]">
                            <span class="text-[9px] font-bold text-[var(--p-text-muted-color)] uppercase tracking-tight">
                                {{ formatDate(run.createdAt) }}
                            </span>
                            
                            <div v-if="run.status === 'COMPLETE' && run._id.toString() !== batch.chosenRunId?.toString()">
                                <Button 
                                    :label="$t('batch.chooseRun')"
                                    size="small"
                                    text
                                    class="p-0 text-[10px] font-black uppercase tracking-wider"
                                    @click.stop="chooseRunHandler(run._id)"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </AccordionTab>

            <!-- Nesting Options Panel -->
            <AccordionTab :header="$t('nesting.settings')">
                <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 items-end py-2">
                    <div class="flex flex-col gap-2">
                        <label for="toolSelect" class="text-sm font-medium text-[var(--p-text-color)]">{{ $t('nesting.tool') }}</label>
                        <Select 
                            id="toolSelect" 
                            v-model="nestingOptions.toolId" 
                            :options="tools"
                            optionLabel="name"
                            optionValue="_id"
                            :placeholder="$t('nesting.selectTool')"
                            class="w-full"
                        />
                    </div>

                    <div class="flex flex-col gap-2">
                        <label class="text-sm font-medium text-[var(--p-text-color)]">{{ $t('nesting.sheetSource') }}</label>
                        <Select 
                            v-model="sheetSource"
                            :options="[
                                { label: $t('nesting.standard'), value: 'standard' },
                                { label: $t('nesting.custom'), value: 'custom' }
                            ]"
                            optionLabel="label"
                            optionValue="value"
                            class="w-full"
                        />
                    </div>

                    <template v-if="sheetSource === 'standard'">
                        <div class="flex flex-col gap-2 animate-in fade-in zoom-in duration-300">
                            <label for="plateWidth" class="text-sm font-medium text-[var(--p-text-color)]">{{ $t('nesting.plateWidth') }} (mm)</label>
                            <InputNumber id="plateWidth" v-model="nestingOptions.width" :min="0" class="w-full" />
                        </div>
                        <div class="flex flex-col gap-2 animate-in fade-in zoom-in duration-300">
                            <label for="plateHeight" class="text-sm font-medium text-[var(--p-text-color)]">{{ $t('nesting.plateHeight') }} (mm)</label>
                            <InputNumber id="plateHeight" v-model="nestingOptions.height" :min="0" class="w-full" />
                        </div>
                    </template>

                    <template v-else>
                        <div class="flex flex-col gap-2 lg:col-span-2 animate-in fade-in zoom-in duration-300">
                            <label class="text-sm font-medium text-[var(--p-text-color)]">{{ $t('nesting.customSheet') }}</label>
                            <div class="flex gap-2">
                                <FileUpload 
                                    mode="basic" 
                                    accept=".dxf" 
                                    :auto="true" 
                                    customUpload 
                                    @uploader="handleSheetSelect"
                                    :chooseLabel="selectedSheetFile ? selectedSheetFile.name : $t('common.upload')"
                                    class="flex-1"
                                    :disabled="batch.status !== 'DRAFT'"
                                />
                                <Button 
                                    v-if="selectedSheetFile" 
                                    icon="pi pi-times" 
                                    severity="danger" 
                                    text 
                                    @click="clearSheetFile" 
                                    :disabled="batch.status !== 'DRAFT'"
                                />
                            </div>
                        </div>
                    </template>

                    <div>
                        <Button 
                            :label="$t('batches.runNesting')"
                            icon="pi pi-play"
                            severity="success"
                            @click="runNesting"
                            :disabled="batch.status !== 'DRAFT' || entries.length === 0"
                            :loading="nestingInProgress"
                            class="w-full h-[42px]"
                        />
                    </div>
                </div>
            </AccordionTab>

            <!-- Cassettes DataView Panel -->
            <AccordionTab :header="$t('batches.cassettes')">
                <div class="flex flex-col gap-4">
                    <!-- View Switcher -->
                    <div class="flex justify-between items-center">
                        <div class="flex gap-2">
                            <Button 
                                :icon="viewMode === 'grid' ? 'pi pi-th-large' : 'pi pi-th-large'"
                                :severity="viewMode === 'grid' ? 'primary' : 'secondary'"
                                @click="viewMode = 'grid'"
                                v-tooltip.top="$t('batch.gridView')"
                                text
                                :outlined="viewMode !== 'grid'"
                            />
                            <Button 
                                :icon="viewMode === 'table' ? 'pi pi-table' : 'pi pi-table'"
                                :severity="viewMode === 'table' ? 'primary' : 'secondary'"
                                @click="viewMode = 'table'"
                                v-tooltip.top="$t('batch.tableView')"
                                text
                                :outlined="viewMode !== 'table'"
                            />
                        </div>
                    </div>

                    <!-- Grid View -->
                    <div v-if="viewMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        <div 
                            v-for="entry in entries" 
                            :key="entry._id"
                            class="border border-[var(--p-content-border-color)] rounded-xl p-4 bg-[var(--p-content-background)] hover:border-[var(--p-primary-color)] transition-all flex flex-col gap-4 shadow-sm group"
                        >
                            <div class="flex flex-col gap-3">
                                <div class="flex justify-between items-start gap-2 min-w-0">
                                    <div class="flex-1 min-w-0">
                                        <h3 class="font-black text-[var(--p-text-color)] truncate text-xs uppercase tracking-tight" :title="getCassetteName(entry.cassetteTemplateId)">{{ getCassetteName(entry.cassetteTemplateId) }}</h3>
                                        <span class="text-[9px] font-bold text-[var(--p-text-muted-color)] uppercase tracking-widest">{{ entry.entryId }}</span>
                                    </div>
                                    <Button 
                                        icon="pi pi-trash"
                                        severity="danger"
                                        text
                                        rounded
                                        size="small"
                                        class="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                        @click="confirmDelete(entry)"
                                        :disabled="batch.status !== 'DRAFT'"
                                    />
                                </div>

                                <!-- Thumbnail -->
                                <div class="h-32 w-full">
                                    <CassetteThumbnail :cassette-id="entry.cassetteTemplateId" />
                                </div>
                            </div>

                            <div class="flex flex-col gap-4 pt-4 border-t border-[var(--p-content-border-color)]">
                                <div class="flex items-center justify-between gap-4">
                                    <span class="text-[10px] font-black uppercase tracking-wider text-[var(--p-text-muted-color)]">{{ $t('batches.quantity') }}</span>
                                    <InputNumber 
                                        v-model="entry.quantity" 
                                        :min="1" 
                                        :disabled="batch.status !== 'DRAFT'"
                                        showButtons 
                                        buttonLayout="horizontal"
                                        size="small"
                                        class="w-24"
                                        @update:model-value="saveBatch"
                                    />
                                </div>
                                
                                <div class="grid grid-cols-2 gap-x-3 gap-y-3">
                                    <div v-for="param in getEntryParameters(entry)" :key="param" class="flex flex-col gap-1">
                                        <span class="text-[9px] font-black uppercase tracking-tighter text-[var(--p-text-muted-color)]">{{ param }}</span>
                                        <InputNumber 
                                            v-model="entry.dimensions[param]"
                                            :disabled="batch.status !== 'DRAFT'"
                                            size="small"
                                            class="w-full"
                                            :min="0"
                                            @update:model-value="saveBatch"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Table View -->
                    <DataTable 
                        v-if="viewMode === 'table'"
                        v-model:editingRows="editingRows"
                        :value="entries"
                        :editMode="batch.status === 'DRAFT' ? 'cell' : null"
                        dataKey="_id"
                        @cell-edit-complete="onRowEditSave"
                        :paginator="entries.length > 10"
                        :rows="10"
                        responsiveLayout="scroll"
                        class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden"
                    >
                        <!-- Cassette Template Column -->
                        <Column field="cassetteTemplateId" :header="$t('batches.cassette')" style="min-width: 200px">
                            <template #body="slotProps">
                                <span class="font-medium">{{ getCassetteName(slotProps.data.cassetteTemplateId) }}</span>
                            </template>
                            <template #editor="{ data }">
                                <Select 
                                    v-model="data.cassetteTemplateId"
                                    :options="cassettes"
                                    optionLabel="name"
                                    optionValue="_id"
                                    :placeholder="$t('batches.selectCassette')"
                                    @change="onCassetteChange(data)"
                                    class="w-full"
                                />
                            </template>
                        </Column>

                        <!-- Quantity Column -->
                        <Column field="quantity" :header="$t('batches.quantity')" style="width: 120px">
                            <template #editor="{ data }">
                                <InputNumber v-model="data.quantity" :min="1" :max="1000" showButtons class="w-full" />
                            </template>
                        </Column>

                        <!-- Dimensions Columns (Dynamic) -->
                        <Column 
                            v-for="param in allParameters" 
                            :key="param"
                            :field="`dimensions.${param}`"
                            :header="param"
                            style="min-width: 100px"
                        >
                            <template #body="slotProps">
                                <span>{{ slotProps.data.dimensions?.[param] || '-' }}</span>
                            </template>
                            <template #editor="{ data }">
                                <InputNumber 
                                    v-model="data.dimensions[param]"
                                    class="w-full"
                                />
                            </template>
                        </Column>

                        <!-- Options Columns (Dynamic) -->
                        <Column
                            v-for="option in allOptions"
                            :key="option"
                            :field="`options.${option}`"
                            :header="option"
                            style="width: 100px"
                        >
                            <template #body="slotProps">
                                <i v-if="slotProps.data.options?.[option]" class="pi pi-check-circle text-green-500"></i>
                                <i v-else class="pi pi-times-circle text-red-400 opacity-50"></i>
                            </template>
                            <template #editor="{ data }">
                                <ToggleSwitch v-model="data.options[option]" v-if="data.options" />
                            </template>
                        </Column>

                        <!-- Actions Column -->
                        <Column :header="$t('common.actions')" style="width: 80px" class="text-right">
                            <template #body="slotProps">
                                <Button 
                                    icon="pi pi-trash"
                                    severity="danger"
                                    text
                                    rounded
                                    @click="confirmDelete(slotProps.data)"
                                    :disabled="batch.status !== 'DRAFT'"
                                />
                            </template>
                        </Column>

                        <template #empty>
                            <div class="text-center py-12">
                                <i class="pi pi-inbox text-5xl mb-4 opacity-20"></i>
                                <p class="text-[var(--p-text-secondary-color)]">{{ $t('batches.noEntries') }}</p>
                            </div>
                        </template>
                    </DataTable>

                    <!-- Add Cassette Buttons -->
                    <div class="flex flex-wrap gap-3">
                        <Button 
                            :label="$t('batches.addFromTemplate')"
                            icon="pi pi-plus"
                            severity="secondary"
                            outlined
                            @click="showAddDialog = true"
                            :disabled="batch.status !== 'DRAFT'"
                        />
                        <Button 
                            :label="$t('batches.uploadCassette')"
                            icon="pi pi-upload"
                            severity="secondary"
                            outlined
                            @click="showUploadDialog = true"
                            :disabled="batch.status !== 'DRAFT'"
                        />
                    </div>
                </div>
            </AccordionTab>

            <!-- Artifacts Panel -->
            <AccordionTab v-if="selectedRunId && filteredArtifactsBySelectedRun.length > 0" :header="$t('batches.artifacts')">
                <ArtifactsTable :batch-id="batch._id" :batch="batch" :run-id="selectedRunId" />
            </AccordionTab>
        </Accordion>

        <!-- Add Entry Dialog -->
        <Dialog 
            v-model:visible="showAddDialog"
            :header="$t('batches.addEntry')"
            :modal="true"
            :style="{ width: '95vw', maxWidth: '500px' }"
        >
            <div class="flex flex-col gap-6 py-4">
                <div class="flex flex-col gap-2">
                    <label class="font-medium text-[var(--p-text-color)]">{{ $t('batches.cassette') }}</label>
                    <Select 
                        v-model="newEntry.cassetteTemplateId"
                        :options="cassettes"
                        optionLabel="name"
                        optionValue="_id"
                        :placeholder="$t('batches.selectCassette')"
                        class="w-full"
                        @change="onNewCassetteChange"
                    />
                    <small v-if="cassettes.length === 0" class="text-red-500">{{ $t('batches.noCassettes') }}</small>
                </div>
                <div class="flex flex-col gap-2">
                    <label class="font-medium text-[var(--p-text-color)]">{{ $t('batches.quantity') }}</label>
                    <InputNumber v-model="newEntry.quantity" :min="1" showButtons class="w-full" />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showAddDialog = false" />
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
            :style="{ width: '95vw', maxWidth: '600px' }"
        >
            <p class="mb-4 text-[var(--p-text-secondary-color)]">{{ $t('batches.uploadNote') }}</p>
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
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
import Dialog from 'primevue/dialog';
import DataView from 'primevue/dataview';
import ConfirmDialog from 'primevue/confirmdialog';
import Accordion from 'primevue/accordion';
import AccordionTab from 'primevue/accordiontab';
import CassetteEditorDialog from './CassetteEditorDialog.vue';
import CassetteThumbnail from './CassetteThumbnail.vue';

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
const viewMode = ref('grid');
const selectedRunId = ref(null);

const filteredArtifactsBySelectedRun = computed(() => {
    if (!selectedRunId.value) return [];
    if (!artifacts.value) return [];
    return artifacts.value.filter(a => a.runId?.toString() === selectedRunId.value);
});

const nestingOptions = ref({
    width: 2440,
    height: 1220,
    toolId: null,
    sheetPolygon: null
});
const selectedSheetFile = ref(null);
const sheetSource = ref('standard'); // 'standard' or 'custom'

const handleSheetSelect = async (event) => {
    if (event.files && event.files.length > 0) {
        selectedSheetFile.value = event.files[0];
        try {
            const { extractPolygons } = await import('~/utils/dxfParser');
            const polygons = await extractPolygons(selectedSheetFile.value);
            if (polygons.length > 0) {
                // Use the largest polygon as the sheet boundary
                const largest = polygons.sort((a, b) => calculatePolygonArea(b) - calculatePolygonArea(a))[0];
                nestingOptions.value.sheetPolygon = largest;
                toast.add({ severity: 'success', summary: t('common.success'), detail: t('batches.sheetUploaded'), life: 3000 });
            } else {
                toast.add({ severity: 'error', summary: t('common.error'), detail: t('batches.noPolygonsInSheet'), life: 3000 });
                selectedSheetFile.value = null;
            }
        } catch (error) {
            console.error('Failed to parse sheet DXF:', error);
            toast.add({ severity: 'error', summary: t('common.error'), detail: t('batches.sheetParseError'), life: 3000 });
            selectedSheetFile.value = null;
        }
    }
};

const calculatePolygonArea = (vertices) => {
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        area += vertices[i][0] * vertices[j][1];
        area -= vertices[j][0] * vertices[i][1];
    }
    return Math.abs(area) / 2;
};

const clearSheetFile = () => {
    selectedSheetFile.value = null;
    nestingOptions.value.sheetPolygon = null;
};

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

watch(selectedRunId, () => {
    loadArtifacts();
});

const loadBatchData = () => {
    entries.value = [...(props.batch.entries || [])];
    loadArtifacts();
};

const loadArtifacts = async () => {
    try {
        console.log('[BatchEditor] Loading artifacts for batch:', props.batch._id, 'run:', selectedRunId.value);
        await artifactsStore.fetchArtifacts(props.batch._id, selectedRunId.value);
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

const getEntryParameters = (entry) => {
    const cassette = cassettes.value.find(c => c._id === entry.cassetteTemplateId);
    return cassette?.parameters || [];
};

const getRunArtifacts = (runId) => {
    if (!artifacts.value) return [];
    return artifacts.value.filter(a => a.runId?.toString() === runId.toString());
};

const getRunSheetCount = (runId) => {
    // This info is stored in nesting_jobs for the run
    // Since we don't fetch all jobs here, we might need to store layoutCount in the run object itself
    // Or fetch it. For now, we'll assume it's in run.layoutCount (added by processor)
    const run = props.batch.runs.find(r => r._id.toString() === runId.toString());
    return run?.layoutCount || 0;
};

const mapArtifactType = (type) => {
    const map = {
        'LAYOUT_DXF': 'DXF',
        'LAYOUT_SVG': 'SVG',
        'PDF_PASSPORT': 'PDF',
        'NESTING_REPORT': 'REPORT'
    };
    return map[type] || type.split('_')[1] || type;
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
        const payload = {
            width: nestingOptions.value.width,
            height: nestingOptions.value.height,
            toolId: nestingOptions.value.toolId,
            sheet_polygon: sheetSource.value === 'custom' ? nestingOptions.value.sheetPolygon : null
        };
        await batchesStore.startNesting(props.batch._id, payload);
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

const chooseRunHandler = async (runId) => {
    try {
        await batchesStore.chooseRun(props.batch._id, runId);
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('batch.runChosen'), life: 3000 });
        emit('updated');
    } catch (error) {
        console.error('Failed to choose run:', error);
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('batch.chooseRunFailed'), life: 3000 });
    }
};

const markCutHandler = async () => {
    confirm.require({
        message: t('batch.confirmMarkCut'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            try {
                await batchesStore.markCut(props.batch._id);
                toast.add({ severity: 'success', summary: t('common.success'), detail: t('batch.markedCut'), life: 3000 });
                emit('updated');
            } catch (error) {
                console.error('Failed to mark as cut:', error);
                toast.add({ severity: 'error', summary: t('common.error'), detail: t('batch.markCutFailed'), life: 3000 });
            }
        }
    });
};

const deleteRunHandler = async (runId) => {
    confirm.require({
        message: t('batch.confirmDeleteRun'),
        header: t('common.confirmation'),
        icon: 'pi pi-trash',
        accept: async () => {
            try {
                await batchesStore.deleteRun(props.batch._id, runId);
                if (selectedRunId.value === runId.toString()) {
                    selectedRunId.value = null;
                }
                toast.add({ severity: 'success', summary: t('common.success'), detail: t('batch.runDeleted'), life: 3000 });
                emit('updated');
            } catch (error) {
                console.error('Failed to delete run:', error);
                toast.add({ severity: 'error', summary: t('common.error'), detail: t('batch.deleteRunFailed'), life: 3000 });
            }
        }
    });
};

const getRunStatusSeverity = (status) => {
    const map = {
        'NESTING': 'warning',
        'ERROR': 'danger',
        'COMPLETE': 'success',
        'CHOSEN': 'info'
    };
    return map[status] || 'info';
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

<style scoped lang="scss">
</style>