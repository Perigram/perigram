<template>
  <div class="h-full">
    <EntityCard :entity="cassette" entity-type="cassette" :variant="variant" :show-trace="false">
      <template #before-identity>
        <i class="pi pi-clone"></i>
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <CassetteThumbnail :cassette="cassette" />
        <DataBlock :entity="cassetteForDisplay" :fields="FIELDS" />
      </div>
    </EntityCard>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';

const FIELDS = [
  { path: 'data.parameters.length', i18n: 'cassette.parametersTitle' }
];

const props = defineProps({
  cassette: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const definition = computed(() => props.cassette.data?.definition || {});
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
