<template>
  <StandardPage :title="$t('features.requisitions')">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <div v-else class="grid grid-cols-1 gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <MetricPanel
        class="xl:sticky xl:top-4 xl:self-start"
        :title="$t('features.requisitions')"
        :metrics="requisitionMetrics"
        orientation="vertical"
      />
      <RequisitionsTab :requisitions="requisitions" :loading="loading" />
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import RequisitionsTab from '~/components/hubs/RequisitionsTab.vue';
import MetricPanel from '~/components/shared/MetricPanel.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useEntity } from '~/composables/useEntity';
import { getPrimaryState } from '~/packages/core/src/index.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { list } = useEntity('requisition');
const { t } = useI18n();
const requisitions = ref([]);
const loading = ref(true);
const requisitionStats = computed(() => ({
  total: requisitions.value.length,
  items: requisitions.value.reduce((sum, requisition) => sum + Number(requisition.data?.items?.length || 0), 0),
  totalPrice: formatNumber(requisitions.value.reduce((sum, requisition) => sum + Number(requisition.data?.totalPrice || 0), 0)),
  active: requisitions.value.filter(requisition => getPrimaryState(requisition.status, 'UNKNOWN') !== 'CLOSED').length
}));
const requisitionMetrics = computed(() => [
  { key: 'total', label: t('features.requisitions'), value: requisitionStats.value.total },
  { key: 'items', label: t('requisition.items'), value: requisitionStats.value.items },
  { key: 'totalPrice', label: t('common.subtotal'), value: `$${requisitionStats.value.totalPrice}` },
  { key: 'active', label: t('common.active'), value: requisitionStats.value.active }
]);

onMounted(async () => {
  loading.value = true;
  try {
    requisitions.value = await list();
  } finally {
    loading.value = false;
  }
});

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? number : Number(number.toFixed(2));
}
</script>
