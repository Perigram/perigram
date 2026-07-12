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
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <MetricPanel
          class="lg:sticky lg:top-4 lg:self-start"
          :title="$t('project.artifacts')"
          :subtitle="$t('artifacts.createQueueFirst')"
          :metrics="artifactMetrics"
          orientation="vertical"
        >
          <Button icon="pi pi-refresh" :label="$t('common.update')" severity="secondary" outlined size="small" class="w-full" @click="loadQueues" />
        </MetricPanel>

        <Accordion :multiple="true" :value="['0']" class="flex min-w-0 flex-col gap-4">
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
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import ArtifactsTable from '~/components/ArtifactsTable.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import MetricPanel from '~/components/shared/MetricPanel.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const { t } = useI18n();
const slug = route.params.slug;

const queues = ref([]);
const loading = ref(true);
const artifactStats = computed(() => ({
  queues: queues.value.length,
  runs: queues.value.reduce((sum, queue) => sum + Number(queue.summary?.runCount || 0), 0),
  sheets: queues.value.reduce((sum, queue) => sum + Number(queue.summary?.sheetCount || 0), 0),
  area: formatNumber(queues.value.reduce((sum, queue) => sum + Number(queue.summary?.totalArea || 0), 0))
}));
const artifactMetrics = computed(() => [
  { key: 'queues', label: t('project.queues'), value: artifactStats.value.queues },
  { key: 'runs', label: t('queue.runs'), value: artifactStats.value.runs },
  { key: 'sheets', label: t('results.sheets'), value: artifactStats.value.sheets },
  { key: 'area', label: t('common.area'), value: `${artifactStats.value.area} m²` }
]);

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
