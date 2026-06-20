<template>
  <StandardPage :title="$t('features.catalogs')">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <div v-else class="grid grid-cols-1 gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <MetricPanel
        class="xl:sticky xl:top-4 xl:self-start"
        :title="$t('features.catalogs')"
        :metrics="catalogMetrics"
        orientation="vertical"
      />
      <CatalogsTab :catalogs="catalogs" :loading="loading" />
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import CatalogsTab from '~/components/hubs/CatalogsTab.vue';
import MetricPanel from '~/components/shared/MetricPanel.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useEntity } from '~/composables/useEntity';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { list } = useEntity('catalog');
const { t } = useI18n();
const catalogs = ref([]);
const loading = ref(true);
const catalogStats = computed(() => ({
  total: catalogs.value.length,
  colors: catalogs.value.reduce((sum, catalog) => sum + Number(catalog.summary?.colorCount || 0), 0),
  sheetOptions: catalogs.value.reduce((sum, catalog) => sum + Number(catalog.data?.options?.sheetThicknesses?.length || 0), 0),
  foilOptions: catalogs.value.reduce((sum, catalog) => sum + Number(catalog.data?.options?.foilThicknesses?.length || 0), 0)
}));
const catalogMetrics = computed(() => [
  { key: 'total', label: t('features.catalogs'), value: catalogStats.value.total },
  { key: 'colors', label: t('catalog.colorsAvailable'), value: catalogStats.value.colors },
  { key: 'sheetOptions', label: t('catalog.sheetThicknessOptions'), value: catalogStats.value.sheetOptions },
  { key: 'foilOptions', label: t('catalog.foilThicknessOptions'), value: catalogStats.value.foilOptions }
]);

onMounted(async () => {
  loading.value = true;
  try {
    catalogs.value = await list();
  } finally {
    loading.value = false;
  }
});
</script>
