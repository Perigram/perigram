<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-xl font-bold text-[var(--p-text-color)]">{{ $t('features.sheets') }}</h2>

    <DataTable :value="sheets" :loading="loading" stripedRows class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden">
      <Column field="sheetNumber" header="#" sortable />
      <Column :header="$t('queue.status')">
        <template #body="{ data }">
          <StatusBadge :status="data.status" />
        </template>
      </Column>
      <Column field="material" :header="$t('common.material', 'Material')" />
      <Column field="color" :header="$t('common.color', 'Color')" />
      <Column :header="$t('common.size', 'Size')">
        <template #body="{ data }">
          {{ data.width }} × {{ data.height }}
        </template>
      </Column>
      <Column header="Actions" class="text-right">
        <template #body="{ data }">
          <Button icon="pi pi-eye" text @click="viewDetails(data)" v-tooltip.top="'View Details'" />
        </template>
      </Column>
    </DataTable>

    <!-- Details Dialog -->
    <Dialog v-model:visible="showDetailsDialog" :header="`Sheet: ${selectedSheet?.sheetNumber}`" :style="{ width: '90vw', maxWidth: '1000px' }" modal>
        <div v-if="selectedSheet" class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <div class="md:col-span-2 flex flex-col gap-6">
                <!-- Ancestry -->
                <div class="flex flex-col gap-2">
                    <span class="text-[10px] font-black uppercase opacity-60">Reference Chain</span>
                    <TraceChain :ancestry="sheetAncestry" />
                </div>

                <!-- Characteristics -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div class="p-3 border rounded-lg bg-[var(--p-content-background)]">
                        <span class="text-[10px] font-black uppercase opacity-60 block">Material</span>
                        <span class="font-bold">{{ selectedSheet.material }}</span>
                    </div>
                    <div class="p-3 border rounded-lg bg-[var(--p-content-background)]">
                        <span class="text-[10px] font-black uppercase opacity-60 block">Color</span>
                        <span class="font-bold">{{ selectedSheet.color }}</span>
                    </div>
                    <div class="p-3 border rounded-lg bg-[var(--p-content-background)]">
                        <span class="text-[10px] font-black uppercase opacity-60 block">Thickness</span>
                        <span class="font-bold">{{ selectedSheet.thickness }}mm</span>
                    </div>
                    <div class="p-3 border rounded-lg bg-[var(--p-content-background)]">
                        <span class="text-[10px] font-black uppercase opacity-60 block">Size</span>
                        <span class="font-bold">{{ selectedSheet.width }}x{{ selectedSheet.height }}</span>
                    </div>
                </div>
            </div>

            <div class="flex flex-col gap-6">
                <!-- Status & History -->
                <div class="flex flex-col gap-2 p-4 bg-[var(--p-content-background)] border rounded-xl">
                    <span class="text-[10px] font-black uppercase opacity-60 mb-2">Operation History</span>
                    <HistoryTimeline :history="selectedSheet.statusHistory || []" />
                </div>
            </div>
        </div>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useEntityStore } from '~/stores/entities';
import StatusBadge from '~/components/shared/status/StatusBadge.vue';
import HistoryTimeline from '~/components/shared/status/HistoryTimeline.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';

const toast = useToast();
const entityStore = useEntityStore();

const sheets = ref([]);
const loading = ref(false);
const showDetailsDialog = ref(false);
const selectedSheet = ref(null);

const sheetAncestry = computed(() => {
    if (!selectedSheet.value) return [];
    return entityStore.getAncestry('sheet', selectedSheet.value);
});

async function load() {
  loading.value = true;
  try {
    sheets.value = await $fetch('/api/sheets');
  } catch (error) {
    if (error.status !== 401) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

function viewDetails(sheet) {
    selectedSheet.value = sheet;
    showDetailsDialog.value = true;
}

onMounted(() => load());
</script>