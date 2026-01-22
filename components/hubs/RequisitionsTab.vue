<template>
  <div class="flex flex-col gap-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-black text-[var(--p-text-color)]">{{ $t('features.requisitions') }}</h2>
        <p class="text-sm text-[var(--p-text-secondary-color)]">Track material orders and fulfillment status.</p>
      </div>
      <Button v-if="authStore.isContractor" :label="$t('common.create')" icon="pi pi-plus" @click="showCreateDialog = true" />
    </div>

    <!-- Requisition Grid (Card View) -->
    <div v-if="!selectedReq" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <RequisitionCard 
            v-for="req in requisitions" 
            :key="req._id" 
            :requisition="req" 
            @view="viewDetails"
        />
        <div v-if="!loading && requisitions.length === 0" class="col-span-full p-12 border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 opacity-40">
            <i class="pi pi-shopping-cart text-4xl"></i>
            <span class="font-bold">No requisitions found</span>
            <Button v-if="authStore.isContractor" label="New Requisition" icon="pi pi-plus" size="small" text @click="showCreateDialog = true" />
        </div>
    </div>

    <!-- Requisition Detail View -->
    <div v-else class="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="mb-4">
            <Button label="Back to List" icon="pi pi-arrow-left" text size="small" @click="selectedReq = null" />
        </div>
        <RequisitionDetail 
            :requisition="selectedReq" 
            @send="sendReq"
            @approve="approveReq"
            @reject="rejectReq"
            @start-fulfillment="startFulfillment"
            @fulfill="openFulfillDialog"
        />
    </div>

    <!-- Create Dialog (True to nature) -->
    <Dialog v-model:visible="showCreateDialog" header="New Requisition" :style="{ width: '800px' }" modal>
      <div class="flex flex-col gap-6 pt-4">
        <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
                <label class="font-bold text-sm">Manufacturer *</label>
                <Select v-model="form.manufacturerId" :options="manufacturers" optionLabel="name" optionValue="_id" class="w-full" placeholder="Select supplier..." />
            </div>
             <div class="flex flex-col gap-2">
                <label class="font-bold text-sm">Project (Optional)</label>
                <Select v-model="form.projectId" :options="projects" optionLabel="name" optionValue="_id" class="w-full" placeholder="Link to project..." />
            </div>
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex justify-between items-center">
            <label class="font-bold text-sm">Order Items</label>
            <Button label="Add Item" icon="pi pi-plus" size="small" text @click="addItem" :disabled="!form.manufacturerId" />
          </div>
          
          <div v-if="!form.manufacturerId" class="p-8 border border-dashed rounded-xl flex items-center justify-center text-xs opacity-40 italic">
              Select a manufacturer first to browse their catalog...
          </div>

          <div v-for="(item, idx) in form.items" :key="idx" class="p-4 bg-[var(--p-content-background)] rounded-xl border flex flex-col gap-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-black uppercase opacity-40">Select Catalog</label>
                    <Select v-model="item.catalogId" :options="availableCatalogs" optionLabel="name" optionValue="_id" placeholder="Catalog" @change="onCatalogChange(idx)" />
                </div>
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-black uppercase opacity-40">Material Specification</label>
                    <Select v-model="item.sheetTypeId" :options="getAvailableSheetTypes(item.catalogId)" optionLabel="color" optionValue="_id" placeholder="Specification" @change="onSheetTypeChange(idx)">
                        <template #option="slotProps">
                            <div class="flex items-center gap-2">
                                <div class="w-4 h-4 rounded-full border shadow-sm" :style="{ backgroundColor: slotProps.option.colorFallback }"></div>
                                <span>{{ slotProps.option.color }} ({{ slotProps.option.thickness }}mm)</span>
                            </div>
                        </template>
                    </Select>
                </div>
            </div>

            <div v-if="item.sheetTypeId" class="grid grid-cols-3 gap-4 items-end">
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-black uppercase opacity-40">Size (W x H)</label>
                    <Select v-model="item.sizeIndex" :options="getSizeOptions(item.catalogId, item.sheetTypeId)" optionLabel="label" optionValue="value" />
                </div>
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-black uppercase opacity-40">Quantity</label>
                    <InputNumber v-model="item.quantity" :min="1" class="w-full" />
                </div>
                <div class="flex justify-end p-2">
                    <Button icon="pi pi-trash" severity="danger" text @click="form.items.splice(idx, 1)" />
                </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">Special Instructions / Notes</label>
          <Textarea v-model="form.notes" class="w-full" rows="3" placeholder="Add any specific requirements or delivery notes..." />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="showCreateDialog = false" />
        <Button label="Create Requisition" icon="pi pi-check" @click="createReq" :loading="submitting" :disabled="!form.items.length" />
      </template>
    </Dialog>

    <!-- Fulfillment Dialog -->
    <Dialog v-model:visible="showFulfillDialog" header="Confirm Shipment & Fulfillment" :style="{ width: '500px' }" modal>
      <div class="flex flex-col gap-6 pt-4">
        <p class="text-sm text-[var(--p-text-secondary-color)]">
          Completing fulfillment will automatically generate a material batch for the contractor.
        </p>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">Target Warehouse (at Contractor's site) *</label>
          <Select 
            v-model="fulfillForm.warehouseId" 
            :options="contractorWarehouses" 
            optionLabel="name" 
            optionValue="_id" 
            placeholder="Select destination warehouse..."
            class="w-full"
          />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">Delivery Notes</label>
          <Textarea v-model="fulfillForm.notes" class="w-full" rows="3" placeholder="Transport details, tracking number..." />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="showFulfillDialog = false" />
        <Button label="Confirm & Ship" icon="pi pi-truck" @click="confirmFulfill" :loading="submitting" :disabled="!fulfillForm.warehouseId" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '~/stores/auth';
import { useEntityStore } from '~/stores/entities';
import RequisitionCard from '~/components/entities/Requisition/RequisitionCard.vue';
import RequisitionDetail from '~/components/entities/Requisition/RequisitionDetail.vue';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import Dialog from 'primevue/dialog';

const toast = useToast();
const authStore = useAuthStore();
const entityStore = useEntityStore();

const requisitions = ref([]);
const manufacturers = ref([]);
const catalogs = ref([]);
const projects = ref([]);
const contractorWarehouses = ref([]);
const loading = ref(false);
const submitting = ref(false);
const showCreateDialog = ref(false);
const showFulfillDialog = ref(false);
const selectedReq = ref(null);

const form = ref({ manufacturerId: null, projectId: null, notes: '', items: [] });
const fulfillForm = ref({ warehouseId: null, notes: '' });
const fulfillingId = ref(null);

const availableCatalogs = computed(() => {
    if (!form.value.manufacturerId) return [];
    return catalogs.value.filter(c => c.manufacturerId === form.value.manufacturerId);
});

async function load() {
  loading.value = true;
  try {
    requisitions.value = await $fetch('/api/requisitions');
    if (authStore.isContractor) {
      const orgs = await $fetch('/api/organizations?type=Manufacturer');
      manufacturers.value = orgs;
      catalogs.value = await $fetch('/api/catalogs');
      projects.value = await $fetch('/api/project');
    }
    if (authStore.isManufacturer) {
        // If manufacturer fulfills, they need to select contractor's warehouse
        // This is where my previous visibility fix comes in
    }
  } catch (error) {
    if (error.status !== 401) {
      toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

async function viewDetails(req) {
    selectedReq.value = req;
    if (authStore.isManufacturer && req.status === 'in_fulfillment') {
        // Fetch destination org warehouses
        contractorWarehouses.value = await $fetch(`/api/warehouses?organizationId=${req.contractorId}`);
    }
}

function addItem() {
  form.value.items.push({ catalogId: null, sheetTypeId: null, sizeIndex: 0, quantity: 1 });
}

function onCatalogChange(idx) {
    form.value.items[idx].sheetTypeId = null;
    form.value.items[idx].sizeIndex = 0;
}

function onSheetTypeChange(idx) {
    form.value.items[idx].sizeIndex = 0;
}

function getAvailableSheetTypes(catalogId) {
    const catalog = catalogs.value.find(c => c._id === catalogId);
    return catalog?.sheetTypes || [];
}

function getSizeOptions(catalogId, sheetTypeId) {
    const catalog = catalogs.value.find(c => c._id === catalogId);
    const sheetType = catalog?.sheetTypes.find(st => st._id === sheetTypeId);
    return (sheetType?.sizes || []).map((s, idx) => ({
        label: `${s.width}x${s.height}mm - $${s.pricePerSqm}/m²`,
        value: idx
    }));
}

async function createReq() {
  if (form.value.items.some(i => !i.catalogId || !i.sheetTypeId || !i.quantity)) {
      toast.add({ severity: 'warn', summary: 'Incomplete', detail: 'Please fill in all item details' });
      return;
  }

  submitting.value = true;
  try {
    await $fetch('/api/requisitions', { method: 'POST', body: form.value });
    toast.add({ severity: 'success', summary: 'Success', detail: 'Requisition created' });
    showCreateDialog.value = false;
    form.value = { manufacturerId: null, projectId: null, notes: '', items: [] };
    await load();
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message });
  } finally {
    submitting.value = false;
  }
}

async function sendReq(id) {
    try {
        await $fetch(`/api/requisitions/${id}/send`, { method: 'POST' });
        toast.add({ severity: 'success', summary: 'Success', detail: 'Requisition submitted' });
        await load();
    } catch (e) { toast.add({ severity: 'error', summary: 'Error', detail: e.message }); }
}

async function approveReq(id) {
    try {
        await $fetch(`/api/requisitions/${id}/approve`, { method: 'POST' });
        toast.add({ severity: 'success', summary: 'Success', detail: 'Requisition approved' });
        await load();
    } catch (e) { toast.add({ severity: 'error', summary: 'Error', detail: e.message }); }
}

async function rejectReq(id) {
    if (confirm('Reject this requisition?')) {
        try {
            await $fetch(`/api/requisitions/${id}/reject`, { method: 'POST' });
            toast.add({ severity: 'success', summary: 'Success', detail: 'Requisition rejected' });
            await load();
        } catch (e) { toast.add({ severity: 'error', summary: 'Error', detail: e.message }); }
    }
}

async function startFulfillment(id) {
    try {
        await $fetch(`/api/requisitions/${id}/start-fulfillment`, { method: 'POST' });
        toast.add({ severity: 'success', summary: 'Success', detail: 'Fulfillment started' });
        await load();
        if (selectedReq.value) {
            contractorWarehouses.value = await $fetch(`/api/warehouses?organizationId=${selectedReq.value.contractorId}`);
        }
    } catch (e) { toast.add({ severity: 'error', summary: 'Error', detail: e.message }); }
}

function openFulfillDialog(id) {
    fulfillingId.value = id;
    fulfillForm.value = { warehouseId: null, notes: '' };
    showFulfillDialog.value = true;
}

async function confirmFulfill() {
    submitting.value = true;
    try {
        await $fetch(`/api/requisitions/${fulfillingId.value}/fulfill`, { 
            method: 'POST', 
            body: fulfillForm.value 
        });
        toast.add({ severity: 'success', summary: 'Success', detail: 'Requisition fulfilled' });
        showFulfillDialog.value = false;
        await load();
    } catch (e) { toast.add({ severity: 'error', summary: 'Error', detail: e.message }); }
    finally { submitting.value = false; }
}

onMounted(() => load());
</script>