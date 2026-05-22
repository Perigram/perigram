<template>
    <StandardPage :title="$t('features.users')">
        <template #actions>
            <Button :label="$t('common.create')" icon="pi pi-user-plus" @click="openCreateUser" />
        </template>

        <TableFrame>
        <DataTable :value="users" :loading="loading" stripedRows>
            <Column field="identity.name" :header="$t('profile.name')" sortable>
                <template #body="slotProps">
                    <span>{{ slotProps.data.identity?.name }}</span>
                </template>
            </Column>
            <Column field="data.email" :header="$t('profile.email')" sortable>
                <template #body="slotProps">
                    <span>{{ slotProps.data.data?.email }}</span>
                </template>
            </Column>
            <Column field="data.role" :header="$t('queue.status')" sortable>
                <template #body="slotProps">
                    <Tag :value="$t(`roles.${slotProps.data.data?.role}`)" :severity="getRoleSeverity(slotProps.data.data?.role)" size="small" />
                </template>
            </Column>
            <Column :header="$t('admin.workbench.entities')">
                <template #body="slotProps">
                    <div class="flex flex-col gap-1">
                        <small class="text-muted-color">{{ activeMembership(slotProps.data)?.organizationId || $t('common.notAvailable') }}</small>
                        <span>{{ activeMembership(slotProps.data)?.role || slotProps.data.data?.role }}</span>
                    </div>
                </template>
            </Column>
            <Column :header="$t('auth.permissions')">
                <template #body="slotProps">
                    <div class="flex flex-wrap gap-1">
                        <Tag
                            v-for="item in permissionSummary(slotProps.data).slice(0, 4)"
                            :key="item"
                            :value="item"
                            severity="secondary"
                            size="small"
                        />
                    </div>
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
        </TableFrame>

        <!-- User Dialog -->
        <StandardDialog v-model:visible="userDialog" :header="editMode ? $t('admin.editUser') : $t('admin.createUser')" size="sm">
            <UserForm :user="selectedUser" @save="saveUser" @cancel="userDialog = false" />
        </StandardDialog>

        <!-- Permissions Dialog -->
        <StandardDialog v-model:visible="permDialog" :header="$t('admin.editPermissions')" size="md">
            <div v-if="selectedUser" class="flex flex-col gap-4">
                <div class="flex flex-wrap gap-2">
                    <Tag :value="selectedUser.data?.role" severity="secondary" size="small" />
                    <Tag
                        v-if="activeMembership(selectedUser)?.organizationId"
                        :value="activeMembership(selectedUser).organizationId"
                        severity="info"
                        size="small"
                    />
                </div>
                <PermissionEditor
                    :permissions="activeMembership(selectedUser)?.permissions || selectedUser.data?.permissions"
                    @save="savePermissions"
                />
            </div>
        </StandardDialog>
    </StandardPage>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import UserForm from '~/components/UserForm.vue';
import PermissionEditor from '~/components/PermissionEditor.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import { useEntity } from '~/composables/useEntity';

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
const usersEntity = useEntity('user');

const loadUsers = async () => {
    loading.value = true;
    try {
        users.value = await usersEntity.list();
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

const activeMembership = (user) => {
    const memberships = user?.data?.memberships || [];
    return memberships.find(item => item.status === 'active') || memberships[0] || null;
};

const permissionSummary = (user) => {
    const permissions = activeMembership(user)?.permissions || user?.data?.permissions || {};
    return Object.entries(permissions)
        .filter(([, level]) => level && level !== 'none')
        .map(([feature, level]) => `${feature}:${level}`);
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
            await usersEntity.create(formData);
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
