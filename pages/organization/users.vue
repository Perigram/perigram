<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-[var(--p-text-color)]">{{ $t('features.users') }}</h1>
      <Button :label="$t('common.create')" icon="pi pi-user-plus" @click="showCreateDialog = true" />
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
const selectedUser = ref(null);

const form = ref({
  name: '',
  email: '',
  password: '',
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
  } catch (error) {
    if (error.status !== 401) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
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
