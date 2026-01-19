<template>
    <div class="flex flex-col gap-4">
        <DataTable :value="permissionRows" class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden">
            <Column field="entity" header="Feature" />
            <Column header="None">
                <template #body="slotProps">
                    <RadioButton v-model="localPermissions[slotProps.data.key]" value="none" />
                </template>
            </Column>
            <Column header="Read">
                <template #body="slotProps">
                    <RadioButton v-model="localPermissions[slotProps.data.key]" value="read" />
                </template>
            </Column>
            <Column header="Write">
                <template #body="slotProps">
                    <RadioButton v-model="localPermissions[slotProps.data.key]" value="write" />
                </template>
            </Column>
            <Column header="Admin">
                <template #body="slotProps">
                    <RadioButton v-model="localPermissions[slotProps.data.key]" value="admin" />
                </template>
            </Column>
        </DataTable>
        <div class="flex justify-end">
            <Button label="Save Permissions" @click="$emit('save', localPermissions)" />
        </div>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import RadioButton from 'primevue/radiobutton';
import Button from 'primevue/button';

const props = defineProps({
    permissions: {
        type: Object,
        default: () => ({})
    }
});

const emit = defineEmits(['save']);

const entities = [
    { key: 'projects', label: 'Projects' },
    { key: 'queues', label: 'Queues' },
    { key: 'cassettes', label: 'Cassettes' },
    { key: 'warehouses', label: 'Warehouses' },
    { key: 'catalogs', label: 'Catalogs' },
    { key: 'requisitions', label: 'Requisitions' },
    { key: 'materials', label: 'Materials' },
    { key: 'users', label: 'Users' },
    { key: 'organizations', label: 'Organizations' }
];

const permissionRows = entities.map(e => ({ entity: e.label, key: e.key }));

const localPermissions = ref({ ...props.permissions });

watch(() => props.permissions, (newVal) => {
    localPermissions.value = { ...newVal };
}, { deep: true });
</script>