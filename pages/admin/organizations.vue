<template>
    <div class="flex flex-col gap-6">
        <div class="flex justify-between items-center">
            <h1 class="text-2xl font-bold">Organizations</h1>
            <Button label="Add Organization" icon="pi pi-plus" @click="openCreateOrg" />
        </div>

        <DataTable :value="organizations" :loading="loading" class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden">
            <Column field="name" header="Name" sortable></Column>
            <Column field="type" header="Type" sortable>
                <template #body="slotProps">
                    <Tag :value="slotProps.data.type" severity="info" />
                </template>
            </Column>
            <Column field="email" header="Contact Email"></Column>
            <Column header="Actions" style="width: 100px">
                <template #body="slotProps">
                    <Button icon="pi pi-pencil" text rounded size="small" @click="editOrg(slotProps.data)" />
                </template>
            </Column>
        </DataTable>

        <!-- Organization Dialog -->
        <Dialog v-model:visible="orgDialog" :header="editMode ? 'Edit Organization' : 'Create Organization'" modal class="w-full max-w-md">
            <div class="flex flex-col gap-4 py-4">
                <div class="flex flex-col gap-2">
                    <label class="font-bold text-sm">Name</label>
                    <InputText v-model="form.name" />
                </div>
                <div class="flex flex-col gap-2">
                    <label class="font-bold text-sm">Type</label>
                    <Select 
                        v-model="form.type" 
                        :options="['Manufacturer', 'Contractor', 'Customer', 'ServiceProvider']" 
                        :disabled="editMode"
                    />
                </div>
                <div class="flex flex-col gap-2">
                    <label class="font-bold text-sm">Email</label>
                    <InputText v-model="form.email" type="email" />
                </div>
                <div class="flex flex-col gap-2">
                    <label class="font-bold text-sm">Phone</label>
                    <InputText v-model="form.phone" />
                </div>
                <div class="flex flex-col gap-2">
                    <label class="font-bold text-sm">Address</label>
                    <InputText v-model="form.address" />
                </div>
            </div>
            <template #footer>
                <Button label="Cancel" text severity="secondary" @click="orgDialog = false" />
                <Button :label="editMode ? 'Update' : 'Create'" @click="saveOrg" />
            </template>
        </Dialog>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';

definePageMeta({
    layout: 'app',
    middleware: 'auth'
});

const toast = useToast();
const organizations = ref([]);
const loading = ref(false);
const orgDialog = ref(false);
const editMode = ref(false);
const form = ref({ name: '', type: 'Contractor', email: '', phone: '', address: '' });
const selectedId = ref(null);

const loadOrgs = async () => {
    loading.value = true;
    try {
        const data = await $fetch('/api/organizations');
        organizations.value = data;
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load organizations' });
    } finally {
        loading.value = false;
    }
};

const openCreateOrg = () => {
    form.value = { name: '', type: 'Contractor', email: '', phone: '', address: '' };
    editMode.value = false;
    orgDialog.value = true;
};

const editOrg = (org) => {
    form.value = { ...org };
    selectedId.value = org._id;
    editMode.value = true;
    orgDialog.value = true;
};

const saveOrg = async () => {
    try {
        if (editMode.value) {
            await $fetch(`/api/organizations/${selectedId.value}`, {
                method: 'PATCH',
                body: form.value
            });
            toast.add({ severity: 'success', summary: 'Success', detail: 'Organization updated' });
        } else {
            await $fetch('/api/organizations', {
                method: 'POST',
                body: form.value
            });
            toast.add({ severity: 'success', summary: 'Success', detail: 'Organization created' });
        }
        orgDialog.value = false;
        loadOrgs();
    } catch (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message });
    }
};

onMounted(() => {
    loadOrgs();
});
</script>