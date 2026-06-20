<template>
  <StandardPage :title="$t('assets.layerStandards')">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <div v-else-if="error" class="px-1">
      <Message severity="error">{{ error }}</Message>
    </div>
    <template v-else>
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('assets.layerStandards') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ standardStats.total }}</div>
        </div>
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('entities.penTemplate') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ standardStats.withPens }}</div>
        </div>
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('common.default') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ standardStats.defaultPens }}</div>
        </div>
        <div class="rounded-ui border border-content-border bg-content px-4 py-3">
          <small class="text-muted-color">{{ $t('common.type') }}</small>
          <div class="mt-1 text-2xl font-semibold">{{ standardStats.categories }}</div>
        </div>
      </section>

      <ResponsiveGrid>
        <LayerStandardCard
          v-for="std in standards"
          :key="std._id"
          :standard="std"
          @set-pen="openPenDialog"
          @revert="revert"
        />
      </ResponsiveGrid>
    </template>

    <!-- Pen assignment dialog -->
    <StandardDialog v-model:visible="dialogVisible" :header="$t('layerStandard.setPen')" size="sm">
      <div class="flex flex-col gap-4 pt-2">
        <Select
          v-model="selectedPenId"
          :options="penOptions"
          option-label="name"
          option-value="_id"
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
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { storeToRefs } from 'pinia';
import LayerStandardCard from '~/components/entities/LayerStandard/LayerStandardCard.vue';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Button from 'primevue/button';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { namedSelectOptions } from '~/utils/selectOptions';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const layerStandardsStore = useLayerStandardsStore();
const penTemplatesStore = usePenTemplatesStore();

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
