<template>
  <div class="flex flex-col gap-6 py-4">
    <ActionToolbar :title="$t('entities.sheetDesign')" :subtitle="$t('sheetDesign.runNestingFirst')">
      <template #actions>
        <Button icon="pi pi-refresh" :label="$t('common.update')" severity="secondary" outlined size="small" @click="loadSheetDesigns" />
      </template>
    </ActionToolbar>

    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />

    <StateBlock
      v-else-if="!sheetDesigns.length"
      :message="$t('sheetDesign.noSheetDesigns')"
      :description="$t('sheetDesign.runNestingFirst')"
      icon="pi pi-map"
    />

    <template v-else>
      <div class="grid grid-cols-1 gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <MetricPanel
          class="xl:sticky xl:top-4 xl:self-start"
          :title="$t('entities.sheetDesign')"
          :subtitle="$t('sheetDesign.runNestingFirst')"
          :metrics="sheetDesignMetrics"
          orientation="vertical"
        >
          <Button icon="pi pi-refresh" :label="$t('common.update')" severity="secondary" outlined size="small" class="w-full" @click="loadSheetDesigns" />
        </MetricPanel>

        <ResponsiveGrid variant="wide">
          <SheetDesignCard
            v-for="design in sheetDesigns"
            :key="design._id"
            :design="design"
          />
        </ResponsiveGrid>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import SheetDesignCard from '~/components/entities/SheetDesign/SheetDesignCard.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import MetricPanel from '~/components/shared/MetricPanel.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useEntity } from '~/composables/useEntity';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const { t } = useI18n();
const slug = route.params.slug;
const { entity: project, loading: projectLoading, fetch: loadProject } = useEntity('project', slug);
const selectedRunSheetDesigns = ref([]);
const sheetDesignsLoading = ref(false);
const loading = computed(() => projectLoading.value || sheetDesignsLoading.value);
const sheetDesigns = computed(() => [...selectedRunSheetDesigns.value].sort((left, right) => (
  new Date(right.createdAt || right.origin?.timestamp || 0) -
  new Date(left.createdAt || left.origin?.timestamp || 0)
)));
const sheetDesignStats = computed(() => {
  const rows = sheetDesigns.value;
  return {
    total: rows.length,
    parts: rows.reduce((sum, design) => sum + Number(design.summary?.placedCount || 0), 0),
    runs: new Set(rows.map(design => toIdString(design.lineage?.runId)).filter(Boolean)).size,
    materialSources: rows.reduce((sum, design) => sum + Number(design.data?.materialPool?.length || 0), 0)
  };
});
const sheetDesignMetrics = computed(() => [
  { key: 'total', label: t('entities.sheetDesign'), value: sheetDesignStats.value.total },
  { key: 'parts', label: t('sheetDesign.parts'), value: sheetDesignStats.value.parts },
  { key: 'runs', label: t('queue.runs'), value: sheetDesignStats.value.runs },
  { key: 'materialSources', label: t('sheetDesign.materialSources'), value: sheetDesignStats.value.materialSources }
]);

const loadSheetDesigns = async () => {
  const loadedProject = project.value || await loadProject();
  if (!loadedProject?._id) {
    selectedRunSheetDesigns.value = [];
    return;
  }

  sheetDesignsLoading.value = true;
  try {
    const queues = await $fetch(`/api/project/${slug}/queues`);
    const selectedRuns = queues
      .map((queue) => ({
        queueId: toIdString(queue._id),
        runId: toIdString(queue.data?.materialConsumption?.runId)
      }))
      .filter(({ queueId, runId }) => queueId && runId);

    if (!selectedRuns.length) {
      selectedRunSheetDesigns.value = [];
      return;
    }

    const designGroups = await Promise.all(selectedRuns.map(async ({ queueId, runId }) => {
      const designs = await $fetch('/api/sheet-designs', { query: { queueId } });
      return designs.filter((design) => isSheetDesignForRun(design, runId));
    }));

    selectedRunSheetDesigns.value = uniqueById(designGroups.flat());
  } finally {
    sheetDesignsLoading.value = false;
  }
};

function isSheetDesignForRun(design, runId) {
  return toIdString(design?.lineage?.runId) === runId;
}

function toIdString(value) {
  if (!value) return '';
  return value.toString?.() || String(value);
}

function uniqueById(items) {
  return Array.from(new Map(items.map((item) => [toIdString(item._id), item])).values());
}

onMounted(loadSheetDesigns);
</script>
