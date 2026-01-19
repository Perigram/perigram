<template>
  <div class="space-y-4">
    <h2 class="text-xl font-semibold">Remnants</h2>

    <DataTable :value="remnants" :loading="loading" stripedRows>
      <Column field="remnantNumber" header="Remnant #" sortable />
      <Column header="Status">
        <template #body="{ data }">
          <Tag :value="data.status" :severity="data.status === 'in_stock' ? 'success' : 'secondary'" />
        </template>
      </Column>
      <Column field="material" header="Material" />
      <Column field="color" header="Color" />
      <Column header="Area">
        <template #body="{ data }">
          {{ data.area?.toFixed(3) }} m²
        </template>
      </Column>
      <Column header="Reusable">
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

const toast = useToast();
const remnants = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    remnants.value = await $fetch('/api/remnants');
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());
</script>
