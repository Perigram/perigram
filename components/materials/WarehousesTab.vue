<template>
  <div class="space-y-4">
    <div class="flex justify-between">
      <h2 class="text-xl font-semibold">Warehouses</h2>
      <Button label="New Warehouse" icon="pi pi-plus" @click="showDialog = true" />
    </div>

    <DataTable :value="warehouses" :loading="loading" stripedRows>
      <Column field="name" header="Name" sortable />
      <Column field="address" header="Address" />
      <Column field="contactPerson" header="Contact" />
      <Column header="Inventory">
        <template #body="{ data }">
          <div class="text-sm space-y-1">
            <div>Batches: <Tag :value="data.totalBatches" severity="info" /></div>
            <div>Sheets: <Tag :value="data.totalSheets" severity="success" /></div>
            <div>Remnants: <Tag :value="data.totalRemnants" severity="warn" /></div>
          </div>
        </template>
      </Column>
      <Column header="Actions">
        <template #body="{ data }">
          <Button icon="pi pi-pencil" text size="small" @click="edit(data)" />
          <Button icon="pi pi-trash" text severity="danger" size="small" @click="remove(data)" />
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="showDialog" header="Warehouse" :style="{ width: '500px' }" modal>
      <div class="flex flex-col gap-4">
        <div>
          <label class="block mb-2">Name *</label>
          <InputText v-model="form.name" class="w-full" />
        </div>
        <div>
          <label class="block mb-2">Address</label>
          <Textarea v-model="form.address" class="w-full" rows="3" />
        </div>
        <div>
          <label class="block mb-2">Contact Person</label>
          <InputText v-model="form.contactPerson" class="w-full" />
        </div>
        <div class="flex justify-end gap-2">
          <Button label="Cancel" severity="secondary" @click="showDialog = false" />
          <Button label="Save" @click="save" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '~/stores/auth';

const toast = useToast();
const authStore = useAuthStore();

const warehouses = ref([]);
const loading = ref(false);
const showDialog = ref(false);
const form = ref({ name: '', address: '', contactPerson: '', organizationId: authStore.user?.organizationId });
const editingId = ref(null);

async function load() {
  loading.value = true;
  try {
    warehouses.value = await $fetch('/api/warehouses');
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
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
    form.value = { name: '', address: '', contactPerson: '', organizationId: authStore.user?.organizationId };
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
