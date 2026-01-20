<template>
  <div class="flex flex-col gap-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-bold text-[var(--p-text-color)]">{{ $t('features.catalogs') }}</h2>
      <Button v-if="authStore.isManufacturer || authStore.isSuperAdmin" :label="$t('common.create')" icon="pi pi-plus" @click="showDialog = true" />
    </div>

    <DataTable :value="catalogs" :loading="loading" stripedRows class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden">
      <Column field="name" :header="$t('common.name')" sortable />
      <Column field="description" :header="$t('common.description')" />
      <Column :header="$t('features.sheets')">
        <template #body="{ data }">
          {{ data.sheetTypes?.length || 0 }}
        </template>
      </Column>
      <Column header="Actions" class="text-right">
        <template #body="{ data }">
          <div class="flex justify-end gap-2">
            <Button v-if="authStore.isManufacturer || authStore.isSuperAdmin" icon="pi pi-pencil" text @click="edit(data)" v-tooltip.top="'Edit'" />
            <Button v-if="authStore.isManufacturer || authStore.isSuperAdmin" icon="pi pi-trash" text severity="danger" @click="remove(data)" v-tooltip.top="'Delete'" />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="showDialog" :header="$t('features.catalogs')" :style="{ width: '500px' }" modal>
      <div class="flex flex-col gap-4 pt-4">
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('common.name') }} *</label>
          <InputText v-model="form.name" class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('common.description') }}</label>
          <Textarea v-model="form.description" class="w-full" rows="3" />
        </div>
      </div>
      <template #footer>
          <Button :label="$t('common.cancel')" text severity="secondary" @click="showDialog = false" />
          <Button :label="$t('common.save')" @click="save" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '~/stores/auth';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';

const toast = useToast();
const authStore = useAuthStore();

const catalogs = ref([]);
const loading = ref(false);
const showDialog = ref(false);
const form = ref({ name: '', description: '', manufacturerId: authStore.userData?.organizationId });
const editingId = ref(null);

async function load() {
  loading.value = true;
  try {
    catalogs.value = await $fetch('/api/catalogs');
  } catch (error) {
    if (error.status !== 401) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

function edit(catalog) {
  form.value = { ...catalog };
  editingId.value = catalog._id;
  showDialog.value = true;
}

async function save() {
  try {
    if (editingId.value) {
      await $fetch(`/api/catalogs/${editingId.value}`, { method: 'PUT', body: form.value });
      toast.add({ severity: 'success', summary: 'Success', detail: 'Catalog updated', life: 3000 });
    } else {
      await $fetch('/api/catalogs', { method: 'POST', body: form.value });
      toast.add({ severity: 'success', summary: 'Success', detail: 'Catalog created', life: 3000 });
    }
    showDialog.value = false;
    form.value = { name: '', description: '', manufacturerId: authStore.userData?.organizationId };
    editingId.value = null;
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
  }
}

async function remove(catalog) {
  if (confirm(`Delete catalog "${catalog.name}"?`)) {
    try {
      await $fetch(`/api/catalogs/${catalog._id}`, { method: 'DELETE' });
      toast.add({ severity: 'success', summary: 'Success', detail: 'Catalog deleted', life: 3000 });
      await load();
    } catch (error) {
      toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  }
}

onMounted(() => load());
</script>
