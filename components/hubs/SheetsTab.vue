<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-between items-center">
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-black text-surface-900 dark:text-surface-0">{{ $t('sheets.title') }}</h2>
        <p class="text-sm text-surface-500 dark:text-surface-400">{{ $t('sheets.subtitle') }}</p>
      </div>
    </div>

    <!-- Sheet Grid -->
    <div v-if="!selectedSheet" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
        <SheetCard 
            v-for="sheet in sheets" 
            :key="sheet._id" 
            :sheet="sheet" 
            variant="card"
            @click="viewDetails(sheet)"
        />
        <div v-if="!loading && sheets.length === 0" class="col-span-full p-12 border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-2xl flex flex-col items-center gap-4 opacity-40">
            <i class="pi pi-file text-4xl"></i>
            <span class="font-bold">{{ $t('sheets.noSheets') }}</span>
        </div>
    </div>

    <!-- Detail View -->
    <div v-else class="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div class="mb-4">
            <Button :label="$t('common.backToList')" icon="pi pi-arrow-left" text size="small" @click="selectedSheet = null" />
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