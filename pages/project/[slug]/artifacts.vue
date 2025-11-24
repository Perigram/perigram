<template>
  <div class="p-4">
    <div v-if="loading" class="flex flex-col items-center justify-center p-16 text-center border border-dashed border-surface-d rounded-md bg-surface-a">
      <ProgressSpinner />
    </div>

    <div v-else-if="!batches || batches.length === 0" class="flex flex-col items-center justify-center p-16 text-center border border-dashed border-surface-d rounded-md bg-surface-a">
      <i class="pi pi-file-excel text-6xl text-surface-400 mb-4"></i>
      <p class="text-xl font-medium text-surface-500">{{ $t('artifacts.noBatches') }}</p>
      <p class="text-surface-400 mt-2">{{ $t('artifacts.createBatchFirst') }}</p>
    </div>

    <Accordion v-else :multiple="true" :activeIndex="[0]">
      <AccordionTab v-for="batch in batches" :key="batch._id" :header="batch.name || `Batch ${batch.batchNumber}`">
        <ArtifactsTable :batch-id="batch._id" />
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
  layout: 'project',
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
