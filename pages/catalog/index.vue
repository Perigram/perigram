<template>
  <StandardPage :title="$t('features.catalogs')">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <div v-else class="flex flex-col gap-6">
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('features.catalogs') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ catalogStats.total }}</div>
        </div>
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('catalog.colorsAvailable') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ catalogStats.colors }}</div>
        </div>
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('catalog.sheetThicknessOptions') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ catalogStats.sheetOptions }}</div>
        </div>
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('catalog.foilThicknessOptions') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ catalogStats.foilOptions }}</div>
        </div>
      </section>
      <CatalogsTab :catalogs="catalogs" :loading="loading" />
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import CatalogsTab from '~/components/hubs/CatalogsTab.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useEntity } from '~/composables/useEntity';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { list } = useEntity('catalog');
const catalogs = ref([]);
const loading = ref(true);
const catalogStats = computed(() => ({
  total: catalogs.value.length,
  colors: catalogs.value.reduce((sum, catalog) => sum + Number(catalog.summary?.colorCount || 0), 0),
  sheetOptions: catalogs.value.reduce((sum, catalog) => sum + Number(catalog.data?.options?.sheetThicknesses?.length || 0), 0),
  foilOptions: catalogs.value.reduce((sum, catalog) => sum + Number(catalog.data?.options?.foilThicknesses?.length || 0), 0)
}));

onMounted(async () => {
  loading.value = true;
  try {
    catalogs.value = await list();
  } finally {
    loading.value = false;
  }
});
</script>
