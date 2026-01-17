<template>
  <div class="flex flex-col gap-6 py-4">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <ProgressSpinner />
    </div>

    <div v-else-if="!batches || batches.length === 0" class="text-center py-20 px-6 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)] mx-1">
      <i class="pi pi-file-excel text-6xl text-[var(--p-text-muted-color)] mb-4 opacity-30 block"></i>
      <p class="text-xl font-bold text-[var(--p-text-color)] m-0 uppercase tracking-wider">{{ $t('artifacts.noBatches') }}</p>
      <p class="text-[var(--p-text-secondary-color)] mt-2 font-medium">{{ $t('artifacts.createBatchFirst') }}</p>
    </div>

    <Accordion v-else :multiple="true" :activeIndex="[0]" class="flex flex-col gap-4">
      <AccordionTab v-for="batch in batches" :key="batch._id" :header="batch.name || `${$t('batch.title')} ${batch.batchNumber}`">
        <div class="pt-4">
          <ArtifactsTable :batch-id="batch._id" />
        </div>
      </AccordionTab>
    </Accordion>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import Accordion from 'primevue/accordion';
import AccordionTab from 'primevue/accordiontab';
import ProgressSpinner from 'primevue/progressspinner';
import ArtifactsTable from '~/components/ArtifactsTable.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const slug = route.params.slug;

const batches = ref([]);
const loading = ref(true);

const loadBatches = async () => {
  loading.value = true;
  try {
    batches.value = await $fetch(`/api/project/${slug}/batches`);
    // Sort batches by batchNumber descending to show the latest first
    batches.value.sort((a, b) => b.batchNumber - a.batchNumber);
  } catch (error) {
    console.error('Failed to load batches:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(loadBatches);
</script>
