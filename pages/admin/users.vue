<template>
    <div class="flex flex-col gap-6">
        <div class="flex justify-between items-center">
            <h1>{{ $t('features.users') }}</h1>
            <Button :label="$t('common.create')" icon="pi pi-user-plus" @click="openCreateUser" />
        </div>

        <DataTable :value="users" :loading="loading" stripedRows>
            <Column field="name" :header="$t('profile.name')" sortable>
                <template #body="slotProps">
                    <span>{{ slotProps.data.name }}</span>
                </template>
            </Column>
            <Column field="email" :header="$t('profile.email')" sortable>
                <template #body="slotProps">
                    <span>{{ slotProps.data.email }}</span>
                </template>
            </Column>
            <Column field="role" :header="$t('queue.status')" sortable>
                <template #body="slotProps">
                    <Tag :value="$t(`roles.${slotProps.data.role}`)" :severity="getRoleSeverity(slotProps.data.role)" />
                </template>
            </Column>
            <Column :header="$t('common.actions.title')" class="text-right">
                <template #body="slotProps">
                    <div class="flex justify-end gap-2">
                        <Button icon="pi pi-pencil" text @click="editUser(slotProps.data)" />
                        <Button icon="pi pi-shield" text severity="warn" @click="editPermissions(slotProps.data)" />
                    </div>
                </template>
            </Column>
        </DataTable>

        <!-- User Dialog -->
        <Dialog v-model:visible="userDialog" :header="editMode ? $t('admin.editUser') : $t('admin.createUser')" modal class="w-full max-w-md">
            <UserForm :user="selectedUser" @save="saveUser" @cancel="userDialog = false" />
        </Dialog>

        <!-- Permissions Dialog -->
        <Dialog v-model:visible="permDialog" :header="$t('admin.editPermissions')" modal class="w-full max-w-lg">
            <PermissionEditor 
                v-if="selectedUser" 
                :permissions="selectedUser.permissions" 
                @save="savePermissions" 
            />
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
import UserForm from '~/components/UserForm.vue';
import PermissionEditor from '~/components/PermissionEditor.vue';

definePageMeta({
    layout: 'app',
    middleware: 'auth'
});

const toast = useToast();
const { t } = useI18n();
const users = ref([]);
const loading = ref(false);
const userDialog = ref(false);
const permDialog = ref(false);
const selectedUser = ref(null);
const editMode = ref(false);

const loadUsers = async () => {
    loading.value = true;
    try {
        const data = await $fetch('/api/users');
        users.value = data;
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('admin.failedToLoadUsers') });
    } finally {
        loading.value = false;
    }
};

const getRoleSeverity = (role) => {
    switch (role) {
        case 'SuperAdmin': return 'danger';
        case 'ManufacturerAdmin': return 'warning';
        case 'ContractorAdmin': return 'success';
        case 'CustomerAdmin': return 'info';
        default: return 'secondary';
    }
};

const openCreateUser = () => {
    selectedUser.value = null;
    editMode.value = false;
    userDialog.value = true;
};

const editUser = (user) => {
    selectedUser.value = { ...user };
    editMode.value = true;
    userDialog.value = true;
};

const editPermissions = (user) => {
    selectedUser.value = { ...user };
    permDialog.value = true;
};

const saveUser = async (formData) => {
    try {
        if (editMode.value) {
            // Update user logic here (endpoint needed if strictly editing fields other than permissions)
            // For now, assuming create logic mainly
            toast.add({ severity: 'info', summary: t('common.info'), detail: t('admin.updateNotImplemented') });
        } else {
            await $fetch('/api/users', {
                method: 'POST',
                body: formData
            });
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.userCreated') });
        }
        userDialog.value = false;
        loadUsers();
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error.message });
    }
};

const savePermissions = async (newPermissions) => {
    try {
        await $fetch(`/api/users/${selectedUser.value._id}/permissions`, {
            method: 'PATCH',
            body: { permissions: newPermissions }
        });
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.permissionsUpdated') });
        permDialog.value = false;
        loadUsers();
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error.message });
    }
};

onMounted(() => {
    loadUsers();
});
</script>
