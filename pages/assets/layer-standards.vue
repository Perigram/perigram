<template>
  <div class="flex flex-col gap-6">
    <div v-if="loading" class="flex items-center justify-center py-12">
      <ProgressSpinner />
    </div>
    <div v-else-if="error" class="px-1">
      <Message severity="error">{{ error }}</Message>
    </div>
    <div v-else class="grid-hub px-1">
      <LayerStandardCard
        v-for="std in standards"
        :key="std._id"
        :standard="std"
        @set-pen="openPenDialog"
        @revert="revert"
      />
    </div>

    <!-- Pen assignment dialog -->
    <StandardDialog v-model:visible="dialogVisible" :header="$t('layerStandard.setPen')" size="sm">
      <div class="flex flex-col gap-4 pt-2">
        <Select
          v-model="selectedPenId"
          :options="pens || []"
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
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { storeToRefs } from 'pinia';
import LayerStandardCard from '~/components/entities/LayerStandard/LayerStandardCard.vue';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';

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

function openPenDialog(std) {
  activeStandard.value = std;
  selectedPenId.value = std.orgPenId || std.defaultPenId || null;
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
