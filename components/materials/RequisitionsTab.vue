<template>
    <div class="flex flex-col gap-4">
        <div class="flex justify-between items-center">
            <h2 class="text-xl font-bold text-[var(--p-text-color)]">{{ $t('features.requisitions') }}</h2>
            <Button v-if="authStore.isContractor" :label="$t('common.create')" icon="pi pi-plus" @click="showDialog = true" />
        </div>

        <DataTable :value="requisitions" :loading="loading" stripedRows class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden">
            <Column field="requisitionNumber" header="#" sortable />
            <Column header="Status">
                <template #body="{ data }">
                    <Tag :value="data.status.toUpperCase()" :severity="getStatusSeverity(data.status)" />
                </template>
            </Column>
            <Column field="totalAmount" header="Total">
                <template #body="{ data }">
                    {{ data.totalAmount.toFixed(2) }}
                </template>
            </Column>
            <Column header="Items">
                <template #body="{ data }">
                    {{ data.items.length }}
                </template>
            </Column>
            <Column field="createdAt" header="Created">
                <template #body="{ data }">
                    {{ new Date(data.createdAt).toLocaleDateString() }}
                </template>
            </Column>
            <Column header="Actions" class="text-right">
                <template #body="{ data }">
                    <div class="flex justify-end gap-2">
                        <Button v-if="data.status === 'draft' && authStore.isContractor" icon="pi pi-send" text @click="send(data._id)" v-tooltip.top="'Send'" />
                        <Button v-if="data.status === 'sent' && authStore.isManufacturer" icon="pi pi-check" text severity="success" @click="approve(data._id)" v-tooltip.top="'Approve'" />
                        <Button v-if="data.status === 'approved' && authStore.isManufacturer" icon="pi pi-box" text severity="info" @click="fulfill(data._id)" v-tooltip.top="'Fulfill'" />
                        <Button v-if="data.status !== 'fulfilled' && data.status !== 'canceled'" icon="pi pi-times" text severity="danger" @click="cancel(data._id)" v-tooltip.top="'Cancel'" />
                    </div>
                </template>
            </Column>
        </DataTable>

    <Dialog v-model:visible="showDialog" header="New Requisition" :style="{ width: '700px' }" modal>
      <div class="flex flex-col gap-4">
        <div>
          <label class="block mb-2">Manufacturer *</label>
          <Select v-model="form.manufacturerId" :options="manufacturers" optionLabel="name" optionValue="_id" class="w-full" placeholder="Select manufacturer" />
        </div>
        <div>
          <label class="block mb-2">Notes</label>
          <Textarea v-model="form.notes" class="w-full" rows="3" />
        </div>
        <Divider />
        <div>
          <div class="flex justify-between mb-2">
            <label class="block font-semibold">Items</label>
            <Button label="Add Item" icon="pi pi-plus" size="small" @click="addItem" />
          </div>
          <div v-for="(item, idx) in form.items" :key="idx" class="border p-3 rounded mb-2">
            <div class="flex gap-2">
              <Select v-model="item.catalogId" :options="catalogs" optionLabel="name" optionValue="_id" placeholder="Catalog" class="flex-1" />
              <InputNumber v-model="item.quantity" placeholder="Qty" :min="1" class="w-24" />
              <Button icon="pi pi-trash" text severity="danger" @click="form.items.splice(idx, 1)" />
            </div>
          </div>
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

const requisitions = ref([]);
const manufacturers = ref([]);
const catalogs = ref([]);
const loading = ref(false);
const showDialog = ref(false);
const form = ref({ manufacturerId: null, notes: '', items: [] });

function getStatusSeverity(status) {
  const map = { draft: 'secondary', sent: 'info', approved: 'warn', fulfilled: 'success', canceled: 'danger' };
  return map[status] || 'secondary';
}

async function load() {
  loading.value = true;
  try {
    requisitions.value = await $fetch('/api/requisitions');
    if (authStore.isContractor) {
      const orgs = await $fetch('/api/organizations');
      manufacturers.value = orgs.filter(o => o.type === 'Manufacturer');
      catalogs.value = await $fetch('/api/catalogs');
    }
  } catch (error) {
    if (error.status !== 401) {
      toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

function addItem() {
  form.value.items.push({ catalogId: null, sheetTypeId: null, sizeIndex: 0, quantity: 1 });
}

async function create() {
  try {
    await $fetch('/api/requisitions', { method: 'POST', body: form.value });
    toast.add({ severity: 'success', summary: 'Success', detail: 'Requisition created', life: 3000 });
    showDialog.value = false;
    form.value = { manufacturerId: null, notes: '', items: [] };
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
  }
}

async function send(id) {
  try {
    await $fetch(`/api/requisitions/${id}/send`, { method: 'POST' });
    toast.add({ severity: 'success', summary: 'Success', detail: 'Requisition sent', life: 3000 });
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
  }
}

async function approve(id) {
  try {
    await $fetch(`/api/requisitions/${id}/approve`, { method: 'POST' });
    toast.add({ severity: 'success', summary: 'Success', detail: 'Requisition approved', life: 3000 });
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
  }
}

async function fulfill(id) {
  try {
    await $fetch(`/api/requisitions/${id}/fulfill`, { method: 'POST' });
    toast.add({ severity: 'success', summary: 'Success', detail: 'Requisition fulfilled', life: 3000 });
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
  }
}

async function cancel(id) {
  if (confirm('Cancel this requisition?')) {
    try {
      await $fetch(`/api/requisitions/${id}/cancel`, { method: 'POST' });
      toast.add({ severity: 'success', summary: 'Success', detail: 'Requisition canceled', life: 3000 });
      await load();
    } catch (error) {
      toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  }
}

onMounted(() => load());
</script>
