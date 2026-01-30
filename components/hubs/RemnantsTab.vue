<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-between items-center">
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-black text-surface-900 dark:text-surface-0">{{ $t('remnants.title') }}</h2>
        <p class="text-sm text-surface-500 dark:text-surface-400">{{ $t('remnants.subtitle') }}</p>
      </div>
    </div>

    <!-- Remnant Grid -->
    <div v-if="!selectedRemnant" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
        <RemnantCard 
            v-for="remnant in remnants" 
            :key="remnant._id" 
            :remnant="remnant" 
            variant="card"
            @click="viewDetails(remnant)"
        />
        <div v-if="!loading && remnants.length === 0" class="col-span-full p-12 border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-2xl flex flex-col items-center gap-4 opacity-40">
            <i class="pi pi-box text-4xl"></i>
            <span class="font-bold">{{ $t('remnants.noRemnants') }}</span>
        </div>
    </div>

    <!-- Detail View -->
    <div v-else class="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="mb-4">
            <Button :label="$t('common.backToList')" icon="pi pi-arrow-left" text size="small" @click="selectedRemnant = null" />
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
