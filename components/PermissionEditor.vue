<template>
    <div class="flex flex-col gap-8">
        <div class="flex flex-col gap-2">
            <h3 class="m-0">Feature Access Control</h3>
            <p>Configure granular access levels for each system module.</p>
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
import { ref, watch } from 'vue';
import SelectButton from 'primevue/selectbutton';
import Button from 'primevue/button';
import Card from 'primevue/card';

const props = defineProps({
    permissions: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['save']);

const PERMISSION_LEVELS = [
    { label: 'None',  value: 'none' },
    { label: 'Read',  value: 'read' },
    { label: 'Write', value: 'write' },
    { label: 'Admin', value: 'admin' }
];

const entities = [
    { key: 'projects',     label: 'Projects' },
    { key: 'queues',       label: 'Production Queues' },
    { key: 'cassettes',    label: 'Cassette Library' },
    { key: 'warehouses',   label: 'Warehouses' },
    { key: 'catalogs',     label: 'Material Catalogs' },
    { key: 'requisitions', label: 'Requisitions' },
    { key: 'materials',    label: 'Physical Materials' },
    { key: 'users',        label: 'Team Members' },
    { key: 'organizations',label: 'Organization' }
];

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
    const labels = { none: 'No Access', read: 'View Only', write: 'Edit Access', admin: 'Full Control' };
    return labels[level] || level;
};

const getDescription = (key, level) => {
    if (level === 'none')  return `No access to ${key}. Feature will be hidden from UI.`;
    if (level === 'read')  return `Can view ${key} data and tracking info. Cannot modify.`;
    if (level === 'write') return `Can create and update ${key}. Limited deletion.`;
    if (level === 'admin') return `Total control over ${key}, including deletion and settings.`;
    return '';
};
</script>
