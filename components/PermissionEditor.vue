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
                                    <Tag :value="grantModeLabel(grant)" severity="secondary" size="small" />
                                </span>
                                <span class="flex flex-wrap gap-1">
                                    <Tag
                                        v-for="chip in grantChips(grant)"
                                        :key="chip"
                                        :value="chip"
                                        severity="info"
                                        size="small"
                                    />
                                </span>
                            </button>
                            <Message v-if="selectedGrants.length === 0" severity="info">{{ $t('auth.noPermissionGrants') }}</Message>
                        </div>

                        <div v-if="selectedGrant" class="flex min-w-0 flex-col gap-4">
                            <Message severity="info">
                                {{ grantExpressionSummary(selectedGrant) }}
                            </Message>

                            <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,16rem)_auto] md:items-end">
                                <div class="flex flex-col gap-2">
                                    <label>{{ $t('auth.permissionLevel') }}</label>
                                    <SelectButton
                                        :model-value="selectedGrant.level"
                                        :options="PERMISSION_LEVELS"
                                        option-label="label"
                                        option-value="value"
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

                            <Panel :header="$t('auth.permissionTraitFilters')">
                                <p class="m-0 mb-3 text-sm text-muted-color">
                                    {{ $t('auth.permissionTraitFiltersHelp') }}
                                </p>
                                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div
                                        v-for="scope in scopeFields"
                                        :key="scope.key"
                                        class="flex min-w-0 flex-col gap-1"
                                    >
                                        <label>{{ scope.label }}</label>
                                        <InputText
                                            :model-value="scopeValue(selectedGrant, scope.key)"
                                            :placeholder="$t('auth.permissionCommaSeparated')"
                                            @update:model-value="value => setScopeValue(scope.key, value)"
                                        />
                                    </div>
                                </div>
                            </Panel>

                            <Panel :header="$t('auth.permissionTransitionFilters')">
                                <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                    <InputText v-model="transitionDraft.from" :placeholder="$t('auth.transitionFrom')" />
                                    <InputText v-model="transitionDraft.to" :placeholder="$t('auth.transitionTo')" />
                                    <Button icon="pi pi-plus" :label="$t('common.add')" size="small" outlined @click="addTransitionScope" />
                                </div>
                                <div class="mt-3 flex flex-wrap gap-2">
                                    <span
                                        v-for="(transition, index) in grantTransitions(selectedGrant)"
                                        :key="`${transition.from || '*'}-${transition.to || '*'}-${index}`"
                                        class="inline-flex items-center gap-1"
                                    >
                                        <Tag :value="transitionLabel(transition)" severity="secondary" size="small" />
                                        <Button icon="pi pi-times" text rounded size="small" :aria-label="$t('common.delete')" @click="removeTransitionScope(index)" />
                                    </span>
                                </div>
                            </Panel>

                            <Panel :header="$t('auth.permissionLogicRules')">
                                <p class="m-0 mb-3 text-sm text-muted-color">
                                    {{ $t('auth.permissionLogicRulesHelp') }}
                                </p>
                                <div class="flex flex-col gap-3">
                                    <div class="grid grid-cols-1 gap-3 md:grid-cols-[12rem_minmax(0,1fr)] md:items-end">
                                        <div class="flex flex-col gap-1">
                                            <label>{{ $t('auth.permissionMatch') }}</label>
                                            <Select
                                                :model-value="ruleGate(selectedGrant)"
                                                :options="gateOptions"
                                                option-label="label"
                                                option-value="value"
                                                @update:model-value="setRuleGate"
                                            />
                                        </div>
                                        <div class="flex flex-wrap gap-2">
                                            <span
                                                v-for="(condition, index) in ruleConditions(selectedGrant)"
                                                :key="`${condition.fact}-${index}`"
                                                class="inline-flex items-center gap-1"
                                            >
                                                <Tag :value="conditionLabel(condition)" severity="info" size="small" />
                                                <Button icon="pi pi-times" text rounded size="small" :aria-label="$t('common.delete')" @click="removeCondition(index)" />
                                            </span>
                                            <Tag
                                                v-if="ruleConditions(selectedGrant).length === 0"
                                                :value="$t('auth.permissionNoLogicRules')"
                                                severity="secondary"
                                                size="small"
                                            />
                                        </div>
                                    </div>

                                    <div class="grid grid-cols-1 gap-2 xl:grid-cols-[12rem_10rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
                                        <Select
                                            v-model="conditionDraft.fact"
                                            :options="conditionFactOptions"
                                            option-label="label"
                                            option-value="value"
                                        />
                                        <Select
                                            v-model="conditionDraft.operator"
                                            :options="conditionOperatorOptions"
                                            option-label="label"
                                            option-value="value"
                                        />
                                        <InputText
                                            v-if="conditionDraft.fact === 'field'"
                                            v-model="conditionDraft.field"
                                            :placeholder="$t('auth.permissionFieldPath')"
                                        />
                                        <InputText
                                            v-else
                                            :model-value="conditionFactLabel(conditionDraft.fact)"
                                            disabled
                                        />
                                        <InputText v-model="conditionDraft.value" :placeholder="$t('auth.permissionConditionValue')" />
                                        <Button icon="pi pi-plus" :label="$t('common.add')" size="small" outlined @click="addCondition" />
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
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import SelectButton from 'primevue/selectbutton';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Checkbox from 'primevue/checkbox';
import Textarea from 'primevue/textarea';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Message from 'primevue/message';

const props = defineProps({
    permissions: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['save']);
const { t } = useI18n();

const selectedFeatureKey = ref('projects');
const selectedGrantIndex = ref(0);
const selectedGrantJson = ref('');
const selectedGrantError = ref('');
const transitionDraft = ref({ from: '', to: '' });
const conditionDraft = ref({ fact: 'lineage.projectId', operator: 'equals', field: '', value: '' });

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

const conditionFactOptions = computed(() => [
    { label: t('auth.permissionRuleTypes.organizationId'), value: 'lineage.organizationId' },
    { label: t('auth.permissionRuleTypes.projectId'), value: 'lineage.projectId' },
    { label: t('auth.permissionRuleTypes.queueId'), value: 'lineage.queueId' },
    { label: t('auth.permissionRuleTypes.warehouseId'), value: 'lineage.warehouseId' },
    { label: t('auth.permissionRuleTypes.entityId'), value: 'entityId' },
    { label: t('auth.permissionRuleTypes.entityType'), value: 'entityType' },
    { label: t('auth.permissionRuleTypes.primaryStatus'), value: 'status.primary' },
    { label: t('auth.permissionRuleTypes.transitionFrom'), value: 'transition.from' },
    { label: t('auth.permissionRuleTypes.transitionTo'), value: 'transition.to' },
    { label: t('auth.permissionRuleTypes.entityPath'), value: 'field' }
]);

const conditionOperatorOptions = computed(() => [
    { label: t('auth.permissionOperators.equals'), value: 'equals' },
    { label: t('auth.permissionOperators.notEquals'), value: 'notEquals' },
    { label: t('auth.permissionOperators.in'), value: 'in' },
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

watch(() => props.permissions, (newVal) => {
    localPermissions.value = buildLocalPermissions(newVal);
    selectedGrantIndex.value = 0;
}, { deep: true });

watch(selectedFeatureKey, () => {
    selectedGrantIndex.value = 0;
    selectedGrantError.value = '';
    transitionDraft.value = { from: '', to: '' };
    conditionDraft.value = { fact: 'lineage.projectId', operator: 'equals', field: '', value: '' };
});

watch(selectedGrant, (grant) => {
    selectedGrantJson.value = grant ? JSON.stringify(grant, null, 2) : '';
    selectedGrantError.value = '';
}, { immediate: true, deep: true });

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
    const grants = selectedGrants.value;
    grants[selectedGrantIndex.value] = { ...selectedGrant.value, ...patch };
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

function setScopeValue(key, value) {
    const values = parseList(value);
    const scope = { ...(selectedGrant.value.scope || {}) };
    delete scope[key];
    delete scope[`${key}s`];
    if (values.length === 1) scope[key] = values[0];
    if (values.length > 1) scope[`${key}s`] = values;
    updateGrant({ scope: cleanObject(scope) });
}

function grantTransitions(grant) {
    const transitions = grant?.transitions || grant?.transition || [];
    return (Array.isArray(transitions) ? transitions : [transitions]).map(normalizeTransition).filter(Boolean);
}

function addTransitionScope() {
    const transition = normalizeTransition(transitionDraft.value);
    if (!transition) return;
    updateGrant({ transitions: [...grantTransitions(selectedGrant.value), transition] });
    transitionDraft.value = { from: '', to: '' };
}

function removeTransitionScope(index) {
    updateGrant({ transitions: grantTransitions(selectedGrant.value).filter((_, transitionIndex) => transitionIndex !== index) });
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

function transitionLabel(transition) {
    return transition.from && transition.to ? `${transition.from}->${transition.to}` : transition.to || transition.from || '';
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

function setRuleGate(gate) {
    const conditions = ruleConditions(selectedGrant.value);
    updateGrant({ rule: conditions.length ? { [gate]: conditions } : undefined });
}

function addCondition() {
    const condition = buildCondition(conditionDraft.value);
    if (!condition) return;
    const gate = ruleGate(selectedGrant.value);
    updateGrant({ rule: { [gate]: [...ruleConditions(selectedGrant.value), condition] } });
    conditionDraft.value = { fact: conditionDraft.value.fact, operator: conditionDraft.value.operator, field: '', value: '' };
}

function removeCondition(index) {
    const gate = ruleGate(selectedGrant.value);
    const conditions = ruleConditions(selectedGrant.value).filter((_, conditionIndex) => conditionIndex !== index);
    updateGrant({ rule: conditions.length ? { [gate]: conditions } : undefined });
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

function conditionLabel(condition) {
    const key = condition.fact === 'field' ? condition.field : condition.fact;
    const operator = ['equals', 'notEquals', 'in', 'includes', 'atLeast', 'exists'].find(name => condition[name] !== undefined);
    const value = Array.isArray(condition[operator]) ? condition[operator].join(', ') : condition[operator];
    return `${key} ${operator || ''} ${value ?? ''}`.trim();
}

function conditionFactLabel(value) {
    return conditionFactOptions.value.find(option => option.value === value)?.label || value;
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

function grantChips(grant) {
    return [grantFilterSummary(grant)];
}

function grantExpressionSummary(grant) {
    return t('auth.permissionExpression', {
        level: getLevelLabel(grant?.level || 'none'),
        feature: selectedFeature.value.label,
        filter: grantFilterSummary(grant)
    });
}

function grantFilterSummary(grant) {
    const parts = [];
    const scope = grant?.scope || {};
    for (const field of scopeFields.value) {
        const value = scopeValue({ scope }, field.key);
        if (value) parts.push(`${field.label} ${t('auth.permissionOperators.equals').toLowerCase()} ${value}`);
    }

    const transitions = grantTransitions(grant);
    if (transitions.length) {
        parts.push(`${t('auth.permissionTransitionFilters')}: ${transitions.map(transitionLabel).join(', ')}`);
    }

    const conditions = ruleConditions(grant);
    if (conditions.length) {
        const joiner = ruleGate(grant) === 'any' ? ` ${t('auth.permissionOr')} ` : ` ${t('auth.permissionAnd')} `;
        parts.push(conditions.map(conditionLabel).join(joiner));
    }

    return parts.length ? parts.join(` ${t('auth.permissionAnd')} `) : t('auth.permissionNoFilters');
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
