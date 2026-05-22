<template>
  <div class="h-full">
    <EntityCard :entity="cassette" entity-type="cassette" :variant="variant" :show-trace="false">
      <template #before-identity>
        <i class="pi pi-clone"></i>
      </template>
      <template #subtitle>
        <Tag v-if="cassetteType" :value="cassetteType" severity="secondary" size="small" />
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
const cassetteForDisplay = computed(() => ({
  ...props.cassette,
  data: {
    ...(props.cassette.data || {}),
    parameters: Array.isArray(props.cassette.data?.parameters)
      ? props.cassette.data.parameters
      : Object.keys(props.cassette.data?.parameters || {})
  }
}));
</script>
