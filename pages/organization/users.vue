<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-[var(--p-text-color)]">{{ $t('features.users') }}</h1>
      <div class="flex gap-2">
        <Button label="Invite Member" icon="pi pi-link" severity="secondary" @click="showInviteDialog = true" />
        <Button :label="$t('common.create')" icon="pi pi-user-plus" @click="showCreateDialog = true" />
      </div>
    </div>

    <DataTable :value="users" :loading="loading" stripedRows class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden">
      <Column field="name" :header="$t('profile.name')" sortable />
      <Column field="email" :header="$t('profile.email')" sortable />
      <Column field="role" :header="$t('queue.status')">
        <template #body="{ data }">
          <Tag :value="$t(`roles.${data.role}`)" severity="info" />
        </template>
      </Column>
      <Column :header="$t('common.actions')" class="text-right">
        <template #body="{ data }">
          <div class="flex justify-end gap-2">
            <Button icon="pi pi-shield" text @click="editPermissions(data)" v-tooltip.top="'Permissions'" />
            <Button icon="pi pi-trash" text severity="danger" @click="confirmDelete(data)" v-tooltip.top="'Delete'" />
          </div>
        </template>
      </Column>
    </DataTable>

    <div v-if="invitations.length > 0" class="flex flex-col gap-4 mt-8">
        <h2 class="text-xl font-bold">Active Invitations</h2>
        <DataTable :value="invitations" class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden">
            <Column field="code" header="Invite Code">
                <template #body="{ data }">
                    <span class="font-mono font-bold text-[var(--p-primary-color)]">{{ data.code }}</span>
                </template>
            </Column>
            <Column field="role" header="Role" />
            <Column field="expiresAt" header="Expires">
                <template #body="{ data }">
                    {{ new Date(data.expiresAt).toLocaleDateString() }}
                </template>
            </Column>
            <Column header="Actions" class="text-right">
                <template #body="{ data }">
                    <Button icon="pi pi-copy" text @click="copyToClipboard(data.code)" v-tooltip.top="'Copy Link'" />
                </template>
            </Column>
        </DataTable>
    </div>

    <!-- Invite Member Dialog -->
    <Dialog v-model:visible="showInviteDialog" header="Invite Member" :style="{ width: '450px' }" modal>
        <div class="flex flex-col gap-4 pt-4">
            <p class="text-sm text-[var(--p-text-muted-color)] m-0">Generate a unique code that a user can use to join your organization from their profile.</p>
            <div class="flex flex-col gap-2">
                <label class="font-bold text-sm">Role *</label>
                <Select v-model="inviteForm.role" :options="roleOptions" optionLabel="label" optionValue="value" class="w-full" />
            </div>
            <div v-if="generatedCode" class="p-4 bg-[var(--p-surface-50)] border-2 border-dashed border-[var(--p-primary-color)] rounded-xl text-center mt-4 animate-in fade-in zoom-in">
                <span class="text-[10px] font-black uppercase opacity-60 block mb-1">Your Code</span>
                <span class="text-2xl font-mono font-black text-[var(--p-primary-color)]">{{ generatedCode }}</span>
                <Button label="Copy Code" icon="pi pi-copy" text size="small" class="mt-2 block mx-auto" @click="copyToClipboard(generatedCode)" />
            </div>
        </div>
        <template #footer>
            <Button label="Close" text severity="secondary" @click="showInviteDialog = false; generatedCode = null" />
            <Button label="Generate Code" icon="pi pi-refresh" @click="generateInvite" :loading="generatingInvite" v-if="!generatedCode" />
        </template>
    </Dialog>

    <!-- Create User Dialog -->
    <Dialog v-model:visible="showCreateDialog" :header="$t('auth.createAccount')" :style="{ width: '500px' }" modal>
      <form @submit.prevent="createUser" class="flex flex-col gap-4 pt-4">
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('profile.name') }} *</label>
          <InputText v-model="form.name" required class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('profile.email') }} *</label>
          <InputText v-model="form.email" type="email" required class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('profile.password') }} *</label>
          <Password v-model="form.password" required toggleMask class="w-full" inputClass="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">Role *</label>
          <Select v-model="form.role" :options="roleOptions" optionLabel="label" optionValue="value" required class="w-full" />
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <Button type="button" :label="$t('common.cancel')" text severity="secondary" @click="showCreateDialog = false" />
          <Button type="submit" :label="$t('common.create')" :loading="submitting" />
        </div>
      </form>
    </Dialog>

    <!-- Permissions Dialog -->
    <Dialog v-model:visible="showPermissionsDialog" :header="'Permissions: ' + selectedUser?.name" :style="{ width: '800px' }" modal>
        <div class="pt-4">
            <PermissionEditor 
                v-if="selectedUser" 
                :permissions="selectedUser.permissions" 
                @save="savePermissions" 
            />
        </div>
    </Dialog>
  </div>
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
import Dialog from 'primevue/dialog';
import PermissionEditor from '~/components/PermissionEditor.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { t } = useI18n();
const authStore = useAuthStore();
const toast = useToast();

const users = ref([]);
const loading = ref(false);
const submitting = ref(false);
const showCreateDialog = ref(false);
const showPermissionsDialog = ref(false);
const showInviteDialog = ref(false);
const generatingInvite = ref(false);
const selectedUser = ref(null);
const generatedCode = ref(null);
const invitations = ref([]);

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
  const baseType = authStore.organizationData?.type || 'Individual';
  return [
    { label: t(`roles.${baseType}Admin`), value: `${baseType}Admin` },
    { label: t('roles.IndividualUser'), value: 'IndividualUser' }
  ];
});

async function loadUsers() {
  loading.value = true;
  try {
    users.value = await $fetch('/api/users');
    await loadInvitations();
  } catch (error) {
    if (error.status !== 401) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
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
        generatedCode.value = res.code;
        await loadInvitations();
    } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 });
    } finally {
        generatingInvite.value = false;
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    toast.add({ severity: 'success', summary: 'Copied', detail: 'Invitation code copied to clipboard', life: 2000 });
}

async function createUser() {
  submitting.value = true;
  try {
    await $fetch('/api/users', {
      method: 'POST',
      body: {
        ...form.value,
        organizationId: authStore.userData.organizationId
      }
    });
    toast.add({ severity: 'success', summary: 'Success', detail: 'User created successfully', life: 3000 });
    showCreateDialog.value = false;
    form.value = { name: '', email: '', password: '', role: 'IndividualUser' };
    await loadUsers();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
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
    toast.add({ severity: 'success', summary: 'Success', detail: 'Permissions updated', life: 3000 });
    showPermissionsDialog.value = false;
    await loadUsers();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
  }
}

async function confirmDelete(user) {
    if (confirm(`Are you sure you want to remove ${user.name}?`)) {
        try {
            await $fetch(`/api/users/${user._id}`, { method: 'DELETE' });
            toast.add({ severity: 'success', summary: 'Success', detail: 'User removed', life: 3000 });
            await loadUsers();
        } catch (error) {
            toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
        }
    }
}

onMounted(() => {
  loadUsers();
});
</script>
