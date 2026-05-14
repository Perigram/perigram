<template>
    <div class="flex flex-col gap-6">
        <!-- Queue Header: Compact & Standard -->
        <Panel>
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex flex-col gap-1 flex-1 min-w-0">
                    <div class="flex flex-wrap items-start gap-3 min-w-0">
                        <Select
                            v-if="queues?.length > 0"
                            :modelValue="queue._id"
                            :options="queues"
                            option-label="name"
                            option-value="_id"
                            class="border-none bg-transparent p-0 shadow-none"
                            @update:modelValue="$emit('select-queue', $event)"
                        >
                            <template #value="slotProps">
                                <h2 class="m-0 truncate">{{ queueName }}</h2>
                            </template>
                        </Select>
                        <h2 v-else class="m-0">{{ queueName }}</h2>
                        <div class="min-w-0">
                            <EntityStatus :entity="queue" entity-type="queue" variant="inline" :actions="queueStatusActions" />
                        </div>
                    </div>
                    <TraceChain :entity="queue" />
                </div>
            </div>
        </Panel>

        <Accordion :multiple="true" :value="['0', '1', '2']" class="flex flex-col gap-4">
            <!-- Runs Panel -->
            <AccordionPanel v-if="queueRuns.length > 0" value="0">
                <AccordionHeader>{{ $t('queue.runs') }} ({{ queueRuns.length }})</AccordionHeader>
                <AccordionContent>
                    <div class="grid-hub">
                        <NestingRunCard 
                            v-for="run in queueRuns" 
                            :key="run._id"
                            :run="run"
                            :active="run._id.toString() === selectedRunId"
                            :is-chosen="run.status?.state === 'CHOSEN'"
                            :artifacts="getRunArtifacts(run._id)"
                            @select="selectedRunId = $event.toString()"
                            @choose="chooseRunHandler"
                            @delete="deleteRunHandler"
                            @artifact-click="onArtifactClick"
                            @convert-to-physical="handleConvertToPhysical"
                            @create-requisition="handleCreateRequisition"
                        />
                    </div>
                </AccordionContent>
            </AccordionPanel>

            <!-- Sheets & Nesting Settings -->
            <AccordionPanel value="1">
                <AccordionHeader>{{ $t('projectData.sheets') }}</AccordionHeader>
                <AccordionContent>
                    <div class="flex flex-col gap-6" v-if="queueState === 'DRAFT'">
                        <Panel>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div class="flex flex-col gap-4">
                                    <div class="flex flex-col gap-1">
                                        <label>{{ $t('nesting.materialSourcing') }}</label>
                                        <SelectButton v-model="nestingOptions.materialMode" :options="['VIRTUAL', 'WAREHOUSE']" size="small" />
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <label>{{ $t('nesting.productionTool') }}</label>
                                        <Select v-model="nestingOptions.toolId" :options="tools" optionLabel="name" optionValue="_id" :placeholder="$t('nesting.selectTool')" class="w-full" />
                                    </div>
                                </div>

                                <div class="flex flex-col gap-4">
                                    <!-- Virtual Mode -->
                                    <div v-if="nestingOptions.materialMode === 'VIRTUAL'" class="grid grid-cols-2 gap-4">
                                        <div class="flex flex-col gap-1">
                                            <label>{{ $t('nesting.width') }}</label>
                                            <InputNumber v-model="nestingOptions.virtualWidth" :min="100" />
                                        </div>
                                        <div class="flex flex-col gap-1">
                                            <label>{{ $t('nesting.length') }}</label>
                                            <InputNumber v-model="nestingOptions.virtualLength" :min="100" />
                                        </div>
                                    </div>

                                    <!-- Warehouse Mode -->
                                    <div v-else class="flex flex-col gap-4">
                                        <div class="grid grid-cols-2 gap-4">
                                            <div class="flex flex-col gap-1">
                                                <label>{{ $t('nesting.selectWarehouse') }}</label>
                                                <Select v-model="nestingOptions.warehouseId" :options="warehouses" optionLabel="name" optionValue="_id" @change="loadWarehouseInventory" />
                                            </div>
                                            <div class="flex flex-col gap-1">
                                                <label>{{ $t('nesting.customUpload') }}</label>
                                                <FileUpload mode="basic" name="file" url="/api/files/upload" accept=".dxf" :auto="true" @upload="onCustomSheetUpload" :chooseLabel="$t('common.upload')" />
                                            </div>
                                        </div>

                                        <div v-if="nestingOptions.warehouseId" class="flex flex-col gap-1">
                                            <label>{{ $t('nesting.inventorySources') }}</label>
                                            <MultiSelect 
                                                v-model="nestingOptions.inventoryItems" 
                                                :options="availableInventory" 
                                                optionLabel="label" 
                                                optionValue="uniqueId"
                                                display="chip"
                                                :placeholder="$t('nesting.selectInventory')"
                                                class="w-full"
                                                filter
                                            >
                                                <template #option="slotProps">
                                                    <div class="flex items-center gap-2">
                                                        <Tag :value="slotProps.option.type" />
                                                        <span>{{ slotProps.option.label }}</span>
                                                        <small>{{ slotProps.option.specs }}</small>
                                                    </div>
                                                </template>
                                            </MultiSelect>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Panel>

                        <!-- Run Action -->
                        <div class="flex flex-col gap-4">
                            <Message v-if="warehouseShortage" severity="error">
                                <div>
                                    <p>{{ $t('nesting.shortageTitle') }}</p>
                                    <small>{{ $t('nesting.shortageNote', { needed: warehouseShortage.needed, available: warehouseShortage.available, missing: warehouseShortage.missing }) }}</small>
                                </div>
                            </Message>
                            <Button 
                                :label="$t('nesting.calculateLayout')" icon="pi pi-play" severity="success"
                                @click="runNesting" :loading="nestingInProgress"
                                :disabled="!isNestingReady"
                                class="w-full"
                            />
                        </div>
                    </div>
                    <div v-else class="py-12 flex flex-col items-center gap-2">
                        <div class="w-12 h-12 border rounded-full flex items-center justify-center">
                            <i class="pi pi-lock"></i>
                        </div>
                        <p>{{ $t('nesting.lockedNote', { status: queueState }) }}</p>
                    </div>
                </AccordionContent>
            </AccordionPanel>

            <!-- Cassettes Panel -->
            <AccordionPanel value="2">
                <AccordionHeader>{{ $t('queues.cassettes') }}</AccordionHeader>
                <AccordionContent>
                    <div class="flex flex-col gap-6">
                        <div class="flex justify-end items-center">
                            <div class="flex gap-2">
                                <Button icon="pi pi-th-large" @click="viewMode = 'grid'" text />
                                <Button icon="pi pi-table" @click="viewMode = 'table'" text />
                            </div>
                        </div>

                        <div v-if="viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                            <template v-for="entry in entries" :key="entry?._id || Math.random()">
                                <Panel v-if="entry" class="card-interactive h-full">
                                    <template #header>
                                        <div class="flex justify-between items-center gap-2">
                                            <span class="truncate">{{ getCassetteName(entry.cassetteTemplateId) }}</span>
                                            <div class="flex items-center gap-1">
                                                <InputNumber 
                                                    v-model="entry.quantity" :min="1" :disabled="queueState !== 'DRAFT'"
                                                    size="small" class="w-16"
                                                    @update:model-value="saveQueue"
                                                />
                                                <small>{{ $t('common.units') }}</small>
                                                <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="confirmDelete(entry)" :disabled="queueState !== 'DRAFT'" />
                                            </div>
                                        </div>
                                    </template>
                                    <CassetteThumbnail 
                                        :cassette-id="entry.cassetteTemplateId" 
                                        :cassette="getCassetteData(entry.cassetteTemplateId)"
                                        :dimensions="entry.dimensions"
                                    />
                                    <Divider />
                                    <!-- Parameters -->
                                    <div v-if="isParametricEntry(entry)" class="grid grid-cols-2 gap-4">
                                        <div v-for="param in getEntryParameters(entry)" :key="param" class="flex flex-col">
                                            <small>{{ param }}</small>
                                            <InputNumber 
                                                v-model="entry.dimensions[param]" :disabled="queueState !== 'DRAFT'"
                                                size="small" :min="0"
                                                @update:model-value="saveQueue"
                                            />
                                        </div>
                                    </div>
                                    <div v-else class="flex justify-center italic opacity-20">
                                        <span>{{ $t('queue.static') }}</span>
                                    </div>
                                </Panel>
                            </template>
                        </div>

                        <DataTable v-else :value="entries" dataKey="_id" :editMode="queueState === 'DRAFT' ? 'cell' : null" @cell-edit-complete="onRowEditSave">
                            <Column field="cassetteTemplateId" :header="$t('queues.cassette')">
                                <template #body="{ data }"><span>{{ getCassetteName(data.cassetteTemplateId) }}</span></template>
                            </Column>
                            <Column field="quantity" :header="$t('queues.quantity')">
                                <template #editor="{ data }"><InputNumber v-model="data.quantity" :min="1" fluid size="small" /></template>
                            </Column>
                            <Column v-for="param in allParameters" :key="param" :header="param" :field="`dimensions.${param}`">
                                <template #body="{ data }">
                                    <span v-if="isParametricEntry(data)">{{ data.dimensions?.[param] || '-' }}</span>
                                    <span v-else class="opacity-20">-</span>
                                </template>
                                <template #editor="{ data }">
                                    <InputNumber v-if="isParametricEntry(data)" v-model="data.dimensions[param]" fluid size="small" />
                                </template>
                            </Column>
                            <Column v-if="queueState === 'DRAFT'" style="width: var(--ck-table-action-column-width)">
                                <template #body="{ data }"><Button icon="pi pi-trash" severity="danger" text @click="confirmDelete(data)" size="small" /></template>
                            </Column>
                        </DataTable>

                        <div class="flex gap-3" v-if="queueState === 'DRAFT'">
                            <Button :label="$t('queues.addFromTemplate')" icon="pi pi-plus" text @click="showAddDialog = true" />
                            <FileUpload 
                                mode="basic" 
                                name="file" 
                                accept=".dxf" 
                                :auto="true" 
                                :customUpload="true" 
                                @select="onInstantUploadSelect"
                                :chooseLabel="$t('queues.uploadCassette')"
                                text
                            />
                        </div>
                    </div>
                </AccordionContent>
            </AccordionPanel>

            <!-- Tracking -->
            <AccordionPanel v-if="queueState === 'CUT'" value="3">
                <AccordionHeader>{{ $t('project.cassettes') }} Instances</AccordionHeader>
                <AccordionContent>
                    <div class="grid-hub">
                        <CassetteInstanceCard 
                            v-for="instance in instances" 
                            :key="instance._id" 
                            :instance="instance"
                            variant="compact"
                        />
                    </div>
                </AccordionContent>
            </AccordionPanel>
        </Accordion>


        <!-- Add Entry Dialog -->
        <StandardDialog v-model:visible="showAddDialog" :header="$t('queues.addEntry')">
            <div class="flex flex-col gap-4 py-4">
                <div class="flex flex-col gap-2">
                    <label>{{ $t('queues.cassette') }}</label>
                    <Select v-model="newEntry.cassetteTemplateId" :options="allAvailableCassettes" optionLabel="name" optionValue="_id" class="w-full" @change="onNewCassetteChange" />
                </div>
                <div class="flex flex-col gap-2">
                    <label>{{ $t('queues.quantity') }}</label>
                    <InputNumber v-model="newEntry.quantity" :min="1" fluid />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showAddDialog = false" />
                <Button :label="$t('common.add')" @click="() => addEntry()" :disabled="!newEntry.cassetteTemplateId" />
            </template>
        </StandardDialog>

        <CassetteEditorDialog v-model:modelValue="showUploadDialog" @saved="onCassetteUploaded" ref="uploadDialogRef" />

        <ArtifactsTable ref="artifactsTableRef" :batch-id="queue._id" class="hidden" />

        <ConfirmDialog />
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '~/stores/auth';
import { useCassettesStore } from '~/stores/cassettes';
import { useToolProfilesStore } from '~/stores/toolProfiles';
import { useArtifactsStore } from '~/stores/artifacts';
import { useQueuesStore } from '~/stores/queues';
import { storeToRefs } from 'pinia';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import MultiSelect from 'primevue/multiselect';
import Message from 'primevue/message';
import Divider from 'primevue/divider';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Checkbox from 'primevue/checkbox';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import FileUpload from 'primevue/fileupload';
import ConfirmDialog from 'primevue/confirmdialog';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import CassetteEditorDialog from './CassetteEditorDialog.vue';
import CassetteThumbnail from './CassetteThumbnail.vue';
import ArtifactsTable from './ArtifactsTable.vue';
import NestingRunCard from '~/components/entities/NestingRun/NestingRunCard.vue';
import CassetteInstanceCard from '~/components/entities/CassetteInstance/CassetteInstanceCard.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';

const props = defineProps({
    queue: { type: Object, required: true },
    queues: { type: Array, default: () => [] },
    projectSlug: { type: String, required: true }
});

const emit = defineEmits(['updated', 'select-queue']);
const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const authStore = useAuthStore();

const queueState = computed(() => props.queue.status?.state || props.queue.state || 'UNKNOWN');
const queueName = computed(() => props.queue.identity?.name || props.queue.name || props.queue.identity?.slug || props.queue.slug || 'Unnamed');

const queuesStore = useQueuesStore();
const cassettesStore = useCassettesStore();
const artifactsStore = useArtifactsStore();
const toolProfilesStore = useToolProfilesStore();

const entries = ref([]);
const { artifacts } = storeToRefs(artifactsStore);
const { runs, nestingCompleted } = storeToRefs(queuesStore);

watch(nestingCompleted, (queueId) => {
    if (queueId && queueId === props.queue._id) {
        artifactsStore.fetchArtifacts(props.queue._id);
    }
});
const nestingInProgress = ref(false);
const showAddDialog = ref(false);
const showUploadDialog = ref(false);
const uploadDialogRef = ref(null);
const cassettes = ref([]);
const cassetteDesigns = ref([]);
const warehouses = ref([]);
const availableInventory = ref([]);
const { tools } = storeToRefs(toolProfilesStore);
const viewMode = ref('grid');
const selectedRunId = ref(null);
const instances = ref([]);
const artifactsTableRef = ref(null);

const newEntry = ref({
    cassetteTemplateId: null,
    quantity: 1,
    dimensions: {}
});

const getCassetteData = (id) => {
    const idStr = id?.toString();
    if (!idStr) return null;
    return cassettes.value.find(c => c._id?.toString() === idStr) || 
           cassetteDesigns.value.find(d => d._id?.toString() === idStr);
};

const getCassetteName = (id) => {
    const data = getCassetteData(id);
    if (!data) return 'Unknown';
    return data.identity?.name || data.name || data.identity?.slug || data.slug || 'Unnamed';
};

const getCassetteType = (data) => data?.type || data?.data?.type || data?.definition?.type || '';
const getCassetteParameters = (data) => data?.parameters || data?.data?.parameters || data?.definition?.parameters || [];
const getEntryCassetteData = (entry) => getCassetteData(entry?.cassetteTemplateId || entry?.id);
const isParametricEntry = (entry) => {
    const data = getEntryCassetteData(entry);
    if (data) return !data.geometry && getCassetteParameters(data).length > 0;
    return entry?.type === 'PARAMETRIC';
};

const getEntryParameters = (e) => {
    const data = getEntryCassetteData(e);
    if (!data || !!data.geometry) return []; 
    if (getCassetteType(data) === 'PARAMETRIC') return getCassetteParameters(data);
    return [];
};

const allAvailableCassettes = computed(() => {
    const items = [...cassettes.value, ...cassetteDesigns.value];
    return items.map(item => ({
        ...item,
        name: item.identity?.name || item.name || item.identity?.slug || item.slug || 'Unnamed'
    }));
});

const allParameters = computed(() => {
    const params = new Set();
    entries.value.forEach(e => {
        const data = getEntryCassetteData(e);
        if (data) {
            getCassetteParameters(data).forEach(p => params.add(p));
        }
    });
    return Array.from(params);
});

const nestingOptions = ref({    materialMode: props.queue.nestingParams?.materialMode || 'VIRTUAL',
    virtualWidth: props.queue.nestingParams?.virtualWidth || 3000,
    virtualLength: props.queue.nestingParams?.virtualLength || 1500,
    warehouseId: props.queue.nestingParams?.warehouseId || null,
    inventoryItems: props.queue.nestingParams?.inventoryItems || [],
    toolId: props.queue.nestingParams?.toolId || null,
    requestedArtifacts: props.queue.requestedArtifacts || ['LAYOUT_DXF']
});

const queueRuns = computed(() => runs.value[props.queue._id] || []);
const hasChosenRun = computed(() => queueRuns.value.some(r => r.status?.state === 'CHOSEN'));
const queueStatusActions = computed(() => {
    if (!authStore.can('queues', 'edit')) return [];

    const actions = [];
    if (queueState.value === 'READY' && hasChosenRun.value) {
        actions.push({
            label: t('queue.markCut'),
            icon: 'pi pi-scissors',
            severity: 'success',
            command: () => markCutHandler()
        });
    }
    if (queueState.value !== 'DRAFT') {
        actions.push({
            label: t('queue.resetToDraft'),
            icon: 'pi pi-refresh',
            severity: 'warning',
            command: () => resetToDraft()
        });
    }
    return actions;
});

const warehouseShortage = computed(() => {
    if (nestingOptions.value.materialMode !== 'WAREHOUSE') return null;
    if (queueRuns.value.length === 0) return null;
    
    const latestRun = queueRuns.value[queueRuns.value.length - 1];
    if (latestRun.status?.state !== 'COMPLETE' && latestRun.status?.state !== 'CHOSEN') return null;
    
    // Calculate total available sheets in selected inventory
    let totalAvailable = 0;
    nestingOptions.value.inventoryItems.forEach(uniqueId => {
        const [type, id] = uniqueId.split('_');
        const item = availableInventory.value.find(i => i.uniqueId === uniqueId);
        if (item) {
            if (type === 'pile') {
                const pile = warehouses.value.flatMap(w => w.piles || []).find(p => p._id.toString() === id);
                if (pile) totalAvailable += (pile.stock?.total || 0) - (pile.stock?.used || 0);
            } else if (type === 'sheet') {
                totalAvailable += 1;
            }
        }
    });
    
    if (latestRun.layoutCount > totalAvailable) {
        return {
            needed: latestRun.layoutCount,
            available: totalAvailable,
            missing: latestRun.layoutCount - totalAvailable
        };
    }
    
    return null;
});

const isNestingReady = computed(() => {
    if (entries.value.length === 0) return false;
    
    if (nestingOptions.value.materialMode === 'WAREHOUSE') {
        if (nestingOptions.value.inventoryItems.length === 0) return false;
    }
    
    return true;
});


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
            ...remnants.map(r => ({ type: 'REMNANT', uniqueId: `remnant_${r._id}`, label: r.identity?.serial || r.serial, specs: r.data?.area ? `${r.data.area}m²` : '-', id: r._id }))
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
            entries.value = (data.job?.items || []).map(item => ({
                ...item,
                cassetteTemplateId: item.cassetteTemplateId || item.id,
                dimensions: item.parameters || item.dimensions || {},
                type: item.type || 'STATIC'
            }));
            entries.value.forEach(syncEntryWithCassette);
            if (queueState.value === 'CUT') loadInstances();
        }
    } catch (e) { console.error('Failed to load queue data:', e); }
};

onMounted(async () => {
    const [cassetteResult, designResult, projectRes, whRes] = await Promise.all([
        cassettesStore.fetchCassettes(),
        $fetch('/api/cassette-designs'),
        $fetch(`/api/project/${props.projectSlug}`),
        $fetch('/api/warehouses'),
        artifactsStore.fetchArtifacts(props.queue._id)
    ]);
    cassettes.value = cassetteResult || [];
    cassetteDesigns.value = designResult || [];
    warehouses.value = whRes || [];
    if (nestingOptions.value.warehouseId) loadWarehouseInventory();
    await toolProfilesStore.fetchTools();
    await queuesStore.fetchRuns(props.queue._id);
    loadQueueData();
});

const getRunArtifacts = (runId) => {
    const idStr = runId?.toString();
    if (!idStr) return [];
    return artifacts.value?.filter(a => a.lineage?.runId?.toString() === idStr) || [];
};
const formatDate = (d) => new Date(d).toLocaleString();

const onNewCassetteChange = () => {
    const data = getCassetteData(newEntry.value.cassetteTemplateId);
    if (getCassetteParameters(data).length > 0) {
        newEntry.value.dimensions = {};
        getCassetteParameters(data).forEach(p => newEntry.value.dimensions[p] = 0);
    } else {
        newEntry.value.dimensions = {};
    }
};

const syncEntryWithCassette = (entry) => {
    const data = getEntryCassetteData(entry);
    if (!data) return entry;

    const isDesign = !!data.geometry;
    const type = (!isDesign && getCassetteParameters(data).length > 0) ? 'PARAMETRIC' : 'STATIC';
    entry.type = type;

    if (type === 'PARAMETRIC') {
        entry.dimensions = entry.dimensions || {};
        getCassetteParameters(data).forEach((param) => {
            if (entry.dimensions[param] === undefined) entry.dimensions[param] = 0;
        });
    }

    return entry;
};

const addEntry = async (item = null) => {
    const data = item || getCassetteData(newEntry.value.cassetteTemplateId);
    if (!data) return;

    const isDesign = !!data.geometry;
    const type = (!isDesign && getCassetteParameters(data).length > 0) ? 'PARAMETRIC' : 'STATIC';
    
    const entryData = item ? {
        cassetteTemplateId: data._id,
        quantity: 1,
        dimensions: {}
    } : { ...newEntry.value };

    entries.value.push(syncEntryWithCassette({ 
        ...entryData, 
        _id: `temp_${Date.now()}`, 
        type, 
        id: data._id 
    }));
    
    await saveQueue();
    newEntry.value = { cassetteTemplateId: null, quantity: 1, dimensions: {} };
    showAddDialog.value = false;
};

const saveQueue = async () => {
    try { 
        entries.value.forEach(syncEntryWithCassette);
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
        toast.add({ severity: 'info', summary: t('queues.nestingStarted'), life: 3000 });
    } catch (e) { toast.add({ severity: 'error', summary: t('queues.nestingFailed'), detail: e.message, life: 3000 }); }
    finally { nestingInProgress.value = false; }
};

const markCutHandler = async () => {
    confirm.require({
        message: t('queue.confirmMarkCut'),
        header: t('queue.markCut'),
        icon: 'pi pi-scissors',
        accept: async () => {
            try { await queuesStore.markCut(props.queue._id); emit('updated'); }
            catch (e) { toast.add({ severity: 'error', summary: t('common.error'), detail: e.message }); }
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
    confirm.require({
        message: t('queue.confirmDeleteRun'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            try { 
                await queuesStore.deleteRun(props.queue._id, id); 
                toast.add({ severity: 'success', summary: t('common.success'), detail: t('queue.runDeleted'), life: 2000 });
                emit('updated'); 
            }
            catch (e) { toast.add({ severity: 'error', summary: t('common.error'), detail: e.message }); }
        }
    });
};

const handleConvertToPhysical = async (runId) => {
    const run = queueRuns.value.find(r => r._id.toString() === runId.toString());
    if (!run) return;
    nestingOptions.value.materialMode = 'WAREHOUSE';
    nestingOptions.value.virtualWidth = run.params?.width || 3000;
    nestingOptions.value.virtualLength = run.params?.height || 1500;
    toast.add({ 
        severity: 'info', 
        summary: t('queues.switchingToWarehouse'),
        detail: t('queues.selectWarehouseHint'),
        life: 5000 
    });
};

const handleCreateRequisition = async (runId) => {
    const run = queueRuns.value.find(r => r._id.toString() === runId.toString());
    if (!run) return;
    confirm.require({
        message: `Create a requisition for ${run.layoutCount} sheets (${run.params?.width}x${run.params?.height}) based on this nesting?`,
        header: t('requisition.title'),
        icon: 'pi pi-shopping-cart',
        accept: async () => {
            try {
                navigateTo('/materials');
                toast.add({ severity: 'success', summary: t('common.success'), detail: t('queues.requisitionRedirect') });
            } catch (e) {
                toast.add({ severity: 'error', summary: t('common.error'), detail: e.message });
            }
        }
    });
};

const onArtifactClick = (a) => {
    selectedRunId.value = a.lineage.runId;
    nextTick(() => { if (artifactsTableRef.value) artifactsTableRef.value.previewArtifact(a); });
};

const confirmDelete = (entry) => {
    confirm.require({
        message: t('queue.confirmDeleteEntry'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            entries.value = entries.value.filter(e => e._id !== entry._id);
            await saveQueue();
        }
    });
};

const onRowEditSave = async () => await saveQueue();

const loadInstances = async () => {
    try {
        instances.value = await $fetch(`/api/cassette-instances?lineage.queueId=${props.queue._id}`);
    } catch (e) { console.error('Failed to load instances:', e); }
};

const onCassetteUploaded = async (newItem) => {
    showUploadDialog.value = false;
    const [cRes, dRes] = await Promise.all([
        cassettesStore.fetchCassettes(),
        $fetch('/api/cassette-designs')
    ]);
    cassettes.value = cRes || [];
    cassetteDesigns.value = dRes || [];
    if (newItem) await addEntry(newItem);
};

const onInstantUploadSelect = (event) => {
    if (event.files && event.files.length > 0) {
        showUploadDialog.value = true;
        nextTick(() => {
            if (uploadDialogRef.value) {
                uploadDialogRef.value.handleFileSelect({ files: [event.files[0]] });
            }
        });
    }
};
</script>
