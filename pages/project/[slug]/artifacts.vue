<template>
  <div class="flex flex-col gap-6 py-4">
    <ActionToolbar :title="$t('project.artifacts')" :subtitle="$t('artifacts.createQueueFirst')">
      <template #actions>
        <Button icon="pi pi-refresh" :label="$t('common.update')" severity="secondary" outlined size="small" @click="loadQueues" />
      </template>
    </ActionToolbar>

    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />

    <StateBlock
      v-else-if="!queues || queues.length === 0"
      :message="$t('artifacts.noQueues')"
      :description="$t('artifacts.createQueueFirst')"
      icon="pi pi-file-excel"
    />

    <template v-else>
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('project.queues') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ artifactStats.queues }}</div>
        </div>
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('queue.runs') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ artifactStats.runs }}</div>
        </div>
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('results.sheets') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ artifactStats.sheets }}</div>
        </div>
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('common.area') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ artifactStats.area }} m²</div>
        </div>
      </section>

      <Accordion :multiple="true" :value="['0']" class="flex flex-col gap-4">
        <AccordionPanel v-for="(queue, index) in queues" :key="queue._id" :value="index.toString()">
          <AccordionHeader>
            <div class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
              <span class="min-w-0 truncate">{{ queue.identity?.name || `${$t('queue.title')} ${queue.data?.queueNumber}` }}</span>
              <div class="flex shrink-0 flex-wrap gap-2">
                <Tag :value="`${queue.summary?.runCount || 0} ${$t('queue.runs')}`" severity="secondary" size="small" />
                <Tag :value="`${queue.summary?.sheetCount || 0} ${$t('results.sheets')}`" severity="info" size="small" />
              </div>
            </div>
          </AccordionHeader>
        <AccordionContent>
          <div class="pt-4">
            <ArtifactsTable :batch-id="queue._id" />
          </div>
        </AccordionContent>
        </AccordionPanel>
      </Accordion>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import ArtifactsTable from '~/components/ArtifactsTable.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const slug = route.params.slug;

const queues = ref([]);
const loading = ref(true);
const artifactStats = computed(() => ({
  queues: queues.value.length,
  runs: queues.value.reduce((sum, queue) => sum + Number(queue.summary?.runCount || 0), 0),
  sheets: queues.value.reduce((sum, queue) => sum + Number(queue.summary?.sheetCount || 0), 0),
  area: formatNumber(queues.value.reduce((sum, queue) => sum + Number(queue.summary?.totalArea || 0), 0))
}));

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

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? number : Number(number.toFixed(2));
}
</script>
