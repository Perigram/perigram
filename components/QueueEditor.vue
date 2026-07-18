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
                        entity-type="queue"
                        class="w-full"
                        size="small"
                        @update:modelValue="$emit('select-queue', $event)"
                    />
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
                                v-model="nestingOptions.machineId"
                                :options="machineOptions"
                                optionLabel="name"
                                optionValue="_id"
                                entity-type="machine"
                                :placeholder="$t('nesting.selectMachine')"
                                class="min-w-48 flex-1"
                                size="small"
                                :disabled="!canRunNesting"
                            />
                            <Select
                                v-model="nestingOptions.toolProfileId"
                                :options="toolOptions"
                                optionLabel="name"
                                optionValue="_id"
                                entity-type="toolProfile"
                                :placeholder="$t('nesting.selectTool')"
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
                                <div class="grid grid-cols-3 gap-4">
                                    <InputNumber v-model="nestingOptions.virtualWidth" :min="100" :placeholder="$t('nesting.width')" size="small" />
                                    <InputNumber v-model="nestingOptions.virtualLength" :min="100" :placeholder="$t('nesting.length')" size="small" />
                                    <InputNumber v-model="nestingOptions.virtualThickness" :min="0.01" :min-fraction-digits="1" :max-fraction-digits="3" :placeholder="$t('nesting.thickness')" size="small" />
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
                            v-if="canAddQueueEntry && producerMenuItems.length"
                            :label="$t('queues.addEntry')"
                            icon="pi pi-plus"
                            severity="primary"
                            size="small"
                            @click="event => producerMenu.toggle(event)"
                        />
                        <Menu ref="producerMenu" :model="producerMenuItems" popup />
                    </template>
                    <div class="flex flex-col gap-6">
                        <ResponsiveGrid v-if="viewMode === 'grid'" variant="wide">
                            <template v-for="entry in entries" :key="entry?._key">
                                <QueueEntryCard
                                    v-if="entry"
                                    :entry="entry"
                                    :cassette="getEntryEntityData(entry)"
                                    :parameters="getEntryParameters(entry)"
                                    :locked-parameters="['T']"
                                    :disabled="!canEditQueue"
                                    @update-quantity="value => updateEntryQuantity(entry, value)"
                                    @update-dimension="(param, value) => updateEntryDimension(entry, param, value)"
                                    @remove="confirmDelete(entry)"
                                />
                            </template>
                        </ResponsiveGrid>

                        <TableFrame v-else>
                            <DataTable :value="entries" dataKey="_key" :editMode="canEditQueue ? 'cell' : null" @cell-edit-complete="onRowEditSave">
                                <Column field="id" :header="$t('queues.cassette')">
                                    <template #body="{ data }"><span>{{ getCassetteName(data.id) }}</span></template>
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
                                        <InputNumber
                                            v-if="isParametricEntry(data)"
                                            v-model="data.dimensions[param]"
                                            :disabled="param === 'T'"
                                            fluid
                                            size="small"
                                        />
                                    </template>
                                </Column>
                                <Column v-if="canEditQueue" style="width: var(--ck-table-action-column-width)">
                                    <template #body="{ data }"><Button icon="pi pi-trash" severity="danger" text :aria-label="$t('common.delete')" @click="confirmDelete(data)" size="small" /></template>
                                </Column>
                            </DataTable>
                        </TableFrame>
                    </div>
                </ScrollablePanel>

                <ScrollablePanel v-if="hasPhysicalOutputs" :header="`${$t('project.cassettes')} ${$t('cassetteInstance.instances')}`" class="flex-1">
                    <ResponsiveGrid>
                        <CassetteInstanceCard
                            v-for="instance in instances"
                            :key="instance._id"
                            :instance="instance"
                            variant="compact"
                        />
                    </ResponsiveGrid>
                </ScrollablePanel>
            </div>
            <template v-if="showNestingRunRegion" #[supportSlot]>
                <Panel :header="$t('queue.runs')">
                    <div v-if="activeRun" class="flex min-h-0 min-w-0 flex-col gap-3">
                        <NestingRunCard
                            :key="activeRun._id"
                            :run="activeRun"
                            :sheet-designs="sheetDesigns"
                            :active="true"
                            :is-chosen="isAcceptedRun(activeRun)"
                            @choose="chooseRunHandler"
                            @refresh="handleRunStatusChanged"
                            @delete="deleteRunHandler"
                            @convert-to-physical="handleConvertToPhysical"
                        />
                    </div>
                    <StateBlock v-else-if="canRunNesting" :message="$t('queue.nestingRuns')" icon="pi pi-list-check" />
                </Panel>
            </template>
        </component>


        <StandardDialog v-model:visible="showAddDialog" :header="selectedProducer ? producerLabel(selectedProducer) : $t('queues.addEntry')">
            <div class="flex flex-col gap-4 py-4">
                <div v-if="selectedProducer?.kind === 'entitySource'" class="flex flex-col gap-2">
                    <label>{{ $t('queues.cassette') }}</label>
                    <Select v-model="producerValues.designId" :options="designOptions" optionLabel="label" optionValue="value" entity-type="cassetteDesign" class="w-full" size="small" />
                </div>
                <template v-else>
                    <div v-for="field in visibleProducerFields" :key="field.id" class="flex flex-col gap-2">
                        <label>{{ field.label || field.id }}</label>
                        <Select
                            v-if="field.type === 'entity'"
                            v-model="producerValues[field.id]"
                            :options="producerFieldOptions[field.id] || []"
                            option-label="label"
                            option-value="value"
                            :entity-type="field.entityType || field.accepts?.[0] || ''"
                            class="w-full"
                            size="small"
                            :disabled="field.id === 'templateId' && !producerValues.libraryId"
                            @change="onProducerFieldChange(field)"
                        />
                        <MultiSelect
                            v-else-if="field.type === 'entityList'"
                            v-model="producerValues[field.id]"
                            :options="producerFieldOptions[field.id] || []"
                            option-label="label"
                            option-value="value"
                            :entity-type="field.entityType || field.accepts?.[0] || ''"
                            class="w-full"
                            size="small"
                        />
                        <InputNumber v-else-if="field.type === 'number'" v-model="producerValues[field.id]" fluid size="small" />
                        <Textarea v-else-if="field.type === 'object'" v-model="producerValues[field.id]" rows="3" auto-resize />
                        <InputText v-else-if="field.type !== 'cassetteParameters'" v-model="producerValues[field.id]" class="w-full" size="small" />
                        <div v-else class="grid grid-cols-2 gap-3">
                            <div v-for="parameter in producerParameterNames" :key="parameter" class="flex flex-col gap-1">
                                <label>{{ parameter }}</label>
                                <InputNumber v-model="producerParameters[parameter]" :disabled="parameter === 'T'" fluid size="small" />
                            </div>
                        </div>
                    </div>
                </template>
                <div class="flex flex-col gap-2">
                    <label>{{ $t('queues.quantity') }}</label>
                    <InputNumber v-model="producerQuantity" :min="1" fluid size="small" />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" size="small" @click="showAddDialog = false" />
                <Button :label="$t('common.add')" severity="secondary" size="small" :loading="producerExecuting" @click="executeSelectedProducer" :disabled="!producerReady" />
            </template>
        </StandardDialog>

        <CassetteEditorDialog
            v-model:modelValue="showUploadDialog"
            :producer-action-id="selectedProducer?.actionId || ''"
            :producer-action-body="uploadProducerActionBody"
            @saved="onCassetteUploaded"
        />

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
import Select from '~/components/shared/EntitySelect.vue';
import MultiSelect from '~/components/shared/EntityMultiSelect.vue';
import SelectButton from 'primevue/selectbutton';
import Message from 'primevue/message';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Menu from 'primevue/menu';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import FileUpload from 'primevue/fileupload';
import ConfirmDialog from 'primevue/confirmdialog';
import CassetteEditorDialog from './CassetteEditorDialog.vue';
import QueueEntryCard from '~/components/entities/Queue/QueueEntryCard.vue';
import QueueCard from '~/components/entities/Queue/QueueCard.vue';
import QueueSourceCard from '~/components/entities/Queue/QueueSourceCard.vue';
import NestingRunCard from '~/components/entities/NestingRun/NestingRunCard.vue';
import CassetteInstanceCard from '~/components/entities/CassetteInstance/CassetteInstanceCard.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import WorkspaceLanes from '~/components/shared/WorkspaceLanes.vue';
import EntityWorkspace from '~/components/shared/EntityWorkspace.vue';
import ScrollablePanel from '~/components/shared/ScrollablePanel.vue';
import { entitySelectLabel, namedSelectOptions } from '~/utils/selectOptions';
import { onEntityChanged } from '~/utils/entity-events.js';
import { occsParameterNames } from '~/utils/occs/parameters.js';
import { canonicalQueueItem } from '~/utils/queue-items.js';
import { currentQueueRun } from '~/utils/queue-runs.js';
import {
    buildProducerActionRequest,
    producerFieldsForAction,
    templatesAvailableToProject
} from '~/utils/queue-producers.js';
import { resolveQueueDesignProducers } from '~/utils/queue-design-producers.js';
import { getPrimaryState } from '~/packages/core/src/index.js';
import { hasPermissionGrant } from '#shared/access-control.js';
import { cncDomain } from '@cutkit/domain-cnc';

const props = defineProps({
    queue: { type: Object, required: true },
    queues: { type: Array, default: () => [] },
    projectSlug: { type: String, required: true },
    showQueueNavigation: { type: Boolean, default: true },
    editMode: { type: String, default: 'workflow' },
    processActions: { type: Array, default: () => [] }
});

const emit = defineEmits(['updated', 'select-queue', 'create-queue', 'queue-deleted']);
const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const authStore = useAuthStore();

const queueState = computed(() => getPrimaryState(props.queue.status, 'UNKNOWN'));
const isProcessMode = computed(() => props.editMode === 'process');
const showQueueNavigation = computed(() => props.showQueueNavigation);
const workspaceComponent = computed(() => showQueueNavigation.value ? WorkspaceLanes : EntityWorkspace);
const supportSlot = computed(() => showQueueNavigation.value ? 'right' : 'support');

const queuesStore = useQueuesStore();
const cassettesStore = useCassettesStore();
const toolProfilesStore = useToolProfilesStore();

const entries = ref([]);
const { runs, nestingCompleted } = storeToRefs(queuesStore);
const nestingInProgress = ref(false);
const showAddDialog = ref(false);
const showUploadDialog = ref(false);
const producerMenu = ref(null);
const selectedProducer = ref(null);
const producerValues = ref({});
const producerFieldOptions = ref({});
const producerParameters = ref({});
const producerQuantity = ref(1);
const producerExecuting = ref(false);
const cassettes = ref([]);
const cassetteDesigns = ref([]);
const sheetDesigns = ref([]);
const warehouses = ref([]);
const libraries = ref([]);
const machines = ref([]);
const project = ref(null);
const availableInventory = ref([]);
const { tools } = storeToRefs(toolProfilesStore);
const viewMode = ref('grid');
const instances = ref([]);
const queueOptions = computed(() => namedSelectOptions(props.queues, t('common.unnamed')));
const queueList = computed(() => [...props.queues].reverse());
const toolOptions = computed(() => namedSelectOptions(tools.value, t('common.unnamed')));
const machineOptions = computed(() => namedSelectOptions(machines.value, t('common.unnamed')));
const warehouseOptions = computed(() => namedSelectOptions(warehouses.value, t('common.unnamed')));
const canCreateQueue = computed(() => authStore.can('queues', 'create'));
const canEditQueue = computed(() => {
    return hasPermissionGrant({
        permissions: authStore.activePermissions,
        feature: 'queues',
        level: 'write',
        entity: props.queue,
        entityType: 'queue'
    });
});
const hasFeatureAccess = (feature, level) => authStore.hasPermission(feature, level);
const canAddQueueEntry = computed(() => producerMenuItems.value.length > 0);
const availableProducers = computed(() => {
    return resolveQueueDesignProducers({
        domain: cncDomain,
        processMode: isProcessMode.value,
        processActions: props.processActions,
        canEditQueue: canEditQueue.value,
        hasFeatureAccess
    });
});
const producerMenuItems = computed(() => availableProducers.value.map(producer => ({
    label: producerLabel(producer),
    command: () => startProducer(producer)
})));
const producerFields = computed(() => {
    const producer = selectedProducer.value;
    if (!producer || producer.kind === 'entitySource') return [];
    if (producer.action) {
        const fields = producer.action.inputPolicy?.fields || producer.action.construction?.inputs || [];
        return producerSourceFields(
            producer,
            producerFieldsForAction(producer.action, fields, ['queue', 'project'])
        );
    }
    return producerSourceFields(producer, constructionFields(producer.constructionMode));
});
const visibleProducerFields = computed(() => producerFields.value.filter(field => !usesServerDefaultTemplate(field)));
const designOptions = computed(() => cassetteDesigns.value.map(design => ({
    label: entitySelectLabel(design, t('entities.cassetteDesign')),
    value: design._id?.toString(),
    entity: design
})));
const libraryOptions = computed(() => libraries.value
    .filter(library => libraryHasReadableTemplates(library))
    .map(library => ({
        label: entitySelectLabel(library, t('entities.library')),
        value: library._id?.toString(),
        entity: library
    })));
const producerParameterNames = computed(() => {
    const template = templateForProducer();
    return template ? getCassetteParameters(template) : [];
});
const uploadProducerActionBody = computed(() => {
    if (!selectedProducer.value?.actionId) return {};
    return {
        data: {
            ...(isProcessMode.value ? { queueAppend: { quantity: 1 } } : {})
        },
        entities: {
            queue: props.queue._id || props.queue.identity?.uid,
            ...(project.value?._id ? { project: project.value._id } : {})
        }
    };
});
const producerReady = computed(() => {
    if (!selectedProducer.value) return false;
    if (selectedProducer.value.kind === 'entitySource') return Boolean(producerValues.value.designId);
    return producerFields.value.every(field => !field.required || hasProducerValue(field));
});
const processRunNestingAction = computed(() => {
    if (!isProcessMode.value) return null;
    return props.processActions
        .find(action => action?.actionKind === 'runCommand' && action.commandId === 'solveNesting') || null;
});

function producerLabel(producer = {}) {
    return producer.labelKey ? t(producer.labelKey) : (producer.label || producer.id);
}

function libraryHasReadableTemplates(library = {}) {
    const libraryId = library._id?.toString?.() || library._id;
    if (!libraryId) return false;
    if ((library.summary?.cassettePreview || []).length > 0) return true;
    return cassettes.value.some(template => {
        const templateLibraryId = template.lineage?.libraryId?.toString?.() || template.lineage?.libraryId;
        return templateLibraryId?.toString() === libraryId.toString();
    });
}

function constructionFields(mode = '') {
    const contract = cncDomain.construction?.cassette_design || {};
    return contract.modeInputs?.[mode] || contract.inputs || [];
}

function producerSourceFields(producer = {}, fields = []) {
    if (producer.constructionMode !== 'bakeCassetteDesignFromTemplate') return fields;
    const byId = new Map(fields.filter(field => field?.id).map(field => [field.id, field]));
    return [
        {
            id: 'libraryId',
            label: t('entities.library'),
            type: 'entity',
            entityType: 'library',
            required: true,
            prompt: true,
            uiOnly: true
        },
        byId.get('templateId') || {
            id: 'templateId',
            label: t('entities.cassetteTemplate'),
            path: 'templateId',
            type: 'entity',
            entityType: 'cassette',
            required: true,
            prompt: true
        },
        ...fields.filter(field => field.id !== 'templateId')
    ];
}

function availableTemplateEntities() {
    const selectedLibraryId = producerValues.value.libraryId?.toString?.() || producerValues.value.libraryId;
    if (selectedLibraryId) {
        return cassettes.value.filter(template => {
            const libraryId = template.lineage?.libraryId?.toString?.() || template.lineage?.libraryId;
            return libraryId?.toString() === selectedLibraryId.toString();
        });
    }
    return templatesAvailableToProject(cassettes.value, project.value?.relations?.cassetteLibraries || []);
}

async function loadTemplatesForSelectedLibrary() {
    const selectedLibraryId = producerValues.value.libraryId?.toString?.() || producerValues.value.libraryId;
    if (!selectedLibraryId) {
        producerFieldOptions.value.templateId = [];
        producerValues.value.templateId = null;
        syncProducerParameters();
        return;
    }
    const scoped = await optionalList(() => $fetch('/api/cassettes', {
        query: { libraryId: selectedLibraryId }
    }));
    const known = new Map(cassettes.value.map(template => [template._id?.toString?.() || template._id, template]));
    for (const template of scoped) {
        const id = template._id?.toString?.() || template._id;
        if (id) known.set(id, template);
    }
    cassettes.value = Array.from(known.values());
    producerFieldOptions.value.templateId = scoped.map(template => ({
        label: entitySelectLabel(template, t('entities.cassette')),
        value: template._id?.toString(),
        entity: template
    }));
    producerValues.value.templateId = producerFieldOptions.value.templateId.length === 1
        ? producerFieldOptions.value.templateId[0].value
        : null;
    syncProducerParameters();
}

async function onProducerFieldChange(field = {}) {
    if (field.id === 'libraryId') {
        await loadTemplatesForSelectedLibrary();
        return;
    }
    if (field.id === 'templateId') syncProducerParameters();
}

async function startProducer(producer) {
    selectedProducer.value = producer;
    producerValues.value = {};
    producerFieldOptions.value = {};
    producerParameters.value = {};
    producerQuantity.value = 1;
    if (producer.constructionMode === 'importCassetteDesignFromArtifact') {
        showUploadDialog.value = true;
        return;
    }
    for (const field of producerFields.value) {
        if (field.default !== undefined) producerValues.value[field.id] = field.default;
        if (field.type === 'entity' || field.type === 'entityList') {
            producerFieldOptions.value[field.id] = await loadProducerEntityOptions(field);
            if (field.required && producerFieldOptions.value[field.id].length === 1) {
                const value = producerFieldOptions.value[field.id][0].value;
                producerValues.value[field.id] = field.type === 'entityList' ? [value] : value;
            }
        }
    }
    syncProducerParameters();
    showAddDialog.value = true;
}

async function loadProducerEntityOptions(field = {}) {
    const entityType = field.entityType || field.accepts?.[0] || '';
    const entities = entityType === 'library'
        ? libraries.value
        : entityType === 'cassette'
        ? availableTemplateEntities()
        : entityType === 'cassette_design'
            ? cassetteDesigns.value
            : await optionalList(() => $fetch(`/api/${domainCollection(entityType)}`));
    return entities.map(entity => ({
        label: entitySelectLabel(entity, entityType),
        value: entity._id?.toString(),
        entity
    }));
}

function domainCollection(entityType = '') {
    return (cncDomain.entities || []).find(entity => entity.type === entityType)?.collection || `${entityType}s`;
}

function hasProducerValue(field = {}) {
    if (usesServerDefaultTemplate(field)) return true;
    if (field.type === 'cassetteParameters') return true;
    const value = producerValues.value[field.id];
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== '';
}

function usesServerDefaultTemplate(field = {}) {
    if (selectedProducer.value?.constructionMode === 'bakeCassetteDesignFromTemplate') return false;
    return isProcessMode.value
        && selectedProducer.value?.constructionMode === 'bakeCassetteDesignFromTemplate'
        && field.id === 'templateId'
        && (producerFieldOptions.value[field.id] || []).length === 0;
}

function templateForProducer() {
    const templateId = producerValues.value.templateId;
    return cassettes.value.find(template => template._id?.toString() === templateId?.toString()) || null;
}

function selectedMaterialThickness() {
    if (nestingOptions.value.materialMode === 'WAREHOUSE') {
        return Number(selectedMaterialPool.value[0]?.dimensions?.thickness || 0) || null;
    }
    return Number(nestingOptions.value.virtualThickness || 0) || null;
}

function syncProducerParameters() {
    const template = templateForProducer();
    if (!template) {
        const thickness = selectedMaterialThickness();
        producerParameters.value = thickness ? { T: thickness } : {};
        return;
    }
    const definitions = template.data?.definition?.parameters || {};
    const thickness = selectedMaterialThickness();
    producerParameters.value = Object.fromEntries(getCassetteParameters(template).map(name => {
        const definition = definitions[name] || {};
        const value = name === 'T' && thickness
            ? thickness
            : Number(definition.default ?? definition.value ?? definition.min ?? 0);
        return [name, Number.isFinite(value) ? value : 0];
    }));
}

function producerData() {
    const data = {};
    for (const field of producerFields.value) {
        if (field.uiOnly) continue;
        let value = field.type === 'cassetteParameters' ? producerParameters.value : producerValues.value[field.id];
        if (field.type === 'object' && typeof value === 'string') {
            try { value = JSON.parse(value || '{}'); } catch { value = {}; }
        }
        if (value !== undefined && value !== '') setProducerPath(data, field.path || field.id, value);
    }
    return data;
}

function setProducerPath(target, path, value) {
    const parts = String(path || '').split('.').filter(Boolean);
    let cursor = target;
    while (parts.length > 1) {
        const key = parts.shift();
        cursor[key] ||= {};
        cursor = cursor[key];
    }
    if (parts[0]) cursor[parts[0]] = value;
}

function isAcceptedRun(run = {}) {
    return props.queue.data?.materialConsumption?.runId?.toString() === run._id?.toString();
}

async function executeSelectedProducer() {
    if (!producerReady.value || producerExecuting.value) return;
    producerExecuting.value = true;
    try {
        let produced;
        if (selectedProducer.value.kind === 'entitySource') {
            produced = cassetteDesigns.value.find(design => design._id?.toString() === producerValues.value.designId?.toString());
            if (isProcessMode.value) {
                if (!produced) throw new Error(t('queues.invalidCassetteEntry'));
                await appendExistingDesignInProcessMode(produced);
                showAddDialog.value = false;
                return;
            }
        } else if (selectedProducer.value.actionId) {
            const data = producerData();
            const request = buildProducerActionRequest({
                action: selectedProducer.value.action,
                fields: producerFields.value,
                values: producerValues.value,
                data: {
                    ...data,
                    ...(isProcessMode.value ? { queueAppend: { quantity: producerQuantity.value } } : {})
                },
                contextEntities: { queue: props.queue, project: project.value }
            });
            request.entities = {
                ...(request.entities || {}),
                queue: props.queue._id || props.queue.identity?.uid,
                ...(project.value?._id ? { project: project.value._id } : {})
            };
            produced = await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(selectedProducer.value.actionId)}/execute`, {
                method: 'POST',
                body: request
            });
            if (isProcessMode.value) {
                const design = await resolveProducedDesign(produced);
                if (!design) throw new Error(t('queues.invalidCassetteEntry'));
                await loadQueueData();
                emit('updated');
                showAddDialog.value = false;
                return;
            }
        } else if (selectedProducer.value.constructionMode === 'bakeCassetteDesignFromTemplate') {
            const data = producerData();
            produced = await $fetch(`/api/cassettes/${encodeURIComponent(data.templateId)}/designs`, {
                method: 'POST',
                body: { parameters: data.parameters || {}, name: data.name || '' }
            });
        }
        const design = await resolveProducedDesign(produced);
        if (!design) throw new Error(t('queues.invalidCassetteEntry'));
        await addEntry(design, producerQuantity.value);
        showAddDialog.value = false;
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: requestErrorMessage(error) });
    } finally {
        producerExecuting.value = false;
    }
}

async function appendExistingDesignInProcessMode(design) {
    await $fetch(`/api/process-definitions/active/queues/${encodeURIComponent(props.queue._id || props.queue.identity?.uid)}/items`, {
        method: 'POST',
        body: {
            designId: design._id,
            quantity: producerQuantity.value
        }
    });
    await loadQueueData();
    emit('updated');
}

async function resolveProducedDesign(result) {
    const entity = result?.design || result?.entity || (result?.data?.geometry ? result : null);
    if (entity?._id) {
        if (!cassetteDesigns.value.some(item => item._id?.toString() === entity._id?.toString())) cassetteDesigns.value.push(entity);
        return entity;
    }
    const ref = (result?.entities || []).find(item => item?.type === 'cassette_design');
    return ref?.id ? await $fetch(`/api/cassette-designs/${encodeURIComponent(ref.id)}`) : null;
}
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
    const thickness = Number(specs.thickness || entity.data?.thickness || 0);
    return { width, length, thickness };
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
    machineId: nestingOptions.value.machineId,
    virtualWidth: nestingOptions.value.virtualWidth,
    virtualLength: nestingOptions.value.virtualLength,
    virtualThickness: nestingOptions.value.virtualThickness,
    inventoryItems: nestingOptions.value.inventoryItems,
    materialPool: selectedMaterialPool.value,
    toolProfileId: nestingOptions.value.toolProfileId
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
    `entry_${item.id || 'unknown'}_${index}`
);

const queueItemEntityType = (item = {}, entity = null) => (
    item.entityType || (entity ? 'cassette_design' : '')
);

const makeQueueEntry = (item = {}, index = 0) => {
    const canonical = canonicalQueueItem(item, { cassettes: cassettes.value, cassetteDesigns: cassetteDesigns.value }) || item;
    const id = canonical.id || '';
    return {
        ...canonical,
        id,
        _key: entryKeyFor({ ...canonical, id }, index),
        entityType: queueItemEntityType(canonical),
        dimensions: canonical.parameters || canonical.dimensions || {},
        type: canonical.type || 'STATIC'
    };
};

const getCassetteData = (id) => {
    const idStr = id?.toString();
    if (!idStr) return null;
    return cassetteDesigns.value.find(d => d._id?.toString() === idStr)
        || cassettes.value.find(template => template._id?.toString() === idStr);
};
const getEntryEntityData = (entry = {}) => {
    const idStr = entry?.id?.toString();
    if (!idStr) return null;
    if (entry.entityType === 'cassette') {
        return cassettes.value.find(template => template._id?.toString() === idStr) || null;
    }
    if (entry.entityType === 'cassette_design') {
        return cassetteDesigns.value.find(design => design._id?.toString() === idStr) || null;
    }
    return getCassetteData(idStr);
};

const getCassetteName = (id) => {
    const data = getCassetteData(id);
    if (!data) return t('common.unknown');
    return data.identity?.name || data.identity?.slug || t('common.unnamed');
};

const isCassetteDesignEntity = (data) => Boolean(data?.data?.geometry || data?.data?.polygonParts || data?.data?.layerData);
const getCassetteParameters = (data) => {
    const explicit = data?.data?.parameters;
    if (Array.isArray(explicit) && explicit.length) return explicit;
    if (explicit && typeof explicit === 'object') return Object.keys(explicit);
    return occsParameterNames(data?.data?.definition || {});
};
const getEntryCassetteData = (entry) => getCassetteData(entry?.id);
const isParametricEntry = (entry) => {
    return entry?.type === 'PARAMETRIC';
};

const getEntryParameters = (e) => {
    const data = getEntryEntityData(e);
    return data && e?.type === 'PARAMETRIC' ? getCassetteParameters(data) : [];
};

const allParameters = computed(() => {
    const params = new Set();
    entries.value.forEach(e => {
        const data = getEntryEntityData(e);
        if (data) {
            getCassetteParameters(data).forEach(p => params.add(p));
        }
    });
    return Array.from(params);
});

const resolveUploadedQueueItem = (payload) => {
    if (!payload) return null;
    const design = payload.design || (payload.data?.geometry ? payload : null);
    if (design) {
        if (!cassetteDesigns.value.some(item => item._id?.toString() === design._id?.toString())) {
            cassetteDesigns.value.push(design);
        }
        return design;
    }

    return null;
};

const defaultNestingSettings = () => ({
    materialMode: 'VIRTUAL',
    virtualWidth: 3000,
    virtualLength: 1500,
    virtualThickness: null,
    machineId: 'machine-system-default',
    warehouseId: null,
    inventoryItems: [],
    toolProfileId: null,
    requestedArtifacts: []
});

const queueNestingSettings = (queue = {}) => {
    const settings = queue.data?.nestingSettings || {};
    return {
        ...defaultNestingSettings(),
        ...settings,
        toolProfileId: settings.toolProfileId || null,
        inventoryItems: Array.isArray(settings.inventoryItems) ? [...settings.inventoryItems] : [],
        requestedArtifacts: Array.isArray(settings.requestedArtifacts) ? [...settings.requestedArtifacts] : []
    };
};

const nestingOptions = ref(queueNestingSettings(props.queue));

const queueRuns = computed(() => runs.value[props.queue._id] || []);
const canReadNestingRun = (run = {}) => hasPermissionGrant({
    permissions: authStore.activePermissions,
    feature: 'nesting_runs',
    level: 'read',
    entity: run,
    entityType: 'nesting_run'
});
const readableQueueRuns = computed(() => isProcessMode.value ? queueRuns.value.filter(canReadNestingRun) : queueRuns.value);
const currentRun = computed(() => currentQueueRun(readableQueueRuns.value, props.queue));
const showNestingRunRegion = computed(() => !isProcessMode.value || Boolean(currentRun.value) || canRunNesting.value);
const activeRun = computed(() => currentRun.value);
const hasPhysicalOutputs = computed(() => Boolean(props.queue.data?.physicalOutputs?.cassetteInstanceIds?.length));
const warehouseShortage = computed(() => {
    if (nestingOptions.value.materialMode !== 'WAREHOUSE') return null;
    if (queueRuns.value.length === 0) return null;

    const latestRun = queueRuns.value[queueRuns.value.length - 1];
    if (!runSheetCount(latestRun)) return null;

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
    if (!nestingOptions.value.machineId || !nestingOptions.value.toolProfileId) return false;

    if (nestingOptions.value.materialMode === 'WAREHOUSE') {
        if (nestingOptions.value.inventoryItems.length === 0) return false;
        if (selectedStockSizeConflict.value) return false;
        if (!selectedMaterialPool.value.every(item => Number(item.dimensions?.thickness) > 0)) return false;
    } else if (!(Number(nestingOptions.value.virtualThickness) > 0)) {
        return false;
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

const runSheetCount = (run = {}) => Number(run.data?.results?.sheetCount || run.summary?.sheetCount || run.layoutCount || 0);
const runParams = (run = {}) => run.data?.params || run.params || {};

const loadQueueData = async () => {
    try {
        const data = await queuesStore.getQueue(props.queue._id);
        if (data) {
            entries.value = (data.data?.job?.items || []).map(makeQueueEntry);
            entries.value.forEach(syncEntryWithCassette);
            await hydrateMissingEntryDesigns();
            entries.value.forEach(syncEntryWithCassette);
            nestingOptions.value = queueNestingSettings(data);
            if (nestingOptions.value.warehouseId) {
                await loadWarehouseInventory();
            } else {
                availableInventory.value = [];
            }
            if (hasPhysicalOutputs.value) loadInstances();
        }
    } catch (e) { console.error('Failed to load queue data:', e); }
};

const hydrateMissingEntryDesigns = async () => {
    const missingIds = Array.from(new Set(entries.value
        .filter(entry => entry.entityType !== 'cassette')
        .map(entry => entry.id?.toString?.() || entry.id)
        .filter(Boolean)
        .filter(id => !cassetteDesigns.value.some(design => design._id?.toString?.() === id.toString()))));
    if (!missingIds.length) return;
    const loaded = await Promise.all(missingIds.map(id => (
        $fetch(`/api/cassette-designs/${encodeURIComponent(id)}`).catch(() => null)
    )));
    for (const design of loaded.filter(Boolean)) {
        if (!cassetteDesigns.value.some(item => item._id?.toString?.() === design._id?.toString())) {
            cassetteDesigns.value.push(design);
        }
    }
};

const loadSheetDesigns = async () => {
    try {
        const runIds = activeRun.value?._id ? [activeRun.value._id.toString()] : [];
        sheetDesigns.value = await $fetch('/api/sheet-designs', {
            query: runIds.length
                ? { queueId: props.queue._id, runIds: runIds.join(',') }
                : { queueId: props.queue._id }
        });
    } catch (e) {
        console.error('Failed to load sheet designs:', e);
        sheetDesigns.value = [];
    }
};

let queueRunRefreshPromise = null;
const refreshQueueAfterRunTransition = async () => {
    if (queueRunRefreshPromise) return queueRunRefreshPromise;

    queueRunRefreshPromise = (async () => {
        await queuesStore.fetchRuns(props.queue._id);
        await Promise.all([
            loadQueueData(),
            loadSheetDesigns()
        ]);
        if (hasPhysicalOutputs.value) {
            await loadInstances();
        }
        emit('updated');
    })().finally(() => {
        queueRunRefreshPromise = null;
    });

    return queueRunRefreshPromise;
};

const handleRunStatusChanged = async () => {
    try {
        await refreshQueueAfterRunTransition();
    } catch (e) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: e.message });
    }
};

onMounted(async () => {
    const projectId = props.queue.lineage?.projectId;
    const [cassetteResult, designResult, libraryResult, whRes, machineResult, projectResult] = await Promise.all([
        optionalList(() => cassettesStore.fetchCassettes()),
        optionalList(() => $fetch('/api/cassette-designs')),
        optionalList(() => $fetch('/api/libraries')),
        optionalList(() => $fetch('/api/warehouses')),
        optionalList(() => $fetch('/api/machines')),
        projectId ? $fetch(`/api/project/${encodeURIComponent(projectId)}`).catch(() => null) : null
    ]);
    cassettes.value = cassetteResult || [];
    cassetteDesigns.value = designResult || [];
    libraries.value = libraryResult || [];
    warehouses.value = whRes || [];
    machines.value = machineResult || [];
    project.value = projectResult;
    await toolProfilesStore.fetchTools();
    await queuesStore.fetchRuns(props.queue._id);
    await loadSheetDesigns();
    loadQueueData();
});

const stopEntityChangeListener = onEntityChanged(async ({ type, id, entity }) => {
    const queueId = props.queue._id?.toString();
    if (type === 'queue' && id?.toString() === queueId) {
        await loadQueueData();
        return;
    }

    if (type !== 'nesting_run') return;

    const runQueueId = entity?.lineage?.queueId?.toString?.() || entity?.lineage?.queueId;
    const knownRun = queueRuns.value.some(run => run._id?.toString() === id?.toString());
    if (runQueueId?.toString() === queueId || knownRun) {
        await refreshQueueAfterRunTransition();
    }
});

onUnmounted(() => {
    stopEntityChangeListener();
});

watch(nestingCompleted, async (event) => {
    const queueId = typeof event === 'object' ? event?.queueId : event;
    if (queueId?.toString() === props.queue._id?.toString()) {
        await loadSheetDesigns();
    }
});

watch(() => props.queue._id, async () => {
    await loadQueueData();
    await queuesStore.fetchRuns(props.queue._id);
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

    const type = entry.type === 'PARAMETRIC' || Object.prototype.hasOwnProperty.call(entry.dimensions || {}, 'T') ? 'PARAMETRIC' : 'STATIC';
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
    if (param === 'T') return;
    entry.dimensions = {
        ...(entry.dimensions || {}),
        [param]: value
    };
    await saveQueue({ notify: false });
};

const addEntry = async (item = null, quantity = 1) => {
    if (!canEditQueue.value) return;
    const data = item;
    if (!data || !isCassetteDesignEntity(data)) throw new Error(t('queues.invalidCassetteEntry'));
    const parameters = { ...(data.data?.parameters || {}) };
    const type = Object.prototype.hasOwnProperty.call(parameters, 'T') ? 'PARAMETRIC' : 'STATIC';

    entries.value.push(syncEntryWithCassette({
        quantity: Number(quantity || 1),
        dimensions: parameters,
        _key: `entry_${data._id}_${Date.now()}_${entries.value.length}`,
        entityType: 'cassette_design',
        type,
        id: data._id
    }));

    await saveQueue();
    showAddDialog.value = false;
};

const saveQueue = async ({ notify = true } = {}) => {
    if (!canEditQueue.value) return false;
    try {
        entries.value.forEach(syncEntryWithCassette);
        const invalidEntry = entries.value.find(entry => entry.entityType !== 'cassette_design' || !getEntryCassetteData(entry));
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
                        id: e.id,
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
            const refreshedRuns = await queuesStore.fetchRuns(queueId);
            queuesStore.pollQueueStatus(queueId);
            emit('updated');
        } else {
            await saveQueue();
            await queuesStore.startNesting(queueId);
            await queuesStore.fetchRuns(queueId);
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

const chooseRunHandler = async (id) => {
    try {
        await queuesStore.chooseRun(props.queue._id, id);
        await refreshQueueAfterRunTransition();
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
    if (isProcessMode.value && selectedProducer.value?.actionId) {
        await loadQueueData();
        emit('updated');
        return;
    }
    const [cRes, dRes] = await Promise.all([
        optionalList(() => cassettesStore.fetchCassettes()),
        optionalList(() => $fetch('/api/cassette-designs'))
    ]);
    cassettes.value = cRes || [];
    cassetteDesigns.value = dRes || [];
    const queueItem = resolveUploadedQueueItem(newItem);
    if (queueItem) await addEntry(queueItem, 1);
};
</script>
