<template>
  <div class="h-full">
    <EntityCard :entity="material" entity-type="material" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-database"></i>
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <Tag v-if="material.data?.code" :value="material.data.code" severity="secondary" size="small" />
      </template>
      <template #compact-content>
        <p v-if="material.data?.description" class="mt-3 mb-0 text-sm text-muted-color">
          {{ material.data.description }}
        </p>
      </template>
      <Divider />
      <DataBlock entity-type="material" :entity="material" :fields="FIELDS" />
    </EntityCard>
  </div>
</template>

<script setup>
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const FIELDS = [
  { path: 'data.code', i18n: 'common.code' },
  { path: 'data.description', i18n: 'common.description' }
];

defineProps({
  material: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>
