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
        <Accordion :multiple="true" :activeIndex="[0, 1, 2]" class="flex flex-col gap-4">
            <!-- Runs Panel -->
            <AccordionTab v-if="batch.runs && batch.runs.length > 0" :header="`${$t('batch.runs')} (${batch.runs.length})`">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    <div 
                        v-for="run in batch.runs" 
                        :key="run._id"
                        class="p-4 border-2 rounded-xl transition-all cursor-pointer flex flex-col gap-3 relative h-40 group overflow-hidden"
                        :class="[
                            run._id.toString() === selectedRunId 
                                ? 'border-[var(--p-primary-color)] shadow-md bg-[var(--p-primary-50)]/10' 
                                : (run._id.toString() === batch.chosenRunId?.toString() 
                                    ? 'border-[var(--p-primary-300)] bg-[var(--p-primary-50)]/30' 
                                    : 'border-[var(--p-content-border-color)] bg-[var(--p-content-background)] hover:border-[var(--p-primary-200)]')
                        ]"
                        @click="selectedRunId = run._id.toString()"
                    >
                        <!-- Delete button -->
                        <Button 
                            icon="pi pi-trash" 
                            severity="danger" 
                            text 
                            rounded 
                            size="small"
                            class="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                            @click.stop="deleteRunHandler(run._id)"
                        />

                        <div class="flex items-start justify-between">
                            <div class="flex items-center gap-2">
                                <span class="text-xl font-black">#{{ run.runNumber }}</span>
                                <Tag 
                                    :value="$t(`batch.runStatus.${run.status}`)" 
                                    :severity="getRunStatusSeverity(run.status)"
                                />
                            </div>
                        </div>

                        <div v-if="run.error" class="text-[10px] text-red-500 font-medium line-clamp-2">
                            {{ run.error }}
                        </div>

                        <div v-else class="flex flex-col gap-2 flex-1">
                            <div v-if="run.status === 'COMPLETE' || run.status === 'CHOSEN'" class="flex items-center gap-2 text-xs font-bold text-[var(--p-text-muted-color)]">
                                <i class="pi pi-clone"></i>
                                <span>{{ run.layoutCount || 0 }} {{ $t('results.sheets') }}</span>
                            </div>
                            
                            <!-- Artifacts for this run -->
                            <div v-if="(run.status === 'COMPLETE' || run.status === 'CHOSEN')" class="flex flex-wrap gap-1">
                                <Tag 
                                    v-for="artifact in getRunArtifacts(run._id)" 
                                    :key="artifact._id"
                                    :value="mapArtifactType(artifact.type)"
                                    :severity="artifact.status === 'READY' ? 'success' : 'secondary'"
                                    class="cursor-pointer"
                                    @click.stop="onArtifactClick(artifact)"
                                />
                            </div>
                        </div>

                        <div class="flex items-center justify-between mt-auto pt-2 border-t border-[var(--p-content-border-color)]">
                            <span class="text-[10px] font-bold text-[var(--p-text-muted-color)] uppercase">
                                {{ formatDate(run.createdAt) }}
                            </span>
                            
                            <div v-if="run.status === 'COMPLETE' && run._id.toString() !== batch.chosenRunId?.toString()">
                                <Button 
                                    :label="$t('batch.chooseRun')"
                                    size="small"
                                    text
                                    class="p-0 font-black uppercase tracking-wider text-[10px]"
                                    @click.stop="chooseRunHandler(run._id)"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </AccordionTab>

            <!-- Sheets & Nesting Settings -->
            <AccordionTab :header="$t('projectData.sheets')">
                <div class="flex flex-col gap-8 py-2">
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        <!-- Inventory Dropdown -->
                        <div class="lg:col-span-4 flex flex-col gap-2">
                            <label class="text-xs font-black uppercase tracking-widest text-[var(--p-text-muted-color)]">{{ $t('nesting.selectFromInventory') }}</label>
                            <Select 
                                v-model="selectedSheetId" 
                                :options="projectSheets" 
                                optionLabel="label"
                                optionValue="_id"
                                :placeholder="$t('nesting.selectFromInventory')"
                                class="w-full"
                                @change="onInventorySheetChange"
                            >
                                <template #option="slotProps">
                                    <div class="flex flex-col gap-1">
                                        <span class="font-bold text-sm">{{ slotProps.option.material.name }}</span>
                                        <span class="text-[10px] text-[var(--p-text-muted-color)] font-bold uppercase">{{ slotProps.option.width }}x{{ slotProps.option.height }} ({{ slotProps.option.available }} {{ $t('common.units') }})</span>
                                    </div>
                                </template>
                            </Select>
                            <small v-if="projectSheets.length === 0" class="text-[var(--p-text-muted-color)] italic">{{ $t('nesting.noSheetsInInventory') }}</small>
                        </div>

                        <!-- Manual Add -->
                        <div class="lg:col-span-4 flex flex-col gap-2">
                            <label class="text-xs font-black uppercase tracking-widest text-[var(--p-text-muted-color)]">{{ $t('nesting.manualSheet') }}</label>
                            <div class="flex gap-2">
                                <InputNumber v-model="manualSheetInput.width" :min="1" placeholder="W" class="w-full" size="small" />
                                <InputNumber v-model="manualSheetInput.height" :min="1" placeholder="H" class="w-full" size="small" />
                                <Button icon="pi pi-plus" severity="secondary" @click="addManualSheet" v-tooltip.top="$t('nesting.addManualSheet')" />
                            </div>
                        </div>

                        <!-- Tool Selection -->
                        <div class="lg:col-span-2 flex flex-col gap-2">
                            <label class="text-xs font-black uppercase tracking-widest text-[var(--p-text-muted-color)]">{{ $t('nesting.tool') }}</label>
                            <Select 
                                v-model="nestingOptions.toolId" 
                                :options="tools"
                                optionLabel="name"
                                optionValue="_id"
                                :placeholder="$t('nesting.selectTool')"
                                class="w-full"
                            />
                        </div>

                        <!-- Run Button -->
                        <div class="lg:col-span-2 flex items-end h-full">
                            <Button 
                                :label="$t('batches.runNesting')"
                                icon="pi pi-play"
                                severity="success"
                                @click="runNesting"
                                :disabled="batch.status !== 'DRAFT' || entries.length === 0"
                                :loading="nestingInProgress"
                                class="w-full h-[42px] font-black uppercase text-xs"
                            />
                        </div>
                    </div>

                    <!-- Selected Sheets Pool -->
                    <div v-if="nestingOptions.inventorySheets.length > 0 || nestingOptions.sheetPolygon" class="flex flex-col gap-3">
                        <span class="text-[10px] font-black uppercase tracking-widest text-[var(--p-text-muted-color)]">Sheets Pool</span>
                        <div class="flex flex-wrap gap-2">
                            <Chip 
                                v-for="(s, idx) in nestingOptions.inventorySheets" 
                                :key="idx"
                                :label="`${s.width}x${s.height} (${s.code})`" 
                                removable 
                                @remove="removeSheetFromPool(idx)"
                            />
                            <Chip 
                                v-if="nestingOptions.sheetPolygon" 
                                label="Custom Polygon (DXF)" 
                                removable 
                                @remove="clearSheetFile" 
                            />
                        </div>
                    </div>

                    <!-- Artifact Cards -->
                    <div class="flex flex-col gap-4 border-t border-[var(--p-content-border-color)] pt-6">
                        <span class="text-[10px] font-black uppercase tracking-widest text-[var(--p-text-muted-color)]">{{ $t('nesting.artifactsToGenerate') }}</span>
                        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            <div 
                                v-for="art in availableArtifacts" 
                                :key="art.id"
                                class="p-4 border-2 rounded-xl transition-all cursor-pointer flex flex-col gap-2 relative"
                                :class="[
                                    nestingOptions.requestedArtifacts.includes(art.id) 
                                        ? 'border-[var(--p-primary-color)] bg-[var(--p-primary-50)]/30' 
                                        : 'border-[var(--p-content-border-color)] hover:border-[var(--p-primary-200)]',
                                    art.disabled ? 'opacity-60 cursor-default' : ''
                                ]"
                                @click="toggleArtifact(art.id)"
                            >
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-black uppercase">{{ art.name }}</span>
                                    <i v-if="nestingOptions.requestedArtifacts.includes(art.id)" class="pi pi-check-circle text-[var(--p-primary-color)]"></i>
                                </div>
                                <p class="text-[10px] font-medium text-[var(--p-text-muted-color)] leading-tight m-0">{{ art.description }}</p>
                                
                                <div v-if="art.id === 'PDF_PASSPORT' && nestingOptions.requestedArtifacts.includes('PDF_PASSPORT')" class="mt-2" @click.stop>
                                    <Select 
                                        v-model="nestingOptions.pdfTemplateId"
                                        :options="pdfTemplates"
                                        optionLabel="name"
                                        optionValue="_id"
                                        size="small"
                                        class="w-full text-[10px]"
                                    />
                                </div>
                            </div>
                        </div>
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
                                icon="pi pi-th-large"
                                :severity="viewMode === 'grid' ? 'primary' : 'secondary'"
                                @click="viewMode = 'grid'"
                                text
                                :outlined="viewMode !== 'grid'"
                            />
                            <Button 
                                icon="pi pi-table"
                                :severity="viewMode === 'table' ? 'primary' : 'secondary'"
                                @click="viewMode = 'table'"
                                text
                                :outlined="viewMode !== 'table'"
                            />
                        </div>
                    </div>

                    <!-- Grid View -->
                    <div v-if="viewMode === 'grid'" class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
                        <div 
                            v-for="entry in entries" 
                            :key="entry._id"
                            class="border border-[var(--p-content-border-color)] rounded-2xl p-4 bg-[var(--p-content-background)] hover:border-[var(--p-primary-color)] transition-all flex gap-6 shadow-sm group relative overflow-hidden"
                        >
                            <!-- Delete button -->
                            <Button 
                                icon="pi pi-trash"
                                severity="danger"
                                text
                                rounded
                                size="small"
                                class="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                @click="confirmDelete(entry)"
                                :disabled="batch.status !== 'DRAFT'"
                            />

                            <!-- Left: Thumbnail (Squared and Bigger) -->
                            <div class="w-40 h-40 flex-shrink-0 bg-white dark:bg-zinc-900 rounded-xl overflow-hidden border border-[var(--p-content-border-color)]">
                                <CassetteThumbnail :cassette-id="entry.cassetteTemplateId" />
                            </div>

                            <!-- Right: Info and Parameters -->
                            <div class="flex-1 flex flex-col min-w-0 py-1 gap-4">
                                <h3 class="font-black text-[var(--p-text-color)] truncate text-sm uppercase tracking-wider m-0">
                                    {{ getCassetteName(entry.cassetteTemplateId) }}
                                </h3>

                                <div class="flex flex-col gap-3">
                                    <div class="flex items-center justify-between gap-4">
                                        <span class="text-[10px] font-black uppercase tracking-widest text-[var(--p-text-muted-color)]">{{ $t('batch.quantity') }}</span>
                                        <InputNumber 
                                            v-model="entry.quantity" 
                                            :min="1" 
                                            :disabled="batch.status !== 'DRAFT'"
                                            size="small"
                                            class="w-28"
                                            showButtons
                                            buttonLayout="horizontal"
                                            @update:model-value="saveBatch"
                                        />
                                    </div>
                                    
                                    <div class="flex flex-col gap-2">
                                        <div v-for="param in getEntryParameters(entry)" :key="param" class="flex items-center justify-between gap-4">
                                            <span class="text-[10px] font-black uppercase tracking-tighter text-[var(--p-text-muted-color)]">{{ param }}</span>
                                            <InputNumber 
                                                v-model="entry.dimensions[param]"
                                                :disabled="batch.status !== 'DRAFT'"
                                                size="small"
                                                class="w-28"
                                                :min="0"
                                                @update:model-value="saveBatch"
                                            />
                                        </div>
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
            <AccordionTab v-if="selectedRunId" :header="$t('batches.artifacts')">
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
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import Chip from 'primevue/chip';
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
const previewRunId = ref(null);

const projectData = ref(null);
const selectedSheetId = ref(null);
const manualSheetInput = ref({ width: 2440, height: 1220 });

const availableArtifacts = ref([
    { id: 'LAYOUT_DXF', name: 'DXF Layout', description: 'Production-ready DXF with all layers and styling.', disabled: true },
    { id: 'LAYOUT_SVG', name: 'SVG Preview', description: 'Web-friendly SVG for quick previewing.' },
    { id: 'PDF_PASSPORT', name: 'PDF Passports', description: 'Per-sheet technical passports.' },
    { id: 'NESTING_REPORT', name: 'Nesting Report', description: 'Detailed PDF report with utilization stats.' }
]);

const nestingOptions = ref({
    width: props.batch.nestingParams?.width || 2440,
    height: props.batch.nestingParams?.height || 1220,
    toolId: props.batch.nestingParams?.toolId || null,
    sheetPolygon: props.batch.nestingParams?.sheetPolygon || null,
    requestedArtifacts: props.batch.requestedArtifacts || ['LAYOUT_DXF'],
    pdfTemplateId: props.batch.pdfTemplateId || null,
    inventorySheets: props.batch.nestingParams?.inventorySheets || []
});

// Watch nesting options for auto-save
watch(nestingOptions, async (newVal) => {
    if (props.batch.status !== 'DRAFT') return;
    try {
        await $fetch(`/api/batch/${props.batch._id}`, {
            method: 'PUT',
            body: {
                nestingParams: {
                    width: newVal.width,
                    height: newVal.height,
                    toolId: newVal.toolId,
                    sheetPolygon: newVal.sheetPolygon,
                    inventorySheets: newVal.inventorySheets
                },
                requestedArtifacts: newVal.requestedArtifacts,
                pdfTemplateId: newVal.pdfTemplateId
            }
        });
    } catch (error) {
        console.error('Failed to auto-save nesting options:', error);
    }
}, { deep: true });

const selectedSheetFile = ref(null);

const pdfTemplates = ref([
    { _id: 'default', name: 'Standard Passport' },
    { _id: 'detailed', name: 'Detailed Technical' }
]);

const projectSheets = computed(() => {
    return (projectData.value?.sheets || []).map(s => ({
        ...s,
        label: `${s.material.name} (${s.width}x${s.height})`
    }));
});

const onInventorySheetChange = (e) => {
    const sheetId = e.value;
    const sheet = projectSheets.value.find(s => s._id === sheetId);
    if (sheet) {
        nestingOptions.value.inventorySheets.push({
            code: sheet.material.code,
            width: sheet.width,
            height: sheet.height,
            available: sheet.available
        });
        selectedSheetId.value = null; // Reset dropdown
    }
};

const addManualSheet = () => {
    nestingOptions.value.inventorySheets.push({
        code: 'MANUAL',
        width: manualSheetInput.value.width,
        height: manualSheetInput.value.height,
        available: 1
    });
};

const removeSheetFromPool = (index) => {
    nestingOptions.value.inventorySheets.splice(index, 1);
};

const toggleArtifact = (id) => {
    if (id === 'LAYOUT_DXF') return;
    const index = nestingOptions.value.requestedArtifacts.indexOf(id);
    if (index > -1) {
        nestingOptions.value.requestedArtifacts.splice(index, 1);
    } else {
        nestingOptions.value.requestedArtifacts.push(id);
    }
};

const onArtifactClick = (artifact) => {
    selectedRunId.value = artifact.runId.toString();
};

const goToProjectData = () => {
    navigateTo(`/project/${props.projectSlug}/data`);
};

onMounted(async () => {
    console.log('[BatchEditor] Mounted, loading data...');
    const [cassetteResult, projectRes] = await Promise.all([
        cassettesStore.fetchCassettes(),
        $fetch(`/api/project/${props.projectSlug}`)
    ]);
    
    cassettes.value = cassetteResult || [];
    projectData.value = projectRes;
    
    // Load tools
    await toolProfilesStore.fetchTools();
    
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
    entries.value.forEach(entry => {
        const cassette = cassettes.value.find(c => c._id === entry.cassetteTemplateId);
        if (cassette?.parameters) {
            cassette.parameters.forEach(param => params.add(param));
        }
        if (entry.dimensions) {
            Object.keys(entry.dimensions).forEach(key => params.add(key));
        }
    });
    return Array.from(params).sort();
});

// Get all unique options from all entries based on their cassettes
const allOptions = computed(() => {
    const options = new Set();
    entries.value.forEach(entry => {
        const cassette = cassettes.value.find(c => c._id === entry.cassetteTemplateId);
        if (cassette?.options) {
            Object.keys(cassette.options).forEach(option => options.add(option));
        }
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
    const entry = {
        ...newEntry.value,
        _id: `temp_${Date.now()}`,
        dimensions: { ...newEntry.value.dimensions },
        options: { ...newEntry.value.options }
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
    }
};

const runNesting = async () => {
    if (entries.value.length === 0) {
        return;
    }

    nestingInProgress.value = true;
    try {
        const payload = {
            width: nestingOptions.value.width,
            height: nestingOptions.value.height,
            toolId: nestingOptions.value.toolId,
            sheet_polygon: nestingOptions.value.sheetPolygon,
            inventorySheets: nestingOptions.value.inventorySheets,
            requestedArtifacts: nestingOptions.value.requestedArtifacts,
            pdfTemplateId: nestingOptions.value.pdfTemplateId
        };
        await batchesStore.startNesting(props.batch._id, payload);
        toast.add({ severity: 'info', summary: t('batches.nestingStarted'), life: 3000 });
    } catch (error) {
        console.error('Failed to run nesting:', error);
        toast.add({ severity: 'error', summary: t('batches.nestingFailed'), detail: error.message, life: 3000 });
    } finally {
        nestingInProgress.value = false;
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
                toast.add({ severity: 'success', summary: t('common.success'), life: 3000 });
                emit('updated');
            } catch (error) {
                console.error('Failed to delete run:', error);
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

const handleSheetSelect = async (event) => {
    if (event.files && event.files.length > 0) {
        selectedSheetFile.value = event.files[0];
        try {
            const { extractPolygons } = await import('~/utils/dxfParser');
            const polygons = await extractPolygons(selectedSheetFile.value);
            if (polygons.length > 0) {
                const largest = polygons.sort((a, b) => calculatePolygonArea(b) - calculatePolygonArea(a))[0];
                nestingOptions.value.sheetPolygon = largest;
                toast.add({ severity: 'success', summary: t('common.success'), detail: t('batches.sheetUploaded'), life: 3000 });
            } else {
                toast.add({ severity: 'error', summary: t('common.error'), detail: t('batches.noPolygonsInSheet'), life: 3000 });
                selectedSheetFile.value = null;
            }
        } catch (error) {
            console.error('Failed to parse sheet DXF:', error);
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

const onCassetteUploaded = async () => {
    showUploadDialog.value = false;
    const result = await cassettesStore.fetchCassettes();
    cassettes.value = result || [];
};
</script>

<style scoped lang="scss">
:deep(.p-accordion-tab) {
    margin-bottom: 1rem;
}
:deep(.p-inputnumber-input) {
    width: 100% !important;
}
</style>
