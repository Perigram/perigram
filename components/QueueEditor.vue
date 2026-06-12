<template>
    <div class="flex h-[calc(100dvh-10rem)] min-h-0 min-w-0 flex-col overflow-hidden">
        <div class="grid min-h-0 min-w-0 flex-1 gap-4 xl:grid-cols-12">
            <aside v-if="queues?.length > 0" class="hidden min-h-0 min-w-0 xl:col-span-3 xl:flex xl:flex-col xl:gap-3 xl:overflow-hidden">
                <div class="flex shrink-0 items-center justify-between gap-2 px-1">
                    <span class="font-medium">{{ $t('project.queues') }}</span>
                    <Button
                        icon="pi pi-plus"
                        size="small"
                        :aria-label="$t('queue.create')"
                        @click="$emit('create-queue')"
                    />
                </div>
                <div class="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
                    <QueueCard
                        v-for="option in queueOptions"
                        :key="option._id"
                        :queue="option"
                        variant="compact"
                        :status-actions="option._id === queue._id ? queueStatusActions : []"
                        :show-delete="false"
                        :show-summary="false"
                        :class="{ 'outline outline-2 outline-primary': option._id === queue._id }"
                        @view="$emit('select-queue', option._id)"
                        @edit="$emit('select-queue', option._id)"
                    />
                </div>
            </aside>

            <main class="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto pr-1 xl:col-span-6">
                <div v-if="queues?.length > 0" class="flex shrink-0 gap-2 xl:hidden">
                    <Select
                        :modelValue="queue._id"
                        :options="queueOptions"
                        option-label="name"
                        option-value="_id"
                        class="w-full"
                        size="small"
                        @update:modelValue="$emit('select-queue', $event)"
                    >
                        <template #value>
                            <span class="block truncate font-semibold">{{ queueName }}</span>
                        </template>
                    </Select>
                    <Button
                        icon="pi pi-plus"
                        size="small"
                        :aria-label="$t('queue.create')"
                        @click="$emit('create-queue')"
                    />
                </div>

                <Panel :header="$t('nesting.settings')">
                    <div class="flex flex-col gap-6" v-if="queueState === 'DRAFT'">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div class="flex flex-col gap-4">
                                <div class="flex flex-col gap-1">
                                    <label>{{ $t('nesting.materialSourcing') }}</label>
                                    <SelectButton v-model="nestingOptions.materialMode" :options="['VIRTUAL', 'WAREHOUSE']" size="small" />
                                </div>
                                <div class="flex flex-col gap-1">
                                    <label>{{ $t('nesting.productionTool') }}</label>
                                    <Select v-model="nestingOptions.toolId" :options="toolOptions" optionLabel="name" optionValue="_id" :placeholder="$t('nesting.selectTool')" class="w-full" />
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
                                            <Select v-model="nestingOptions.warehouseId" :options="warehouseOptions" optionLabel="name" optionValue="_id" @change="loadWarehouseInventory" />
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
                                        <Message v-if="selectedStockSizeConflict" severity="error">
                                            {{ $t('nesting.mixedStockSize') }}
                                        </Message>
                                        <Message v-else-if="selectedStockSummary" severity="info">
                                            {{ selectedStockSummary }}
                                        </Message>
                                    </div>
                                </div>
                            </div>
                        </div>

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
                    <StateBlock
                        v-else
                        :message="$t('nesting.lockedNote', { status: queueState })"
                        icon="pi pi-lock"
                    />
                </Panel>

                <Panel :header="$t('queues.cassettes')">
                    <div class="flex flex-col gap-6">
                        <div class="flex justify-end items-center">
                            <div class="flex gap-2">
                                <Button icon="pi pi-th-large" :aria-label="$t('queue.gridView')" @click="viewMode = 'grid'" text />
                                <Button icon="pi pi-table" :aria-label="$t('queue.tableView')" @click="viewMode = 'table'" text />
                            </div>
                        </div>

                        <ResponsiveGrid v-if="viewMode === 'grid'">
                            <template v-for="entry in entries" :key="entry?._key">
                                <QueueEntryCard
                                    v-if="entry"
                                    :entry="entry"
                                    :cassette="getCassetteData(entry.cassetteTemplateId)"
                                    :parameters="getEntryParameters(entry)"
                                    :disabled="queueState !== 'DRAFT'"
                                    @update-quantity="value => updateEntryQuantity(entry, value)"
                                    @update-dimension="(param, value) => updateEntryDimension(entry, param, value)"
                                    @remove="confirmDelete(entry)"
                                />
                            </template>
                        </ResponsiveGrid>

                        <TableFrame v-else>
                            <DataTable :value="entries" dataKey="_key" :editMode="queueState === 'DRAFT' ? 'cell' : null" @cell-edit-complete="onRowEditSave">
                                <Column field="cassetteTemplateId" :header="$t('queues.cassette')">
                                    <template #body="{ data }"><span>{{ getCassetteName(data.cassetteTemplateId) }}</span></template>
                                </Column>
                                <Column field="quantity" :header="$t('queues.quantity')">
                                    <template #editor="{ data }"><InputNumber v-model="data.quantity" :min="1" fluid size="small" /></template>
                                </Column>
                                <Column v-for="param in allParameters" :key="param" :header="param" :field="`dimensions.${param}`">
                                    <template #body="{ data }">
                                        <span v-if="isParametricEntry(data)">{{ data.dimensions?.[param] || '-' }}</span>
                                        <span v-else class="text-muted-color">-</span>
                                    </template>
                                    <template #editor="{ data }">
                                        <InputNumber v-if="isParametricEntry(data)" v-model="data.dimensions[param]" fluid size="small" />
                                    </template>
                                </Column>
                                <Column v-if="queueState === 'DRAFT'" style="width: var(--ck-table-action-column-width)">
                                    <template #body="{ data }"><Button icon="pi pi-trash" severity="danger" text :aria-label="$t('common.delete')" @click="confirmDelete(data)" size="small" /></template>
                                </Column>
                            </DataTable>
                        </TableFrame>

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
                </Panel>

                <Panel v-if="hasPhysicalOutputs" :header="`${$t('project.cassettes')} ${$t('cassetteInstance.instances')}`">
                    <ResponsiveGrid>
                        <CassetteInstanceCard 
                            v-for="instance in instances" 
                            :key="instance._id" 
                            :instance="instance"
                            variant="compact"
                        />
                    </ResponsiveGrid>
                </Panel>
            </main>

            <aside class="min-h-0 min-w-0 overflow-y-auto pr-1 xl:col-span-3">
                <Panel :header="`${$t('queue.runs')} (${queueRuns.length})`">
                    <div v-if="queueRuns.length > 0" class="flex min-h-0 min-w-0 flex-col gap-3">
                        <Select
                            :model-value="selectedRunId"
                            :options="runOptions"
                            option-label="name"
                            option-value="id"
                            class="w-full"
                            size="small"
                            @update:model-value="selectedRunId = $event"
                        />
                        <NestingRunCard
                            v-if="activeRun"
                            :key="activeRun._id"
                            :run="activeRun"
                            :sheet-designs="sheetDesigns"
                            :show-sheet-design-previews="true"
                            :active="true"
                            :is-chosen="activeRun.status?.state === 'CHOSEN'"
                            @select="selectedRunId = $event.toString()"
                            @choose="chooseRunHandler"
                            @delete="deleteRunHandler"
                            @convert-to-physical="handleConvertToPhysical"
                        />
                    </div>
                    <StateBlock v-else :message="$t('queue.nestingRuns')" icon="pi pi-list-check" />
                </Panel>
            </aside>
        </div>


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

        <ConfirmDialog />
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '~/stores/auth';
import { useCassettesStore } from '~/stores/cassettes';
import { useToolProfilesStore } from '~/stores/toolProfiles';
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
import InputNumber from 'primevue/inputnumber';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import FileUpload from 'primevue/fileupload';
import ConfirmDialog from 'primevue/confirmdialog';
import CassetteEditorDialog from './CassetteEditorDialog.vue';
import QueueEntryCard from '~/components/entities/Queue/QueueEntryCard.vue';
import QueueCard from '~/components/entities/Queue/QueueCard.vue';
import NestingRunCard from '~/components/entities/NestingRun/NestingRunCard.vue';
import CassetteInstanceCard from '~/components/entities/CassetteInstance/CassetteInstanceCard.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import { entitySelectLabel, namedSelectOptions } from '~/utils/selectOptions';
import { occsParameterNames } from '~/utils/occs/parameters.js';

const props = defineProps({
    queue: { type: Object, required: true },
    queues: { type: Array, default: () => [] },
    projectSlug: { type: String, required: true }
});

const emit = defineEmits(['updated', 'select-queue', 'create-queue']);
const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const authStore = useAuthStore();

const queueState = computed(() => props.queue.status?.state || 'UNKNOWN');
const queueName = computed(() => props.queue.identity?.name || props.queue.identity?.slug || t('common.unnamed'));

const queuesStore = useQueuesStore();
const cassettesStore = useCassettesStore();
const toolProfilesStore = useToolProfilesStore();

const entries = ref([]);
const { runs, nestingCompleted } = storeToRefs(queuesStore);
const nestingInProgress = ref(false);
const showAddDialog = ref(false);
const showUploadDialog = ref(false);
const uploadDialogRef = ref(null);
const cassettes = ref([]);
const cassetteDesigns = ref([]);
const sheetDesigns = ref([]);
const warehouses = ref([]);
const availableInventory = ref([]);
const { tools } = storeToRefs(toolProfilesStore);
const viewMode = ref('grid');
const selectedRunId = ref(null);
const instances = ref([]);
const queueOptions = computed(() => namedSelectOptions(props.queues, t('common.unnamed')));
const toolOptions = computed(() => namedSelectOptions(tools.value, t('common.unnamed')));
const warehouseOptions = computed(() => namedSelectOptions(warehouses.value, t('common.unnamed')));

const formatInventorySpecs = (entity = {}) => {
    const specs = entity.specs || entity.data?.specs || {};
    const width = specs.width || specs.w;
    const length = specs.length || specs.height || specs.h;
    return width && length ? `${width}x${length}` : '-';
};

const inventoryDimensions = (entity = {}) => {
    const specs = entity.specs || entity.data?.specs || {};
    const width = Number(specs.width || specs.w || 0);
    const length = Number(specs.length || specs.height || specs.h || 0);
    return { width, length };
};

const inventoryGeometryData = (entity = {}) => (
    entity.data?.geometryData ||
    entity.data?.geometry?.data ||
    entity.geometryData ||
    entity.geometry?.data ||
    null
);

const normalizeSheetRing = (points = []) => {
    if (!Array.isArray(points)) return null;
    const normalized = points
        .map(point => Array.isArray(point) && point.length >= 2 ? [Number(point[0]), Number(point[1])] : null)
        .filter(point => point && Number.isFinite(point[0]) && Number.isFinite(point[1]));
    if (normalized.length < 3) return null;
    const [firstX, firstY] = normalized[0];
    const [lastX, lastY] = normalized[normalized.length - 1];
    if (Math.abs(firstX - lastX) > 0.001 || Math.abs(firstY - lastY) > 0.001) {
        normalized.push([firstX, firstY]);
    }
    return normalized;
};

const normalizeSheetPolygon = (polygon = null) => {
    if (polygon && !Array.isArray(polygon) && typeof polygon === 'object') {
        const outer = normalizeSheetRing(polygon.outer || polygon.data?.outer || []);
        if (!outer) return null;
        return {
            outer,
            inner: (polygon.inner || polygon.data?.inner || [])
                .map(normalizeSheetRing)
                .filter(Boolean)
        };
    }
    const outer = normalizeSheetRing(polygon);
    return outer ? { outer, inner: [] } : null;
};

const inventorySheetPolygon = (entity = {}) => {
    const geometry = inventoryGeometryData(entity);
    return normalizeSheetPolygon(
        geometry?.polygon ||
        geometry?.sheetPolygon ||
        geometry?.sheet_polygon ||
        geometry?.polygonParts?.find(part => Array.isArray(part?.coordinates))?.coordinates ||
        null
    );
};

const stockSizeKey = (item = {}) => {
    const width = Number(item.dimensions?.width || 0);
    const length = Number(item.dimensions?.length || item.dimensions?.height || 0);
    return width > 0 && length > 0 ? `${width}x${length}` : '';
};

const selectedMaterialPool = computed(() => (
    nestingOptions.value.inventoryItems
        .map(uniqueId => availableInventory.value.find(item => item.uniqueId === uniqueId))
        .filter(Boolean)
        .map(item => ({
            type: item.type,
            id: item.id,
            warehouseId: item.warehouseId,
            label: item.label,
            specs: item.specs,
            dimensions: item.dimensions,
            geometryData: item.geometryData,
            sheetPolygon: item.sheetPolygon,
            available: item.availableCount ?? 1
        }))
));
const selectedStockSizeKeys = computed(() => Array.from(new Set(selectedMaterialPool.value.map(stockSizeKey).filter(Boolean))));
const selectedStockSizeConflict = computed(() => selectedStockSizeKeys.value.length > 1);
const selectedStockSummary = computed(() => {
    if (!selectedMaterialPool.value.length || selectedStockSizeConflict.value) return '';
    const available = selectedMaterialPool.value.reduce((sum, item) => sum + (item.available || 1), 0);
    const size = selectedStockSizeKeys.value[0] || t('common.notAvailable');
    return t('nesting.selectedStockSummary', { count: available, size });
});

const newEntry = ref({
    cassetteTemplateId: null,
    quantity: 1,
    dimensions: {}
});

const entryKeyFor = (item = {}, index = 0) => (
    item._key ||
    item.entryKey ||
    `entry_${item.id || item.cassetteTemplateId || 'unknown'}_${index}`
);

const makeQueueEntry = (item = {}, index = 0) => ({
    ...item,
    _key: entryKeyFor(item, index),
    cassetteTemplateId: item.cassetteTemplateId || item.id,
    dimensions: item.parameters || item.dimensions || {},
    type: item.type || 'STATIC'
});

const getCassetteData = (id) => {
    const idStr = id?.toString();
    if (!idStr) return null;
    return cassettes.value.find(c => c._id?.toString() === idStr) || 
           cassetteDesigns.value.find(d => d._id?.toString() === idStr);
};

const getCassetteName = (id) => {
    const data = getCassetteData(id);
    if (!data) return t('common.unknown');
    return data.identity?.name || data.identity?.slug || t('common.unnamed');
};

const getCassetteType = (data) => data?.data?.type || '';
const getCassetteParameters = (data) => {
    const explicit = data?.data?.parameters;
    if (Array.isArray(explicit) && explicit.length) return explicit;
    return occsParameterNames(data?.data?.definition || {});
};
const getEntryCassetteData = (entry) => getCassetteData(entry?.cassetteTemplateId || entry?.id);
const isParametricEntry = (entry) => {
    const data = getEntryCassetteData(entry);
    if (data) return !data.data?.geometry && getCassetteParameters(data).length > 0;
    return entry?.type === 'PARAMETRIC';
};

const getEntryParameters = (e) => {
    const data = getEntryCassetteData(e);
    if (!data || !!data.data?.geometry) return []; 
    if (getCassetteType(data) === 'PARAMETRIC') return getCassetteParameters(data);
    return [];
};

const allAvailableCassettes = computed(() => {
    const items = [...cassettes.value, ...cassetteDesigns.value];
    return namedSelectOptions(items, t('common.unnamed'));
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

const findDesignForTemplate = (templateId) => {
    const id = templateId?.toString();
    if (!id) return null;
    return cassetteDesigns.value.find(design => design.lineage?.templateId?.toString() === id) || null;
};

const resolveUploadedQueueItem = (payload) => {
    if (!payload) return null;
    const design = payload.design || (payload.data?.geometry ? payload : null);
    if (design) {
        if (!cassetteDesigns.value.some(item => item._id?.toString() === design._id?.toString())) {
            cassetteDesigns.value.push(design);
        }
        return design;
    }

    const template = payload.template || payload;
    return findDesignForTemplate(template._id) || template;
};

const nestingOptions = ref({    materialMode: props.queue.data?.nestingParams?.materialMode || 'VIRTUAL',
    virtualWidth: props.queue.data?.nestingParams?.virtualWidth || 3000,
    virtualLength: props.queue.data?.nestingParams?.virtualLength || 1500,
    warehouseId: props.queue.data?.nestingParams?.warehouseId || null,
    inventoryItems: props.queue.data?.nestingParams?.inventoryItems || [],
    toolId: props.queue.data?.nestingParams?.toolId || null,
    requestedArtifacts: props.queue.requestedArtifacts || []
});

const queueRuns = computed(() => runs.value[props.queue._id] || []);
const runOptions = computed(() => queueRuns.value.map(run => ({
    ...run,
    id: run._id?.toString(),
    name: entitySelectLabel(run, t('entities.nestingRun'))
})));
const activeRun = computed(() => queueRuns.value.find(run => run._id?.toString() === selectedRunId.value?.toString()) || queueRuns.value[0] || null);
const hasPhysicalOutputs = computed(() => Boolean(props.queue.data?.physicalOutputs?.cassetteInstanceIds?.length));
const queueStatusActions = computed(() => {
    if (!authStore.can('queues', 'edit')) return [];

    const actions = [];
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
    
    const totalAvailable = selectedMaterialPool.value.reduce((sum, item) => sum + (item.available || 1), 0);
    
    const neededSheets = runSheetCount(latestRun);
    if (neededSheets > totalAvailable) {
        return {
            needed: neededSheets,
            available: totalAvailable,
            missing: neededSheets - totalAvailable
        };
    }
    
    return null;
});

const isNestingReady = computed(() => {
    if (entries.value.length === 0) return false;
    
    if (nestingOptions.value.materialMode === 'WAREHOUSE') {
        if (nestingOptions.value.inventoryItems.length === 0) return false;
        if (selectedStockSizeConflict.value) return false;
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
            ...piles.map(p => {
                const stock = p.data?.stock || {};
                const availableCount = Math.max((stock.total || 0) - (stock.used || 0), 0);
                const dimensions = inventoryDimensions(p);
                return {
                    type: 'PILE',
                    uniqueId: `pile_${p._id}`,
                    warehouseId: whId,
                    label: entitySelectLabel(p, p.data?.serial || t('piles.pile')),
                    specs: `${formatInventorySpecs(p)} · ${availableCount} ${t('common.units')}`,
                    id: p._id,
                    dimensions,
                    availableCount
                };
            }).filter(item => item.availableCount > 0),
            ...sheets.map(s => ({ type: 'SHEET', uniqueId: `sheet_${s._id}`, warehouseId: whId, label: entitySelectLabel(s, t('sheets.title')), specs: formatInventorySpecs(s), id: s._id, dimensions: inventoryDimensions(s), availableCount: 1 })),
            ...remnants.map(r => ({
                type: 'REMNANT',
                uniqueId: `remnant_${r._id}`,
                warehouseId: whId,
                label: entitySelectLabel(r, t('remnants.title')),
                specs: r.data?.area ? `${r.data.area}m²` : '-',
                id: r._id,
                dimensions: inventoryDimensions(r),
                geometryData: inventoryGeometryData(r),
                sheetPolygon: inventorySheetPolygon(r),
                availableCount: 1
            }))
        ];
        const availableIds = new Set(availableInventory.value.map(item => item.uniqueId));
        nestingOptions.value.inventoryItems = nestingOptions.value.inventoryItems.filter(id => availableIds.has(id));
    } catch (e) { console.error(e); }
};

const getInventoryTagSeverity = (t) => ({ 'PILE': 'primary', 'SHEET': 'info', 'REMNANT': 'warn' }[t] || 'secondary');

const onCustomSheetUpload = (event) => {
    const response = JSON.parse(event.xhr.response);
    availableInventory.value.push({ type: 'CUSTOM', uniqueId: `file_${response.fileId}`, label: response.name, specs: 'DXF Poly', id: response.fileId });
    nestingOptions.value.inventoryItems.push(`file_${response.fileId}`);
};

const runSheetCount = (run = {}) => Number(run.data?.results?.sheetCount || run.summary?.sheetCount || run.layoutCount || 0);
const runParams = (run = {}) => run.data?.params || run.params || {};

const loadQueueData = async () => {
    try {
        const data = await queuesStore.getQueue(props.queue._id);
        if (data) {
            entries.value = (data.data?.job?.items || []).map(makeQueueEntry);
            entries.value.forEach(syncEntryWithCassette);
            if (hasPhysicalOutputs.value) loadInstances();
        }
    } catch (e) { console.error('Failed to load queue data:', e); }
};

const loadSheetDesigns = async () => {
    try {
        sheetDesigns.value = await $fetch('/api/sheet-designs', { query: { queueId: props.queue._id } });
    } catch (e) {
        console.error('Failed to load sheet designs:', e);
        sheetDesigns.value = [];
    }
};

onMounted(async () => {
    const [cassetteResult, designResult, projectRes, whRes] = await Promise.all([
        cassettesStore.fetchCassettes(),
        $fetch('/api/cassette-designs'),
        $fetch(`/api/project/${props.projectSlug}`),
        $fetch('/api/warehouses')
    ]);
    cassettes.value = cassetteResult || [];
    cassetteDesigns.value = designResult || [];
    warehouses.value = whRes || [];
    if (nestingOptions.value.warehouseId) loadWarehouseInventory();
    await toolProfilesStore.fetchTools();
    await queuesStore.fetchRuns(props.queue._id);
    await loadSheetDesigns();
    loadQueueData();
});

watch(nestingCompleted, async (event) => {
    const queueId = typeof event === 'object' ? event?.queueId : event;
    if (queueId?.toString() === props.queue._id?.toString()) {
        await loadSheetDesigns();
    }
});

watch(queueRuns, (runsForQueue) => {
    if (!runsForQueue.length) {
        selectedRunId.value = null;
        return;
    }
    if (!runsForQueue.some(run => run._id?.toString() === selectedRunId.value?.toString())) {
        selectedRunId.value = runsForQueue[runsForQueue.length - 1]._id?.toString();
    }
}, { immediate: true });

watch(() => props.queue._id, async () => {
    await loadQueueData();
    await queuesStore.fetchRuns(props.queue._id);
    await loadSheetDesigns();
});

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

    const isDesign = !!data.data?.geometry;
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

const updateEntryQuantity = async (entry, quantity) => {
    entry.quantity = quantity;
    await saveQueue();
};

const updateEntryDimension = async (entry, param, value) => {
    entry.dimensions = {
        ...(entry.dimensions || {}),
        [param]: value
    };
    await saveQueue();
};

const addEntry = async (item = null) => {
    const data = item || getCassetteData(newEntry.value.cassetteTemplateId);
    if (!data) return;

    const isDesign = !!data.data?.geometry;
    const type = (!isDesign && getCassetteParameters(data).length > 0) ? 'PARAMETRIC' : 'STATIC';
    
    const entryData = item ? {
        cassetteTemplateId: data._id,
        quantity: 1,
        dimensions: {}
    } : { ...newEntry.value };

    entries.value.push(syncEntryWithCassette({ 
        ...entryData, 
        _key: `entry_${data._id}_${Date.now()}_${entries.value.length}`,
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
        await queuesStore.updateQueue(
            props.queue._id,
            {
                job: {
                    items: entries.value.map(e => ({ type: e.type, id: e.id, quantity: e.quantity, parameters: e.dimensions })),
                    materialPool: selectedMaterialPool.value
                },
                nestingParams: nestingOptions.value
            }
        );
        emit('updated'); 
    } catch (e) {
        console.error(e);
        throw e;
    }
};

const runNesting = async () => {
    nestingInProgress.value = true;
    try {
        await saveQueue();
        await queuesStore.startNesting(props.queue._id, {
            ...nestingOptions.value,
            materialPool: selectedMaterialPool.value
        });
        await loadSheetDesigns();
        toast.add({ severity: 'info', summary: t('queues.nestingStarted'), life: 3000 });
    } catch (e) { toast.add({ severity: 'error', summary: t('queues.nestingFailed'), detail: e.message, life: 3000 }); }
    finally { nestingInProgress.value = false; }
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
    try {
        await queuesStore.chooseRun(props.queue._id, id);
        await loadInstances();
        emit('updated');
    }
    catch (e) { toast.add({ severity: 'error', summary: t('queue.chooseRunFailed'), detail: e.message }); }
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
    const params = runParams(run);
    nestingOptions.value.materialMode = 'WAREHOUSE';
    nestingOptions.value.virtualWidth = params.width || 3000;
    nestingOptions.value.virtualLength = params.height || 1500;
    toast.add({ 
        severity: 'info', 
        summary: t('queues.switchingToWarehouse'),
        detail: t('queues.selectWarehouseHint'),
        life: 5000 
    });
};

const confirmDelete = (entry) => {
    confirm.require({
        message: t('queue.confirmDeleteEntry'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            entries.value = entries.value.filter(e => e._key !== entry._key);
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
    const queueItem = resolveUploadedQueueItem(newItem);
    if (queueItem) await addEntry(queueItem);
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
