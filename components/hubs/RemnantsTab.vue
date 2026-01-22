<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-xl font-bold text-[var(--p-text-color)]">{{ $t('features.remnants') }}</h2>

    <DataTable :value="remnants" :loading="loading" stripedRows class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden">
      <Column field="remnantNumber" header="#" sortable />
      <Column :header="$t('queue.status')">
        <template #body="{ data }">
          <Tag :value="data.status.toUpperCase()" :severity="data.status === 'in_stock' ? 'success' : 'secondary'" />
        </template>
      </Column>
      <Column field="material" :header="$t('common.material', 'Material')" />
      <Column field="color" :header="$t('common.color', 'Color')" />
      <Column :header="$t('common.area', 'Area')">
        <template #body="{ data }">
          {{ data.area?.toFixed(3) }} m²
        </template>
      </Column>
      <Column :header="$t('common.reusable', 'Reusable')" class="text-center">
        <template #body="{ data }">
          <i :class="data.isReusable ? 'pi pi-check text-green-500' : 'pi pi-times text-red-500'" />
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
const remnants = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    remnants.value = await $fetch('/api/remnants');
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
