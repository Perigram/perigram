<template>
    <div class="flex flex-col gap-8">
        <div class="flex flex-col gap-2">
            <h3 class="m-0">{{ $t('auth.featureAccessControl') }}</h3>
            <p>{{ $t('auth.featureAccessControlHelp') }}</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Panel
                v-for="feature in entities"
                :key="feature.key"
                :class="getFeatureLevel(feature.key) === 'none' ? 'opacity-50' : ''"
            >
                <template #header>
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 border rounded flex items-center justify-center">
                            <i :class="getIcon(feature.key)"></i>
                        </div>
                        <div class="flex flex-col">
                            <span>{{ feature.label }}</span>
                            <small>{{ getLevelLabel(localPermissions[feature.key]) }}</small>
                        </div>
                    </div>
                </template>
                <div class="flex flex-col gap-3">
                    <SelectButton
                        :model-value="getFeatureLevel(feature.key)"
                        :options="PERMISSION_LEVELS"
                        option-label="label"
                        option-value="value"
                        @update:model-value="setFeatureLevel(feature.key, $event)"
                    />
                    <p class="italic opacity-60 m-0">
                        {{ getDescription(feature.key, getFeatureLevel(feature.key)) }}
                    </p>
                    <div v-if="feature.actions?.length && getFeatureLevel(feature.key) !== 'none'" class="flex flex-col gap-2">
                        <small class="font-medium">{{ $t('auth.permissionActions') }}</small>
                        <div class="grid grid-cols-2 gap-2">
                            <label
                                v-for="action in feature.actions"
                                :key="action"
                                class="flex items-center gap-2 text-sm"
                            >
                                <Checkbox
                                    :model-value="isActionEnabled(feature.key, action)"
                                    binary
                                    @update:model-value="setAction(feature.key, action, $event)"
                                />
                                <span>{{ getActionLabel(action) }}</span>
                            </label>
                        </div>
                    </div>
                    <div v-if="getFeatureLevel(feature.key) !== 'none'" class="flex flex-col gap-2">
                        <small class="font-medium">{{ $t('auth.advancedPermissionJson') }}</small>
                        <Textarea
                            :model-value="permissionDrafts[feature.key] ?? formatPermission(feature.key)"
                            rows="4"
                            auto-resize
                            class="w-full font-mono text-xs"
                            @update:model-value="permissionDrafts[feature.key] = $event"
                            @blur="applyPermissionJson(feature.key)"
                        />
                        <small v-if="permissionErrors[feature.key]" class="text-red-500">
                            {{ permissionErrors[feature.key] }}
                        </small>
                    </div>
                </div>
            </Panel>
        </div>

        <div class="pt-6 border-t flex justify-end gap-3">
            <Button :label="$t('common.cancel')" text severity="secondary" @click="reset" />
            <Button :label="$t('common.save')" icon="pi pi-shield" @click="save" />
        </div>
    </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SelectButton from 'primevue/selectbutton';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Checkbox from 'primevue/checkbox';
import Textarea from 'primevue/textarea';

const props = defineProps({
    permissions: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['save']);
const { t } = useI18n();

const PERMISSION_LEVELS = computed(() => [
    { label: t('auth.permissionLevels.none'),  value: 'none' },
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

const buildLocalPermissions = (permissions = {}) => ({
    ...permissions,
    ...Object.fromEntries(
        entities.value.map(feature => [feature.key, permissions?.[feature.key] || 'none'])
    )
});

const localPermissions = ref(buildLocalPermissions(props.permissions));
const permissionDrafts = ref({});
const permissionErrors = ref({});

watch(() => props.permissions, (newVal) => {
    localPermissions.value = buildLocalPermissions(newVal);
    permissionDrafts.value = {};
    permissionErrors.value = {};
}, { deep: true });

const reset = () => {
    localPermissions.value = buildLocalPermissions(props.permissions);
    permissionDrafts.value = {};
    permissionErrors.value = {};
};

const getIcon = (key) => {
    const iconMap = {
        projects:      'pi pi-folder',
        queues:        'pi pi-list',
        nesting_runs:  'pi pi-sitemap',
        artifacts:     'pi pi-file',
        cassettes:     'pi pi-pencil',
        warehouses:    'pi pi-building',
        catalogs:      'pi pi-book',
        requisitions:  'pi pi-shopping-cart',
        materials:     'pi pi-box',
        layer_standards: 'pi pi-palette',
        users:         'pi pi-users',
        organizations: 'pi pi-globe',
        workbench:     'pi pi-wrench',
        domain_builder: 'pi pi-sitemap',
        config_bot:    'pi pi-sparkles'
    };
    return iconMap[key] || 'pi pi-circle';
};

const normalizeGrant = (value) => {
    if (!value || value === 'none') return { level: 'none' };
    if (typeof value === 'string') return { level: value };
    if (Array.isArray(value)) return normalizeGrant(value[0]);
    if (typeof value === 'object') return { ...value, level: value.level || value.access || 'none' };
    return { level: 'none' };
};

const getFeatureLevel = (key) => normalizeGrant(localPermissions.value[key]).level || 'none';

const setFeatureLevel = (key, level) => {
    const current = localPermissions.value[key];
    permissionErrors.value[key] = '';
    if (level === 'none') {
        localPermissions.value[key] = 'none';
    } else if (current && typeof current === 'object' && !Array.isArray(current)) {
        localPermissions.value[key] = { ...current, level };
    } else {
        localPermissions.value[key] = level;
    }
    permissionDrafts.value[key] = formatPermission(key);
};

const ensureGrantObject = (key) => {
    const current = localPermissions.value[key];
    if (current && typeof current === 'object' && !Array.isArray(current)) return current;
    const grant = { level: getFeatureLevel(key) === 'none' ? 'read' : getFeatureLevel(key) };
    localPermissions.value[key] = grant;
    return grant;
};

const isActionEnabled = (key, action) => {
    const grant = normalizeGrant(localPermissions.value[key]);
    if (!grant.actions || grant.actions[action] === undefined) return true;
    return grant.actions[action] === true;
};

const setAction = (key, action, enabled) => {
    const grant = ensureGrantObject(key);
    localPermissions.value[key] = {
        ...grant,
        actions: {
            ...(grant.actions || {}),
            [action]: enabled === true
        }
    };
    permissionDrafts.value[key] = formatPermission(key);
};

const getActionLabel = (action) => t(`auth.permissionActionLabels.${action}`, action);

const formatPermission = (key) => JSON.stringify(localPermissions.value[key] ?? 'none', null, 2);

const applyPermissionJson = (key) => {
    const draft = permissionDrafts.value[key];
    if (draft === undefined) return;
    try {
        localPermissions.value[key] = JSON.parse(draft);
        permissionErrors.value[key] = '';
        permissionDrafts.value[key] = formatPermission(key);
    } catch (error) {
        permissionErrors.value[key] = t('auth.invalidPermissionJson');
    }
};

const save = () => {
    Object.keys(permissionDrafts.value).forEach(applyPermissionJson);
    if (Object.values(permissionErrors.value).some(Boolean)) return;
    emit('save', JSON.parse(JSON.stringify(localPermissions.value)));
};

const getLevelLabel = (level) => {
    const labels = {
        none:  t('auth.permissionLevelLabels.none'),
        read:  t('auth.permissionLevelLabels.read'),
        write: t('auth.permissionLevelLabels.write'),
        admin: t('auth.permissionLevelLabels.admin')
    };
    return labels[level] || level;
};

const getDescription = (key, level) => {
    const feature = entities.value.find(item => item.key === key)?.label || key;
    if (level === 'none')  return t('auth.permissionDescriptions.none', { feature });
    if (level === 'read')  return t('auth.permissionDescriptions.read', { feature });
    if (level === 'write') return t('auth.permissionDescriptions.write', { feature });
    if (level === 'admin') return t('auth.permissionDescriptions.admin', { feature });
    return '';
};
</script>
