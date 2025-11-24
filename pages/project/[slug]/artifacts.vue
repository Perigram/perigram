<template>
  <div class="artifacts-page">
    <div v-if="loading" class="loading-state">
      <ProgressSpinner />
    </div>

    <div v-else-if="!batches || batches.length === 0" class="empty-state">
      <i class="pi pi-file-excel empty-icon"></i>
      <p class="empty-text">{{ $t('artifacts.noBatches') }}</p>
      <p class="empty-subtext">{{ $t('artifacts.createBatchFirst') }}</p>
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

<style lang="scss" scoped>
.artifacts-page {
  padding: 1rem;
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  border: 1px dashed var(--surface-d);
  border-radius: var(--border-radius);
  background-color: var(--surface-a);
}

.empty-icon {
  font-size: 4rem;
  color: var(--text-color-secondary);
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-text {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.empty-subtext {
  font-size: 1rem;
  color: var(--text-color-secondary);
  margin-top: 0.5rem;
}
</style>