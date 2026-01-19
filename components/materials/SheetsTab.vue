<template>
  <div class="space-y-4">
    <h2 class="text-xl font-semibold">Sheets</h2>

    <DataTable :value="sheets" :loading="loading" stripedRows>
      <Column field="sheetNumber" header="Sheet #" sortable />
      <Column header="Status">
        <template #body="{ data }">
          <Tag :value="data.status" :severity="getStatusSeverity(data.status)" />
        </template>
      </Column>
      <Column field="material" header="Material" />
      <Column field="color" header="Color" />
      <Column header="Size">
        <template #body="{ data }">
          {{ data.width }} × {{ data.height }} mm
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';

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
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());
</script>
