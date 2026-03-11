<template>
  <div class="flex flex-col gap-6">
    <div v-if="loading" class="flex items-center justify-center py-12">
      <ProgressSpinner />
    </div>
    <div v-else-if="error" class="px-1">
      <Message severity="error">{{ error }}</Message>
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-1">
      <Card
        v-for="std in standards"
        :key="std._id"
        class="h-full border border-[var(--p-content-border-color)] shadow-sm"
      >
        <template #title>
          <div class="flex items-center justify-between gap-3 pt-2 px-1">
            <span class="font-mono font-bold text-base truncate text-[var(--p-text-color)]">{{ std.code }}</span>
            <Tag :value="std.category" severity="secondary" class="text-[10px] uppercase flex-shrink-0" />
          </div>
        </template>
        <template #content>
          <div class="py-3 px-1 flex flex-col gap-3 text-xs">
            <div class="grid grid-cols-2 gap-y-2">
              <span class="text-[var(--p-text-muted-color)] font-medium">{{ $t('assets.layers.name') }}:</span>
              <span class="text-right text-[var(--p-text-color)]">{{ std.name }}</span>
              <span class="text-[var(--p-text-muted-color)] font-medium">{{ $t('assets.layers.pen') }}:</span>
              <span class="text-right text-[var(--p-text-color)]">{{ getPenName(std.defaultPenId) }}</span>
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { onMounted, computed } from 'vue';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { storeToRefs } from 'pinia';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const layerStandardsStore = useLayerStandardsStore();
const penTemplatesStore = usePenTemplatesStore();
const { standards, loading, error } = storeToRefs(layerStandardsStore);
const { pens } = storeToRefs(penTemplatesStore);

const penMap = computed(() => {
  const m = {};
  for (const p of pens.value) m[p._id] = p;
  return m;
});

const getPenName = (penId) => penId ? (penMap.value[penId]?.name || penId) : '—';

onMounted(async () => {
  await Promise.all([
    layerStandardsStore.fetchStandards(),
    penTemplatesStore.fetchPens(),
  ]);
});
</script>
