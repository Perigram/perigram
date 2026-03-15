<template>
  <div class="flex flex-col gap-6 py-4">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <ProgressSpinner />
    </div>

    <div v-else-if="!queues || queues.length === 0" class="text-center py-20 px-6 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)] mx-1">
      <i class="pi pi-file-excel text-6xl text-[var(--p-text-muted-color)] mb-4 opacity-30 block"></i>
      <p class="text-xl font-bold text-[var(--p-text-color)] m-0 uppercase tracking-wider">{{ $t('artifacts.noQueues') }}</p>
      <p class="text-[var(--p-text-secondary-color)] mt-2 font-medium">{{ $t('artifacts.createQueueFirst') }}</p>
    </div>

    <Accordion v-else :multiple="true" :value="['0']" class="flex flex-col gap-4">
      <AccordionPanel v-for="(queue, index) in queues" :key="queue._id" :value="index.toString()">
        <AccordionHeader>{{ queue.name || `${$t('queue.title')} ${queue.queueNumber}` }}</AccordionHeader>
        <AccordionContent>
          <div class="pt-4">
            <ArtifactsTable :batch-id="queue._id" />
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import ProgressSpinner from 'primevue/progressspinner';
import ArtifactsTable from '~/components/ArtifactsTable.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const slug = route.params.slug;

const queues = ref([]);
const loading = ref(true);

const loadQueues = async () => {
  loading.value = true;
  try {
    // Queue listing is project-scoped — access via project sub-resource endpoint
    queues.value = await $fetch(`/api/project/${slug}/queues`);
    // Sort queues by queueNumber descending to show the latest first
    queues.value.sort((a, b) => b.queueNumber - a.queueNumber);
  } catch (error) {
    console.error('Failed to load queues:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(loadQueues);
</script>
