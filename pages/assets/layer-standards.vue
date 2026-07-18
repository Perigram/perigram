<template>
  <StandardPage :title="$t('assets.layerStandards')">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <div v-else-if="error" class="px-1">
      <Message severity="error">{{ error }}</Message>
    </div>
    <template v-else>
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <MetricPanel
          class="lg:sticky lg:top-4 lg:self-start"
          :title="$t('assets.layerStandards')"
          :metrics="standardMetrics"
          orientation="vertical"
        />

        <ResponsiveGrid>
          <LayerStandardCard
            v-for="std in standards"
            :key="std._id"
            :standard="std"
            @set-pen="openPenDialog"
            @revert="revert"
          />
        </ResponsiveGrid>
      </div>
    </template>

    <!-- Pen assignment dialog -->
    <StandardDialog v-model:visible="dialogVisible" :header="$t('layerStandard.setPen')" size="sm">
      <div class="flex flex-col gap-4 pt-2">
        <Select
          v-model="selectedPenId"
          :options="penOptions"
          option-label="name"
          option-value="_id"
          entity-type="penTemplate"
          :placeholder="$t('layerStandard.selectPen')"
          class="w-full"
        />
      </div>
      <template #footer>
        <Button :label="$t('common.cancel')" text @click="dialogVisible = false" />
        <Button :label="$t('common.save')" :disabled="!selectedPenId" @click="savePen" />
      </template>
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { storeToRefs } from 'pinia';
import LayerStandardCard from '~/components/entities/LayerStandard/LayerStandardCard.vue';
import Message from 'primevue/message';
import Select from '~/components/shared/EntitySelect.vue';
import Button from 'primevue/button';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import MetricPanel from '~/components/shared/MetricPanel.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { namedSelectOptions } from '~/utils/selectOptions';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const layerStandardsStore = useLayerStandardsStore();
const penTemplatesStore = usePenTemplatesStore();
const { t } = useI18n();

const { standards, loading, error } = storeToRefs(layerStandardsStore);
const { pens } = storeToRefs(penTemplatesStore);

const dialogVisible = ref(false);
const selectedPenId = ref(null);
const activeStandard = ref(null);
const penOptions = computed(() => namedSelectOptions(pens.value, 'Pen'));
const standardStats = computed(() => ({
  total: standards.value.length,
  withPens: standards.value.filter(standard => standard.data?.orgPenId || standard.orgPenId || standard.data?.defaultPenId || standard.defaultPenId).length,
  defaultPens: standards.value.filter(standard => standard.data?.defaultPenId || standard.defaultPenId).length,
  categories: new Set(standards.value.map(standard => standard.data?.category).filter(Boolean)).size
}));
const standardMetrics = computed(() => [
  { key: 'total', label: t('assets.layerStandards'), value: standardStats.value.total },
  { key: 'withPens', label: t('entities.penTemplate'), value: standardStats.value.withPens },
  { key: 'defaultPens', label: t('common.default'), value: standardStats.value.defaultPens },
  { key: 'categories', label: t('common.type'), value: standardStats.value.categories }
]);

function openPenDialog(std) {
  activeStandard.value = std;
  selectedPenId.value = std.data?.orgPenId || std.orgPenId || std.data?.defaultPenId || std.defaultPenId || null;
  dialogVisible.value = true;
}

async function savePen() {
  if (!selectedPenId.value || !activeStandard.value) return;
  await layerStandardsStore.setOrgPenOverride(activeStandard.value._id, selectedPenId.value);
  dialogVisible.value = false;
}

async function revert(std) {
  await layerStandardsStore.removeOrgPenOverride(std._id);
}

onMounted(async () => {
  await Promise.all([
    layerStandardsStore.fetchStandards(),
    penTemplatesStore.fetchPens(),
  ]);
});
</script>
