<template>
    <div class="flex flex-col gap-6">
        <div class="flex justify-between items-center">
            <h1>{{ $t('features.organizations') }}</h1>
            <Button :label="$t('common.create')" icon="pi pi-plus" @click="openCreateOrg" />
        </div>

        <DataTable :value="organizations" :loading="loading" stripedRows class="border rounded">
            <Column field="name" :header="$t('common.name')" sortable>
                <template #body="slotProps">
                    <span>{{ slotProps.data.name }}</span>
                </template>
            </Column>
            <Column field="type" :header="$t('queue.status')" sortable>
                <template #body="slotProps">
                    <Tag :value="slotProps.data.type" />
                </template>
            </Column>
            <Column field="email" :header="$t('profile.email')">
                <template #body="slotProps">
                    <span>{{ slotProps.data.email }}</span>
                </template>
            </Column>
            <Column :header="$t('common.actions.title')" class="text-right">
                <template #body="slotProps">
                    <div class="flex justify-end gap-2">
                        <Button icon="pi pi-pencil" text @click="editOrg(slotProps.data)" />
                    </div>
                </template>
            </Column>
        </DataTable>

        <!-- Organization Dialog -->
        <Dialog v-model:visible="orgDialog" :header="editMode ? $t('common.edit') : $t('common.create')" modal>
            <div class="flex flex-col gap-4 py-4">
                <div class="flex flex-col gap-1">
                    <label>{{ $t('common.name') }} *</label>
                    <InputText v-model="form.name" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                    <label>{{ $t('queue.status') }} *</label>
                    <Select 
                        v-model="form.type" 
                        :options="['Manufacturer', 'Contractor', 'Customer', 'ServiceProvider']" 
                        :disabled="editMode"
                        class="w-full"
                    />
                </div>
                <div class="flex flex-col gap-1">
                    <label>{{ $t('profile.email') }}</label>
                    <InputText v-model="form.email" type="email" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                    <label>{{ $t('profile.phone', 'Phone') }}</label>
                    <InputText v-model="form.phone" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                    <label>{{ $t('profile.address', 'Address') }}</label>
                    <InputText v-model="form.address" class="w-full" />
                </div>
            </div>
            <template #footer>
                <Button :label="$t('common.cancel')" text severity="secondary" @click="orgDialog = false" />
                <Button :label="editMode ? $t('common.save') : $t('common.create')" @click="saveOrg" />
            </template>
        </Dialog>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
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
const { t } = useI18n();
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
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('admin.failedToLoadOrganizations') });
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
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('admin.organizationUpdated') });
        } else {
            await $fetch('/api/organizations', {
                method: 'POST',
                body: form.value
            });
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('admin.organizationCreated') });
        }
        orgDialog.value = false;
        loadOrgs();
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error.message });
    }
};

onMounted(() => {
    loadOrgs();
});
</script>
