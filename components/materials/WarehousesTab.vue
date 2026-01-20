<template>
  <div class="flex flex-col gap-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-bold text-[var(--p-text-color)]">{{ $t('features.warehouses') }}</h2>
      <Button :label="$t('common.create')" icon="pi pi-plus" @click="showDialog = true" />
    </div>

    <DataTable :value="warehouses" :loading="loading" stripedRows class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden">
      <Column field="name" :header="$t('common.name')" sortable />
      <Column field="address" :header="$t('profile.address', 'Address')" />
      <Column field="contactPerson" :header="$t('common.contact', 'Contact')" />
      <Column :header="$t('common.inventory', 'Inventory')">
        <template #body="{ data }">
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between gap-4">
                <span class="text-xs font-bold opacity-60 uppercase">{{ $t('features.batches') }}:</span>
                <Tag :value="data.totalBatches" severity="info" />
            </div>
            <div class="flex items-center justify-between gap-4">
                <span class="text-xs font-bold opacity-60 uppercase">{{ $t('features.sheets') }}:</span>
                <Tag :value="data.totalSheets" severity="success" />
            </div>
            <div class="flex items-center justify-between gap-4">
                <span class="text-xs font-bold opacity-60 uppercase">{{ $t('features.remnants') }}:</span>
                <Tag :value="data.totalRemnants" severity="warn" />
            </div>
          </div>
        </template>
      </Column>
      <Column header="Actions" class="text-right">
        <template #body="{ data }">
          <div class="flex justify-end gap-2">
            <Button icon="pi pi-pencil" text @click="edit(data)" v-tooltip.top="'Edit'" />
            <Button icon="pi pi-trash" text severity="danger" @click="remove(data)" v-tooltip.top="'Delete'" />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="showDialog" :header="$t('features.warehouses')" :style="{ width: '500px' }" modal>
      <div class="flex flex-col gap-4 pt-4">
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('common.name') }} *</label>
          <InputText v-model="form.name" class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('profile.address') }}</label>
          <Textarea v-model="form.address" class="w-full" rows="3" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('common.contact', 'Contact Person') }}</label>
          <InputText v-model="form.contactPerson" class="w-full" />
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
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';

const toast = useToast();
const authStore = useAuthStore();

const warehouses = ref([]);
const loading = ref(false);
const showDialog = ref(false);
const form = ref({ name: '', address: '', contactPerson: '', organizationId: authStore.userData?.organizationId });
const editingId = ref(null);

async function load() {
  loading.value = true;
  try {
    warehouses.value = await $fetch('/api/warehouses');
  } catch (error) {
    if (error.status !== 401) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

function edit(warehouse) {
  form.value = { ...warehouse };
  editingId.value = warehouse._id;
  showDialog.value = true;
}

async function save() {
  try {
    if (editingId.value) {
      await $fetch(`/api/warehouses/${editingId.value}`, { method: 'PUT', body: form.value });
      toast.add({ severity: 'success', summary: 'Success', detail: 'Warehouse updated', life: 3000 });
    } else {
      await $fetch('/api/warehouses', { method: 'POST', body: form.value });
      toast.add({ severity: 'success', summary: 'Success', detail: 'Warehouse created', life: 3000 });
    }
    showDialog.value = false;
    form.value = { name: '', address: '', contactPerson: '', organizationId: authStore.userData?.organizationId };
    editingId.value = null;
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
  }
}

async function remove(warehouse) {
  if (confirm(`Delete warehouse "${warehouse.name}"?`)) {
    try {
      await $fetch(`/api/warehouses/${warehouse._id}`, { method: 'DELETE' });
      toast.add({ severity: 'success', summary: 'Success', detail: 'Warehouse deleted', life: 3000 });
      await load();
    } catch (error) {
      toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  }
}

onMounted(() => load());
</script>
