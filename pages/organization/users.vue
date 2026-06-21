<template>
  <StandardPage :title="$t('organization.teamManagement')">
    <template #actions>
        <Button :label="$t('processDesigner.title')" icon="pi pi-sitemap" severity="secondary" outlined @click="navigateTo('/organization/process')" />
        <Button :label="$t('auth.inviteMember')" icon="pi pi-link" severity="secondary" @click="showInviteDialog = true" />
        <Button :label="$t('common.create')" icon="pi pi-user-plus" @click="showCreateDialog = true" />
    </template>

    <TableFrame>
    <DataTable :value="users" :loading="loading" stripedRows>
      <Column field="identity.name" :header="$t('profile.name')" sortable />
      <Column field="data.email" :header="$t('profile.email')" sortable />
      <Column field="data.role" :header="$t('queue.status')">
        <template #body="{ data }">
          <Tag :value="$t(`roles.${data.data?.role}`)" severity="info" />
        </template>
      </Column>
      <Column :header="$t('common.actions.title')" class="text-right">
        <template #body="{ data }">
          <div class="flex justify-end gap-2">
            <Button icon="pi pi-shield" text @click="editPermissions(data)" v-tooltip.top="$t('auth.permissions')" />
            <Button icon="pi pi-trash" text severity="danger" @click="confirmDelete(data)" v-tooltip.top="$t('common.delete')" />
          </div>
        </template>
      </Column>
    </DataTable>
    </TableFrame>

    <div v-if="invitations.length > 0" class="flex flex-col gap-4">
        <ActionToolbar :title="$t('auth.activeInvitations')" />
        <TableFrame>
        <DataTable :value="invitations">
            <Column :header="$t('auth.invitationLink')">
                <template #body="{ data }">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-mono opacity-60 truncate max-w-md">
                            {{ getInvitationUrl(data.token) }}
                        </span>
                        <Button icon="pi pi-copy" text size="small" :aria-label="$t('common.copy')" @click="copyToClipboard(getInvitationUrl(data.token))" />
                    </div>
                </template>
            </Column>
            <Column field="role" :header="$t('billing.role')" />
            <Column field="expiresAt" :header="$t('auth.expires')">
                <template #body="{ data }">
                    {{ new Date(data.expiresAt).toLocaleDateString() }}
                </template>
            </Column>
            <Column :header="$t('common.actions.title')" class="text-right">
                <template #body="{ data }">
                    <Button icon="pi pi-trash" text severity="danger" @click="revokeInvite(data._id)" v-tooltip.top="$t('common.revoke')" />
                </template>
            </Column>
        </DataTable>
        </TableFrame>
    </div>

    <!-- Pending Members Section -->
    <div v-if="pendingUsers.length > 0" class="flex flex-col gap-4">
        <ActionToolbar :title="$t('auth.joinRequests')" />
        <TableFrame>
        <DataTable :value="pendingUsers">
            <Column field="name" :header="$t('profile.name')" sortable />
            <Column field="email" :header="$t('profile.email')" />
            <Column :header="$t('common.actions.title')" class="text-right">
                <template #body="{ data }">
                    <div class="flex justify-end gap-2">
                        <Button icon="pi pi-check" :label="$t('common.approve')" severity="success" size="small" @click="confirmMembership(data._id, 'approve')" />
                        <Button icon="pi pi-times" :label="$t('common.reject')" severity="danger" size="small" text @click="confirmMembership(data._id, 'reject')" />
                    </div>
                </template>
            </Column>
        </DataTable>
        </TableFrame>
    </div>

    <!-- Invite Member Dialog -->
    <StandardDialog v-model:visible="showInviteDialog" :header="$t('auth.inviteMember')" size="sm">
        <div class="flex flex-col gap-4 pt-4">
            <p>{{ $t('auth.inviteMemberNote') }}</p>
            <div class="flex flex-col gap-2">
                <label>{{ $t('billing.role') }} *</label>
                <Select v-model="inviteForm.role" :options="roleOptions" optionLabel="label" optionValue="value" class="w-full" />
            </div>
            <div v-if="generatedUrl" class="mt-4">
                <Panel>
                    <div class="flex flex-col gap-2">
                        <small>{{ $t('auth.invitationLink') }}</small>
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-mono truncate flex-1">{{ generatedUrl }}</span>
                            <Button icon="pi pi-copy" text size="small" :aria-label="$t('common.copy')" @click="copyToClipboard(generatedUrl)" />
                        </div>
                    </div>
                </Panel>
            </div>
        </div>
        <template #footer>
            <Button :label="$t('common.close')" text severity="secondary" @click="showInviteDialog = false; generatedUrl = null" />
            <Button :label="$t('auth.generateLink')" icon="pi pi-link" @click="generateInvite" :loading="generatingInvite" v-if="!generatedUrl" />
        </template>
    </StandardDialog>

    <!-- Create User Dialog -->
    <StandardDialog v-model:visible="showCreateDialog" :header="$t('auth.createAccount')" size="sm">
      <form @submit.prevent="createUser" class="flex flex-col gap-4 pt-4">
        <div class="flex flex-col gap-2">
          <label>{{ $t('profile.name') }} *</label>
          <InputText v-model="form.name" required class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('profile.email') }} *</label>
          <InputText v-model="form.email" type="email" required class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('profile.password') }} *</label>
          <Password v-model="form.password" required toggleMask class="w-full" :inputStyle="{ width: '100%' }" />
        </div>
        <div class="flex flex-col gap-2">
          <label>{{ $t('billing.role') }} *</label>
          <Select v-model="form.role" :options="roleOptions" optionLabel="label" optionValue="value" required class="w-full" />
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <Button type="button" :label="$t('common.cancel')" text severity="secondary" @click="showCreateDialog = false" />
          <Button type="submit" :label="$t('common.create')" :loading="submitting" />
        </div>
      </form>
    </StandardDialog>

    <!-- Permissions Dialog -->
    <StandardDialog v-model:visible="showPermissionsDialog" :header="`${$t('auth.permissions')}: ${selectedUser?.identity?.name}`" size="lg">
        <div class="pt-4">
            <PermissionEditor 
                v-if="selectedUser" 
                :permissions="selectedUser.data?.permissions" 
                @save="savePermissions" 
            />
        </div>
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Panel from 'primevue/panel';
import PermissionEditor from '~/components/PermissionEditor.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import { useEntity } from '~/composables/useEntity';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { t } = useI18n();
const authStore = useAuthStore();
const toast = useToast();
const usersEntity = useEntity('user');

const users = ref([]);
const loading = ref(false);
const submitting = ref(false);
const showCreateDialog = ref(false);
const showPermissionsDialog = ref(false);
const showInviteDialog = ref(false);
const generatingInvite = ref(false);
const selectedUser = ref(null);
const generatedUrl = ref(null);
const invitations = ref([]);
const pendingUsers = ref([]);

const getInvitationUrl = (token) => {
    if (process.client) {
        return `${window.location.origin}/invitation/${token}`;
    }
    return '';
};

const revokeInvite = async (id) => {
    if (confirm(t('auth.revokeInvitationConfirm'))) {
        try {
            await $fetch(`/api/organizations/${authStore.userData.organizationId}/invitations/${id}`, { method: 'DELETE' });
            await loadInvitations();
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.invitationRevoked'), life: 3000 });
        } catch (e) {
            toast.add({ severity: 'error', summary: t('common.error'), detail: e.message, life: 3000 });
        }
    }
};

const form = ref({
  name: '',
  email: '',
  password: '',
  role: 'IndividualUser'
});

const inviteForm = ref({
    role: 'IndividualUser'
});

const roleOptions = computed(() => {
  const baseType = authStore.organizationData?.data?.type || 'Individual';
  return [
    { label: t(`roles.${baseType}Admin`), value: `${baseType}Admin` },
    { label: t('roles.IndividualUser'), value: 'IndividualUser' }
  ];
});

async function loadUsers() {
  loading.value = true;
  try {
    const allUsers = await usersEntity.list();
    users.value = allUsers.filter(u => 
        u.data?.memberships?.some(m => m.organizationId.toString() === authStore.userData.organizationId.toString() && m.status === 'active')
    );
    pendingUsers.value = allUsers.filter(u => 
        u.data?.memberships?.some(m => m.organizationId.toString() === authStore.userData.organizationId.toString() && m.status === 'pending')
    );
    await loadInvitations();
  } catch (error) {
    if (error.status !== 401) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

async function loadInvitations() {
    try {
        invitations.value = await $fetch(`/api/organizations/${authStore.userData.organizationId}/invitations`);
    } catch (e) { console.error(e); }
}

async function generateInvite() {
    generatingInvite.value = true;
    try {
        const res = await $fetch(`/api/organizations/${authStore.userData.organizationId}/invitations`, {
            method: 'POST',
            body: inviteForm.value
        });
        generatedUrl.value = getInvitationUrl(res.token);
        await loadInvitations();
    } catch (e) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: e.message, life: 3000 });
    } finally {
        generatingInvite.value = false;
    }
}

async function confirmMembership(userId, action) {
    try {
        await $fetch(`/api/users/${userId}/membership-confirmation`, {
            method: 'POST',
            body: { action, organizationId: authStore.userData.organizationId }
        });
        toast.add({ severity: 'success', summary: t('common.success'), detail: t(`auth.membership.${action}`), life: 3000 });
        await loadUsers();
    } catch (e) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: e.message, life: 3000 });
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    toast.add({ severity: 'success', summary: t('common.copied'), detail: t('auth.invitationCopied'), life: 2000 });
}

async function createUser() {
  submitting.value = true;
  try {
    await usersEntity.create({
        ...form.value,
        organizationId: authStore.userData.organizationId
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.userCreated'), life: 3000 });
    showCreateDialog.value = false;
    form.value = { name: '', email: '', password: '', role: 'IndividualUser' };
    await loadUsers();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 });
  } finally {
    submitting.value = false;
  }
}

function editPermissions(user) {
  selectedUser.value = user;
  showPermissionsDialog.value = true;
}

async function savePermissions(permissions) {
  try {
    await $fetch(`/api/users/${selectedUser.value._id}/permissions`, {
      method: 'PATCH',
      body: { permissions }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.permissionsUpdated'), life: 3000 });
    showPermissionsDialog.value = false;
    await loadUsers();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 });
  }
}

async function confirmDelete(user) {
    if (confirm(t('auth.removeUserConfirm', { name: user.identity?.name }))) {
        try {
            const { remove } = useEntity('user', user._id);
            await remove();
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.userRemoved'), life: 3000 });
            await loadUsers();
        } catch (error) {
            toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 });
        }
    }
}

onMounted(() => {
  loadUsers();
});
</script>
