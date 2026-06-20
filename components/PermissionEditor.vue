<template>
    <div class="flex min-h-0 flex-col gap-4">
        <div class="flex flex-col gap-1">
            <h3 class="m-0">{{ $t('auth.featureAccessControl') }}</h3>
            <p class="m-0 text-muted-color">{{ $t('auth.featureAccessControlHelp') }}</p>
        </div>

        <div class="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
            <Panel :header="$t('auth.permissionFeatures')">
                <div class="flex flex-col gap-2">
                    <button
                        v-for="feature in entities"
                        :key="feature.key"
                        type="button"
                        class="flex min-w-0 items-center justify-between gap-3 rounded-ui border border-content-border bg-content px-3 py-2 text-left"
                        :class="selectedFeatureKey === feature.key ? 'border-primary' : ''"
                        @click="selectedFeatureKey = feature.key"
                    >
                        <span class="flex min-w-0 items-center gap-2">
                            <i :class="getIcon(feature.key)" aria-hidden="true"></i>
                            <span class="truncate">{{ feature.label }}</span>
                        </span>
                        <Tag :value="featureSummary(feature.key)" :severity="featureSummarySeverity(feature.key)" size="small" />
                    </button>
                </div>
            </Panel>

            <div class="flex min-w-0 flex-col gap-4">
                <Panel>
                    <template #header>
                        <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
                            <div class="flex min-w-0 flex-col">
                                <strong class="truncate">{{ selectedFeature.label }}</strong>
                                <small class="text-muted-color">{{ $t('auth.permissionGrantCount', { count: selectedGrants.length }) }}</small>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <Button icon="pi pi-plus" :label="$t('auth.addGrant')" size="small" @click="addGrant" />
                                <Button icon="pi pi-ban" :label="$t('auth.noAccess')" severity="secondary" outlined size="small" @click="clearFeature" />
                            </div>
                        </div>
                    </template>

                    <div class="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
                        <div class="flex min-w-0 flex-col gap-2">
                            <button
                                v-for="(grant, index) in selectedGrants"
                                :key="index"
                                type="button"
                                class="flex min-w-0 flex-col gap-2 rounded-ui border border-content-border bg-content px-3 py-2 text-left"
                                :class="selectedGrantIndex === index ? 'border-primary' : ''"
                                @click="selectedGrantIndex = index"
                            >
                                <span class="flex min-w-0 items-center justify-between gap-2">
                                    <strong>{{ getLevelLabel(grant.level) }}</strong>
                                    <small class="text-muted-color">{{ grantModeLabel(grant) }}</small>
                                </span>
                            </button>
                            <Message v-if="selectedGrants.length === 0" severity="info">{{ $t('auth.noPermissionGrants') }}</Message>
                        </div>

                        <div v-if="selectedGrants.length === 0" class="flex min-w-0 flex-col gap-3">
                            <Message severity="info">{{ $t('auth.permissionNoGrantSelected') }}</Message>
                            <div>
                                <Button icon="pi pi-plus" :label="$t('auth.addGrant')" @click="addGrant" />
                            </div>
                        </div>

                        <div v-else-if="selectedGrant" class="flex min-w-0 flex-col gap-4">
                            <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,16rem)_auto] md:items-end">
                                <div class="flex flex-col gap-2">
                                    <label>{{ $t('auth.permissionLevel') }}</label>
                                    <Select
                                        :model-value="selectedGrant.level"
                                        :options="PERMISSION_LEVELS"
                                        option-label="label"
                                        option-value="value"
                                        class="w-full"
                                        @update:model-value="value => updateGrant({ level: value })"
                                    />
                                </div>
                                <div class="flex justify-end">
                                    <Button icon="pi pi-trash" :label="$t('auth.removeGrant')" severity="danger" outlined size="small" @click="removeGrant(selectedGrantIndex)" />
                                </div>
                            </div>

                            <Panel v-if="selectedFeature.actions?.length" :header="$t('auth.permissionActions')">
                                <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
                                    <label
                                        v-for="action in selectedFeature.actions"
                                        :key="action"
                                        class="flex items-center gap-2"
                                    >
                                        <Checkbox
                                            :model-value="isGrantActionEnabled(selectedGrant, action)"
                                            binary
                                            @update:model-value="value => setGrantAction(action, value)"
                                        />
                                        <span>{{ getActionLabel(action) }}</span>
                                    </label>
                                </div>
                            </Panel>

                            <Panel :header="$t('auth.permissionFilterBuilder')">
                                <p class="m-0 mb-3 text-sm text-muted-color">
                                    {{ $t('auth.permissionFilterBuilderHelp') }}
                                </p>
                                <div class="flex flex-col gap-3">
                                    <div class="grid grid-cols-1 gap-3 md:grid-cols-[12rem_minmax(0,1fr)] md:items-end">
                                        <div class="flex flex-col gap-1">
                                            <label>{{ $t('auth.permissionMatch') }}</label>
                                            <Select
                                                :model-value="filterGate(selectedGrant)"
                                                :options="gateOptions"
                                                option-label="label"
                                                option-value="value"
                                                @update:model-value="setFilterGate"
                                            />
                                        </div>
                                    </div>

                                    <div class="flex flex-col gap-2">
                                        <div
                                            v-for="(clause, index) in filterClauses(selectedGrant)"
                                            :key="`${clause.fact}-${clause.field || ''}-${index}`"
                                            class="grid grid-cols-1 gap-2 rounded-ui border border-content-border p-3 xl:grid-cols-[12rem_12rem_10rem_minmax(14rem,1fr)_6rem_auto]"
                                        >
                                            <Select
                                                :model-value="clauseTarget(clause)"
                                                :options="filterTargetOptions"
                                                option-label="label"
                                                option-value="value"
                                                @update:model-value="value => updateClauseTarget(index, value)"
                                            />
                                            <Select
                                                v-if="clauseTarget(clause) !== 'custom'"
                                                :model-value="clauseTrait(clause)"
                                                :options="traitOptionsForTarget(clauseTarget(clause))"
                                                option-label="label"
                                                option-value="value"
                                                @update:model-value="value => updateClauseTrait(index, value)"
                                            />
                                            <InputText
                                                v-else
                                                :model-value="clause.field"
                                                :placeholder="$t('auth.permissionFieldPath')"
                                                @update:model-value="value => updateFilterClause(index, { field: value })"
                                            />
                                            <Select
                                                :model-value="clause.operator"
                                                :options="conditionOperatorOptions"
                                                option-label="label"
                                                option-value="value"
                                                @update:model-value="value => updateFilterClause(index, { operator: value })"
                                            />
                                            <MultiSelect
                                                v-if="usesOptionValuePicker(clause) && clause.operator === 'in'"
                                                :model-value="clauseValueList(clause)"
                                                :options="valueOptionsForClause(clause)"
                                                option-label="label"
                                                option-value="value"
                                                filter
                                                display="chip"
                                                class="w-full"
                                                :loading="entityOptionsLoading"
                                                :placeholder="$t('auth.permissionSelectValues')"
                                                @update:model-value="values => updateFilterClause(index, { value: values.join(', ') })"
                                            />
                                            <Select
                                                v-else-if="usesOptionValuePicker(clause)"
                                                :model-value="clause.value"
                                                :options="valueOptionsForClause(clause)"
                                                option-label="label"
                                                option-value="value"
                                                filter
                                                show-clear
                                                class="w-full"
                                                :loading="entityOptionsLoading"
                                                :placeholder="$t('auth.permissionSelectValue')"
                                                @update:model-value="value => updateFilterClause(index, { value })"
                                            />
                                            <InputText
                                                v-else
                                                :model-value="clause.value"
                                                :placeholder="clause.operator === 'exists' ? $t('auth.permissionBooleanValue') : $t('auth.permissionConditionValue')"
                                                @update:model-value="value => updateFilterClause(index, { value })"
                                            />
                                            <label class="flex items-center gap-2">
                                                <Checkbox
                                                    :model-value="clause.negated === true"
                                                    binary
                                                    @update:model-value="value => updateFilterClause(index, { negated: value })"
                                                />
                                                <span>{{ $t('auth.permissionNot') }}</span>
                                            </label>
                                            <Button icon="pi pi-trash" severity="danger" text rounded :aria-label="$t('common.delete')" @click="removeFilterClause(index)" />
                                        </div>
                                    </div>

                                    <div class="grid grid-cols-1 gap-2 border-t pt-3 xl:grid-cols-[12rem_12rem_10rem_minmax(14rem,1fr)_6rem_auto]">
                                        <Select
                                            v-model="filterDraft.target"
                                            :options="filterTargetOptions"
                                            option-label="label"
                                            option-value="value"
                                            @update:model-value="setDraftTarget"
                                        />
                                        <Select
                                            v-if="filterDraft.target !== 'custom'"
                                            v-model="filterDraft.trait"
                                            :options="traitOptionsForTarget(filterDraft.target)"
                                            option-label="label"
                                            option-value="value"
                                            @update:model-value="setDraftTrait"
                                        />
                                        <InputText
                                            v-else
                                            v-model="filterDraft.field"
                                            :placeholder="$t('auth.permissionFieldPath')"
                                        />
                                        <Select
                                            v-model="filterDraft.operator"
                                            :options="conditionOperatorOptions"
                                            option-label="label"
                                            option-value="value"
                                        />
                                        <MultiSelect
                                            v-if="draftUsesOptionValuePicker && filterDraft.operator === 'in'"
                                            v-model="filterDraft.valueList"
                                            :options="valueOptionsForDraft"
                                            option-label="label"
                                            option-value="value"
                                            filter
                                            display="chip"
                                            class="w-full"
                                            :loading="entityOptionsLoading"
                                            :placeholder="$t('auth.permissionSelectValues')"
                                        />
                                        <Select
                                            v-else-if="draftUsesOptionValuePicker"
                                            v-model="filterDraft.value"
                                            :options="valueOptionsForDraft"
                                            option-label="label"
                                            option-value="value"
                                            filter
                                            show-clear
                                            class="w-full"
                                            :loading="entityOptionsLoading"
                                            :placeholder="$t('auth.permissionSelectValue')"
                                        />
                                        <InputText
                                            v-else
                                            v-model="filterDraft.value"
                                            :placeholder="filterDraft.operator === 'exists' ? $t('auth.permissionBooleanValue') : $t('auth.permissionConditionValue')"
                                        />
                                        <label class="flex items-center gap-2">
                                            <Checkbox v-model="filterDraft.negated" binary />
                                            <span>{{ $t('auth.permissionNot') }}</span>
                                        </label>
                                        <Button icon="pi pi-plus" :label="$t('auth.addFilterClause')" size="small" outlined @click="addFilterClause" />
                                    </div>
                                </div>
                            </Panel>

                            <Panel :header="$t('auth.advancedPermissionJson')" toggleable collapsed>
                                <Textarea
                                    :model-value="selectedGrantJson"
                                    rows="8"
                                    auto-resize
                                    class="w-full font-mono text-xs"
                                    @update:model-value="selectedGrantJson = $event"
                                    @blur="applySelectedGrantJson"
                                />
                                <small v-if="selectedGrantError" class="text-red-500">
                                    {{ selectedGrantError }}
                                </small>
                            </Panel>
                        </div>
                    </div>
                </Panel>
            </div>
        </div>

        <div class="flex justify-end gap-3 border-t pt-4">
            <Button :label="$t('common.cancel')" text severity="secondary" @click="reset" />
            <Button :label="$t('common.save')" icon="pi pi-shield" @click="save" />
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Checkbox from 'primevue/checkbox';
import Textarea from 'primevue/textarea';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import { useEntity } from '~/composables/useEntity';
import { useAuthStore } from '~/stores/auth';
import { cncWorkflows } from '@cutkit/domain-cnc';

const props = defineProps({
    permissions: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['save']);
const { t } = useI18n();
const authStore = useAuthStore();

const selectedFeatureKey = ref('projects');
const selectedGrantIndex = ref(0);
const selectedGrantJson = ref('');
const selectedGrantError = ref('');
const filterDraft = ref({ target: 'entity', trait: 'status', operator: 'equals', field: '', value: '', valueList: [], negated: false });
const entityOptionsLoading = ref(false);
const entityOptionLists = ref({});
const entityLoaders = {
    artifact: useEntity('artifact'),
    catalog: useEntity('catalog'),
    cassetteInstance: useEntity('cassetteInstance'),
    cassetteTemplate: useEntity('cassetteTemplate'),
    geometryCapture: useEntity('geometryCapture'),
    material: useEntity('material'),
    nestingRun: useEntity('nestingRun'),
    project: useEntity('project'),
    queue: useEntity('queue'),
    requisition: useEntity('requisition'),
    sheetDesign: useEntity('sheetDesign'),
    user: useEntity('user'),
    warehouse: useEntity('warehouse')
};

const FEATURE_ENTITY_TYPE = {
    artifacts: 'artifact',
    catalogs: 'catalog',
    cassettes: 'cassetteInstance',
    geometry_captures: 'geometryCapture',
    materials: 'material',
    nesting_runs: 'nestingRun',
    projects: 'project',
    requisitions: 'requisition',
    queues: 'queue',
    sheet_designs: 'sheetDesign',
    users: 'user',
    warehouses: 'warehouse',
    organizations: 'organization'
};

const REFERENCE_TARGET_ENTITY_TYPE = {
    organization: 'organization',
    project: 'project',
    queue: 'queue',
    warehouse: 'warehouse'
};

const PERMISSION_LEVELS = computed(() => [
    { label: t('auth.permissionLevels.read'),  value: 'read' },
    { label: t('auth.permissionLevels.write'), value: 'write' },
    { label: t('auth.permissionLevels.admin'), value: 'admin' }
]);

const entities = computed(() => [
    { key: 'projects',      label: t('features.projects') },
    { key: 'queues',        label: t('features.queues'), actions: ['view', 'edit', 'run', 'delete'] },
    { key: 'nesting_runs',  label: t('entities.nestingRun'), actions: ['view', 'run', 'delete'] },
    { key: 'artifacts',     label: t('entities.artifact'), actions: ['view', 'create', 'delete'] },
    { key: 'cassettes',     label: t('features.cassettes') },
    { key: 'warehouses',    label: t('features.warehouses') },
    { key: 'catalogs',      label: t('features.catalogs'), actions: ['view', 'view_all', 'create', 'edit', 'delete'] },
    { key: 'requisitions',  label: t('features.requisitions'), actions: ['view', 'create', 'edit', 'approve', 'reject', 'fulfill', 'delete'] },
    { key: 'materials',     label: t('features.materials') },
    { key: 'layer_standards', label: t('features.layerStandards'), actions: ['setPen'] },
    { key: 'users',         label: t('features.users') },
    { key: 'organizations', label: t('features.organizations') },
    { key: 'workbench',     label: t('admin.workbench.title') },
    { key: 'domain_builder', label: t('admin.domainBuilder.title') },
    { key: 'config_bot',    label: t('features.configBot') }
]);

const scopeFields = computed(() => [
    { key: 'organizationId', label: t('auth.scope.organizationId') },
    { key: 'projectId', label: t('auth.scope.projectId') },
    { key: 'queueId', label: t('auth.scope.queueId') },
    { key: 'warehouseId', label: t('auth.scope.warehouseId') },
    { key: 'entityId', label: t('auth.scope.entityId') },
    { key: 'entityType', label: t('auth.scope.entityType') }
]);

const gateOptions = computed(() => [
    { label: t('auth.permissionGates.all'), value: 'all' },
    { label: t('auth.permissionGates.any'), value: 'any' }
]);

const filterTargetOptions = computed(() => [
    { label: t('auth.permissionTargets.entity'), value: 'entity' },
    { label: t('auth.permissionTargets.organization'), value: 'organization' },
    { label: t('auth.permissionTargets.project'), value: 'project' },
    { label: t('auth.permissionTargets.queue'), value: 'queue' },
    { label: t('auth.permissionTargets.warehouse'), value: 'warehouse' },
    { label: t('auth.permissionTargets.transition'), value: 'transition' },
    { label: t('auth.permissionTargets.custom'), value: 'custom' }
]);

const FACT_BY_TARGET_TRAIT = {
    entity: {
        id: 'entityId',
        type: 'entityType',
        status: 'status.primary'
    },
    organization: {
        id: 'lineage.organizationId',
        type: 'lineage.organization.type'
    },
    project: {
        id: 'lineage.projectId',
        type: 'lineage.project.type',
        status: 'lineage.project.status.primary'
    },
    queue: {
        id: 'lineage.queueId',
        type: 'lineage.queue.type',
        status: 'lineage.queue.status.primary'
    },
    warehouse: {
        id: 'lineage.warehouseId',
        type: 'lineage.warehouse.type'
    },
    transition: {
        from: 'transition.from',
        to: 'transition.to'
    },
    custom: { path: 'field' }
};

const TARGET_TRAIT_BY_FACT = Object.fromEntries(
    Object.entries(FACT_BY_TARGET_TRAIT).flatMap(([target, traits]) => (
        Object.entries(traits).map(([trait, fact]) => [fact, { target, trait }])
    ))
);

const SCOPE_FACT_BY_KEY = {
    organizationId: 'lineage.organizationId',
    projectId: 'lineage.projectId',
    queueId: 'lineage.queueId',
    warehouseId: 'lineage.warehouseId',
    entityId: 'entityId',
    entityType: 'entityType'
};
const SCOPE_KEY_BY_FACT = Object.fromEntries(Object.entries(SCOPE_FACT_BY_KEY).map(([key, fact]) => [fact, key]));

const conditionOperatorOptions = computed(() => [
    { label: t('auth.permissionOperators.equals'), value: 'equals' },
    { label: t('auth.permissionOperators.notEquals'), value: 'notEquals' },
    { label: t('auth.permissionOperators.in'), value: 'in' },
    { label: t('auth.permissionOperators.includes'), value: 'includes' },
    { label: t('auth.permissionOperators.atLeast'), value: 'atLeast' },
    { label: t('auth.permissionOperators.exists'), value: 'exists' }
]);

const buildLocalPermissions = (permissions = {}) => ({
    ...permissions,
    ...Object.fromEntries(
        entities.value.map(feature => [feature.key, normalizeFeaturePermission(permissions?.[feature.key])])
    )
});

const localPermissions = ref(buildLocalPermissions(props.permissions));

const selectedFeature = computed(() => entities.value.find(feature => feature.key === selectedFeatureKey.value) || entities.value[0]);
const selectedGrants = computed(() => normalizeGrants(localPermissions.value[selectedFeatureKey.value]));
const selectedGrant = computed(() => selectedGrants.value[selectedGrantIndex.value] || null);
const valueOptionsForDraft = computed(() => valueOptionsForClause(draftClause()));
const draftUsesOptionValuePicker = computed(() => usesOptionValuePicker(draftClause()));

watch(() => props.permissions, (newVal) => {
    localPermissions.value = buildLocalPermissions(newVal);
    selectedGrantIndex.value = 0;
}, { deep: true });

watch(selectedFeatureKey, () => {
    selectedGrantIndex.value = 0;
    selectedGrantError.value = '';
    filterDraft.value = { target: 'entity', trait: defaultTraitForTarget('entity'), operator: 'equals', field: '', value: '', valueList: [], negated: false };
    loadEntityOptions();
});

watch(selectedGrant, (grant) => {
    selectedGrantJson.value = grant ? JSON.stringify(grant, null, 2) : '';
    selectedGrantError.value = '';
}, { immediate: true, deep: true });

onMounted(loadEntityOptions);

const reset = () => {
    localPermissions.value = buildLocalPermissions(props.permissions);
    selectedGrantIndex.value = 0;
};

function addGrant() {
    const grants = selectedGrants.value;
    grants.push({ level: 'read' });
    setFeatureGrants(selectedFeatureKey.value, grants);
    selectedGrantIndex.value = grants.length - 1;
}

function removeGrant(index) {
    const grants = selectedGrants.value.filter((_, grantIndex) => grantIndex !== index);
    setFeatureGrants(selectedFeatureKey.value, grants);
    selectedGrantIndex.value = Math.max(0, Math.min(index, grants.length - 1));
}

function clearFeature() {
    localPermissions.value[selectedFeatureKey.value] = 'none';
    selectedGrantIndex.value = 0;
}

function updateGrant(patch) {
    if (!selectedGrant.value) return;
    replaceSelectedGrant({ ...selectedGrant.value, ...patch });
}

function replaceSelectedGrant(grant) {
    const grants = selectedGrants.value;
    grants[selectedGrantIndex.value] = grant;
    setFeatureGrants(selectedFeatureKey.value, grants);
}

function setFeatureGrants(key, grants) {
    localPermissions.value[key] = grants.length === 0 ? 'none' : grants.length === 1 ? grants[0] : grants;
}

function normalizeFeaturePermission(value) {
    const grants = normalizeGrants(value);
    if (grants.length === 0) return 'none';
    return grants.length === 1 ? grants[0] : grants;
}

function normalizeGrants(value) {
    if (!value || value === 'none') return [];
    if (typeof value === 'string') return [{ level: value }];
    if (Array.isArray(value)) return value.flatMap(normalizeGrants);
    if (typeof value === 'object') return [{ ...value, level: value.level || value.access || 'none' }].filter(grant => grant.level !== 'none');
    return [];
}

function isGrantActionEnabled(grant, action) {
    if (!grant?.actions || grant.actions[action] === undefined) return true;
    return grant.actions[action] === true;
}

function setGrantAction(action, enabled) {
    updateGrant({
        actions: {
            ...(selectedGrant.value.actions || {}),
            [action]: enabled === true
        }
    });
}

function scopeValue(grant, key) {
    const scope = grant?.scope || {};
    const value = scope[`${key}s`] || scope[key] || grant?.[`${key}s`] || grant?.[key] || [];
    return Array.isArray(value) ? value.join(', ') : String(value || '');
}

function filterGate(grant) {
    return ruleGate(grant);
}

function filterClauses(grant) {
    if (!grant) return [];

    const clauses = [];
    const scope = grant.scope || {};
    for (const field of scopeFields.value) {
        const value = scopeValue({ scope }, field.key);
        if (!value) continue;
        clauses.push({
            fact: SCOPE_FACT_BY_KEY[field.key],
            operator: value.includes(',') ? 'in' : 'equals',
            value,
            field: ''
        });
    }

    for (const transition of grantTransitions(grant)) {
        if (transition.from) clauses.push({ fact: 'transition.from', operator: 'equals', value: transition.from, field: '' });
        if (transition.to) clauses.push({ fact: 'transition.to', operator: 'equals', value: transition.to, field: '' });
    }

    for (const condition of ruleConditions(grant)) {
        clauses.push(conditionToClause(condition));
    }

    return clauses;
}

function setFilterGate(gate) {
    applyFilterClauses(filterClauses(selectedGrant.value), gate);
}

function updateFilterClause(index, patch) {
    const clauses = filterClauses(selectedGrant.value);
    const next = { ...clauses[index], ...patch };
    if (patch.fact && patch.fact !== 'field') next.field = '';
    clauses[index] = normalizeClause(next);
    applyFilterClauses(clauses, filterGate(selectedGrant.value));
}

function updateClauseTarget(index, target) {
    const trait = defaultTraitForTarget(target);
    updateFilterClause(index, {
        fact: factForTargetTrait(target, trait),
        field: target === 'custom' ? filterClauses(selectedGrant.value)[index]?.field || '' : ''
    });
}

function updateClauseTrait(index, trait) {
    const target = clauseTarget(filterClauses(selectedGrant.value)[index]);
    updateFilterClause(index, {
        fact: factForTargetTrait(target, trait),
        field: target === 'custom' ? filterClauses(selectedGrant.value)[index]?.field || '' : ''
    });
}

function removeFilterClause(index) {
    applyFilterClauses(
        filterClauses(selectedGrant.value).filter((_, clauseIndex) => clauseIndex !== index),
        filterGate(selectedGrant.value)
    );
}

function addFilterClause() {
    const clause = normalizeClause({
        ...filterDraft.value,
        value: filterDraft.value.operator === 'in' && draftUsesOptionValuePicker.value
            ? filterDraft.value.valueList.join(', ')
            : filterDraft.value.value,
        negated: filterDraft.value.negated === true
    });
    if (!isCompleteClause(clause)) return;
    applyFilterClauses([...filterClauses(selectedGrant.value), clause], filterGate(selectedGrant.value));
    filterDraft.value = { ...filterDraft.value, field: '', value: '', valueList: [], negated: false };
}

function applyFilterClauses(clauses, gate = 'all') {
    if (!selectedGrant.value) return;

    const scope = {};
    const ruleConditions = [];
    for (const clause of clauses.map(normalizeClause).filter(isCompleteClause)) {
        const scopeKey = SCOPE_KEY_BY_FACT[clause.fact];
        if (!clause.negated && scopeKey && ['equals', 'in'].includes(clause.operator)) {
            setScopeFromClause(scope, scopeKey, clause);
        } else {
            const condition = clauseToCondition(clause);
            if (condition) ruleConditions.push(condition);
        }
    }

    const nextGrant = { ...selectedGrant.value };
    delete nextGrant.scope;
    delete nextGrant.rule;
    delete nextGrant.transition;
    delete nextGrant.transitions;

    const cleanedScope = cleanObject(scope);
    if (Object.keys(cleanedScope).length) nextGrant.scope = cleanedScope;
    if (ruleConditions.length) nextGrant.rule = { [gate]: ruleConditions };
    replaceSelectedGrant(nextGrant);
}

function setScopeFromClause(scope, scopeKey, clause) {
    const values = clause.operator === 'in' ? parseList(clause.value) : parseList(clause.value).slice(0, 1);
    delete scope[scopeKey];
    delete scope[`${scopeKey}s`];
    if (values.length === 1) scope[scopeKey] = values[0];
    if (values.length > 1) scope[`${scopeKey}s`] = values;
}

function conditionToClause(condition = {}) {
    if (condition.not) {
        return { ...conditionToClause(condition.not), negated: true };
    }
    const operator = ['equals', 'notEquals', 'in', 'includes', 'atLeast', 'exists'].find(name => condition[name] !== undefined) || 'equals';
    const value = Array.isArray(condition[operator]) ? condition[operator].join(', ') : String(condition[operator] ?? '');
    return normalizeClause({
        fact: condition.fact || 'field',
        operator,
        value,
        field: condition.field || '',
        negated: condition.negated === true
    });
}

function clauseToCondition(clause) {
    const condition = buildCondition({
        fact: clause.fact,
        operator: clause.operator,
        field: clause.field,
        value: clause.value
    });
    return clause.negated && condition ? { not: condition } : condition;
}

function normalizeClause(clause = {}) {
    const operator = clause.operator || 'equals';
    const target = clause.target || clauseTarget(clause);
    const trait = clause.trait || clauseTrait(clause) || defaultTraitForTarget(target);
    const fact = clause.fact || factForTargetTrait(target, trait);
    return {
        fact,
        operator,
        field: fact === 'field' ? String(clause.field || '') : '',
        value: operator === 'exists' && clause.value === '' ? 'true' : String(clause.value ?? ''),
        negated: clause.negated === true
    };
}

function isCompleteClause(clause) {
    if (clause.fact === 'field' && !clause.field) return false;
    if (clause.operator === 'exists') return true;
    return Boolean(String(clause.value || '').trim());
}

function setDraftTarget(target) {
    filterDraft.value.trait = defaultTraitForTarget(target);
    filterDraft.value.field = '';
    filterDraft.value.value = '';
    filterDraft.value.valueList = [];
    filterDraft.value.negated = false;
}

function setDraftTrait(trait) {
    filterDraft.value.trait = trait;
    if (filterDraft.value.target !== 'custom') filterDraft.value.field = '';
    filterDraft.value.value = '';
    filterDraft.value.valueList = [];
}

function traitOptionsForTarget(target) {
    if (target === 'custom') return [{ label: t('auth.permissionTraits.path'), value: 'path' }];
    if (target === 'transition') {
        return [
            { label: t('auth.permissionTraits.from'), value: 'from' },
            { label: t('auth.permissionTraits.to'), value: 'to' }
        ];
    }

    const options = [
        { label: t('auth.permissionTraits.id'), value: 'id' },
        { label: t('auth.permissionTraits.type'), value: 'type' }
    ];
    if (workflowStateOptions(entityTypeForTarget(target)).length) {
        options.push({ label: t('auth.permissionTraits.status'), value: 'status' });
    }
    return options;
}

function defaultTraitForTarget(target) {
    return traitOptionsForTarget(target)[0]?.value || 'id';
}

function factForTargetTrait(target, trait) {
    return FACT_BY_TARGET_TRAIT[target]?.[trait] || 'entityId';
}

function clauseTarget(clause = {}) {
    return TARGET_TRAIT_BY_FACT[clause.fact]?.target || (clause.fact === 'field' ? 'custom' : 'entity');
}

function clauseTrait(clause = {}) {
    return TARGET_TRAIT_BY_FACT[clause.fact]?.trait || (clause.fact === 'field' ? 'path' : 'id');
}

function draftClause() {
    return {
        target: filterDraft.value.target,
        trait: filterDraft.value.trait,
        operator: filterDraft.value.operator,
        field: filterDraft.value.field,
        value: filterDraft.value.value
    };
}

function usesOptionValuePicker(clause = {}) {
    return isStatusClause(clause) || Boolean(entityTypeForClause(clause));
}

function valueOptionsForClause(clause = {}) {
    if (isStatusClause(clause)) return workflowStateOptions(entityTypeForTarget(clauseTarget(clause)));
    const entityType = entityTypeForClause(clause);
    return entityType ? entityOptionLists.value[entityType] || [] : [];
}

function entityTypeForClause(clause = {}) {
    if (clause.operator === 'exists') return null;
    const target = clauseTarget(clause);
    const trait = clauseTrait(clause);
    if (trait !== 'id') return null;
    if (target === 'entity') return FEATURE_ENTITY_TYPE[selectedFeatureKey.value] || null;
    return REFERENCE_TARGET_ENTITY_TYPE[target] || null;
}

function isStatusClause(clause = {}) {
    return clause.operator !== 'exists' && clauseTrait(clause) === 'status';
}

function entityTypeForTarget(target) {
    if (target === 'entity') return FEATURE_ENTITY_TYPE[selectedFeatureKey.value] || null;
    return REFERENCE_TARGET_ENTITY_TYPE[target] || null;
}

function workflowStateOptions(entityType) {
    const workflow = entityType ? cncWorkflows[entityType] : null;
    const primaryRegion = workflow?.primaryRegion || 'main';
    const states = workflow?.regions?.[primaryRegion]?.states || {};
    return Object.keys(states).map(state => ({ label: statusLabel(state), value: state }));
}

function statusLabel(state) {
    return t(`status.${String(state).toLowerCase()}`, state);
}

function clauseValueList(clause = {}) {
    return parseList(clause.value);
}

async function loadEntityOptions() {
    entityOptionsLoading.value = true;
    try {
        const next = {
            ...entityOptionLists.value,
            organization: organizationOptions()
        };
        const requiredTypes = new Set(['project', 'queue', 'warehouse']);
        const featureEntityType = FEATURE_ENTITY_TYPE[selectedFeatureKey.value];
        if (featureEntityType) requiredTypes.add(featureEntityType);

        await Promise.all([...requiredTypes].map(async (type) => {
            if (type === 'organization') {
                next.organization = organizationOptions();
                return;
            }
            const loader = entityLoaders[type];
            if (!loader) return;
            try {
                next[type] = mapEntityOptions(await loader.list());
            } catch {
                next[type] = next[type] || [];
            }
        }));
        entityOptionLists.value = next;
    } finally {
        entityOptionsLoading.value = false;
    }
}

function organizationOptions() {
    const organizations = [
        authStore.organizationData,
        ...(authStore.userOrganizations || [])
    ].filter(Boolean);
    return mapEntityOptions(dedupeEntities(organizations));
}

function dedupeEntities(entities = []) {
    const seen = new Set();
    return entities.filter((entity) => {
        const id = entityOptionValue(entity);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function mapEntityOptions(entities = []) {
    return (entities || []).map(entity => ({
        label: entityOptionLabel(entity),
        value: entityOptionValue(entity)
    })).filter(option => option.value);
}

function entityOptionValue(entity = {}) {
    return String(entity._id || entity.id || entity.identity?.uid || '');
}

function entityOptionLabel(entity = {}) {
    return entity.identity?.name
        || entity.identity?.slug
        || entity.name
        || entity.data?.name
        || entity.data?.title
        || entityOptionValue(entity);
}

function grantTransitions(grant) {
    const transitions = grant?.transitions || grant?.transition || [];
    return (Array.isArray(transitions) ? transitions : [transitions]).map(normalizeTransition).filter(Boolean);
}

function normalizeTransition(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        const [from, to] = value.includes('->') ? value.split('->') : ['', value];
        return cleanObject({ from: from?.trim(), to: to?.trim() });
    }
    const transition = cleanObject({
        from: String(value.from || '').trim(),
        to: String(value.to || '').trim()
    });
    return transition.from || transition.to ? transition : null;
}

function ruleGate(grant) {
    if (grant?.rule?.any) return 'any';
    return 'all';
}

function ruleConditions(grant) {
    if (!grant?.rule) return [];
    if (Array.isArray(grant.rule.all)) return grant.rule.all;
    if (Array.isArray(grant.rule.any)) return grant.rule.any;
    return [grant.rule];
}

function buildCondition(draft = {}) {
    const condition = { fact: draft.fact };
    if (draft.fact === 'field') {
        if (!draft.field) return null;
        condition.field = draft.field;
    }
    if (draft.operator === 'exists') {
        condition.exists = parseBoolean(draft.value);
        return condition;
    }
    const values = draft.operator === 'in' ? parseList(draft.value) : String(draft.value || '').trim();
    if ((Array.isArray(values) && values.length === 0) || (!Array.isArray(values) && !values)) return null;
    condition[draft.operator] = values;
    return condition;
}

function applySelectedGrantJson() {
    if (!selectedGrant.value) return;
    try {
        const parsed = JSON.parse(selectedGrantJson.value || '{}');
        const grants = selectedGrants.value;
        grants[selectedGrantIndex.value] = { ...parsed, level: parsed.level || parsed.access || 'none' };
        setFeatureGrants(selectedFeatureKey.value, grants);
        selectedGrantError.value = '';
    } catch {
        selectedGrantError.value = t('auth.invalidPermissionJson');
    }
}

function save() {
    emit('save', JSON.parse(JSON.stringify(localPermissions.value)));
}

function featureSummary(key) {
    const grants = normalizeGrants(localPermissions.value[key]);
    if (grants.length === 0) return t('auth.permissionLevelLabels.none');
    const strongest = grants.reduce((current, grant) => strongestLevel(current, grant.level), 'none');
    return grants.length === 1 ? getLevelLabel(strongest) : t('auth.permissionGrantSummary', { level: getLevelLabel(strongest), count: grants.length });
}

function featureSummarySeverity(key) {
    const level = normalizeGrants(localPermissions.value[key]).reduce((current, grant) => strongestLevel(current, grant.level), 'none');
    if (level === 'admin') return 'danger';
    if (level === 'write') return 'warn';
    if (level === 'read') return 'info';
    return 'secondary';
}

function strongestLevel(left = 'none', right = 'none') {
    const levels = ['none', 'read', 'write', 'admin'];
    return levels.indexOf(right) > levels.indexOf(left) ? right : left;
}

function grantModeLabel(grant) {
    if (grantHasFilters(grant)) return t('auth.permissionModes.filtered');
    return t('auth.permissionModes.unfiltered');
}

function grantHasFilters(grant) {
    return Boolean(
        grant?.rule
        || (grant?.scope && Object.keys(grant.scope).length)
        || grantTransitions(grant).length
    );
}

function getIcon(key) {
    const iconMap = {
        projects: 'pi pi-folder',
        queues: 'pi pi-list',
        nesting_runs: 'pi pi-sitemap',
        artifacts: 'pi pi-file',
        cassettes: 'pi pi-pencil',
        warehouses: 'pi pi-building',
        catalogs: 'pi pi-book',
        requisitions: 'pi pi-shopping-cart',
        materials: 'pi pi-box',
        layer_standards: 'pi pi-palette',
        users: 'pi pi-users',
        organizations: 'pi pi-globe',
        workbench: 'pi pi-wrench',
        domain_builder: 'pi pi-sitemap',
        config_bot: 'pi pi-sparkles'
    };
    return iconMap[key] || 'pi pi-circle';
}

function getActionLabel(action) {
    return t(`auth.permissionActionLabels.${action}`, action);
}

function getLevelLabel(level) {
    const labels = {
        none: t('auth.permissionLevelLabels.none'),
        read: t('auth.permissionLevelLabels.read'),
        write: t('auth.permissionLevelLabels.write'),
        admin: t('auth.permissionLevelLabels.admin')
    };
    return labels[level] || level;
}

function parseList(value) {
    return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function parseBoolean(value) {
    if (value === true || String(value).toLowerCase() === 'true') return true;
    if (value === false || String(value).toLowerCase() === 'false') return false;
    return Boolean(value);
}

function cleanObject(value) {
    return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => {
        if (Array.isArray(item)) return item.length > 0;
        return item !== undefined && item !== null && item !== '';
    }));
}
</script>
