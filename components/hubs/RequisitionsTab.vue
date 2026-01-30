<template>
  <div class="flex flex-col gap-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-black text-surface-900 dark:text-surface-0">{{ $t('features.requisitions') }}</h2>
        <p class="text-sm text-surface-500 dark:text-surface-400">Track material orders and fulfillment status.</p>
      </div>
      <Button v-if="authStore.isContractor" :label="$t('common.create')" icon="pi pi-plus" @click="showCreateDialog = true" />
    </div>

    <!-- Requisition Grid (Card View) -->
    <div v-if="!selectedReq" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
        <RequisitionCard 
            v-for="req in requisitions" 
            :key="req._id" 
            :requisition="req" 
            @view="viewDetails"
            @edit="openEditDialog"
            @delete="confirmDelete"
        />
        <div v-if="!loading && requisitions.length === 0" class="col-span-full p-12 border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-2xl flex flex-col items-center gap-4 opacity-40">
            <i class="pi pi-shopping-cart text-4xl"></i>
            <span class="font-bold">{{ $t('requisition.noRequisitions') }}</span>
            <Button v-if="authStore.isContractor" :label="$t('requisition.newRequisition')" icon="pi pi-plus" size="small" text @click="showCreateDialog = true" />
        </div>
    </div>

    <!-- Detail View -->
    <div v-else class="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="mb-4">
            <Button :label="$t('common.backToList')" icon="pi pi-arrow-left" text size="small" @click="selectedReq = null" />
        </div>
        <RequisitionDetail :requisition="selectedReq" />
    </div>

    <!-- Create Dialog (True to nature) -->
    <Dialog v-model:visible="showCreateDialog" :header="$t('requisition.newRequisition')" :style="{ width: '800px' }" modal>
      <div class="flex flex-col gap-6 pt-4">
        <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
                <label class="font-bold text-sm">{{ $t('requisition.manufacturer') }} *</label>
                <Select v-model="form.manufacturerId" :options="manufacturers" optionLabel="name" optionValue="_id" class="w-full" :placeholder="$t('requisition.selectManufacturer')" />
            </div>
             <div class="flex flex-col gap-2">
                <label class="font-bold text-sm">{{ $t('requisition.project') }} ({{ $t('common.optional') }})</label>
                <Select v-model="form.projectId" :options="projects" optionLabel="name" optionValue="_id" class="w-full" :placeholder="$t('requisition.linkToProject')" />
            </div>
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex justify-between items-center">
            <label class="font-bold text-sm">{{ $t('requisition.orderItems') }}</label>
            <Button :label="$t('requisition.addItem')" icon="pi pi-plus" size="small" text @click="addItem" :disabled="!form.manufacturerId" />
          </div>
          
          <div v-if="!form.manufacturerId" class="p-8 border border-dashed rounded-xl flex items-center justify-center text-xs opacity-40 italic">
              {{ $t('requisition.selectManufacturerFirst') }}
          </div>

          <div v-for="(item, idx) in form.items" :key="idx" class="p-4 bg-surface-0 dark:bg-surface-900 rounded-xl border flex flex-col gap-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-black uppercase opacity-40">{{ $t('requisition.selectCatalog') }}</label>
                    <Select v-model="item.catalogId" :options="availableCatalogs" optionLabel="name" optionValue="_id" :placeholder="$t('requisition.catalog')" @change="onCatalogChange(idx)" />
                </div>
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-black uppercase opacity-40">{{ $t('requisition.colorFinish') }}</label>
                    <Select v-model="item.colorId" :options="getAvailableColors(item.catalogId)" :optionLabel="opt => opt.identity?.name || opt.color" optionValue="_id" :placeholder="$t('requisition.selectColor')">
                        <template #option="slotProps">
                            <div class="flex items-center gap-2">
                                <div class="w-4 h-4 rounded-full border shadow-sm" :style="{ backgroundColor: slotProps.option.visuals?.hexCode || slotProps.option.colorFallback || '#ccc' }"></div>
                                <span>{{ slotProps.option.identity?.name || slotProps.option.color }}</span>
                            </div>
                        </template>
                    </Select>
                </div>
            </div>

            <div v-if="item.catalogId" class="grid grid-cols-5 gap-3 items-end">
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-black uppercase opacity-40">{{ $t('catalog.foilThickness') }} (mm)</label>
                    <Select v-model="item.foilThickness" :options="getCatalogOptions(item.catalogId, 'foilThicknessOptions')" optionLabel="label" optionValue="value" />
                </div>
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-black uppercase opacity-40">{{ $t('catalog.sheetThickness') }} (mm)</label>
                    <Select v-model="item.sheetThickness" :options="getCatalogOptions(item.catalogId, 'sheetThicknessOptions')" optionLabel="label" optionValue="value" />
                </div>
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-black uppercase opacity-40">{{ $t('catalog.width') }} (mm)</label>
                    <Select v-model="item.width" :options="getCatalogOptions(item.catalogId, 'widthOptions')" optionLabel="label" optionValue="value" />
                </div>
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-black uppercase opacity-40">{{ $t('catalog.length') }} (mm)</label>
                    <InputNumber v-model="item.length" :min="100" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-black uppercase opacity-40">{{ $t('common.quantity') }}</label>
                    <div class="flex items-center gap-2">
                        <InputNumber v-model="item.quantity" :min="1" class="w-full" />
                        <Button icon="pi pi-trash" severity="danger" text @click="form.items.splice(idx, 1)" />
                    </div>
                </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('requisition.specialInstructions') }}</label>
          <Textarea v-model="form.notes" class="w-full" rows="3" :placeholder="$t('requisition.notesPlaceholder')" />
        </div>
      </div>
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="showCreateDialog = false" />
        <Button :label="$t('requisition.createRequisition')" icon="pi pi-check" @click="createReq" :loading="submitting" :disabled="!form.items.length" />
      </template>
    </Dialog>

    <!-- Fulfillment Dialog -->
    <Dialog v-model:visible="showFulfillDialog" :header="$t('requisition.confirmShipment')" :style="{ width: '500px' }" modal>
      <div class="flex flex-col gap-6 pt-4">
        <p class="text-sm text-[var(--p-text-secondary-color)]">
          {{ $t('requisition.fulfillmentWarning') }}
        </p>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('requisition.targetWarehouse') }} *</label>
          <Select 
            v-model="fulfillForm.warehouseId" 
            :options="contractorWarehouses" 
            optionLabel="name" 
            optionValue="_id" 
            :placeholder="$t('requisition.selectDestinationWarehouse')"
            class="w-full"
          />
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm">{{ $t('requisition.deliveryNotes') }}</label>
          <Textarea v-model="fulfillForm.notes" class="w-full" rows="3" :placeholder="$t('requisition.deliveryNotesPlaceholder')" />
        </div>
      </div>
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="showFulfillDialog = false" />
        <Button :label="$t('requisition.confirmAndShip')" icon="pi pi-truck" @click="confirmFulfill" :loading="submitting" :disabled="!fulfillForm.warehouseId" />
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
const colors = ref([]);
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
    // Allow any catalog that matches manufacturerId (legacy or lineage)
    return catalogs.value.filter(c => 
        c.lineage?.organizationId === form.value.manufacturerId || 
        c.manufacturerId === form.value.manufacturerId ||
        c._id === form.value.manufacturerId // some edge cases where ID is used directly
    );
});

async function load() {
  loading.value = true;
  try {
    requisitions.value = await $fetch('/api/requisitions');
    if (authStore.isContractor) {
      const orgs = await $fetch('/api/organizations?type=Manufacturer');
      manufacturers.value = orgs;
      catalogs.value = await $fetch('/api/catalogs');
      colors.value = await $fetch('/api/colors');
      const projResp = await $fetch('/api/project');
      projects.value = projResp;
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
    if (authStore.isManufacturer && (req.status?.state === 'APPROVED' || req.status === 'in_fulfillment')) {
        // Find contractorId from lineage
        const contractorId = req.lineage?.organizationId;
        if (contractorId) {
            contractorWarehouses.value = await $fetch(`/api/warehouses?organizationId=${contractorId}`);
        }
    }
}

function addItem() {
  form.value.items.push({ 
    catalogId: null, 
    colorId: null, 
    foilThickness: 0.3, 
    sheetThickness: 4, 
    width: 1220, 
    length: 3000, 
    quantity: 1 
  });
}

function onCatalogChange(idx) {
    const catalog = catalogs.value.find(c => c._id === form.value.items[idx].catalogId);
    if (catalog) {
        const options = catalog.options || {};
        form.value.items[idx].foilThickness = options.foilThicknesses?.[0] || 0.3;
        form.value.items[idx].sheetThickness = options.sheetThicknesses?.[0] || 4;
        form.value.items[idx].width = options.widths?.[0] || 1220;
    }
    form.value.items[idx].colorId = null;
}

function getAvailableColors(catalogId) {
    return colors.value.filter(c => (c.lineage?.catalogId === catalogId || c.catalogId === catalogId));
}

function getCatalogOptions(catalogId, field) {
    const catalog = catalogs.value.find(c => c._id === catalogId);
    if (!catalog) return [];
    
    // Map v24 options to dropdown labels
    const optionsMap = {
        foilThicknessOptions: catalog.options?.foilThicknesses || [],
        sheetThicknessOptions: catalog.options?.sheetThicknesses || [],
        widthOptions: catalog.options?.widths || []
    };
    
    return (optionsMap[field] || []).map(val => ({ label: `${val} mm`, value: val }));
}

function openEditDialog(req) {
    form.value = { 
        manufacturerId: req.lineage?.manufacturerId, 
        projectId: req.lineage?.projectId, 
        notes: req.notes || '', 
        items: req.items.map(i => ({
            catalogId: i.catalogId,
            colorId: i.colorId,
            foilThickness: i.specs?.foilThickness,
            sheetThickness: i.specs?.sheetThickness,
            width: i.specs?.width,
            length: i.specs?.length,
            quantity: i.quantity
        }))
    };
    editingId.value = req._id;
    showCreateDialog.value = true;
}

const confirmDelete = (req) => {
    if (confirm('Delete this draft requisition?')) {
        $fetch(`/api/requisitions/${req._id}`, { method: 'DELETE' })
            .then(() => {
                toast.add({ severity: 'success', summary: 'Success', detail: 'Deleted' });
                load();
            })
            .catch(e => toast.add({ severity: 'error', summary: 'Error', detail: e.message }));
    }
};

const editingId = ref(null);

async function createReq() {
  if (form.value.items.some(i => !i.catalogId || !i.colorId || !i.quantity)) {
      toast.add({ severity: 'warn', summary: 'Incomplete', detail: 'Please fill in all item details' });
      return;
  }

  submitting.value = true;
  try {
    if (editingId.value) {
        await $fetch(`/api/requisitions/${editingId.value}`, { method: 'PUT', body: form.value });
    } else {
        await $fetch('/api/requisitions', { method: 'POST', body: form.value });
    }
    toast.add({ severity: 'success', summary: 'Success', detail: editingId.value ? 'Requisition updated' : 'Requisition created' });
    showCreateDialog.value = false;
    editingId.value = null;
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