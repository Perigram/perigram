<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-between items-center">
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-black text-[var(--p-text-color)]">{{ $t('features.sheets') }}</h2>
        <p class="text-sm text-[var(--p-text-secondary-color)]">Individual physical material sheets in inventory.</p>
      </div>
    </div>

    <!-- Sheet Grid -->
    <div v-if="!selectedSheet" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <SheetCard 
            v-for="sheet in sheets" 
            :key="sheet._id" 
            :sheet="sheet" 
            variant="card"
            @click="viewDetails(sheet)"
        />
        <div v-if="!loading && sheets.length === 0" class="col-span-full p-12 border-2 border-dashed rounded-2xl flex flex-col items-center gap-4 opacity-40">
            <i class="pi pi-file text-4xl"></i>
            <span class="font-bold">No physical sheets found</span>
        </div>
    </div>

    <!-- Detail View -->
    <div v-else class="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="mb-4">
            <Button label="Back to List" icon="pi pi-arrow-left" text size="small" @click="selectedSheet = null" />
        </div>
        <SheetDetail :sheet="selectedSheet" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import SheetCard from '~/components/entities/Sheet/SheetCard.vue';
import SheetDetail from '~/components/entities/Sheet/SheetDetail.vue';
import Button from 'primevue/button';

const toast = useToast();
const sheets = ref([]);
const loading = ref(false);
const selectedSheet = ref(null);

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
}

onMounted(() => load());
</script>