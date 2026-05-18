<template>
  <div class="flex flex-col gap-6 py-4">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />

    <StateBlock
      v-else-if="!queues || queues.length === 0"
      :message="$t('artifacts.noQueues')"
      :description="$t('artifacts.createQueueFirst')"
      icon="pi pi-file-excel"
    />

    <Accordion v-else :multiple="true" :value="['0']" class="flex flex-col gap-4">
      <AccordionPanel v-for="(queue, index) in queues" :key="queue._id" :value="index.toString()">
        <AccordionHeader>{{ queue.identity?.name || `${$t('queue.title')} ${queue.data?.queueNumber}` }}</AccordionHeader>
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
import ArtifactsTable from '~/components/ArtifactsTable.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

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
    queues.value.sort((a, b) => (b.data?.queueNumber || 0) - (a.data?.queueNumber || 0));
  } catch (error) {
    console.error('Failed to load queues:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(loadQueues);
</script>
