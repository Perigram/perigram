<template>
    <div class="flex h-full min-h-0 min-w-0 flex-col">
        <component :is="workspaceComponent" :center-scroll="false">
            <template v-if="showQueueNavigation && queues?.length > 0" #left>
                <div class="flex shrink-0 items-center justify-between gap-2 px-1">
                    <span class="font-medium">{{ $t('project.queues') }}</span>
                    <Button
                        v-if="canCreateQueue"
                        icon="pi pi-plus"
                        size="small"
                        text
                        rounded
                        severity="secondary"
                        :aria-label="$t('queue.create')"
                        @click="$emit('create-queue')"
                    />
                </div>
                <div class="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
                    <QueueCard
                        v-for="option in queueList"
                        :key="option._id"
                        :queue="option"
                        variant="compact"
                        :show-delete="showQueueNavigation && isSelectedQueue(option)"
                        :show-summary="false"
                        :show-footer-actions="false"
                        :expandable="false"
                        density="dense"
                        @view="$emit('select-queue', option._id)"
                        @edit="$emit('select-queue', option._id)"
                        @delete="confirmDeleteQueue"
                    />
                </div>
            </template>

            <div class="flex h-full min-h-0 min-w-0 flex-col gap-4">
                <div v-if="showQueueNavigation && queues?.length > 0" class="flex shrink-0 gap-2 xl:hidden">
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
                        v-if="canCreateQueue"
                        icon="pi pi-plus"
                        size="small"
                        text
                        rounded
                        severity="secondary"
                        :aria-label="$t('queue.create')"
                        @click="$emit('create-queue')"
                    />
                </div>

                <ScrollablePanel v-if="showNestingCommandRegion" class="shrink-0" :scroll-content="false">
                    <template #header>
                        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <SelectButton
                                v-model="materialSourceSelection"
                                :options="materialSourceOptions"
                                optionLabel="label"
                                optionValue="value"
                                :aria-label="$t('nesting.materialSourcing')"
                                size="small"
                                class="min-w-0"
                                :disabled="!canRunNesting"
                            />
                            <Select
                                v-model="nestingOptions.toolProfileId"
                                :options="toolOptions"
                                optionLabel="name"
                                optionValue="_id"
                                :placeholder="$t('nesting.selectTool')"
                                class="min-w-48 flex-1"
                                size="small"
                                :disabled="!canRunNesting"
                            />
                            <Select
                                v-model="nestingOptions.machineId"
                                :options="machineOptions"
                                optionLabel="name"
                                optionValue="_id"
                                :placeholder="$t('nesting.selectMachine')"
                                class="min-w-48 flex-1"
                                size="small"
                                :disabled="!canRunNesting"
                            />
                            <Select
                                v-model="nestingOptions.materialId"
                                :options="materialOptions"
                                optionLabel="name"
                                optionValue="_id"
                                :placeholder="$t('nesting.selectMaterial')"
                                class="min-w-48 flex-1"
                                size="small"
                                :disabled="!canRunNesting"
                            />
                        </div>
                    </template>
                    <template #actions>
                        <Button
                            v-if="canRunNesting"
                            :label="$t('nesting.calculateLayout')"
                            icon="pi pi-play"
                            size="small"
                            @click="runNesting"
                            :loading="nestingInProgress"
                            :disabled="!isNestingReady"
                        />
                    </template>
                    <div class="flex flex-col gap-6" v-if="canRunNesting">
                        <div class="flex flex-col gap-4">
                            <!-- Virtual Mode -->
                            <div v-if="nestingOptions.materialMode === 'VIRTUAL'" class="flex flex-col gap-3">
                                <div class="grid grid-cols-2 gap-4">
                                    <InputNumber v-model="nestingOptions.virtualWidth" :min="100" :placeholder="$t('nesting.width')" size="small" />
                                    <InputNumber v-model="nestingOptions.virtualLength" :min="100" :placeholder="$t('nesting.length')" size="small" />
                                    <InputNumber v-model="nestingOptions.sheetThickness" :min="0" :placeholder="$t('nesting.sheetThickness')" suffix=" mm" size="small" />
                                </div>
                                <div class="rounded-panel border border-content-border bg-content p-3">
                                    <div class="flex items-center justify-between gap-3">
                                        <div class="flex min-w-0 items-center gap-2">
                                            <i class="pi pi-file"></i>
                                            <span class="truncate font-medium">{{ $t('nesting.virtualSheet') }}</span>
                                        </div>
                                        <span>{{ virtualSheetLabel }}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Warehouse Mode -->
                            <div v-else class="flex flex-col gap-4">
                                <div class="flex flex-col gap-2 sm:flex-row">
                                    <Select
                                        :model-value="null"
                                        :options="unselectedInventoryOptions"
                                        optionLabel="label"
                                        optionValue="uniqueId"
                                        :placeholder="$t('nesting.selectInventory')"
                                        class="min-w-0 flex-1"
                                        size="small"
                                        @update:model-value="addInventoryItem"
                                    >
                                        <template #option="{ option }">
                                            <div class="flex min-w-0 flex-col">
                                                <span class="truncate">{{ option.label }}</span>
                                                <small class="text-muted-color">{{ inventoryOptionMeta(option) }}</small>
                                            </div>
                                        </template>
                                    </Select>
                                    <FileUpload
                                        v-if="canEditQueue"
                                        mode="basic"
                                        name="file"
                                        url="/api/files/upload"
                                        accept=".dxf"
                                        :auto="true"
                                        @upload="onCustomSheetUpload"
                                        :chooseLabel="$t('nesting.customUpload')"
                                        :choose-button-props="{ severity: 'secondary', text: true, size: 'small' }"
                                    />
                                </div>

                                <div v-if="nestingOptions.warehouseId" class="flex flex-col gap-2">
                                    <div v-if="selectedInventory.length" class="flex min-w-0 gap-3 overflow-x-auto pb-1">
                                        <QueueSourceCard
                                            v-for="item in selectedInventory"
                                            :key="item.uniqueId"
                                            :source="item"
                                            class="relative min-w-56 flex-[0_0_14rem] sm:flex-[0_0_15rem]"
                                            @remove="removeInventoryItem(item.uniqueId)"
                                        />
                                    </div>
                                    <small v-else class="text-muted-color">
                                        {{ $t('nesting.selectInventory') }}
                                    </small>
                                    <Message v-if="selectedStockSizeConflict" severity="error">
                                        {{ $t('nesting.mixedStockSize') }}
                                    </Message>
                                </div>
                            </div>
                        </div>

                        <Message v-if="warehouseShortage" severity="error">
                            <div>
                                <p>{{ $t('nesting.shortageTitle') }}</p>
                                <small>{{ $t('nesting.shortageNote', { needed: warehouseShortage.needed, available: warehouseShortage.available, missing: warehouseShortage.missing }) }}</small>
                            </div>
                        </Message>
                    </div>
                    <StateBlock
                        v-else
                        :message="$t('nesting.lockedNote', { status: queueState })"
                        icon="pi pi-lock"
                    />
                </ScrollablePanel>

                <ScrollablePanel :header="$t('queues.cassettes')" class="min-h-0 flex-1">
                    <template #actions>
                        <Button icon="pi pi-th-large" :aria-label="$t('queue.gridView')" @click="viewMode = 'grid'" text severity="secondary" size="small" />
                        <Button icon="pi pi-table" :aria-label="$t('queue.tableView')" @click="viewMode = 'table'" text severity="secondary" size="small" />
                        <Button
                            v-for="action in producerActions"
                            :key="action.actionId"
                            :label="producerActionLabel(action)"
                            icon="pi pi-plus"
                            text
                            severity="secondary"
                            size="small"
                            :disabled="!canEditQueue"
                            @click="$emit('execute-producer', action)"
                        />
                    </template>
                    <div class="flex flex-col gap-6">
                        <ResponsiveGrid v-if="viewMode === 'grid'" variant="wide">
                            <template v-for="entry in entries" :key="entry?._key">
                                <QueueEntryCard
                                    v-if="entry"
                                    :entry="entry"
                                    :cassette="getEntryCassetteData(entry)"
                                    :parameters="getEntryParameters(entry)"
                            :disabled="!canEditQueue"
                                    @update-quantity="value => updateEntryQuantity(entry, value)"
                                    @update-dimension="(param, value) => updateEntryDimension(entry, param, value)"
                                    @remove="confirmDelete(entry)"
                                />
                            </template>
                        </ResponsiveGrid>

                        <TableFrame v-else>
                            <DataTable :value="entries" dataKey="_key" :editMode="canEditQueue ? 'cell' : null" @cell-edit-complete="onRowEditSave">
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
                                <Column v-if="canEditQueue" style="width: var(--ck-table-action-column-width)">
                                    <template #body="{ data }"><Button icon="pi pi-trash" severity="danger" text :aria-label="$t('common.delete')" @click="confirmDelete(data)" size="small" /></template>
                                </Column>
                            </DataTable>
                        </TableFrame>
                    </div>
                </ScrollablePanel>

            </div>
            <template v-if="showNestingRevisionRegion" #[supportSlot]>
                <Panel :header="`${$t('queue.revisions')} (${queueRevisions.length})`">
                    <div v-if="queueRevisions.length > 0" class="flex min-h-0 min-w-0 flex-col gap-3">
                        <Select
                            v-model="inspectedRevisionId"
                            :options="revisionOptions"
                            option-label="name"
                            option-value="id"
                            class="w-full"
                            size="small"
                        />
                        <EntityRevisionCard v-if="inspectedRevision" :revision="inspectedRevision" variant="compact" />
                        <Button
                            v-if="inspectedRevision?.data?.outcome === 'SUCCESS' && inspectedRevisionId !== selectedRevisionId"
                            :label="$t('queue.chooseRevision')"
                            icon="pi pi-check"
                            size="small"
                            @click="chooseRevisionHandler(inspectedRevisionId)"
                        />
                        <div v-if="selectedRevisionId" class="flex flex-col gap-2">
                            <small class="font-medium text-muted-color">{{ $t('queue.sheetDesigns') }}</small>
                            <SheetDesignCard
                                v-for="design in selectedSheetDesigns"
                                :key="design._id"
                                :design="design"
                                variant="compact"
                            />
                            <StateBlock v-if="!selectedSheetDesigns.length" :message="$t('queues.noSheetDesigns')" icon="pi pi-file" />
                        </div>
                    </div>
                    <StateBlock v-else-if="canRunNesting" :message="$t('queue.nestingRevisions')" icon="pi pi-list-check" />
                </Panel>
            </template>
        </component>


        <ConfirmDialog />
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
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
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import Message from 'primevue/message';
import InputNumber from 'primevue/inputnumber';
import FileUpload from 'primevue/fileupload';
import ConfirmDialog from 'primevue/confirmdialog';
import QueueEntryCard from '~/components/entities/Queue/QueueEntryCard.vue';
import QueueCard from '~/components/entities/Queue/QueueCard.vue';
import QueueSourceCard from '~/components/entities/Queue/QueueSourceCard.vue';
import EntityRevisionCard from '~/components/entities/EntityRevision/EntityRevisionCard.vue';
import SheetDesignCard from '~/components/entities/SheetDesign/SheetDesignCard.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import WorkspaceLanes from '~/components/shared/WorkspaceLanes.vue';
import EntityWorkspace from '~/components/shared/EntityWorkspace.vue';
import ScrollablePanel from '~/components/shared/ScrollablePanel.vue';
import { entitySelectLabel, namedSelectOptions } from '~/utils/selectOptions';
import { onEntityChanged } from '~/utils/entity-events.js';
import { generatedActionLabel } from '~/utils/generated-labels.js';
import { occsParameterNames } from '~/utils/occs/parameters.js';
import { canonicalQueueItem } from '~/utils/queue-items.js';
import { getPrimaryState, getRegionState } from '~/packages/core/src/index.js';
import { hasPermissionGrant } from '#shared/access-control.js';

const props = defineProps({
    queue: { type: Object, required: true },
    queues: { type: Array, default: () => [] },
    projectSlug: { type: String, required: true },
    showQueueNavigation: { type: Boolean, default: true },
    editMode: { type: String, default: 'workflow' },
    processActions: { type: Array, default: () => [] },
    producerActions: { type: Array, default: () => [] }
});

const emit = defineEmits(['updated', 'select-queue', 'create-queue', 'queue-deleted', 'execute-producer']);
const { t, te } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const authStore = useAuthStore();
const queuesStore = useQueuesStore();
const cassettesStore = useCassettesStore();
const toolProfilesStore = useToolProfilesStore();

const effectiveQueue = computed(() => (
    queuesStore.currentQueue?._id?.toString() === props.queue._id?.toString()
        ? queuesStore.currentQueue
        : props.queue
));
const queueState = computed(() => getPrimaryState(effectiveQueue.value.status, 'UNKNOWN'));
const nestingState = computed(() => getRegionState(effectiveQueue.value.status, 'nesting', 'IDLE'));
const queueName = computed(() => props.queue.identity?.name || props.queue.identity?.slug || t('common.unnamed'));
const isProcessMode = computed(() => props.editMode === 'process');
const showQueueNavigation = computed(() => props.showQueueNavigation);
const workspaceComponent = computed(() => showQueueNavigation.value ? WorkspaceLanes : EntityWorkspace);
const supportSlot = computed(() => showQueueNavigation.value ? 'right' : 'support');
const producerActionLabel = action => generatedActionLabel(action, action.actionId || action.id, { t, te });
const formatDate = value => value ? new Date(value).toLocaleString() : '';

const entries = ref([]);
const { revisions, nestingCompleted } = storeToRefs(queuesStore);
const nestingInProgress = ref(false);
const cassettes = ref([]);
const cassetteDesigns = ref([]);
const sheetDesigns = ref([]);
const warehouses = ref([]);
const machines = ref([]);
const materials = ref([]);
const availableInventory = ref([]);
const { tools } = storeToRefs(toolProfilesStore);
const viewMode = ref('grid');
const inspectedRevisionId = ref(null);
const queueOptions = computed(() => namedSelectOptions(props.queues, t('common.unnamed')));
const queueList = computed(() => [...props.queues].reverse());
const toolOptions = computed(() => namedSelectOptions(tools.value, t('common.unnamed')));
const machineOptions = computed(() => namedSelectOptions(machines.value, t('common.unnamed')));
const materialOptions = computed(() => namedSelectOptions(materials.value, t('common.unnamed')));
const warehouseOptions = computed(() => namedSelectOptions(warehouses.value, t('common.unnamed')));
const canCreateQueue = computed(() => authStore.can('queues', 'create'));
const canEditQueue = computed(() => {
    if (!isProcessMode.value) return queueState.value === 'DRAFT';
    return hasPermissionGrant({
        permissions: authStore.activePermissions,
        feature: 'queues',
        level: 'write',
        entity: props.queue,
        entityType: 'queue'
    });
});
const processRunNestingAction = computed(() => {
    if (!isProcessMode.value) return null;
    return props.processActions
        .find(action => action?.actionKind === 'runCommand' && action.commandId === 'solveNesting') || null;
});
const canRunNesting = computed(() => isProcessMode.value ? Boolean(processRunNestingAction.value) : canEditQueue.value);
const showNestingCommandRegion = computed(() => !isProcessMode.value || canRunNesting.value);
const requestErrorMessage = (error) => error?.data?.message || error?.response?._data?.message || error?.message || t('common.error');
const optionalList = async (loader) => {
    try {
        const result = await loader();
        return Array.isArray(result) ? result : [];
    } catch {
        return [];
    }
};
const isSelectedQueue = (item = {}) => item._id?.toString() === props.queue._id?.toString();
const materialSourceOptions = computed(() => [
    { label: t('nesting.virtualMode'), value: 'VIRTUAL' },
    ...warehouseOptions.value.map(warehouse => ({
        label: warehouse.name,
        value: `WAREHOUSE:${warehouse._id}`
    }))
]);
const materialSourceSelection = computed({
    get() {
        if (nestingOptions.value.materialMode === 'WAREHOUSE' && nestingOptions.value.warehouseId) {
            return `WAREHOUSE:${nestingOptions.value.warehouseId}`;
        }
        return 'VIRTUAL';
    },
    set(value) {
        if (value === 'VIRTUAL') {
            nestingOptions.value.materialMode = 'VIRTUAL';
            return;
        }
        const warehouseId = value?.replace('WAREHOUSE:', '');
        if (!warehouseId) return;
        nestingOptions.value.materialMode = 'WAREHOUSE';
        nestingOptions.value.warehouseId = warehouseId;
        loadWarehouseInventory();
    }
});

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
const nestingCommandParameters = computed(() => ({
    materialMode: nestingOptions.value.materialMode,
    virtualWidth: nestingOptions.value.virtualWidth,
    virtualLength: nestingOptions.value.virtualLength,
    spacing: nestingOptions.value.spacing,
    inventoryItems: nestingOptions.value.inventoryItems,
    materialPool: selectedMaterialPool.value,
    toolProfileId: nestingOptions.value.toolProfileId,
    machineId: nestingOptions.value.machineId,
    materialId: nestingOptions.value.materialId,
    sheetThickness: nestingOptions.value.sheetThickness
}));
const selectedStockSizeKeys = computed(() => Array.from(new Set(selectedMaterialPool.value.map(stockSizeKey).filter(Boolean))));
const selectedStockSizeConflict = computed(() => selectedStockSizeKeys.value.length > 1);
const selectedInventory = computed(() => nestingOptions.value.inventoryItems
    .map(uniqueId => availableInventory.value.find(item => item.uniqueId === uniqueId))
    .filter(Boolean));
const unselectedInventoryOptions = computed(() => {
    const selectedIds = new Set(nestingOptions.value.inventoryItems);
    return availableInventory.value.filter(item => !selectedIds.has(item.uniqueId));
});
const virtualSheetLabel = computed(() => `${nestingOptions.value.virtualWidth || 0} x ${nestingOptions.value.virtualLength || 0} mm`);
const inventoryOptionMeta = (item = {}) => [inventoryTypeLabel(item.type), item.specs]
    .filter(Boolean)
    .join(' · ');
const inventoryTypeLabel = (type) => ({
    PILE: t('entities.materialPile'),
    SHEET: t('entities.sheet'),
    REMNANT: t('entities.remnant'),
    CUSTOM: t('nesting.custom')
}[type] || type || '');
const addInventoryItem = (value) => {
    const uniqueId = typeof value === 'object' ? value?.uniqueId : value;
    if (!uniqueId) return;
    if (!nestingOptions.value.inventoryItems.includes(uniqueId)) {
        nestingOptions.value.inventoryItems = [...nestingOptions.value.inventoryItems, uniqueId];
    }
};
const removeInventoryItem = (uniqueId) => {
    nestingOptions.value.inventoryItems = nestingOptions.value.inventoryItems.filter(item => item !== uniqueId);
};

const entryKeyFor = (item = {}, index = 0) => (
    item._key ||
    item.entryKey ||
    `entry_${item.id || item.cassetteTemplateId || 'unknown'}_${index}`
);

const queueItemEntityType = (item = {}, entity = null) => (
    item.entityType ||
    (entity?.data?.geometry || entity?.data?.polygonParts || entity?.data?.layerData ? 'cassette_design' : 'cassette')
);

const makeQueueEntry = (item = {}, index = 0) => {
    const canonical = canonicalQueueItem(item, { cassettes: cassettes.value, cassetteDesigns: cassetteDesigns.value }) || item;
    const id = canonical.id || '';
    return {
        ...canonical,
        id,
        _key: entryKeyFor({ ...canonical, id }, index),
        cassetteTemplateId: id,
        entityType: queueItemEntityType(canonical),
        dimensions: canonical.parameters || canonical.dimensions || {},
        type: canonical.type || 'STATIC'
    };
};

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
const isCassetteDesignEntity = (data) => Boolean(data?.data?.geometry || data?.data?.polygonParts || data?.data?.layerData);
const getCassetteParameters = (data) => {
    const explicit = data?.data?.parameters;
    if (Array.isArray(explicit) && explicit.length) return explicit;
    return occsParameterNames(data?.data?.definition || {});
};
const getEntryCassetteData = (entry) => getCassetteData(entry?.cassetteTemplateId || entry?.id);
const isParametricEntry = (entry) => {
    const data = getEntryCassetteData(entry);
    if (data) return !isCassetteDesignEntity(data) && getCassetteParameters(data).length > 0;
    return entry?.type === 'PARAMETRIC';
};

const getEntryParameters = (e) => {
    const data = getEntryCassetteData(e);
    if (!data || isCassetteDesignEntity(data)) return [];
    if (getCassetteType(data) === 'PARAMETRIC') return getCassetteParameters(data);
    return [];
};

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

const defaultNestingSettings = () => ({
    materialMode: 'VIRTUAL',
    virtualWidth: 3000,
    virtualLength: 1500,
    warehouseId: null,
    inventoryItems: [],
    toolProfileId: null,
    machineId: null,
    materialId: null,
    sheetThickness: 4,
    requestedArtifacts: []
});

const queueNestingSettings = (queue = {}) => {
    const settings = queue.data?.nestingSettings || {};
    return {
        ...defaultNestingSettings(),
        ...settings,
        toolProfileId: settings.toolProfileId || settings.toolId || null,
        inventoryItems: Array.isArray(settings.inventoryItems) ? [...settings.inventoryItems] : [],
        requestedArtifacts: Array.isArray(settings.requestedArtifacts) ? [...settings.requestedArtifacts] : []
    };
};

const nestingOptions = ref(queueNestingSettings(props.queue));

const queueRevisions = computed(() => revisions.value[props.queue._id] || []);
const statusNestingData = computed(() => effectiveQueue.value.status?.lifecycle?.data || {});
const selectedRevisionId = computed(() => statusNestingData.value.selectedRevisionId || null);
const showNestingRevisionRegion = computed(() => !isProcessMode.value || queueRevisions.value.length > 0 || canRunNesting.value);
const revisionOptions = computed(() => queueRevisions.value.map(revision => ({
    id: revision._id?.toString(),
    name: `${revision.data?.outcome === 'SUCCESS' ? '✓' : '✕'} #${revision.data?.number || '?'} · ${formatDate(revision.status?.timestamp || revision.origin?.timestamp)}`
})));
const inspectedRevision = computed(() => queueRevisions.value.find(revision => (
    revision._id?.toString() === inspectedRevisionId.value?.toString()
)) || null);
const selectedSheetDesigns = computed(() => sheetDesigns.value.filter(design => (
    design.lineage?.queue?.revisionId?.toString() === selectedRevisionId.value?.toString()
)));
const warehouseShortage = computed(() => {
    if (nestingOptions.value.materialMode !== 'WAREHOUSE') return null;
    if (queueRevisions.value.length === 0) return null;

    const latestRevision = [...queueRevisions.value].reverse().find(revision => revision.data?.outcome === 'SUCCESS');
    if (!latestRevision || !['REVIEW', 'SELECTED'].includes(nestingState.value)) return null;

    const totalAvailable = selectedMaterialPool.value.reduce((sum, item) => sum + (item.available || 1), 0);

    const neededSheets = revisionSheetCount(latestRevision);
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
            $fetch(`/api/material-piles?lineage.warehouse.entityId=${whId}`),
            $fetch(`/api/sheets?lineage.warehouse.entityId=${whId}`),
            $fetch(`/api/remnants?lineage.warehouse.entityId=${whId}`)
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
                    entity: p,
                    dimensions,
                    availableCount
                };
            }).filter(item => item.availableCount > 0),
            ...sheets.map(s => ({ type: 'SHEET', uniqueId: `sheet_${s._id}`, warehouseId: whId, label: entitySelectLabel(s, t('sheets.title')), specs: formatInventorySpecs(s), id: s._id, entity: s, dimensions: inventoryDimensions(s), availableCount: 1 })),
            ...remnants.map(r => ({
                type: 'REMNANT',
                uniqueId: `remnant_${r._id}`,
                warehouseId: whId,
                label: entitySelectLabel(r, t('remnants.title')),
                specs: r.data?.area ? `${r.data.area}m²` : '-',
                id: r._id,
                entity: r,
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

const onCustomSheetUpload = (event) => {
    const response = JSON.parse(event.xhr.response);
    availableInventory.value.push({ type: 'CUSTOM', uniqueId: `file_${response.fileId}`, label: response.name, specs: 'DXF Poly', id: response.fileId });
    nestingOptions.value.inventoryItems.push(`file_${response.fileId}`);
};

const revisionSheetCount = (revision = {}) => Number(revision.data?.snapshot?.results?.sheetCount || 0);

const loadQueueData = async () => {
    try {
        const data = await queuesStore.getQueue(props.queue._id);
        if (data) {
            entries.value = (data.data?.job?.items || []).map(makeQueueEntry);
            entries.value.forEach(syncEntryWithCassette);
            nestingOptions.value = queueNestingSettings(data);
            if (nestingOptions.value.warehouseId) {
                await loadWarehouseInventory();
            } else {
                availableInventory.value = [];
            }
        }
    } catch (e) { console.error('Failed to load queue data:', e); }
};

const loadSheetDesigns = async () => {
    try {
        if (!selectedRevisionId.value) {
            sheetDesigns.value = [];
            return;
        }
        sheetDesigns.value = await $fetch('/api/sheet-designs', {
            query: { queueId: props.queue._id, revisionId: selectedRevisionId.value }
        });
    } catch (e) {
        console.error('Failed to load sheet designs:', e);
        sheetDesigns.value = [];
    }
};

let queueRevisionRefreshPromise = null;
const refreshQueueAfterRevisionTransition = async () => {
    if (queueRevisionRefreshPromise) return queueRevisionRefreshPromise;

    queueRevisionRefreshPromise = (async () => {
        await queuesStore.fetchRevisions(props.queue._id);
        await Promise.all([
            loadQueueData(),
            loadSheetDesigns()
        ]);
        emit('updated');
    })().finally(() => {
        queueRevisionRefreshPromise = null;
    });

    return queueRevisionRefreshPromise;
};

onMounted(async () => {
    const [cassetteResult, designResult, whRes, machineResult, materialResult] = await Promise.all([
        optionalList(() => cassettesStore.fetchCassettes()),
        optionalList(() => $fetch('/api/cassette-designs')),
        optionalList(() => $fetch('/api/warehouses')),
        optionalList(() => $fetch('/api/machines')),
        optionalList(() => $fetch('/api/materials'))
    ]);
    cassettes.value = cassetteResult || [];
    cassetteDesigns.value = designResult || [];
    warehouses.value = whRes || [];
    machines.value = machineResult || [];
    materials.value = materialResult || [];
    await toolProfilesStore.fetchTools();
    await queuesStore.fetchRevisions(props.queue._id);
    await loadSheetDesigns();
    loadQueueData();
});

const stopEntityChangeListener = onEntityChanged(async ({ type, id, entity }) => {
    const queueId = props.queue._id?.toString();
    if (type === 'queue' && id?.toString() === queueId) {
        if (Date.now() < ignoreQueueEventsUntil) return;
        await loadQueueData();
        return;
    }

    if (type === 'entity_revision' && entity?.data?.entityType === 'queue' && entity?.data?.entityId?.toString() === queueId) {
        await refreshQueueAfterRevisionTransition();
    }
});

onUnmounted(() => {
    clearTimeout(queueSaveTimer);
    stopEntityChangeListener();
});

watch(nestingCompleted, async (event) => {
    const queueId = typeof event === 'object' ? event?.queueId : event;
    if (queueId?.toString() === props.queue._id?.toString()) {
        await loadSheetDesigns();
    }
});

watch(queueRevisions, (queueRevisionRows) => {
    if (!queueRevisionRows.length) {
        inspectedRevisionId.value = null;
        return;
    }
    if (!queueRevisionRows.some(revision => revision._id?.toString() === inspectedRevisionId.value?.toString())) {
        inspectedRevisionId.value = queueRevisionRows[queueRevisionRows.length - 1]._id?.toString();
    }
}, { immediate: true });

watch(selectedRevisionId, () => loadSheetDesigns());

watch(() => props.queue._id, async () => {
    await loadQueueData();
    await queuesStore.fetchRevisions(props.queue._id);
    await loadSheetDesigns();
});

const syncEntryWithCassette = (entry) => {
    const canonical = canonicalQueueItem(entry, { cassettes: cassettes.value, cassetteDesigns: cassetteDesigns.value });
    if (canonical) Object.assign(entry, canonical);
    const data = getEntryCassetteData(entry);
    if (!data) {
        entry.entityType = queueItemEntityType(entry);
        return entry;
    }

    const isDesign = isCassetteDesignEntity(data);
    const type = (!isDesign && getCassetteParameters(data).length > 0) ? 'PARAMETRIC' : 'STATIC';
    entry.type = type;
    entry.entityType = queueItemEntityType(entry, data);

    if (type === 'PARAMETRIC') {
        entry.dimensions = entry.dimensions || {};
        getCassetteParameters(data).forEach((param) => {
            if (entry.dimensions[param] === undefined) entry.dimensions[param] = 0;
        });
    }

    return entry;
};

const updateEntryQuantity = async (entry, quantity) => {
    if (!canEditQueue.value) return;
    entry.quantity = quantity;
    await saveQueue({ notify: false });
};

const updateEntryDimension = async (entry, param, value) => {
    if (!canEditQueue.value) return;
    entry.dimensions = {
        ...(entry.dimensions || {}),
        [param]: value
    };
    scheduleQueueSave();
};

let queueSaveTimer = null;
let ignoreQueueEventsUntil = 0;
function scheduleQueueSave() {
    clearTimeout(queueSaveTimer);
    queueSaveTimer = setTimeout(() => saveQueue({ notify: false }), 250);
}

const saveQueue = async ({ notify = true } = {}) => {
    if (!canEditQueue.value) return false;
    try {
        ignoreQueueEventsUntil = Date.now() + 1500;
        entries.value.forEach(syncEntryWithCassette);
        const invalidEntry = entries.value.find(entry => !getEntryCassetteData(entry));
        if (invalidEntry) {
            throw new Error(t('queues.invalidCassetteEntry'));
        }
        await queuesStore.updateQueue(
            props.queue._id,
            {
                job: {
                    items: entries.value.map(e => ({
                        type: e.type,
                        entityType: e.entityType,
                        id: e.id || e.cassetteTemplateId,
                        quantity: e.quantity,
                        parameters: e.dimensions
                    })),
                    materialPool: selectedMaterialPool.value
                },
                nestingSettings: nestingOptions.value
            }
        );
        if (notify) emit('updated');
        return true;
    } catch (e) {
        console.error(e);
        throw e;
    }
};

const runNesting = async () => {
    nestingInProgress.value = true;
    try {
        const queueId = props.queue._id || props.queue.identity?.uid;
        if (processRunNestingAction.value) {
            if (canEditQueue.value) await saveQueue();
            await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(processRunNestingAction.value.actionId)}/execute`, {
                method: 'POST',
                body: {
                    entityId: queueId,
                    entities: { queue: queueId },
                    parameters: nestingCommandParameters.value
                }
            });
            await queuesStore.getQueue(queueId);
            queuesStore.pollQueueStatus(queueId);
            emit('updated');
        } else {
            await saveQueue();
            await queuesStore.startNesting(queueId);
        }
        await loadSheetDesigns();
        toast.add({ severity: 'info', summary: t('queues.nestingStarted'), life: 3000 });
    } catch (e) { toast.add({ severity: 'error', summary: t('queues.nestingFailed'), detail: requestErrorMessage(e), life: 5000 }); }
    finally { nestingInProgress.value = false; }
};

const confirmDeleteQueue = (queueToDelete) => {
    confirm.require({
        message: t('queue.confirmDelete'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            try {
                await queuesStore.deleteQueue(queueToDelete._id);
                emit('queue-deleted', queueToDelete._id);
                toast.add({ severity: 'success', summary: t('common.success'), life: 2000 });
            } catch (e) {
                toast.add({ severity: 'error', summary: t('common.error'), detail: e.message });
            }
        }
    });
};

const chooseRevisionHandler = async (id) => {
    try {
        await queuesStore.chooseRevision(props.queue._id, id);
        await refreshQueueAfterRevisionTransition();
    }
    catch (e) { toast.add({ severity: 'error', summary: t('queue.chooseRevisionFailed'), detail: e.message }); }
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


</script>
