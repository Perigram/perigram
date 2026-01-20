<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-xl font-bold text-[var(--p-text-color)]">{{ $t('features.sheets') }}</h2>

    <DataTable :value="sheets" :loading="loading" stripedRows class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden">
      <Column field="sheetNumber" header="#" sortable />
      <Column :header="$t('queue.status')">
        <template #body="{ data }">
          <Tag :value="data.status.toUpperCase()" :severity="getStatusSeverity(data.status)" />
        </template>
      </Column>
      <Column field="material" :header="$t('common.material', 'Material')" />
      <Column field="color" :header="$t('common.color', 'Color')" />
      <Column :header="$t('common.size', 'Size')">
        <template #body="{ data }">
          {{ data.width }} × {{ data.height }}
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';

const toast = useToast();
const sheets = ref([]);
const loading = ref(false);

function getStatusSeverity(status) {
  const map = { in_stock: 'success', in_cutting: 'warn', milled: 'secondary' };
  return map[status] || 'secondary';
}

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

onMounted(() => load());
</script>
