<template>
  <StandardPage :title="$t('features.requisitions')">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <div v-else class="flex flex-col gap-6">
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('features.requisitions') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ requisitionStats.total }}</div>
        </div>
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('requisition.items') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ requisitionStats.items }}</div>
        </div>
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('common.subtotal') }}</small>
          <div class="mt-1 text-2xl font-semibold">${{ requisitionStats.totalPrice }}</div>
        </div>
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('common.active') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ requisitionStats.active }}</div>
        </div>
      </section>
      <RequisitionsTab :requisitions="requisitions" :loading="loading" />
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import RequisitionsTab from '~/components/hubs/RequisitionsTab.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useEntity } from '~/composables/useEntity';
import { getPrimaryState } from '~/packages/core/src/index.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { list } = useEntity('requisition');
const requisitions = ref([]);
const loading = ref(true);
const requisitionStats = computed(() => ({
  total: requisitions.value.length,
  items: requisitions.value.reduce((sum, requisition) => sum + Number(requisition.data?.items?.length || 0), 0),
  totalPrice: formatNumber(requisitions.value.reduce((sum, requisition) => sum + Number(requisition.data?.totalPrice || 0), 0)),
  active: requisitions.value.filter(requisition => getPrimaryState(requisition.status, 'UNKNOWN') !== 'CLOSED').length
}));

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
