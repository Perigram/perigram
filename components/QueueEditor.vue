<template>
    <div class="flex flex-col gap-6">
        <!-- Queue Header with Status and Traceability -->
        <div class="flex flex-col gap-4 bg-[var(--p-content-background)] p-6 rounded-xl border border-[var(--p-content-border-color)]">
            <div class="flex flex-col sm:flex-row sm:items-center gap-4">
                <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-4">
                        <h2 class="text-3xl font-black m-0">{{ queueName }}</h2>
                        <EntityStatus :entity="queue" variant="inline" />
                    </div>
                    <TraceChain :ancestry="queueAncestry" />
                </div>
                <div class="flex flex-wrap gap-2 sm:ml-auto">
                    <Button icon="pi pi-history" severity="secondary" text @click="showHistory = !showHistory" v-tooltip.top="'Toggle History'" />
                    <Button 
                        v-if="queueState === 'READY' && queue.chosenRunId && authStore.can('queues', 'edit')"
                        :label="$t('queue.markCut')" icon="pi pi-scissors" severity="success"
                        @click="markCutHandler"
                    />
                    <Button 
                        v-if="queueState !== 'DRAFT' && authStore.can('queues', 'edit')"
                        :label="$t('queue.resetToDraft')" icon="pi pi-refresh" severity="warning"
                        @click="resetToDraft"
                    />
                </div>
            </div>

            <div v-if="showHistory" class="mt-4 pt-4 border-t border-[var(--p-content-border-color)] animate-in fade-in slide-in-from-top-2">
                <span class="text-[10px] font-black uppercase opacity-60 mb-4 block">Queue Lifecycle</span>
                <HistoryTimeline :history="queue.statusHistory || []" />
            </div>
        </div>

        <!-- Accordion Panels -->
        <Accordion :multiple="true" :activeIndex="[0, 1, 2]" class="flex flex-col gap-4">
            <!-- Runs Panel -->
            <AccordionTab v-if="queue.runs && queue.runs.length > 0" :header="`${$t('queue.runs')} (${queue.runs.length})`">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    <div 
                        v-for="run in queue.runs" 
                        :key="run._id"
                        class="p-4 border-2 rounded-2xl transition-all cursor-pointer flex flex-col gap-3 relative h-44 group overflow-hidden"
                        :class="[
                            run._id.toString() === selectedRunId 
                                ? 'border-[var(--p-primary-color)] shadow-md bg-[var(--p-primary-50)]/10' 
                                : (run._id.toString() === queue.chosenRunId?.toString() 
                                    ? 'border-[var(--p-primary-300)] bg-[var(--p-primary-50)]/30' 
                                    : 'border-[var(--p-content-border-color)] bg-[var(--p-content-background)] hover:border-[var(--p-primary-200)]')
                        ]"
                        @click="selectedRunId = run._id.toString()"
                    >
                        <div class="flex items-start justify-between">
                            <div class="flex flex-col">
                                <div class="flex items-center gap-2">
                                    <span class="text-xl font-black">#{{ run.runNumber }}</span>
                                    <Tag :value="run.materialMode || 'WAREHOUSE'" :severity="run.materialMode === 'VIRTUAL' ? 'warn' : 'info'" class="text-[8px]" />
                                </div>
                                <EntityStatus :entity="run.status" variant="inline" />
                            </div>
                            <Button 
                                icon="pi pi-trash" severity="danger" text rounded size="small"
                                class="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                @click.stop="deleteRunHandler(run._id)"
                            />
                        </div>

                        <div v-if="run.status?.state === 'COMPLETE' || run.status?.state === 'CHOSEN'" class="flex flex-col gap-2 flex-1">
                            <div class="flex items-center gap-3">
                                <div class="flex items-center gap-1.5 text-xs font-bold text-[var(--p-text-muted-color)]">
                                    <i class="pi pi-clone"></i>
                                    <span>{{ run.layoutCount || 0 }} {{ $t('results.sheets') }}</span>
                                </div>
                                <div v-if="run.utilization" class="flex items-center gap-1.5 text-xs font-bold text-[var(--p-primary-color)]">
                                    <i class="pi pi-chart-bar"></i>
                                    <span>{{ (run.utilization * 100).toFixed(1) }}%</span>
                                </div>
                            </div>
                            
                            <div class="flex flex-wrap gap-1.5">
                                <Tag 
                                    v-for="artifact in getRunArtifacts(run._id)" 
                                    :key="artifact._id"
                                    :value="mapArtifactType(artifact.type)"
                                    :severity="artifact.status?.state === 'READY' ? 'success' : 'secondary'"
                                    class="cursor-pointer font-bold px-2"
                                    @click.stop="onArtifactClick(artifact)"
                                />
                            </div>
                        </div>

                        <div class="flex items-center justify-between mt-auto pt-2 border-t border-[var(--p-content-border-color)]">
                            <span class="text-[10px] font-bold text-[var(--p-text-muted-color)] uppercase tracking-tight">{{ formatDate(run.createdAt) }}</span>
                            <Button 
                                v-if="run.status?.state === 'COMPLETE' && run._id.toString() !== queue.chosenRunId?.toString()"
                                :label="$t('queue.chooseRun')" size="small" text class="p-0 font-black uppercase tracking-wider text-[10px]"
                                @click.stop="chooseRunHandler(run._id)"
                            />
                        </div>
                    </div>
                </div>
            </AccordionTab>

            <!-- Sheets & Nesting Settings -->
            <AccordionTab :header="$t('projectData.sheets')">
                <div class="flex flex-col gap-8 py-2" v-if="queueState === 'DRAFT'">
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        <div class="lg:col-span-12 flex flex-col gap-6">
                            <!-- Source Mode Selection -->
                            <div class="flex flex-col gap-4 p-6 bg-[var(--p-content-background)] border-2 border-[var(--p-content-border-color)] rounded-2xl">
                                <div class="flex flex-col gap-2">
                                    <label class="text-xs font-black uppercase tracking-widest">Material Sourcing Mode</label>
                                    <SelectButton v-model="nestingOptions.materialMode" :options="['VIRTUAL', 'WAREHOUSE']" class="w-full" />
                                </div>

                                <!-- Virtual Mode UI -->
                                <div v-if="nestingOptions.materialMode === 'VIRTUAL'" class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-dashed">
                                    <div class="flex flex-col gap-2">
                                        <label class="text-[10px] font-black uppercase opacity-60">Width (mm)</label>
                                        <InputNumber v-model="nestingOptions.virtualWidth" :min="100" fluid />
                                    </div>
                                    <div class="flex flex-col gap-2">
                                        <label class="text-[10px] font-black uppercase opacity-60">Length (mm)</label>
                                        <InputNumber v-model="nestingOptions.virtualLength" :min="100" fluid />
                                    </div>
                                    <div class="flex flex-col gap-2">
                                        <label class="text-[10px] font-black uppercase opacity-60">Quantity</label>
                                        <InputNumber v-model="nestingOptions.virtualQuantity" :min="1" fluid />
                                    </div>
                                </div>

                                <!-- Warehouse Mode UI -->
                                <div v-else class="flex flex-col gap-6 pt-4 border-t border-dashed">
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div class="flex flex-col gap-2">
                                            <label class="text-[10px] font-black uppercase opacity-60">Select Warehouse</label>
                                            <Select v-model="nestingOptions.warehouseId" :options="warehouses" optionLabel="name" optionValue="_id" class="w-full" @change="loadWarehouseInventory" />
                                        </div>
                                        <div class="flex flex-col gap-2">
                                            <label class="text-[10px] font-black uppercase opacity-60">Custom Sheet Upload</label>
                                            <FileUpload mode="basic" name="file" url="/api/files/upload" accept=".dxf" :auto="true" @upload="onCustomSheetUpload" :chooseLabel="'Upload DXF'" class="p-button-outlined p-button-sm" />
                                        </div>
                                    </div>

                                    <div v-if="nestingOptions.warehouseId" class="flex flex-col gap-2">
                                        <label class="text-[10px] font-black uppercase opacity-60">Inventory Pool Selection</label>
                                        <MultiSelect 
                                            v-model="nestingOptions.inventoryItems" 
                                            :options="availableInventory" 
                                            optionLabel="label" 
                                            optionValue="uniqueId"
                                            display="chip"
                                            placeholder="Select Piles, Sheets, or Remnants..."
                                            class="w-full"
                                            filter
                                        >
                                            <template #option="slotProps">
                                                <div class="flex items-center gap-2">
                                                    <Tag :value="slotProps.option.type" :severity="getInventoryTagSeverity(slotProps.option.type)" class="text-[8px]" />
                                                    <span class="text-xs font-bold">{{ slotProps.option.label }}</span>
                                                    <small class="opacity-50 font-mono">{{ slotProps.option.specs }}</small>
                                                </div>
                                            </template>
                                        </MultiSelect>
                                    </div>
                                </div>
                            </div>

                            <!-- Run Action -->
                            <div class="flex flex-col gap-4">
                                <Button 
                                    :label="'Calculate Nesting Layout'" icon="pi pi-play" severity="success"
                                    @click="runNesting" :loading="nestingInProgress"
                                    :disabled="!isNestingReady"
                                    class="w-full py-4 font-black uppercase text-sm rounded-xl shadow-lg"
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <div v-else class="py-8 text-center opacity-60">
                    <i class="pi pi-lock text-4xl mb-3"></i>
                    <p class="font-bold uppercase tracking-widest text-xs">Queue is {{ queueState }}. Settings are locked.</p>
                </div>
            </AccordionTab>

            <!-- Cassettes DataView Panel -->
            <AccordionTab :header="$t('queues.cassettes')">
                <!-- ... existing cassettes logic ... -->
                <div class="flex flex-col gap-6">
                    <div class="flex justify-between items-center">
                        <div class="flex gap-2">
                            <Button icon="pi pi-th-large" :severity="viewMode === 'grid' ? 'primary' : 'secondary'" @click="viewMode = 'grid'" text />
                            <Button icon="pi pi-table" :severity="viewMode === 'table' ? 'primary' : 'secondary'" @click="viewMode = 'table'" text />
                        </div>
                    </div>

                    <div v-if="viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                        <div v-for="entry in entries" :key="entry._id" class="bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-xl p-3 flex gap-3 shadow-sm hover:border-[var(--p-primary-color)] transition-all group relative h-40">
                            <Button icon="pi pi-trash" severity="danger" text rounded size="small" class="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-lg border z-10" @click="confirmDelete(entry)" :disabled="queueState !== 'DRAFT'" />
                            <div class="w-24 h-full bg-zinc-50 dark:bg-zinc-900 rounded-lg flex items-center justify-center border shrink-0 overflow-hidden">
                                <CassetteThumbnail :data="getCassetteData(entry.cassetteTemplateId)" />
                            </div>
                            <div class="flex flex-col justify-between py-1 min-w-0 flex-1">
                                <div class="flex flex-col">
                                    <span class="font-black text-[10px] truncate uppercase tracking-tight">{{ getCassetteName(entry.cassetteTemplateId) }}</span>
                                    <div class="flex items-center gap-2 mt-1">
                                        <span class="text-[8px] font-bold opacity-40 uppercase">Qty</span>
                                        <InputNumber v-model="entry.quantity" :min="1" :disabled="queueState !== 'DRAFT'" fluid class="p-inputtext-sm" inputClass="py-0.5 px-2 font-black text-[10px] w-12" @update:model-value="saveQueue" />
                                    </div>
                                </div>
                                <div class="flex flex-col gap-1 border-t border-dashed pt-2 mt-2 max-h-20 overflow-y-auto">
                                    <div v-for="param in getEntryParameters(entry)" :key="param" class="flex items-center justify-between gap-2">
                                        <span class="text-[8px] font-black uppercase opacity-40 truncate">{{ param }}</span>
                                        <InputNumber v-model="entry.dimensions[param]" :disabled="queueState !== 'DRAFT'" fluid class="p-inputtext-sm" inputClass="py-0 px-1.5 font-bold text-[9px] w-16 text-right" :minFractionDigits="1" @update:model-value="saveQueue" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DataTable v-else :value="entries" dataKey="_id" :editMode="queueState === 'DRAFT' ? 'cell' : null" @cell-edit-complete="onRowEditSave" class="p-datatable-sm rounded-xl border">
                        <Column field="cassetteTemplateId" :header="$t('queues.cassette')">
                            <template #body="{ data }"><span class="font-bold">{{ getCassetteName(data.cassetteTemplateId) }}</span></template>
                        </Column>
                        <Column field="quantity" :header="$t('queues.quantity')">
                            <template #editor="{ data }"><InputNumber v-model="data.quantity" :min="1" fluid /></template>
                        </Column>
                        <Column v-for="param in allParameters" :key="param" :header="param" :field="`dimensions.${param}`">
                            <template #editor="{ data }"><InputNumber v-model="data.dimensions[param]" fluid /></template>
                        </Column>
                        <Column v-if="queueState === 'DRAFT'" style="width: 3rem">
                            <template #body="{ data }"><Button icon="pi pi-trash" severity="danger" text @click="confirmDelete(data)" /></template>
                        </Column>
                    </DataTable>

                    <div class="flex gap-3 mt-4" v-if="queueState === 'DRAFT'">
                        <Button :label="$t('queues.addFromTemplate')" icon="pi pi-plus" size="small" @click="showAddDialog = true" />
                        <Button :label="$t('queues.uploadCassette')" icon="pi pi-upload" severity="secondary" size="small" @click="showUploadDialog = true" />
                    </div>
                </div>
            </AccordionTab>

            <!-- Physical Instances Tracking -->
            <AccordionTab v-if="queueState === 'CUT'" :header="$t('project.cassettes') + ' Instances'">
                <div class="flex flex-col gap-4 py-2">
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div v-for="instance in instances" :key="instance._id" class="p-4 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-xl flex items-center justify-between group">
                            <div class="flex flex-col gap-1">
                                <span class="text-[10px] font-black uppercase opacity-50">{{ instance.instanceNumber || instance.identity?.serial }}</span>
                                <span class="font-bold text-sm">{{ getCassetteName(instance.lineage?.templateId) }}</span>
                            </div>
                            <Select v-model="instance.status.state" :options="instanceStatuses" optionLabel="label" optionValue="value" class="w-36" size="small" @change="(e) => updateInstanceStatus(instance, e.value)">
                                <template #value="slotProps"><Tag :value="slotProps.value" :severity="getInstanceStatusSeverity(slotProps.value)" class="text-[9px]" /></template>
                            </Select>
                        </div>
                    </div>
                </div>
            </AccordionTab>
        </Accordion>

        <!-- Add Entry Dialog -->
        <Dialog v-model:visible="showAddDialog" :header="$t('queues.addEntry')" modal :style="{ width: '400px' }">
            <div class="flex flex-col gap-4 py-4">
                <div class="flex flex-col gap-2">
                    <label class="text-xs font-bold uppercase opacity-60">{{ $t('queues.cassette') }}</label>
                    <Select v-model="newEntry.cassetteTemplateId" :options="cassettes" optionLabel="name" optionValue="_id" class="w-full" @change="onNewCassetteChange" />
                </div>
                <div class="flex flex-col gap-2">
                    <label class="text-xs font-bold uppercase opacity-60">{{ $t('queues.quantity') }}</label>
                    <InputNumber v-model="newEntry.quantity" :min="1" fluid />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showAddDialog = false" />
                <Button :label="$t('common.add')" @click="addEntry" :disabled="!newEntry.cassetteTemplateId" />
            </template>
        </Dialog>

        <Dialog v-model:visible="showUploadDialog" :header="$t('queues.uploadNewCassette')" modal :style="{ width: '600px' }">
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
import { useQueuesStore } from '~/stores/queues';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import MultiSelect from 'primevue/multiselect';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import FileUpload from 'primevue/fileupload';
import ConfirmDialog from 'primevue/confirmdialog';
import Accordion from 'primevue/accordion';
import AccordionTab from 'primevue/accordiontab';
import CassetteEditorDialog from './CassetteEditorDialog.vue';
import CassetteThumbnail from './CassetteThumbnail.vue';
import EntityStatus from '~/components/entities/shared/EntityStatus.vue';
import HistoryTimeline from '~/components/shared/status/HistoryTimeline.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import LineageBreadcrumbs from '~/components/entities/shared/LineageBreadcrumbs.vue';
import { useIdentity, useStatus } from '~/composables/useBlocks';

const props = defineProps({
    queue: { type: Object, required: true },
    projectSlug: { type: String, required: true }
});

const emit = defineEmits(['updated']);
const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();

const { state: queueState } = useStatus(props.queue);
const { name: queueName } = useIdentity(props.queue);

const queuesStore = useQueuesStore();
const cassettesStore = useCassettesStore();
const artifactsStore = useArtifactsStore();
const toolProfilesStore = useToolProfilesStore();
const entityStore = useEntityStore();

const entries = ref([]);
const editingRows = ref([]);
const { artifacts } = storeToRefs(artifactsStore);
const nestingInProgress = ref(false);
const showAddDialog = ref(false);
const showUploadDialog = ref(false);
const showHistory = ref(false);
const cassettes = ref([]);
const warehouses = ref([]);
const availableInventory = ref([]);
const { tools } = storeToRefs(toolProfilesStore);
const viewMode = ref('grid');
const selectedRunId = ref(null);
const instances = ref([]);

const nestingOptions = ref({
    materialMode: props.queue.nestingParams?.materialMode || 'VIRTUAL',
    virtualWidth: props.queue.nestingParams?.virtualWidth || 3000,
    virtualLength: props.queue.nestingParams?.virtualLength || 1500,
    virtualQuantity: props.queue.nestingParams?.virtualQuantity || 10,
    warehouseId: props.queue.nestingParams?.warehouseId || null,
    inventoryItems: props.queue.nestingParams?.inventoryItems || [],
    toolId: props.queue.nestingParams?.toolId || null,
    requestedArtifacts: props.queue.requestedArtifacts || ['LAYOUT_DXF']
});

const isNestingReady = computed(() => {
    if (entries.value.length === 0) return false;
    if (!nestingOptions.value.toolId) return false;
    if (nestingOptions.value.materialMode === 'WAREHOUSE' && nestingOptions.value.inventoryItems.length === 0) return false;
    return true;
});

const queueAncestry = computed(() => entityStore.getAncestry('queue', props.queue));

const instanceStatuses = [{ label: 'Produced', value: 'PRODUCED' }, { label: 'Milled', value: 'MILLED' }, { label: 'Installed', value: 'INSTALLED' }];
const getInstanceStatusSeverity = (s) => ({ 'PRODUCED': 'info', 'MILLED': 'warn', 'INSTALLED': 'success' }[s] || 'secondary');

const updateInstanceStatus = async (instance, state) => {
    try {
        await $fetch(`/api/cassette-instances/${instance._id}`, { method: 'PUT', body: { status: state } });
        toast.add({ severity: 'success', summary: 'Updated', life: 2000 });
    } catch (e) { toast.add({ severity: 'error', summary: 'Failed', life: 3000 }); }
};

const loadWarehouseInventory = async () => {
    if (!nestingOptions.value.warehouseId) return;
    try {
        const whId = nestingOptions.value.warehouseId;
        const [piles, sheets, remnants] = await Promise.all([
            $fetch(`/api/material-piles?lineage.warehouseId=${whId}`),
            $fetch(`/api/sheets?lineage.warehouseId=${whId}`),
            $fetch(`/api/remnants?lineage.warehouseId=${whId}`)
        ]);
        
        availableInventory.value = [
            ...piles.map(p => ({ type: 'PILE', uniqueId: `pile_${p._id}`, label: p.identity.name, specs: `${p.specs.width}x${p.specs.length}`, id: p._id })),
            ...sheets.map(s => ({ type: 'SHEET', uniqueId: `sheet_${s._id}`, label: s.identity.serial, specs: `${s.specs.width}x${s.specs.length}`, id: s._id })),
            ...remnants.map(r => ({ type: 'REMNANT', uniqueId: `remnant_${r._id}`, label: r.identity.serial, specs: `${r.specs.area}m²`, id: r._id }))
        ];
    } catch (e) { console.error(e); }
};

const getInventoryTagSeverity = (t) => ({ 'PILE': 'primary', 'SHEET': 'info', 'REMNANT': 'warn' }[t] || 'secondary');

const onCustomSheetUpload = (event) => {
    const response = JSON.parse(event.xhr.response);
    availableInventory.value.push({ type: 'CUSTOM', uniqueId: `file_${response.fileId}`, label: response.name, specs: 'DXF Poly', id: response.fileId });
    nestingOptions.value.inventoryItems.push(`file_${response.fileId}`);
};

const loadQueueData = async () => {
    try {
        const data = await queuesStore.getQueue(props.queue._id);
        if (data) {
            entries.value = data.job?.items || [];
            if (queueState.value === 'CUT') loadInstances();
        }
    } catch (e) { console.error('Failed to load queue data:', e); }
};

onMounted(async () => {
    const [cassetteResult, projectRes, whRes] = await Promise.all([
        cassettesStore.fetchCassettes(),
        $fetch(`/api/project/${props.projectSlug}`),
        $fetch('/api/warehouses')
    ]);
    cassettes.value = cassetteResult || [];
    warehouses.value = whRes || [];
    if (nestingOptions.value.warehouseId) loadWarehouseInventory();
    await toolProfilesStore.fetchTools();
    loadQueueData();
});

const getRunArtifacts = (runId) => artifacts.value?.filter(a => a.lineage?.runId === runId) || [];
const mapArtifactType = (t) => ({ 'LAYOUT_DXF': 'DXF', 'PDF_PASSPORT': 'PDF' }[t] || 'FILE');
const formatDate = (d) => new Date(d).toLocaleString();

const onNewCassetteChange = () => {
    const c = cassettes.value.find(c => c._id === newEntry.value.cassetteTemplateId);
    if (c?.definition?.parameters) {
        newEntry.value.dimensions = {};
        c.definition.parameters.forEach(p => newEntry.value.dimensions[p] = 0);
    }
};

const addEntry = async () => {
    entries.value.push({ ...newEntry.value, _id: `temp_${Date.now()}`, type: 'PARAMETRIC', id: newEntry.value.cassetteTemplateId });
    await saveQueue();
    newEntry.value = { cassetteTemplateId: null, quantity: 1, dimensions: {} };
    showAddDialog.value = false;
};

const saveQueue = async () => {
    try { 
        await $fetch(`/api/queue/${props.queue._id}`, { 
            method: 'PUT', 
            body: { 
                job: { items: entries.value.map(e => ({ type: e.type, id: e.id, quantity: e.quantity, parameters: e.dimensions })) },
                nestingParams: nestingOptions.value
            } 
        }); 
        emit('updated'); 
    } catch (e) { console.error(e); }
};

const runNesting = async () => {
    nestingInProgress.value = true;
    try {
        await saveQueue();
        await queuesStore.startNesting(props.queue._id, nestingOptions.value);
        toast.add({ severity: 'info', summary: 'Nesting calculation started', life: 3000 });
    } catch (e) { toast.add({ severity: 'error', summary: 'Failed', detail: e.message, life: 3000 }); }
    finally { nestingInProgress.value = false; }
};

const markCutHandler = async () => {
    confirm.require({
        message: 'This will update physical stock and create cassette instances. Continue?',
        header: 'Mark as CUT',
        icon: 'pi pi-scissors',
        accept: async () => {
            try { await queuesStore.markCut(props.queue._id); emit('updated'); }
            catch (e) { toast.add({ severity: 'error', summary: 'Error', detail: e.message }); }
        }
    });
};

const resetToDraft = async () => {
    confirm.require({
        message: t('queues.confirmResetMessage'),
        header: t('queues.confirmResetTitle'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            try { await queuesStore.resetStatus(props.queue._id); emit('updated'); }
            catch (e) { console.error(e); }
        }
    });
};

const chooseRunHandler = async (id) => {
    try { await queuesStore.chooseRun(props.queue._id, id); emit('updated'); }
    catch (e) { console.error(e); }
};

const deleteRunHandler = async (id) => {
    if (confirm('Delete this nesting run?')) {
        try { await queuesStore.deleteRun(props.queue._id, id); emit('updated'); }
        catch (e) { console.error(e); }
    }
};

const onArtifactClick = (a) => {
    selectedRunId.value = a.lineage.runId;
    nextTick(() => { if (artifactsTableRef.value) artifactsTableRef.value.previewArtifact(a); });
};

const getCassetteData = (id) => cassettes.value.find(c => c._id === id);
const getEntryParameters = (e) => getCassetteData(e.cassetteTemplateId)?.definition?.parameters || [];
const onRowEditSave = async () => await saveQueue();
const onCassetteUploaded = async () => {
    showUploadDialog.value = false;
    const res = await cassettesStore.fetchCassettes();
    cassettes.value = res || [];
};
</script>

<style scoped lang="scss">
:deep(.p-accordion-tab) { margin-bottom: 1rem; }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: var(--p-content-border-color); border-radius: 10px; }
</style>
