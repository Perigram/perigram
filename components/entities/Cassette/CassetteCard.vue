<template>
  <div class="h-full">
    <EntityCard :entity="cassette" entity-type="cassette" :variant="variant" :show-trace="false">
      <template #before-identity>
        <i class="pi pi-clone"></i>
      </template>
      <template #subtitle>
        <div class="flex flex-wrap gap-2">
          <Tag v-if="cassetteType" :value="cassetteType" severity="secondary" size="small" />
          <Tag v-if="documentType" :value="documentType" severity="info" size="small" />
          <Tag v-if="occsVersion" :value="occsVersion" severity="secondary" size="small" />
        </div>
      </template>
      <template #compact-content>
        <div v-if="parameterNames.length" class="mt-3 flex flex-wrap gap-2">
          <Tag v-for="param in parameterNames.slice(0, 4)" :key="param" :value="param" severity="secondary" size="small" />
        </div>
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <GeometryPreview :entity="cassette" />
        <DataBlock :entity="cassetteForDisplay" :fields="FIELDS" />
      </div>
    </EntityCard>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';

const FIELDS = [
  { path: 'data.type', i18n: 'common.type' },
  { path: 'data.parameters.length', i18n: 'cassette.parametersTitle' }
];

const props = defineProps({
  cassette: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const cassetteType = computed(() => props.cassette.data?.type || '');
const definition = computed(() => props.cassette.data?.definition || {});
const documentType = computed(() => definition.value.documentType || '');
const occsVersion = computed(() => definition.value.occs || '');
const parameterNames = computed(() => {
  const raw = props.cassette.data?.parameters || definition.value.parameters || [];
  return Array.isArray(raw) ? raw : Object.keys(raw);
});
const cassetteForDisplay = computed(() => ({
  ...props.cassette,
  data: {
    ...(props.cassette.data || {}),
    parameters: parameterNames.value
  }
}));
</script>
