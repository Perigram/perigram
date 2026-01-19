<template>
  <div class="space-y-4">
    <div class="flex justify-between">
      <h2 class="text-xl font-semibold">Material Batches</h2>
      <Button v-if="isManufacturer" label="New Batch" icon="pi pi-plus" @click="showDialog = true" />
    </div>

    <DataTable :value="batches" :loading="loading" stripedRows>
      <Column field="batchNumber" header="Batch #" sortable />
      <Column header="Status">
        <template #body="{ data }">
          <Tag :value="data.status" :severity="getStatusSeverity(data.status)" />
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
      <Column header="Actions">
        <template #body="{ data }">
          <Button label="Update Status" size="small" @click="updateStatus(data)" />
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="showDialog" header="New Material Batch" :style="{ width: '600px' }" modal>
      <div class="flex flex-col gap-4">
        <div>
          <label class="block mb-2">Warehouse *</label>
          <Select v-model="form.warehouseId" :options="warehouses" optionLabel="name" optionValue="_id" class="w-full" />
        </div>
        <div>
          <label class="block mb-2">Supplier *</label>
          <Select v-model="form.supplierId" :options="suppliers" optionLabel="name" optionValue="_id" class="w-full" />
        </div>
        <div class="flex justify-end gap-2">
          <Button label="Cancel" severity="secondary" @click="showDialog = false" />
          <Button label="Create" @click="create" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '~/stores/auth';

const toast = useToast();
const authStore = useAuthStore();

const isManufacturer = computed(() => authStore.organizationData?.type === 'Manufacturer');

const batches = ref([]);
const warehouses = ref([]);
const suppliers = ref([]);
const loading = ref(false);
const showDialog = ref(false);
const form = ref({ warehouseId: null, supplierId: authStore.user?.organizationId, piles: [] });

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
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
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
