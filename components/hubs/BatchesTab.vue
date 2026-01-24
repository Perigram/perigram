<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-between items-center">
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-black text-[var(--p-text-color)]">{{ $t('features.batches') }}</h2>
        <p class="text-sm text-[var(--p-text-secondary-color)]">Material shipments received from manufacturers.</p>
      </div>
      <Button v-if="authStore.isManufacturer" :label="$t('common.create')" icon="pi pi-plus" @click="showDialog = true" />
    </div>

    <div v-if="!selectedBatch" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <BatchCard 
            v-for="batch in batches" 
            :key="batch._id" 
            :batch="batch" 
            @view="viewDetails"
        />
        <div v-if="!loading && batches.length === 0" class="col-span-full p-12 border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 opacity-40">
            <i class="pi pi-truck text-4xl"></i>
            <span class="font-bold">No material batches found</span>
        </div>
    </div>

    <div v-else class="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="mb-4">
            <Button label="Back to List" icon="pi pi-arrow-left" text size="small" @click="selectedBatch = null" />
        </div>
        <BatchDetail 
            :batch="selectedBatch" 
            @update-status="updateStatus"
        />
    </div>

    <!-- Create Batch Dialog (Manufacturer only) -->
    <Dialog v-model:visible="showDialog" header="Manual Material Batch" :style="{ width: '600px' }" modal>
         <div class="flex flex-col gap-4 pt-4 text-xs opacity-60">
             Note: Most batches should be created via Requisition Fulfillment. This manual entry is for legacy stock or external supply.
         </div>
         <div class="flex flex-col gap-4 pt-4">
             <!-- Simplified form for manual entry -->
             <div class="flex flex-col gap-2">
                 <label class="font-bold text-sm">Target Warehouse *</label>
                 <Select v-model="form.warehouseId" :options="warehouses" optionLabel="name" optionValue="_id" class="w-full" />
             </div>
             <div class="flex flex-col gap-2">
                 <label class="font-bold text-sm">Receipt ID</label>
                 <InputText v-model="form.receiptId" class="w-full" />
             </div>
         </div>
         <template #footer>
             <Button label="Cancel" text severity="secondary" @click="showDialog = false" />
             <Button label="Create Batch" @click="save" :loading="submitting" />
         </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '~/stores/auth';
import BatchCard from '~/components/entities/Batch/BatchCard.vue';
import BatchDetail from '~/components/entities/Batch/BatchDetail.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Dialog from 'primevue/dialog';

const toast = useToast();
const authStore = useAuthStore();

const batches = ref([]);
const warehouses = ref([]);
const selectedBatch = ref(null);
const loading = ref(false);
const submitting = ref(false);
const showDialog = ref(false);
const form = ref({ warehouseId: null, receiptId: '', piles: [] });

async function load() {
  loading.value = true;
  try {
    batches.value = await $fetch('/api/material-piles');
    if (authStore.isManufacturer) {
        // Manufacturers need to see where they can ship
        // In real app, they would select from Contractor warehouses
    }
  } catch (error) {
    if (error.status !== 401) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

function viewDetails(batch) {
    selectedBatch.value = batch;
}

async function updateStatus({ id, status }) {
    try {
        await $fetch(`/api/material-piles/${id}/status`, {
            method: 'PATCH',
            body: { status, note: `Status updated via UI to ${status}` }
        });
        toast.add({ severity: 'success', summary: 'Success', detail: 'Status updated' });
        await load();
    } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.message });
    }
}

async function save() {
    submitting.value = true;
    try {
        await $fetch('/api/material-piles', {
            method: 'POST',
            body: { ...form.value, supplierId: authStore.userData.organizationId }
        });
        showDialog.value = false;
        await load();
        toast.add({ severity: 'success', summary: 'Success', detail: 'Batch created' });
    } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.message });
    } finally {
        submitting.value = false;
    }
}

onMounted(() => load());
</script>
