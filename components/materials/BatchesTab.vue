<template>
  <div class="flex flex-col gap-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-bold text-[var(--p-text-color)]">{{ $t('features.batches') }}</h2>
      <Button v-if="authStore.isManufacturer || authStore.isSuperAdmin" :label="$t('common.create')" icon="pi pi-plus" @click="showDialog = true" />
    </div>

    <DataTable :value="batches" :loading="loading" stripedRows class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden">
      <Column field="batchNumber" header="#" sortable />
      <Column :header="$t('queue.status')">
        <template #body="{ data }">
          <Tag :value="data.status.toUpperCase()" :severity="getStatusSeverity(data.status)" />
        </template>
      </Column>
      <Column header="Piles">
        <template #body="{ data }">
          {{ data.piles?.length || 0 }}
        </template>
      </Column>
      <Column field="createdAt" header="Created">
        <template #body="{ data }">
          {{ new Date(data.createdAt).toLocaleDateString() }}
        </template>
      </Column>
      <Column header="Actions" class="text-right">
        <template #body="{ data }">
          <Button icon="pi pi-pencil" text @click="updateStatus(data)" v-tooltip.top="'Update Status'" />
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="showDialog" :header="$t('features.batches')" :style="{ width: '600px' }" modal>
      <div class="flex flex-col gap-4 pt-4">
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('features.warehouses') }} *</label>
          <Select v-model="form.warehouseId" :options="warehouses" optionLabel="name" optionValue="_id" class="w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">Supplier *</label>
          <Select v-model="form.supplierId" :options="suppliers" optionLabel="name" optionValue="_id" class="w-full" />
        </div>
      </div>
      <template #footer>
          <Button :label="$t('common.cancel')" text severity="secondary" @click="showDialog = false" />
          <Button :label="$t('common.create')" @click="create" />
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
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';

const toast = useToast();
const authStore = useAuthStore();

const batches = ref([]);
const warehouses = ref([]);
const suppliers = ref([]);
const loading = ref(false);
const showDialog = ref(false);
const form = ref({ warehouseId: null, supplierId: authStore.userData?.organizationId, piles: [] });

function getStatusSeverity(status) {
  const map = { requested: 'secondary', assembled: 'info', sent: 'info', arrived: 'success', in_stock: 'success', partially_used: 'warn', used_up: 'danger' };
  return map[status] || 'secondary';
}

async function load() {
  loading.value = true;
  try {
    batches.value = await $fetch('/api/material-batches');
    warehouses.value = await $fetch('/api/warehouses');
  } catch (error) {
    if (error.status !== 401) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

async function create() {
  try {
    await $fetch('/api/material-batches', { method: 'POST', body: form.value });
    toast.add({ severity: 'success', summary: 'Success', detail: 'Batch created', life: 3000 });
    showDialog.value = false;
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
  }
}

function updateStatus(batch) {
  toast.add({ severity: 'info', summary: 'Info', detail: 'Status update dialog not implemented', life: 3000 });
}

onMounted(() => load());
</script>
