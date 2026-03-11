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
            <div class="grid grid-cols-2 gap-y-2 items-center">
              <span class="text-[var(--p-text-muted-color)] font-medium">{{ $t('assets.layers.name') }}:</span>
              <span class="text-right text-[var(--p-text-color)]">{{ std.name }}</span>
              <span class="text-[var(--p-text-muted-color)] font-medium">{{ $t('assets.layers.pen') }}:</span>
              <span class="text-right text-[var(--p-text-color)]" :class="{ 'text-[var(--p-primary-color)]': std.orgPenId }">
                {{ getPenName(std.orgPenId || std.defaultPenId) }}
              </span>
            </div>
            <template v-if="canEdit">
              <Select
                :model-value="drafts[std._id] ?? std.orgPenId ?? std.defaultPenId"
                :options="pens"
                option-label="name"
                option-value="_id"
                class="w-full text-xs"
                @update:model-value="val => drafts[std._id] = val"
              />
              <div class="flex gap-2">
                <Button
                  size="small"
                  :label="$t('common.save')"
                  :disabled="!drafts[std._id] || drafts[std._id] === (std.orgPenId ?? std.defaultPenId)"
                  class="flex-1"
                  @click="save(std)"
                />
                <Button
                  v-if="std.orgPenId"
                  size="small"
                  severity="secondary"
                  :label="$t('common.revert')"
                  class="flex-1"
                  @click="revert(std)"
                />
              </div>
            </template>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { onMounted, computed, reactive } from 'vue';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { useAuthStore } from '~/stores/auth';
import { storeToRefs } from 'pinia';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Button from 'primevue/button';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const layerStandardsStore = useLayerStandardsStore();
const penTemplatesStore = usePenTemplatesStore();
const authStore = useAuthStore();

const { standards, loading, error } = storeToRefs(layerStandardsStore);
const { pens } = storeToRefs(penTemplatesStore);

const canEdit = computed(() => authStore.hasPermission('cassettes', 'write'));

const penMap = computed(() => {
  const m = {};
  for (const p of pens.value) m[p._id] = p;
  return m;
});
const getPenName = (penId) => penId ? (penMap.value[penId]?.name || penId) : '—';

// per-card draft state: standardId -> selected penId
const drafts = reactive({});

async function save(std) {
  const penId = drafts[std._id];
  if (!penId) return;
  await layerStandardsStore.setOrgPenOverride(std._id, penId);
  drafts[std._id] = undefined;
}

async function revert(std) {
  await layerStandardsStore.removeOrgPenOverride(std._id);
  drafts[std._id] = undefined;
}

onMounted(async () => {
  await Promise.all([
    layerStandardsStore.fetchStandards(),
    penTemplatesStore.fetchPens(),
  ]);
});
</script>
