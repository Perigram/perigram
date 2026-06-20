<template>
    <div class="flex min-h-0 flex-col gap-4">
        <div class="flex flex-col gap-1">
            <h3 class="m-0">{{ $t('auth.featureAccessControl') }}</h3>
            <p class="m-0 text-muted-color">{{ $t('auth.featureAccessControlHelp') }}</p>
        </div>

        <div class="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
                <Panel :header="$t('auth.permissionFeatures')">
                    <div class="flex max-h-[18rem] flex-col gap-2 overflow-auto pr-1 xl:max-h-none">
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

                    <div class="flex min-w-0 flex-col gap-4">
                        <div v-if="selectedGrants.length === 0" class="flex min-w-0 flex-col gap-3">
                            <Message severity="info">{{ $t('auth.permissionNoGrantSelected') }}</Message>
                            <div>
                                <Button icon="pi pi-plus" :label="$t('auth.addGrant')" @click="addGrant" />
                            </div>
                        </div>

                        <Accordion v-else :value="String(selectedGrantIndex)" @update:value="value => selectGrant(Number(value || 0))">
                            <AccordionPanel v-for="(grant, index) in selectedGrants" :key="index" :value="String(index)">
                                <AccordionHeader>
                                    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                        <strong>{{ $t('auth.permissionGrantTitle', { index: index + 1 }) }}</strong>
                                        <Tag :value="getLevelLabel(grant.level)" :severity="grantLevelSeverity(grant.level)" size="small" />
                                        <small class="text-muted-color">{{ grantModeLabel(grant) }}</small>
                                    </div>
                                </AccordionHeader>
                                <AccordionContent>
                                    <div class="flex min-w-0 flex-col gap-4">
                                        <div class="flex flex-wrap items-end justify-between gap-3">
                                            <div class="flex min-w-0 flex-wrap items-end gap-2">
                                                <span class="pb-2 font-medium">{{ $t('auth.permissionAllow') }}</span>
                                                <Select
                                                    :model-value="grant.level"
                                                    :options="PERMISSION_LEVELS"
                                                    option-label="label"
                                                    option-value="value"
                                                    class="w-36"
                                                    @update:model-value="value => updateGrantAt(index, { level: value })"
                                                />
                                                <span class="pb-2 text-muted-color">{{ $t('auth.permissionWhen') }}</span>
                                            </div>
                                            <Button icon="pi pi-trash" severity="danger" text rounded :aria-label="$t('auth.removeGrant')" @click="removeGrant(index)" />
                                        </div>

                                        <PermissionRuleBuilder
                                            :model-value="ruleTreeForGrant(index)"
                                            :gate-options="gateOptions"
                                            :subject-options="subjectOptionsForFeature"
                                            :entity-type-options="entityTypeOptions"
                                            :condition-operator-options="conditionOperatorOptions"
                                            :entity-options-loading="entityOptionsLoading"
                                            :trait-options-for-condition="traitOptionsForCondition"
                                            :condition-subject="conditionSubject"
                                            :condition-entity-type="conditionEntityType"
                                            :condition-entity-type-label="conditionEntityTypeLabel"
                                            :condition-trait="conditionTrait"
                                            :patch-condition-subject="patchConditionSubject"
                                            :patch-condition-entity-type="patchConditionEntityType"
                                            :patch-condition-trait="patchConditionTrait"
                                            :uses-option-value-picker="usesOptionValuePicker"
                                            :value-options-for-clause="valueOptionsForClause"
                                            :clause-value-list="clauseValueList"
                                            :create-condition="createConditionNode"
                                            :create-group="createGroupNode"
                                            @update:model-value="value => updateRuleTreeAt(index, value)"
                                        />

                                        <Panel v-if="selectedFeature.actions?.length" :header="$t('auth.permissionActions')" toggleable collapsed>
                                            <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
                                                <label
                                                    v-for="action in selectedFeature.actions"
                                                    :key="action"
                                                    class="flex items-center gap-2"
                                                >
                                                    <Checkbox
                                                        :model-value="isGrantActionEnabled(grant, action)"
                                                        binary
                                                        @update:model-value="value => setGrantActionAt(index, action, value)"
                                                    />
                                                    <span>{{ getActionLabel(action) }}</span>
                                                </label>
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
                                </AccordionContent>
                            </AccordionPanel>
                        </Accordion>
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
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import Checkbox from 'primevue/checkbox';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import { useEntity } from '~/composables/useEntity';
import { useAuthStore } from '~/stores/auth';
import {
    cncEntityFieldGroups,
    cncFrontendEntities,
    cncWorkflows,
    getEntityFieldAccessPolicy
} from '@cutkit/domain-cnc';
import PermissionRuleBuilder from './PermissionRuleBuilder.vue';

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
const entityOptionsLoading = ref(false);
const entityOptionLists = ref({});
const selectedRuleTree = ref(null);
const entityLoaders = {
    catalog: useEntity('catalog'),
    cassetteInstance: useEntity('cassetteInstance'),
    cassetteTemplate: useEntity('cassetteTemplate'),
    geometryCapture: useEntity('geometryCapture'),
    material: useEntity('material'),
    nestingRun: useEntity('nestingRun'),
    project: useEntity('project'),
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

const subjectOptionsForFeature = computed(() => [
    ...(selectedFeatureHasEntity() ? [{ label: entityTypeLabel(selectedFeatureEntityType()), value: 'current' }] : []),
    { label: t('auth.permissionSubjects.related'), value: 'related' },
    { label: t('auth.permissionSubjects.transition'), value: 'transition' },
    { label: t('auth.permissionSubjects.custom'), value: 'custom' }
]);

const entityTypeOptions = computed(() => (
    uniqueEntityTypes(cncFrontendEntities.map(entity => entity.type)).map(type => ({
        label: entityTypeLabel(type),
        value: type
    }))
));

const SCOPE_FACT_BY_KEY = {
    organizationId: 'lineage.organizationId',
    projectId: 'lineage.projectId',
    queueId: 'lineage.queueId',
    warehouseId: 'lineage.warehouseId',
    entityId: 'entityId',
    entityType: 'entityType'
};

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

watch(() => props.permissions, (newVal) => {
    localPermissions.value = buildLocalPermissions(newVal);
    selectedGrantIndex.value = 0;
    hydrateRuleTree();
}, { deep: true });

watch(selectedFeatureKey, () => {
    selectedGrantIndex.value = 0;
    selectedGrantError.value = '';
    hydrateRuleTree();
    loadEntityOptions();
});

watch(selectedGrant, (grant) => {
    selectedGrantJson.value = grant ? JSON.stringify(grant, null, 2) : '';
    selectedGrantError.value = '';
}, { immediate: true, deep: true });

onMounted(() => {
    hydrateRuleTree();
    loadEntityOptions();
});

const reset = () => {
    localPermissions.value = buildLocalPermissions(props.permissions);
    selectedGrantIndex.value = 0;
    hydrateRuleTree();
};

function addGrant() {
    const grants = selectedGrants.value;
    grants.push({ level: 'read' });
    setFeatureGrants(selectedFeatureKey.value, grants);
    selectedGrantIndex.value = grants.length - 1;
    hydrateRuleTree();
}

function removeGrant(index) {
    const grants = selectedGrants.value.filter((_, grantIndex) => grantIndex !== index);
    setFeatureGrants(selectedFeatureKey.value, grants);
    selectedGrantIndex.value = Math.max(0, Math.min(index, grants.length - 1));
    hydrateRuleTree();
}

function clearFeature() {
    localPermissions.value[selectedFeatureKey.value] = 'none';
    selectedGrantIndex.value = 0;
    hydrateRuleTree();
}

function selectGrant(index) {
    selectedGrantIndex.value = index;
    hydrateRuleTree();
}

function updateGrantAt(index, patch) {
    const grant = selectedGrants.value[index];
    if (!grant) return;
    replaceGrantAt(index, { ...grant, ...patch });
}

function replaceGrantAt(index, grant) {
    const grants = selectedGrants.value;
    grants[index] = grant;
    setFeatureGrants(selectedFeatureKey.value, grants);
}

function hydrateRuleTree() {
    selectedRuleTree.value = ruleTreeFromGrant(selectedGrant.value);
}

function ruleTreeForGrant(index) {
    return index === selectedGrantIndex.value ? selectedRuleTree.value : ruleTreeFromGrant(selectedGrants.value[index]);
}

function updateRuleTreeAt(index, value) {
    selectedGrantIndex.value = index;
    selectedRuleTree.value = value;
    applyRuleTreeAt(index, value);
    loadEntityOptions();
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

function setGrantActionAt(index, action, enabled) {
    const grant = selectedGrants.value[index];
    if (!grant) return;
    updateGrantAt(index, {
        actions: {
            ...(grant.actions || {}),
            [action]: enabled === true
        }
    });
}

function scopeValue(grant, key) {
    const scope = grant?.scope || {};
    const value = scope[`${key}s`] || scope[key] || grant?.[`${key}s`] || grant?.[key] || [];
    return Array.isArray(value) ? value.join(', ') : String(value || '');
}

let ruleNodeId = 0;

function nextRuleNodeId() {
    ruleNodeId += 1;
    return `rule-node-${ruleNodeId}`;
}

function createGroupNode(patch = {}) {
    return {
        id: nextRuleNodeId(),
        type: 'group',
        gate: 'all',
        negated: false,
        children: [],
        ...patch
    };
}

function createConditionNode(patch = {}) {
    const subject = selectedFeatureHasEntity() ? 'current' : 'related';
    const entityType = subject === 'current' ? selectedFeatureEntityType() : entityTypeOptions.value[0]?.value || 'project';
    return normalizeClause({
        id: nextRuleNodeId(),
        type: 'condition',
        subject,
        entityType,
        trait: defaultTraitForCondition({ subject, entityType }),
        operator: 'equals',
        field: '',
        value: '',
        negated: false,
        ...patch
    });
}

function ruleTreeFromGrant(grant) {
    if (!grant) return createGroupNode();
    const legacyClauses = legacyGrantClauses(grant).map(clause => createConditionNode(clause));
    const ruleNode = grant.rule ? nodeFromRule(grant.rule) : null;
    if (ruleNode && legacyClauses.length === 0) return ruleNode;
    return createGroupNode({
        gate: 'all',
        children: [...legacyClauses, ...(ruleNode ? [ruleNode] : [])]
    });
}

function legacyGrantClauses(grant) {
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

    return clauses;
}

function nodeFromRule(rule) {
    if (rule?.not) {
        const node = nodeFromRule(rule.not);
        return { ...node, negated: !node.negated };
    }
    if (Array.isArray(rule?.all) || Array.isArray(rule?.any)) {
        const gate = Array.isArray(rule.all) ? 'all' : 'any';
        return createGroupNode({
            gate,
            children: (rule[gate] || []).map(nodeFromRule)
        });
    }
    return createConditionNode(conditionToClause(rule));
}

function applyRuleTreeAt(index, tree) {
    const grant = selectedGrants.value[index];
    if (!grant) return;
    const rule = ruleFromNode(tree);
    const nextGrant = { ...grant };
    delete nextGrant.scope;
    delete nextGrant.rule;
    delete nextGrant.transition;
    delete nextGrant.transitions;
    if (rule) nextGrant.rule = rule;
    replaceGrantAt(index, nextGrant);
}

function ruleFromNode(node) {
    if (!node) return null;
    if (node.type === 'group') {
        const children = (node.children || []).map(ruleFromNode).filter(Boolean);
        if (children.length === 0) return null;
        const rule = { [node.gate === 'any' ? 'any' : 'all']: children };
        return node.negated ? { not: rule } : rule;
    }

    const clause = normalizeClause(node);
    if (!isCompleteClause(clause)) return null;
    return clauseToCondition(clause);
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
    const subject = clause.subject || conditionSubject(clause);
    const entityType = clause.entityType || conditionEntityType({ ...clause, subject });
    const trait = clause.trait || conditionTrait({ ...clause, subject, entityType }) || defaultTraitForCondition({ subject, entityType });
    const fact = clause.fact || factForCondition(subject, entityType, trait);
    const propertyPath = propertyPathForTrait(trait);
    return {
        id: clause.id || nextRuleNodeId(),
        type: 'condition',
        subject,
        entityType,
        trait,
        fact,
        operator,
        field: fact === 'field' ? String(propertyPath || clause.field || '') : '',
        value: operator === 'exists' && clause.value === '' ? 'true' : String(clause.value ?? ''),
        negated: clause.negated === true
    };
}

function isCompleteClause(clause) {
    if (clause.fact === 'field' && !clause.field) return false;
    if (clause.operator === 'exists') return true;
    return Boolean(String(clause.value || '').trim());
}

function traitOptionsForCondition(condition = {}) {
    const subject = conditionSubject(condition);
    if (subject === 'custom') return [{ label: t('auth.permissionTraits.path'), value: 'path' }];
    if (subject === 'transition') {
        return [
            { label: t('auth.permissionTraits.from'), value: 'from' },
            { label: t('auth.permissionTraits.to'), value: 'to' }
        ];
    }

    const entityType = conditionEntityType(condition);
    const options = [{ label: t('auth.permissionTraits.id'), value: 'id' }];
    if (workflowStateOptions(conditionEntityType(condition)).length) {
        options.push({ label: t('auth.permissionTraits.status'), value: 'status' });
    }
    options.push(...propertyTraitOptions(entityType));
    if (conditionTrait(condition) === 'type' && !options.some(option => option.value === 'type')) {
        options.push({ label: t('auth.permissionTraits.entityType'), value: 'type' });
    }
    return options;
}

function defaultTraitForCondition(condition = {}) {
    return traitOptionsForCondition(condition)[0]?.value || 'id';
}

function factForCondition(subject, entityType, trait) {
    if (subject === 'custom') return 'field';
    if (subject === 'transition') return trait === 'from' ? 'transition.from' : 'transition.to';
    const propertyPath = propertyPathForTrait(trait);
    if (propertyPath) {
        return subject === 'related' ? `lineage.${entityType}.${propertyPath}` : `entity.${propertyPath}`;
    }
    if (subject === 'related') {
        if (trait === 'id') return `lineage.${entityType}Id`;
        if (trait === 'type') return `lineage.${entityType}.type`;
        if (trait === 'status') return `lineage.${entityType}.status.primary`;
    }
    if (trait === 'type') return 'entityType';
    if (trait === 'status') return 'status.primary';
    return 'entityId';
}

function conditionSubject(clause = {}) {
    if (clause.subject) return clause.subject;
    const fact = clause.fact || '';
    if (fact === 'field') return 'custom';
    if (fact.startsWith('transition.')) return 'transition';
    if (fact.startsWith('lineage.')) return 'related';
    if (fact.startsWith('entity.')) return 'current';
    return 'current';
}

function conditionEntityType(clause = {}) {
    if (clause.entityType) return clause.entityType;
    if (conditionSubject(clause) === 'current') return selectedFeatureEntityType();
    if (conditionSubject(clause) !== 'related') return '';
    const fact = clause.fact || '';
    const idMatch = fact.match(/^lineage\.([^.]+)Id$/);
    if (idMatch) return idMatch[1];
    const traitMatch = fact.match(/^lineage\.([^.]+)\./);
    return traitMatch?.[1] || entityTypeOptions.value[0]?.value || '';
}

function conditionEntityTypeLabel(clause = {}) {
    if (conditionSubject(clause) === 'current') return entityTypeLabel(selectedFeatureEntityType());
    if (conditionSubject(clause) === 'transition') return t('auth.permissionSubjects.transition');
    if (conditionSubject(clause) === 'custom') return t('auth.permissionSubjects.custom');
    return entityTypeLabel(conditionEntityType(clause));
}

function conditionTrait(clause = {}) {
    if (clause.trait) return clause.trait;
    const fact = clause.fact || '';
    if (fact === 'field') return 'path';
    if (fact === 'entityType' || fact.endsWith('.type')) return 'type';
    if (fact === 'status.primary' || fact === 'primaryStatus' || fact.endsWith('.status.primary')) return 'status';
    if (fact === 'transition.from') return 'from';
    if (fact === 'transition.to') return 'to';
    const lineagePropertyMatch = fact.match(/^lineage\.[^.]+\.(.+)$/);
    if (lineagePropertyMatch) return propertyTraitValue(lineagePropertyMatch[1]);
    if (fact.startsWith('entity.')) return propertyTraitValue(fact.slice('entity.'.length));
    return 'id';
}

function patchConditionSubject(clause = {}, subject) {
    const entityType = subject === 'related' ? entityTypeOptions.value[0]?.value || 'project' : selectedFeatureEntityType();
    const next = {
        ...clause,
        subject,
        entityType,
        trait: defaultTraitForCondition({ subject, entityType }),
        field: subject === 'custom' ? clause.field || '' : '',
        value: ''
    };
    return normalizeClause({ ...next, fact: factForCondition(next.subject, next.entityType, next.trait) });
}

function patchConditionEntityType(clause = {}, entityType) {
    const trait = defaultTraitForCondition({ ...clause, subject: 'related', entityType });
    return normalizeClause({
        ...clause,
        subject: 'related',
        entityType,
        trait,
        fact: factForCondition('related', entityType, trait),
        value: ''
    });
}

function patchConditionTrait(clause = {}, trait) {
    const subject = conditionSubject(clause);
    const entityType = conditionEntityType(clause);
    const fact = factForCondition(subject, entityType, trait);
    return normalizeClause({
        ...clause,
        subject,
        entityType,
        trait,
        fact,
        field: subject === 'custom' ? clause.field || '' : '',
        value: ''
    });
}

function usesOptionValuePicker(clause = {}) {
    const entityType = entityTypeForClause(clause);
    return isStatusClause(clause) || Boolean(entityType && canLoadEntityOptions(entityType));
}

function valueOptionsForClause(clause = {}) {
    if (isStatusClause(clause)) return workflowStateOptions(conditionEntityType(clause));
    const entityType = entityTypeForClause(clause);
    return entityType ? entityOptionLists.value[entityType] || [] : [];
}

function entityTypeForClause(clause = {}) {
    if (clause.operator === 'exists') return null;
    const subject = conditionSubject(clause);
    const trait = conditionTrait(clause);
    if (trait !== 'id') return null;
    if (subject === 'current') return selectedFeatureEntityType();
    if (subject === 'related') return conditionEntityType(clause);
    return null;
}

function canLoadEntityOptions(entityType) {
    return entityType === 'organization' || entityType === 'queue' || Boolean(entityLoaders[entityType]);
}

function isStatusClause(clause = {}) {
    return clause.operator !== 'exists' && conditionTrait(clause) === 'status';
}

function selectedFeatureEntityType() {
    return FEATURE_ENTITY_TYPE[selectedFeatureKey.value] || entityTypeOptions.value[0]?.value || 'project';
}

function selectedFeatureHasEntity() {
    return Boolean(FEATURE_ENTITY_TYPE[selectedFeatureKey.value]);
}

function entityTypeLabel(type) {
    return t(`entities.${camelizeEntityType(type)}`, t(`features.${pluralizeEntityType(type)}`, formatEntityType(type)));
}

function uniqueEntityTypes(types = []) {
    return [...new Set(types.filter(Boolean))];
}

function camelizeEntityType(type = '') {
    return String(type).replace(/[-_]([a-z])/g, (_, char) => char.toUpperCase());
}

function pluralizeEntityType(type = '') {
    const value = camelizeEntityType(type);
    return value.endsWith('s') ? value : `${value}s`;
}

function formatEntityType(type = '') {
    return String(type)
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function snakeEntityType(type = '') {
    return String(type).replace(/[A-Z]/g, char => `_${char.toLowerCase()}`).replace(/-/g, '_');
}

function workflowStateOptions(entityType) {
    const workflow = entityType ? cncWorkflows[entityType] || cncWorkflows[snakeEntityType(entityType)] : null;
    const primaryRegion = workflow?.primaryRegion || 'main';
    const states = workflow?.regions?.[primaryRegion]?.states || {};
    return Object.keys(states).map(state => ({ label: statusLabel(state), value: state }));
}

function propertyTraitOptions(entityType) {
    const paths = new Map();
    for (const field of entityFieldDescriptors(entityType)) {
        if (!field.path || isUnsupportedPredicatePath(field.path)) continue;
        paths.set(field.path, fieldLabel(field));
        for (const fallbackPath of field.fallbackPaths || []) {
            if (!isUnsupportedPredicatePath(fallbackPath)) paths.set(fallbackPath, fieldLabel({ ...field, path: fallbackPath }));
        }
    }
    for (const path of entityAccessPaths(entityType)) {
        if (!paths.has(path) && !isUnsupportedPredicatePath(path)) paths.set(path, formatPathLabel(path));
    }
    return [...paths.entries()].map(([path, label]) => ({
        label,
        value: propertyTraitValue(path)
    }));
}

function entityFieldDescriptors(entityType) {
    const groups = cncEntityFieldGroups[entityType] || {};
    return Object.values(groups).flat();
}

function entityAccessPaths(entityType) {
    const policy = getEntityFieldAccessPolicy(entityType);
    if (!policy) return [];
    return uniqueEntityTypes(['read', 'write', 'admin'].flatMap(level => policy[level] || []))
        .filter(path => !path.endsWith('.*') && !path.includes('*'));
}

function isUnsupportedPredicatePath(path = '') {
    return !path
        || path === '_id'
        || path.includes('*')
        || path.endsWith('.length')
        || path.includes('.preview')
        || path.includes('.geometry');
}

function propertyTraitValue(path = '') {
    return `field:${path}`;
}

function propertyPathForTrait(trait = '') {
    return String(trait).startsWith('field:') ? String(trait).slice('field:'.length) : '';
}

function fieldLabel(field = {}) {
    return t(field.i18n, formatPathLabel(field.path));
}

function formatPathLabel(path = '') {
    return String(path)
        .replace(/^(data|summary|specs|identity|lineage|attachments)\./, '')
        .replace(/\./g, ' / ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, char => char.toUpperCase());
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
        const requiredTypes = entityTypesRequiredByRuleTree(selectedRuleTree.value);
        const featureEntityType = FEATURE_ENTITY_TYPE[selectedFeatureKey.value];
        if (featureEntityType) requiredTypes.add(featureEntityType);

        let projectEntities = [];
        if (requiredTypes.has('project')) {
            projectEntities = await loadEntityOptionsForType('project', next);
        }
        if (requiredTypes.has('queue')) {
            next.queue = await loadQueueOptions(projectEntities);
        }

        await Promise.all([...requiredTypes].filter(type => !['project', 'queue'].includes(type)).map(async (type) => {
            if (type === 'organization') {
                next.organization = organizationOptions();
                return;
            }
            await loadEntityOptionsForType(type, next);
        }));
        entityOptionLists.value = next;
    } finally {
        entityOptionsLoading.value = false;
    }
}

function entityTypesRequiredByRuleTree(node, required = new Set()) {
    if (!node) return required;
    if (node.type === 'group') {
        for (const child of node.children || []) entityTypesRequiredByRuleTree(child, required);
        return required;
    }
    const entityType = entityTypeForClause(node);
    if (entityType && canLoadEntityOptions(entityType)) required.add(entityType);
    return required;
}

async function loadEntityOptionsForType(type, next) {
    const loader = entityLoaders[type];
    if (!loader) return [];
    try {
        const entities = await loader.list();
        next[type] = mapEntityOptions(entities);
        return entities;
    } catch {
        next[type] = next[type] || [];
        return [];
    }
}

async function loadQueueOptions(projectEntities = []) {
    const projects = projectEntities.length ? projectEntities : entityOptionLists.value.project || [];
    const queues = [];
    await Promise.all(projects.map(async (project) => {
        const projectKey = entityRouteKey(project);
        if (!projectKey) return;
        try {
            const data = await $fetch(`/api/project/${encodeURIComponent(projectKey)}/queues`);
            queues.push(...(Array.isArray(data) ? data : data.items || data.data || []));
        } catch {
            // Queue listing is project-scoped in this app; inaccessible projects simply contribute no options.
        }
    }));
    return mapEntityOptions(dedupeEntities(queues));
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

function entityRouteKey(entity = {}) {
    return entity.identity?.slug
        || entity.slug
        || entity.identity?.uid
        || entity._id
        || entity.id
        || entity.value;
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

function grantLevelSeverity(level) {
    if (level === 'admin') return 'danger';
    if (level === 'write') return 'warn';
    if (level === 'read') return 'info';
    return 'secondary';
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
