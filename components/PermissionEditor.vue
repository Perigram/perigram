<template>
    <div class="flex flex-col gap-8">
        <div class="flex flex-col gap-2">
            <h3 class="m-0">{{ $t('auth.featureAccessControl') }}</h3>
            <p>{{ $t('auth.featureAccessControlHelp') }}</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
                v-for="feature in entities"
                :key="feature.key"
                :class="localPermissions[feature.key] === 'none' ? 'opacity-50' : ''"
            >
                <template #title>
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
                <template #content>
                    <div class="flex flex-col gap-3">
                        <SelectButton
                            v-model="localPermissions[feature.key]"
                            :options="PERMISSION_LEVELS"
                            option-label="label"
                            option-value="value"
                        />
                        <p class="italic opacity-60 m-0">
                            {{ getDescription(feature.key, localPermissions[feature.key]) }}
                        </p>
                    </div>
                </template>
            </Card>
        </div>

        <div class="pt-6 border-t flex justify-end gap-3">
            <Button :label="$t('common.cancel')" text severity="secondary" @click="reset" />
            <Button :label="$t('common.save')" icon="pi pi-shield" @click="emit('save', localPermissions.value)" />
        </div>
    </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SelectButton from 'primevue/selectbutton';
import Button from 'primevue/button';
import Card from 'primevue/card';

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
    { key: 'queues',        label: t('features.queues') },
    { key: 'cassettes',     label: t('features.cassettes') },
    { key: 'warehouses',    label: t('features.warehouses') },
    { key: 'catalogs',      label: t('features.catalogs') },
    { key: 'requisitions',  label: t('features.requisitions') },
    { key: 'materials',     label: t('features.materials') },
    { key: 'users',         label: t('features.users') },
    { key: 'organizations', label: t('features.organizations') }
]);

const localPermissions = ref({ ...props.permissions });

watch(() => props.permissions, (newVal) => {
    localPermissions.value = { ...newVal };
}, { deep: true });

const reset = () => {
    localPermissions.value = { ...props.permissions };
};

const getIcon = (key) => {
    const iconMap = {
        projects:      'pi pi-folder',
        queues:        'pi pi-list',
        cassettes:     'pi pi-pencil',
        warehouses:    'pi pi-building',
        catalogs:      'pi pi-book',
        requisitions:  'pi pi-shopping-cart',
        materials:     'pi pi-box',
        users:         'pi pi-users',
        organizations: 'pi pi-globe'
    };
    return iconMap[key] || 'pi pi-circle';
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
