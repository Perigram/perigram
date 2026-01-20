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
          <StatusBadge :status="data.status" />
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
          <div class="flex justify-end gap-2">
            <Button icon="pi pi-eye" text @click="viewDetails(data)" v-tooltip.top="'View Details'" />
            <Button icon="pi pi-pencil" text @click="updateStatus(data)" v-tooltip.top="'Update Status'" />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- Create Dialog (Simplified for now) -->
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

    <!-- Details Dialog (Traceability) -->
    <Dialog v-model:visible="showDetailsDialog" :header="`Batch: ${selectedBatch?.batchNumber}`" :style="{ width: '90vw', maxWidth: '1000px' }" modal>
        <div v-if="selectedBatch" class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <div class="md:col-span-2 flex flex-col gap-6">
                <!-- Ancestry -->
                <div class="flex flex-col gap-2">
                    <span class="text-[10px] font-black uppercase opacity-60">Reference Chain</span>
                    <TraceChain :ancestry="batchAncestry" />
                </div>

                <!-- Piles List -->
                <div class="flex flex-col gap-2">
                    <span class="text-[10px] font-black uppercase opacity-60">Batch Piles</span>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <BatchPileSummary v-for="pile in selectedBatch.piles" :key="pile._id" :data="pile" />
                    </div>
                </div>
            </div>

            <div class="flex flex-col gap-6">
                <!-- Status & History -->
                <div class="flex flex-col gap-2 p-4 bg-[var(--p-surface-50)] border rounded-xl">
                    <span class="text-[10px] font-black uppercase opacity-60 mb-2">Status Lifecycle</span>
                    <HistoryTimeline :history="selectedBatch.statusHistory" />
                </div>
            </div>
        </div>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '~/stores/auth';
import { useEntityStore } from '~/stores/entities';
import StatusBadge from '~/components/shared/status/StatusBadge.vue';
import HistoryTimeline from '~/components/shared/status/HistoryTimeline.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import BatchPileSummary from '~/components/entities/BatchPile/BatchPileSummary.vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Dialog from 'primevue/dialog';

const toast = useToast();
const authStore = useAuthStore();
const entityStore = useEntityStore();

const batches = ref([]);
const warehouses = ref([]);
const suppliers = ref([]);
const loading = ref(false);
const showDialog = ref(false);
const showDetailsDialog = ref(false);
const selectedBatch = ref(null);
const form = ref({ warehouseId: null, supplierId: authStore.userData?.organizationId, piles: [] });

const batchAncestry = computed(() => {
    if (!selectedBatch.value) return [];
    return entityStore.getAncestry('batch', selectedBatch.value);
});

async function load() {
  loading.value = true;
  try {
    batches.value = await $fetch('/api/material-batches');
    warehouses.value = await $fetch('/api/warehouses');
    const orgs = await $fetch('/api/organizations');
    suppliers.value = orgs.filter(o => o.type === 'Manufacturer');
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
    showDetailsDialog.value = true;
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