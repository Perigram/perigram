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
        <Accordion :multiple="true" :value="['0', '1', '2']" class="flex flex-col gap-4">
            <!-- Runs Panel -->
            <AccordionPanel v-if="queue.runs && queue.runs.length > 0" value="0">
                <AccordionHeader>{{ $t('queue.runs') }} ({{ queue.runs.length }})</AccordionHeader>
                <AccordionContent>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        <NestingRunCard 
                            v-for="run in queue.runs" 
                            :key="run._id"
                            :run="run"
                            :active="run._id.toString() === selectedRunId"
                            :is-chosen="run._id.toString() === queue.chosenRunId?.toString()"
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
                    <div class="flex flex-col gap-8 py-2" v-if="queueState === 'DRAFT'">
                        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                            <div class="lg:col-span-12 flex flex-col gap-6">
                                <!-- Source Mode Selection -->
                                <div class="flex flex-col gap-4 p-6 bg-[var(--p-content-background)] border-2 border-[var(--p-content-border-color)] rounded-2xl">
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div class="flex flex-col gap-2">
                                            <label class="text-xs font-black uppercase tracking-widest">Material Sourcing Mode</label>
                                            <SelectButton v-model="nestingOptions.materialMode" :options="['VIRTUAL', 'WAREHOUSE']" class="w-full" />
                                        </div>
                                        <div class="flex flex-col gap-2">
                                            <label class="text-xs font-black uppercase tracking-widest">Select Production Tool</label>
                                            <Select v-model="nestingOptions.toolId" :options="tools" optionLabel="name" optionValue="_id" placeholder="Select tool..." class="w-full" />
                                        </div>
                                    </div>

                                    <!-- Virtual Mode UI -->
                                    <div v-if="nestingOptions.materialMode === 'VIRTUAL'" class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-dashed">
                                        <div class="flex flex-col gap-2">
                                            <label class="text-[10px] font-black uppercase opacity-60">Width (mm)</label>
                                            <InputNumber v-model="nestingOptions.virtualWidth" :min="100" fluid />
                                        </div>
                                        <div class="flex flex-col gap-2">
                                            <label class="text-[10px] font-black uppercase opacity-60">Length (mm)</label>
                                            <InputNumber v-model="nestingOptions.virtualLength" :min="100" fluid />
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
                                            <label class="text-[10px] font-black uppercase opacity-60">Allowed Inventory Sources (Algorithm will use as needed)</label>
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
                                    <Message v-if="warehouseShortage" severity="error" class="shadow-sm">
                                        <div class="flex flex-col gap-1">
                                            <span class="font-black uppercase text-xs">Warehouse Stock Shortage</span>
                                            <span class="text-[10px]">Algorithm calculated <b>{{ warehouseShortage.needed }}</b> sheets needed, but only <b>{{ warehouseShortage.available }}</b> are available in selected sources. Missing <b>{{ warehouseShortage.missing }}</b> units.</span>
                                        </div>
                                    </Message>
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
                </AccordionContent>
            </AccordionPanel>

            <!-- Cassettes DataView Panel -->
            <AccordionPanel value="2">
                <AccordionHeader>{{ $t('queues.cassettes') }}</AccordionHeader>
                <AccordionContent>
                    <div class="flex flex-col gap-6">
                        <div class="flex justify-between items-center">
                            <div class="flex gap-2">
                                <Button icon="pi pi-th-large" :severity="viewMode === 'grid' ? 'primary' : 'secondary'" @click="viewMode = 'grid'" text />
                                <Button icon="pi pi-table" :severity="viewMode === 'table' ? 'primary' : 'secondary'" @click="viewMode = 'table'" text />
                            </div>
                        </div>

                        <div v-if="viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                            <template v-for="entry in entries" :key="entry?._id || Math.random()">
                                <div v-if="entry" class="bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-xl p-3 flex gap-3 shadow-sm hover:border-[var(--p-primary-color)] transition-all group relative h-40 min-w-0">
                                    <Button icon="pi pi-trash" severity="danger" text rounded size="small" class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-lg border z-10" @click="confirmDelete(entry)" :disabled="queueState !== 'DRAFT'" />
                                    <Button icon="pi pi-download" text rounded size="small" class="absolute top-10 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-lg border z-10" @click="downloadEntryDxf(entry)" />
                                    
                                    <!-- Left: Thumbnail -->
                                    <div class="w-28 h-32 flex-shrink-0 bg-zinc-50 dark:bg-zinc-900 rounded-lg overflow-hidden border border-[var(--p-content-border-color)] shadow-inner my-auto">
                                        <CassetteThumbnail 
                                            :cassette-id="entry.cassetteTemplateId" 
                                            :cassette="getCassetteData(entry.cassetteTemplateId)"
                                            :dimensions="entry.dimensions"
                                        />
                                    </div>

                                    <!-- Right: Info -->
                                    <div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
                                        <!-- Header Row: Name + Quantity + Units (1 Row) -->
                                        <div class="flex items-center justify-between gap-2 mb-3 flex-shrink-0 pr-6">
                                            <h3 class="font-black text-[10px] uppercase tracking-wider m-0 truncate text-[var(--p-text-color)] flex-1 min-w-0" :title="getCassetteName(entry.cassetteTemplateId)">
                                                {{ getCassetteName(entry.cassetteTemplateId) }}
                                            </h3>
                                            <div class="flex items-center gap-1 flex-shrink-0">
                                                <InputNumber 
                                                    v-model="entry.quantity" :min="1" :disabled="queueState !== 'DRAFT'"
                                                    size="small" class="w-24 compact-input-buttons"
                                                    showButtons buttonLayout="horizontal"
                                                    :useGrouping="false"
                                                    @update:model-value="saveQueue"
                                                />
                                                <span class="text-[9px] font-black text-[var(--p-text-muted-color)] uppercase">units</span>
                                            </div>
                                        </div>

                                        <!-- Parameters List (2-column Grid) -->
                                        <div v-if="entry.type === 'PARAMETRIC'" class="grid grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto pr-1 custom-scrollbar flex-1 content-start">
                                            <div v-for="param in getEntryParameters(entry)" :key="param" class="flex items-center gap-1 py-0.5">
                                                <span class="text-[10px] font-black uppercase opacity-70 w-4 flex-shrink-0">{{ param }}</span>
                                                <InputNumber 
                                                    v-model="entry.dimensions[param]" :disabled="queueState !== 'DRAFT'"
                                                    size="small" class="flex-1 compact-input" :min="0"
                                                    :useGrouping="false"
                                                    :minFractionDigits="1"
                                                    @update:model-value="saveQueue"
                                                />
                                            </div>
                                        </div>
                                        <div v-else class="flex-1 flex items-center justify-center opacity-30">
                                            <i class="pi pi-lock text-xs mr-2"></i>
                                            <span class="text-[9px] font-black uppercase">Static Geometry</span>
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </div>

                        <DataTable v-else :value="entries" dataKey="_id" :editMode="queueState === 'DRAFT' ? 'cell' : null" @cell-edit-complete="onRowEditSave" class="p-datatable-sm rounded-xl border">
                            <Column field="cassetteTemplateId" :header="$t('queues.cassette')">
                                <template #body="{ data }"><span class="font-bold">{{ getCassetteName(data.cassetteTemplateId) }}</span></template>
                            </Column>
                            <Column field="quantity" :header="$t('queues.quantity')">
                                <template #editor="{ data }"><InputNumber v-model="data.quantity" :min="1" fluid /></template>
                            </Column>
                            <Column v-for="param in allParameters" :key="param" :header="param" :field="`dimensions.${param}`">
                                <template #body="{ data }">
                                    <span v-if="data.type === 'PARAMETRIC'">{{ data.dimensions?.[param] || '-' }}</span>
                                    <span v-else class="opacity-20">-</span>
                                </template>
                                <template #editor="{ data }">
                                    <InputNumber v-if="data.type === 'PARAMETRIC'" v-model="data.dimensions[param]" fluid />
                                </template>
                            </Column>
                            <Column v-if="queueState === 'DRAFT'" style="width: 3rem">
                                <template #body="{ data }"><Button icon="pi pi-trash" severity="danger" text @click="confirmDelete(data)" /></template>
                            </Column>
                        </DataTable>

                        <div class="flex gap-3 mt-4" v-if="queueState === 'DRAFT'">
                            <Button :label="$t('queues.addFromTemplate')" icon="pi pi-plus" size="small" @click="showAddDialog = true" />
                            <FileUpload 
                                mode="basic" 
                                name="file" 
                                accept=".dxf" 
                                :auto="true" 
                                :customUpload="true" 
                                @select="onInstantUploadSelect"
                                :chooseLabel="$t('queues.uploadCassette')"
                                class="p-button-secondary p-button-sm"
                            />
                        </div>
                    </div>
                </AccordionContent>
            </AccordionPanel>

            <!-- Physical Instances Tracking -->
            <AccordionPanel v-if="queueState === 'CUT'" value="3">
                <AccordionHeader>{{ $t('project.cassettes') + ' Instances' }}</AccordionHeader>
                <AccordionContent>
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
                </AccordionContent>
            </AccordionPanel>
        </Accordion>


        <!-- Add Entry Dialog -->
        <Dialog v-model:visible="showAddDialog" :header="$t('queues.addEntry')" modal :style="{ width: '400px' }">
            <div class="flex flex-col gap-4 py-4">
                <div class="flex flex-col gap-2">
                    <label class="text-xs font-bold uppercase opacity-60">{{ $t('queues.cassette') }}</label>
                    <Select v-model="newEntry.cassetteTemplateId" :options="allAvailableCassettes" optionLabel="name" optionValue="_id" class="w-full" @change="onNewCassetteChange" />
                </div>
                <div class="flex flex-col gap-2">
                    <label class="text-xs font-bold uppercase opacity-60">{{ $t('queues.quantity') }}</label>
                    <InputNumber v-model="newEntry.quantity" :min="1" fluid />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="showAddDialog = false" />
                <Button :label="$t('common.add')" @click="() => addEntry()" :disabled="!newEntry.cassetteTemplateId" />
            </template>
        </Dialog>

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
import { useEntityStore } from '~/stores/entities';
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
import CassetteEditorDialog from './CassetteEditorDialog.vue';
import CassetteThumbnail from './CassetteThumbnail.vue';
import ArtifactsTable from './ArtifactsTable.vue';
import NestingRunCard from '~/components/entities/NestingRun/NestingRunCard.vue';
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
const authStore = useAuthStore();

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
const uploadDialogRef = ref(null);
const showHistory = ref(false);
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
    const { name } = useIdentity(data);
    return name.value;
};

const getEntryParameters = (e) => {
    const data = getCassetteData(e.cassetteTemplateId);
    if (!data || !!data.geometry) return []; 
    if (data.definition?.type === 'PARAMETRIC') return data.definition.parameters || [];
    return [];
};

const allAvailableCassettes = computed(() => {
    const items = [...cassettes.value, ...cassetteDesigns.value];
    return items.map(item => {
        const { name } = useIdentity(item);
        return { ...item, name: name.value };
    });
});

const allParameters = computed(() => {
    const params = new Set();
    entries.value.forEach(e => {
        const data = getCassetteData(e.cassetteTemplateId);
        if (data?.definition?.parameters) {
            data.definition.parameters.forEach(p => params.add(p));
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

const warehouseShortage = computed(() => {
    if (nestingOptions.value.materialMode !== 'WAREHOUSE') return null;
    if (!props.queue.runs || props.queue.runs.length === 0) return null;
    
    const latestRun = props.queue.runs[props.queue.runs.length - 1];
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
        // Warehouse mode still requires at least one inventory source selection
        if (nestingOptions.value.inventoryItems.length === 0) return false;
    }
    
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
            entries.value = (data.job?.items || []).map(item => ({
                ...item,
                cassetteTemplateId: item.cassetteTemplateId || item.id,
                dimensions: item.parameters || item.dimensions || {},
                type: item.type || 'STATIC'
            }));
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
    loadQueueData();
});

const getRunArtifacts = (runId) => {
    const idStr = runId?.toString();
    if (!idStr) return [];
    return artifacts.value?.filter(a => a.lineage?.runId?.toString() === idStr) || [];
};
const mapArtifactType = (t) => ({ 'LAYOUT_DXF': 'DXF', 'PDF_PASSPORT': 'PDF' }[t] || 'FILE');
const formatDate = (d) => new Date(d).toLocaleString();

const onNewCassetteChange = () => {
    const data = getCassetteData(newEntry.value.cassetteTemplateId);
    if (data?.definition?.type === 'PARAMETRIC') {
        newEntry.value.dimensions = {};
        (data.definition.parameters || []).forEach(p => newEntry.value.dimensions[p] = 0);
    } else {
        newEntry.value.dimensions = {};
    }
};

const addEntry = async (item = null) => {
    const data = item || getCassetteData(newEntry.value.cassetteTemplateId);
    if (!data) return;

    const isDesign = !!data.geometry;
    const type = (!isDesign && data.definition?.type === 'PARAMETRIC') ? 'PARAMETRIC' : 'STATIC';
    
    const entryData = item ? {
        cassetteTemplateId: data._id,
        quantity: 1,
        dimensions: {}
    } : { ...newEntry.value };

    entries.value.push({ 
        ...entryData, 
        _id: `temp_${Date.now()}`, 
        type, 
        id: data._id 
    });
    
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
        toast.add({ severity: 'info', summary: t('queues.nestingStarted'), life: 3000 });
    } catch (e) { toast.add({ severity: 'error', summary: t('queues.nestingFailed'), detail: e.message, life: 3000 }); }
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
    confirm.require({
        message: 'Delete this nesting run?',
        header: 'Confirmation',
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            try { 
                await queuesStore.deleteRun(props.queue._id, id); 
                toast.add({ severity: 'success', summary: 'Deleted', detail: 'Nesting run removed', life: 2000 });
                emit('updated'); 
            }
            catch (e) { toast.add({ severity: 'error', summary: 'Error', detail: e.message }); }
        }
    });
};

const handleConvertToPhysical = async (runId) => {
    const run = props.queue.runs.find(r => r._id.toString() === runId.toString());
    if (!run) return;

    // Logic to switch nesting options and re-load inventory
    nestingOptions.value.materialMode = 'WAREHOUSE';
    nestingOptions.value.virtualWidth = run.params?.width || 3000;
    nestingOptions.value.virtualLength = run.params?.height || 1500;
    
    toast.add({ 
        severity: 'info', 
        summary: 'Switching to Warehouse', 
        detail: 'Please select warehouse and inventory sources to match this run dimensions.',
        life: 5000 
    });
    
    // Expand the sheets panel
    // Note: Assuming we might want to automatically find matches in future, 
    // for now we guide the user to the selection UI with pre-filled dimensions
};

const handleCreateRequisition = async (runId) => {
    const run = props.queue.runs.find(r => r._id.toString() === runId.toString());
    if (!run) return;

    confirm.require({
        message: `Create a requisition for ${run.layoutCount} sheets (${run.params?.width}x${run.params?.height}) based on this nesting?`,
        header: 'Material Requisition',
        icon: 'pi pi-shopping-cart',
        accept: async () => {
            try {
                // Navigate to requisitions with pre-filled data or open a dialog
                // For now, let's navigate to the materials page
                navigateTo('/materials');
                toast.add({ severity: 'success', summary: 'Redirecting', detail: 'Please create a new requisition with these specs.' });
            } catch (e) {
                toast.add({ severity: 'error', summary: 'Error', detail: e.message });
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
        message: 'Remove this item from the queue?',
        header: 'Confirmation',
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            entries.value = entries.value.filter(e => e._id !== entry._id);
            await saveQueue();
        }
    });
};

const downloadEntryDxf = (entry) => {
    const data = getCassetteData(entry.cassetteTemplateId);
    if (!data) return;

    let url = `/api/cassettes/${entry.cassetteTemplateId}/export`;
    
    // For parametric, append current dimensions as query params
    if (entry.type === 'PARAMETRIC' && entry.dimensions) {
        const params = new URLSearchParams();
        Object.entries(entry.dimensions).forEach(([key, val]) => {
            params.append(key, val);
        });
        url += `?${params.toString()}`;
    }
    
    window.open(url, '_blank');
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
    
    // Automatically add to queue
    if (newItem) {
        await addEntry(newItem);
    }
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

<style scoped lang="scss">
:deep(.p-accordion-tab) { margin-bottom: 1rem; }
:deep(.p-inputnumber-input) { width: 100% !important; }

.compact-input :deep(.p-inputnumber-input) {
    padding: 0.25rem 0.4rem;
    font-size: 10px;
    font-weight: 800;
}

.compact-input-buttons :deep(.p-inputnumber-input) {
    padding: 0.25rem 0.4rem;
    font-size: 10px;
    font-weight: 800;
    text-align: center;
}

.compact-input-buttons :deep(.p-inputnumber-button) {
    width: 1.5rem;
}

.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: var(--p-content-border-color); border-radius: 10px; }
</style>