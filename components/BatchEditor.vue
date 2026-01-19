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
                        class="p-4 border-2 rounded-2xl transition-all cursor-pointer flex flex-col gap-3 relative h-44 group overflow-hidden"
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

                        <div v-if="run.error" class="text-[10px] text-red-500 font-medium line-clamp-2 italic">
                            {{ run.error }}
                        </div>

                        <div v-else class="flex flex-col gap-2 flex-1">
                            <div v-if="run.status === 'COMPLETE' || run.status === 'CHOSEN'" class="flex items-center gap-3">
                                <div class="flex items-center gap-1.5 text-xs font-bold text-[var(--p-text-muted-color)]">
                                    <i class="pi pi-clone"></i>
                                    <span>{{ run.layoutCount || 0 }} {{ $t('results.sheets') }}</span>
                                </div>
                                <div v-if="run.utilization" class="flex items-center gap-1.5 text-xs font-bold text-[var(--p-primary-color)]">
                                    <i class="pi pi-chart-bar"></i>
                                    <span>{{ (run.utilization * 100).toFixed(1) }}%</span>
                                </div>
                            </div>
                            
                            <!-- Artifacts for this run -->
                            <div v-if="(run.status === 'COMPLETE' || run.status === 'CHOSEN')" class="flex flex-wrap gap-1.5">
                                <Tag 
                                    v-for="artifact in getRunArtifacts(run._id)" 
                                    :key="artifact._id"
                                    :value="mapArtifactType(artifact.type)"
                                    :severity="artifact.status === 'READY' ? 'success' : 'secondary'"
                                    class="cursor-pointer font-bold px-2"
                                    @click.stop="onArtifactClick(artifact)"
                                />
                            </div>
                        </div>

                        <div class="flex items-center justify-between mt-auto pt-2 border-t border-[var(--p-content-border-color)]">
                            <span class="text-[10px] font-bold text-[var(--p-text-muted-color)] uppercase tracking-tight">
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
                <div class="flex flex-col gap-8 py-2" v-if="batch.status === 'DRAFT'">
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        <!-- Left: Material & Sheets Selection -->
                        <div class="lg:col-span-10 flex flex-col gap-6">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <!-- Material Selection -->
                                <div class="flex flex-col gap-2">
                                    <label class="text-[10px] font-black uppercase tracking-widest text-[var(--p-text-muted-color)]">1. Select Material</label>
                                    <Select 
                                        v-model="activeMaterialId" 
                                        :options="projectMaterials" 
                                        optionLabel="material.name"
                                        optionValue="materialId"
                                        placeholder="Select project material..."
                                        class="w-full"
                                    >
                                        <template #option="slotProps">
                                            <div class="flex flex-col gap-1">
                                                <span class="font-bold text-sm">{{ slotProps.option.material.name }}</span>
                                                <span class="text-[10px] text-[var(--p-text-muted-color)] font-bold uppercase">{{ slotProps.option.material.code }} • {{ slotProps.option.material.thickness }}mm</span>
                                            </div>
                                        </template>
                                    </Select>
                                </div>

                                <!-- Tool Selection -->
                                <div class="flex flex-col gap-2">
                                    <label class="text-[10px] font-black uppercase tracking-widest text-[var(--p-text-muted-color)]">2. Select Tool</label>
                                    <Select 
                                        v-model="nestingOptions.toolId" 
                                        :options="tools"
                                        optionLabel="name"
                                        optionValue="_id"
                                        placeholder="Select tool..."
                                        class="w-full"
                                    />
                                </div>
                            </div>

                            <!-- Sheets Pool from Active Material -->
                            <div v-if="activeProjectMaterial" class="flex flex-col gap-4 p-6 bg-[var(--p-content-background)] border-2 border-[var(--p-content-border-color)] rounded-2xl">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-black uppercase tracking-widest">Available Inventory</span>
                                    <Button :label="$t('projectData.addSheets')" icon="pi pi-plus" text size="small" @click="goToProjectData" />
                                </div>
                                
                                <div v-if="activeProjectMaterial.sheets.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <div 
                                        v-for="(s, sIdx) in activeProjectMaterial.sheets" 
                                        :key="sIdx"
                                        class="flex items-center justify-between p-3 border-2 rounded-xl cursor-pointer transition-all"
                                        :class="[
                                            isSheetSelected(s)
                                                ? 'border-[var(--p-primary-color)] bg-[var(--p-primary-50)]/30' 
                                                : 'border-[var(--p-content-border-color)] hover:border-[var(--p-primary-200)]'
                                        ]"
                                        @click="toggleSheetSelection(s)"
                                    >
                                        <div class="flex flex-col">
                                            <span class="text-xs font-black">{{ s.width }}x{{ s.height }}</span>
                                            <span class="text-[10px] font-bold text-[var(--p-text-muted-color)]">{{ s.available }} units</span>
                                        </div>
                                        <Checkbox :modelValue="isSheetSelected(s)" binary />
                                    </div>
                                </div>
                                <div v-else class="text-center py-4 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl opacity-60 italic text-xs">
                                    No sheets in inventory for this material.
                                </div>

                                <!-- Waste Polygons -->
                                <div v-if="activeProjectMaterial.wastePolygons?.length > 0" class="flex flex-col gap-3 pt-4 border-t border-[var(--p-content-border-color)]">
                                    <span class="text-[10px] font-black uppercase tracking-widest opacity-60">Waste Polygons</span>
                                    <div class="flex flex-wrap gap-2">
                                        <Chip 
                                            v-for="(wp, wIdx) in activeProjectMaterial.wastePolygons" 
                                            :key="wIdx" 
                                            :label="`Waste #${wIdx+1} (${wp.area}m²)`" 
                                            class="text-[10px]"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Right: Run Action -->
                        <div class="lg:col-span-2 flex flex-col gap-4">
                            <Button 
                                :label="$t('batches.runNesting')"
                                icon="pi pi-play"
                                severity="success"
                                @click="runNesting"
                                :disabled="!activeMaterialId || entries.length === 0"
                                :loading="nestingInProgress"
                                class="w-full py-4 font-black uppercase text-sm rounded-xl"
                            />
                            <div class="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-[var(--p-content-border-color)] flex flex-col gap-2">
                                <span class="text-[10px] font-black uppercase opacity-60">Sheets in Job</span>
                                <span class="text-lg font-black">{{ nestingOptions.inventorySheets.length }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Artifact Cards -->
                    <div class="flex flex-col gap-4 border-t border-[var(--p-content-border-color)] pt-8">
                        <span class="text-[10px] font-black uppercase tracking-widest text-[var(--p-text-muted-color)]">{{ $t('nesting.artifactsToGenerate') }}</span>
                        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            <div 
                                v-for="art in availableArtifacts" 
                                :key="art.id"
                                class="p-5 border-2 rounded-2xl transition-all cursor-pointer flex flex-col gap-3 relative overflow-hidden"
                                :class="[
                                    nestingOptions.requestedArtifacts.includes(art.id) 
                                        ? 'border-[var(--p-primary-color)] bg-[var(--p-primary-50)]/30' 
                                        : 'border-[var(--p-content-border-color)] hover:border-[var(--p-primary-200)]',
                                    art.disabled ? 'opacity-60 cursor-default' : ''
                                ]"
                                @click="toggleArtifact(art.id)"
                            >
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="nestingOptions.requestedArtifacts.includes(art.id) ? 'bg-[var(--p-primary-color)] text-white' : 'bg-zinc-100 text-zinc-400'">
                                            <i :class="art.icon"></i>
                                        </div>
                                        <span class="text-xs font-black uppercase tracking-wider">{{ art.name }}</span>
                                    </div>
                                    <i v-if="nestingOptions.requestedArtifacts.includes(art.id)" class="pi pi-check-circle text-[var(--p-primary-color)] text-lg"></i>
                                </div>
                                <p class="text-[10px] font-bold text-[var(--p-text-muted-color)] leading-snug m-0 pr-4">{{ art.description }}</p>
                                
                                <div v-if="art.id === 'PDF_PASSPORT' && nestingOptions.requestedArtifacts.includes('PDF_PASSPORT')" class="mt-2" @click.stop>
                                    <Select 
                                        v-model="nestingOptions.pdfTemplateId"
                                        :options="pdfTemplates"
                                        optionLabel="name"
                                        optionValue="_id"
                                        size="small"
                                        class="w-full"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div v-else class="py-8 text-center opacity-60">
                    <i class="pi pi-lock text-4xl mb-3"></i>
                    <p class="font-bold uppercase tracking-widest text-xs">Batch is CUT. Settings are locked.</p>
                </div>
            </AccordionTab>

            <!-- Cassettes DataView Panel -->
            <AccordionTab :header="$t('batches.cassettes')">
                <div class="flex flex-col gap-6">
                    <!-- View Switcher -->
                    <div class="flex justify-between items-center">
                        <div class="flex gap-2">
                            <Button icon="pi pi-th-large" :severity="viewMode === 'grid' ? 'primary' : 'secondary'" @click="viewMode = 'grid'" text />
                            <Button icon="pi pi-table" :severity="viewMode === 'table' ? 'primary' : 'secondary'" @click="viewMode = 'table'" text />
                        </div>
                    </div>

                    <!-- Grid View -->
                    <div v-if="viewMode === 'grid'" class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
                        <div 
                            v-for="entry in entries" 
                            :key="entry._id"
                            class="bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-2xl p-5 flex gap-6 shadow-sm hover:border-[var(--p-primary-color)] transition-all group relative overflow-hidden"
                        >
                            <Button 
                                icon="pi pi-trash" severity="danger" text rounded size="small"
                                class="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                @click="confirmDelete(entry)"
                                :disabled="batch.status !== 'DRAFT'"
                            />

                            <!-- Left: Thumbnail (Bigger and Square) -->
                            <div class="w-44 h-44 flex-shrink-0 bg-white dark:bg-zinc-900 rounded-xl overflow-hidden border border-[var(--p-content-border-color)] shadow-inner">
                                <CassetteThumbnail :cassette-id="entry.cassetteTemplateId" />
                            </div>

                            <!-- Right: Info -->
                            <div class="flex-1 flex flex-col min-w-0">
                                <h3 class="font-black text-sm uppercase tracking-widest m-0 mb-4 truncate text-[var(--p-text-color)]">
                                    {{ getCassetteName(entry.cassetteTemplateId) }}
                                </h3>

                                <div class="flex flex-col gap-4">
                                    <!-- Quantity Row -->
                                    <div class="flex items-center justify-between gap-4 p-2 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-[var(--p-content-border-color)]">
                                        <span class="text-[10px] font-black uppercase tracking-widest opacity-60">{{ $t('batch.quantity') }}</span>
                                        <InputNumber 
                                            v-model="entry.quantity" :min="1" :disabled="batch.status !== 'DRAFT'"
                                            size="small" class="w-32" showButtons buttonLayout="horizontal"
                                            @update:model-value="saveBatch"
                                        />
                                    </div>
                                    
                                    <!-- Parameters List -->
                                    <div class="flex flex-col gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                                        <div v-for="param in getEntryParameters(entry)" :key="param" class="flex items-center justify-between gap-4 py-1 border-b border-dashed border-[var(--p-content-border-color)] last:border-0">
                                            <span class="text-[10px] font-black uppercase opacity-60">{{ param }}</span>
                                            <InputNumber 
                                                v-model="entry.dimensions[param]" :disabled="batch.status !== 'DRAFT'"
                                                size="small" class="w-28" :min="0"
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

                        <Column field="quantity" :header="$t('batches.quantity')" style="width: 120px">
                            <template #editor="{ data }">
                                <InputNumber v-model="data.quantity" :min="1" :max="1000" showButtons class="w-full" />
                            </template>
                        </Column>

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
                                <InputNumber v-model="data.dimensions[param]" class="w-full" />
                            </template>
                        </Column>

                        <Column :header="$t('common.actions')" style="width: 80px" class="text-right">
                            <template #body="slotProps">
                                <Button 
                                    icon="pi pi-trash" severity="danger" text rounded
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
                            :label="$t('batches.addFromTemplate')" icon="pi pi-plus" severity="secondary" outlined
                            @click="showAddDialog = true" :disabled="batch.status !== 'DRAFT'"
                        />
                        <Button 
                            :label="$t('batches.uploadCassette')" icon="pi pi-upload" severity="secondary" outlined
                            @click="showUploadDialog = true" :disabled="batch.status !== 'DRAFT'"
                        />
                    </div>
                </div>
            </AccordionTab>

            <!-- Artifacts Panel -->
            <AccordionTab v-if="selectedRunId" :header="$t('batches.artifacts')">
                <ArtifactsTable ref="artifactsTableRef" :batch-id="batch._id" :batch="batch" :run-id="selectedRunId" />
            </AccordionTab>
        </Accordion>

        <!-- Add Entry Dialog -->
        <Dialog 
            v-model:visible="showAddDialog" :header="$t('batches.addEntry')" modal
            :style="{ width: '95vw', maxWidth: '500px' }"
        >
            <div class="flex flex-col gap-6 py-4">
                <div class="flex flex-col gap-2">
                    <label class="font-medium text-[var(--p-text-color)]">{{ $t('batches.cassette') }}</label>
                    <Select 
                        v-model="newEntry.cassetteTemplateId" :options="cassettes"
                        optionLabel="name" optionValue="_id" :placeholder="$t('batches.selectCassette')"
                        class="w-full" @change="onNewCassetteChange"
                    />
                </div>
                <div class="flex flex-col gap-2">
                    <label class="font-medium text-[var(--p-text-color)]">{{ $t('batches.quantity') }}</label>
                    <InputNumber v-model="newEntry.quantity" :min="1" showButtons class="w-full" />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showAddDialog = false" />
                <Button :label="$t('common.add')" @click="addEntry" :disabled="!newEntry.cassetteTemplateId" />
            </template>
        </Dialog>

        <!-- Upload Cassette Dialog -->
        <Dialog 
            v-model:visible="showUploadDialog" :header="$t('batches.uploadNewCassette')" modal
            :style="{ width: '95vw', maxWidth: '600px' }"
        >
            <CassetteEditorDialog v-if="showUploadDialog" @saved="onCassetteUploaded" />
        </Dialog>

        <ConfirmDialog />
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
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
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import Chip from 'primevue/chip';
import ConfirmDialog from 'primevue/confirmdialog';
import Accordion from 'primevue/accordion';
import AccordionTab from 'primevue/accordiontab';
import CassetteEditorDialog from './CassetteEditorDialog.vue';
import CassetteThumbnail from './CassetteThumbnail.vue';

const props = defineProps({
    batch: { type: Object, required: true },
    projectSlug: { type: String, required: true }
});

const emit = defineEmits(['updated']);
const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();

const batchesStore = useBatchesStore();
const cassettesStore = useCassettesStore();
const artifactsStore = useArtifactsStore();
const toolProfilesStore = useToolProfilesStore();

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

const projectData = ref(null);
const activeMaterialId = ref(null);

const availableArtifacts = ref([
    { id: 'LAYOUT_DXF', name: 'DXF Layout', icon: 'pi pi-file', description: 'Full production DXF with all layers.' },
    { id: 'PDF_PASSPORT', name: 'Technical Passports', icon: 'pi pi-id-card', description: 'Per-sheet PDF passports for production.' }
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
    } catch (e) { console.error(e); }
}, { deep: true });

const pdfTemplates = ref([{ _id: 'default', name: 'Standard Passport' }, { _id: 'detailed', name: 'Detailed Technical' }]);

const projectMaterials = computed(() => projectData.value?.projectMaterials || []);
const activeProjectMaterial = computed(() => projectMaterials.value.find(pm => pm.materialId === activeMaterialId.value));

const isSheetSelected = (sheet) => nestingOptions.value.inventorySheets.some(s => s.width === sheet.width && s.height === sheet.height);

const toggleSheetSelection = (sheet) => {
    const idx = nestingOptions.value.inventorySheets.findIndex(s => s.width === sheet.width && s.height === sheet.height);
    if (idx > -1) nestingOptions.value.inventorySheets.splice(idx, 1);
    else nestingOptions.value.inventorySheets.push({ code: activeProjectMaterial.value.material.code, width: sheet.width, height: sheet.height, available: sheet.available });
};

const toggleArtifact = (id) => {
    if (id === 'LAYOUT_DXF') return;
    const idx = nestingOptions.value.requestedArtifacts.indexOf(id);
    if (idx > -1) nestingOptions.value.requestedArtifacts.splice(idx, 1);
    else nestingOptions.value.requestedArtifacts.push(id);
};

const artifactsTableRef = ref(null);

const onArtifactClick = (artifact) => {
    selectedRunId.value = artifact.runId.toString();
    // Use nextTick to ensure the table is rendered then trigger preview
    nextTick(() => {
        if (artifactsTableRef.value) {
            artifactsTableRef.value.previewArtifact(artifact);
        }
    });
};

const goToProjectData = () => navigateTo(`/project/${props.projectSlug}/data`);

onMounted(async () => {
    const [cassetteResult, projectRes] = await Promise.all([
        cassettesStore.fetchCassettes(),
        $fetch(`/api/project/${props.projectSlug}`)
    ]);
    cassettes.value = cassetteResult || [];
    projectData.value = projectRes;
    await toolProfilesStore.fetchTools();
    loadBatchData();
});

onUnmounted(() => batchesStore.stopPolling(props.batch._id));
watch(() => props.batch, () => loadBatchData(), { deep: true });
watch(selectedRunId, () => loadArtifacts());

const loadBatchData = () => {
    entries.value = [...(props.batch.entries || [])];
    loadArtifacts();
};

const loadArtifacts = async () => {
    try { await artifactsStore.fetchArtifacts(props.batch._id, selectedRunId.value); }
    catch (e) { console.error(e); }
};

const allParameters = computed(() => {
    const params = new Set();
    entries.value.forEach(entry => {
        const cassette = cassettes.value.find(c => c._id === entry.cassetteTemplateId);
        if (cassette?.parameters) cassette.parameters.forEach(p => params.add(p));
        if (entry.dimensions) Object.keys(entry.dimensions).forEach(k => params.add(k));
    });
    return Array.from(params).sort();
});

const getCassetteName = (id) => cassettes.value.find(c => c._id === id)?.name || t('batch.unknownCassette');
const getEntryParameters = (entry) => cassettes.value.find(c => c._id === entry.cassetteTemplateId)?.parameters || [];
const getRunArtifacts = (runId) => artifacts.value?.filter(a => a.runId?.toString() === runId.toString()) || [];

const mapArtifactType = (type) => {
    const map = { 'LAYOUT_DXF': 'DXF', 'PDF_PASSPORT': 'PDF' };
    return map[type] || type.split('_')[1] || type;
};

const getStatusSeverity = (s) => ({ 'DRAFT': 'info', 'CUT': 'success' }[s] || 'info');
const getRunStatusSeverity = (s) => ({ 'NESTING': 'warning', 'ERROR': 'danger', 'COMPLETE': 'success', 'CHOSEN': 'info' }[s] || 'info');
const formatDate = (d) => new Date(d).toLocaleString();

const onCassetteChange = (entry) => {
    const cassette = cassettes.value.find(c => c._id === entry.cassetteTemplateId);
    if (cassette?.parameters) {
        entry.dimensions = entry.dimensions || {};
        cassette.parameters.forEach(p => { if (!(p in entry.dimensions)) entry.dimensions[p] = 0; });
    }
};

const onNewCassetteChange = () => {
    const cassette = cassettes.value.find(c => c._id === newEntry.value.cassetteTemplateId);
    if (cassette?.parameters) {
        newEntry.value.dimensions = {};
        cassette.parameters.forEach(p => { newEntry.value.dimensions[p] = 0; });
    }
};

const newEntry = ref({ cassetteTemplateId: null, quantity: 1, dimensions: {} });

const addEntry = async () => {
    entries.value.push({ ...newEntry.value, _id: `temp_${Date.now()}` });
    await saveBatch();
    newEntry.value = { cassetteTemplateId: null, quantity: 1, dimensions: {} };
    showAddDialog.value = false;
};

const onRowEditSave = async () => await saveBatch();

const confirmDelete = (entry) => {
    confirm.require({
        message: t('batches.confirmDeleteEntry'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            const idx = entries.value.findIndex(e => e._id === entry._id);
            if (idx > -1) { entries.value.splice(idx, 1); await saveBatch(); }
        }
    });
};

const saveBatch = async () => {
    try { await $fetch(`/api/batch/${props.batch._id}`, { method: 'PUT', body: { entries: entries.value } }); emit('updated'); }
    catch (e) { console.error(e); }
};

const runNesting = async () => {
    if (entries.value.length === 0) return;
    nestingInProgress.value = true;
    try {
        const payload = {
            ...nestingOptions.value,
            materialId: activeMaterialId.value
        };
        await batchesStore.startNesting(props.batch._id, payload);
        toast.add({ severity: 'info', summary: t('batches.nestingStarted'), life: 3000 });
    } catch (e) {
        toast.add({ severity: 'error', summary: t('batches.nestingFailed'), detail: e.message, life: 3000 });
    } finally { nestingInProgress.value = false; }
};

const resetToDraft = async () => {
    confirm.require({
        message: t('batches.confirmResetMessage'),
        header: t('batches.confirmResetTitle'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            try { await batchesStore.resetStatus(props.batch._id); emit('updated'); }
            catch (e) { console.error(e); }
        }
    });
};

const chooseRunHandler = async (id) => {
    try { await batchesStore.chooseRun(props.batch._id, id); emit('updated'); }
    catch (e) { console.error(e); }
};

const markCutHandler = async () => {
    confirm.require({
        message: t('batch.confirmMarkCut'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            try { await batchesStore.markCut(props.batch._id); emit('updated'); }
            catch (e) { console.error(e); }
        }
    });
};

const deleteRunHandler = async (id) => {
    confirm.require({
        message: t('batch.confirmDeleteRun'),
        header: t('common.confirmation'),
        icon: 'pi pi-trash',
        accept: async () => {
            try { await batchesStore.deleteRun(props.batch._id, id); if (selectedRunId.value === id.toString()) selectedRunId.value = null; emit('updated'); }
            catch (e) { console.error(e); }
        }
    });
};

const onCassetteUploaded = async () => {
    showUploadDialog.value = false;
    const res = await cassettesStore.fetchCassettes();
    cassettes.value = res || [];
};
</script>

<style scoped lang="scss">
:deep(.p-accordion-tab) { margin-bottom: 1rem; }
:deep(.p-inputnumber-input) { width: 100% !important; }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: var(--p-content-border-color); border-radius: 10px; }
</style>