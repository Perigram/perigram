<template>
  <div class="space-y-4">
    <div class="flex justify-between">
      <h2 class="text-xl font-semibold">Catalogs</h2>
      <Button label="New Catalog" icon="pi pi-plus" @click="showDialog = true" />
    </div>

    <DataTable :value="catalogs" :loading="loading" stripedRows>
      <Column field="name" header="Name" sortable />
      <Column field="description" header="Description" />
      <Column header="Sheet Types">
        <template #body="{ data }">
          {{ data.sheetTypes?.length || 0 }} types
        </template>
      </Column>
      <Column header="Actions">
        <template #body="{ data }">
          <Button icon="pi pi-pencil" text size="small" @click="edit(data)" />
          <Button icon="pi pi-trash" text severity="danger" size="small" @click="remove(data)" />
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="showDialog" header="Catalog" :style="{ width: '500px' }" modal>
      <div class="flex flex-col gap-4">
        <div>
          <label class="block mb-2">Name *</label>
          <InputText v-model="form.name" class="w-full" />
        </div>
        <div>
          <label class="block mb-2">Description</label>
          <Textarea v-model="form.description" class="w-full" rows="3" />
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

const catalogs = ref([]);
const loading = ref(false);
const showDialog = ref(false);
const form = ref({ name: '', description: '', manufacturerId: authStore.user?.organizationId });
const editingId = ref(null);

async function load() {
  loading.value = true;
  try {
    catalogs.value = await $fetch('/api/catalogs');
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
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
    form.value = { name: '', description: '', manufacturerId: authStore.user?.organizationId };
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
