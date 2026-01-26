<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-between items-center">
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-black text-[var(--p-text-color)]">{{ $t('features.remnants') }}</h2>
        <p class="text-sm text-[var(--p-text-secondary-color)]">Available material offcuts for reuse.</p>
      </div>
    </div>

    <!-- Remnant Grid -->
    <div v-if="!selectedRemnant" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <RemnantCard 
            v-for="remnant in remnants" 
            :key="remnant._id" 
            :remnant="remnant" 
            variant="card"
            @click="viewDetails(remnant)"
        />
        <div v-if="!loading && remnants.length === 0" class="col-span-full p-12 border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 opacity-40">
            <i class="pi pi-undo text-4xl rotate-180"></i>
            <span class="font-bold">No remnants found</span>
        </div>
    </div>

    <!-- Detail View -->
    <div v-else class="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="mb-4">
            <Button label="Back to List" icon="pi pi-arrow-left" text size="small" @click="selectedRemnant = null" />
        </div>
        <RemnantDetail :remnant="selectedRemnant" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import RemnantCard from '~/components/entities/Remnant/RemnantCard.vue';
import RemnantDetail from '~/components/entities/Remnant/RemnantDetail.vue';
import Button from 'primevue/button';

const toast = useToast();
const remnants = ref([]);
const loading = ref(false);
const selectedRemnant = ref(null);

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

function viewDetails(remnant) {
    selectedRemnant.value = remnant;
}

onMounted(() => load());
</script>
