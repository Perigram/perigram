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
                    <Tag :value="getStatusLabel(data.status)" :severity="getStatusSeverity(data.status)" />
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
                        <Button v-if="data.status === 'draft' && authStore.isContractor" icon="pi pi-send" text @click="send(data._id)" v-tooltip.top="'Submit'" />
                        
                        <Button v-if="data.status === 'sent' && authStore.isManufacturer" icon="pi pi-check" text severity="success" @click="approve(data._id)" v-tooltip.top="'Approve'" />
                        <Button v-if="data.status === 'sent' && authStore.isManufacturer" icon="pi pi-times" text severity="danger" @click="reject(data._id)" v-tooltip.top="'Reject'" />
                        
                        <Button v-if="data.status === 'approved' && authStore.isManufacturer" icon="pi pi-play" text severity="info" @click="startFulfillment(data._id)" v-tooltip.top="'Start Fulfillment'" />
                        <Button v-if="data.status === 'in_fulfillment' && authStore.isManufacturer" icon="pi pi-box" text severity="success" @click="fulfill(data._id)" v-tooltip.top="'Complete Fulfillment'" />
                        
                        <Button v-if="!['fulfilled', 'canceled', 'rejected'].includes(data.status)" icon="pi pi-ban" text severity="danger" @click="cancel(data._id)" v-tooltip.top="'Cancel'" />
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

    <Dialog v-model:visible="showFulfillDialog" header="Complete Fulfillment" :style="{ width: '500px' }" modal>
      <div class="flex flex-col gap-4 py-4">
        <p class="text-sm text-[var(--p-text-secondary-color)]">
          Completing fulfillment will automatically create a material batch in the selected warehouse.
        </p>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">Target Warehouse *</label>
          <Select 
            v-model="fulfillForm.warehouseId" 
            :options="warehouses" 
            optionLabel="name" 
            optionValue="_id" 
            placeholder="Select warehouse"
            class="w-full"
          />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">Notes</label>
          <Textarea v-model="fulfillForm.notes" class="w-full" rows="3" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="showFulfillDialog = false" />
        <Button label="Confirm & Create Batch" @click="confirmFulfill" :disabled="!fulfillForm.warehouseId" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '~/stores/auth';
import Textarea from 'primevue/textarea';
import Divider from 'primevue/divider';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';

const toast = useToast();
const authStore = useAuthStore();

const requisitions = ref([]);
const manufacturers = ref([]);
const catalogs = ref([]);
const warehouses = ref([]);
const loading = ref(false);
const showDialog = ref(false);
const showFulfillDialog = ref(false);
const form = ref({ manufacturerId: null, notes: '', items: [] });
const fulfillForm = ref({ warehouseId: null, notes: '' });
const fulfillingId = ref(null);

function getStatusLabel(status) {
...
async function load() {
  loading.value = true;
  try {
    requisitions.value = await $fetch('/api/requisitions');
    if (authStore.isContractor) {
      const orgs = await $fetch('/api/organizations');
      manufacturers.value = orgs.filter(o => o.type === 'Manufacturer');
      catalogs.value = await $fetch('/api/catalogs');
    }
    if (authStore.isManufacturer || authStore.isSuperAdmin) {
        warehouses.value = await $fetch('/api/warehouses');
    }
  } catch (error) {
...
async function startFulfillment(id) {
  try {
    await $fetch(`/api/requisitions/${id}/start-fulfillment`, { method: 'POST' });
    toast.add({ severity: 'success', summary: 'Success', detail: 'Fulfillment started', life: 3000 });
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
  }
}

function fulfill(id) {
  fulfillingId.value = id;
  fulfillForm.value = { warehouseId: null, notes: '' };
  showFulfillDialog.value = true;
}

async function confirmFulfill() {
  try {
    await $fetch(`/api/requisitions/${fulfillingId.value}/fulfill`, { 
        method: 'POST',
        body: fulfillForm.value
    });
    toast.add({ severity: 'success', summary: 'Success', detail: 'Requisition fulfilled and batch created', life: 3000 });
    showFulfillDialog.value = false;
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
