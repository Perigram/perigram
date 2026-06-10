<template>
  <div :class="[`variant-${variant}`]">
    <EntityCard :entity="warehouse" entity-type="warehouse" :variant="variant" class="card-interactive" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-building"></i>
      </template>
      <template #subtitle>
        <div class="flex flex-wrap gap-2">
          <Tag v-if="warehouseType" :value="warehouseType" severity="secondary" size="small" />
          <Tag v-if="totalSheets" :value="`${totalSheets} ${$t('warehouse.rawSheets')}`" severity="info" size="small" />
        </div>
      </template>
      <template #compact-content>
        <div class="mt-3 flex flex-wrap gap-2">
          <Tag v-if="totalRemnants" :value="`${totalRemnants} ${$t('warehouse.remnants')}`" severity="secondary" size="small" />
          <Tag v-if="warehouse.identity?.reference" :value="warehouse.identity.reference" severity="secondary" size="small" />
        </div>
      </template>
      <Divider />
      <DataBlock :entity="warehouse" :fields="FIELDS" />
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * Warehouse View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const FIELDS = [
    { path: 'data.type',          i18n: 'warehouse.type' },
    { path: 'data.address',       i18n: 'warehouse.address' },
    { path: 'data.contactPerson', i18n: 'warehouse.contactPerson' },
    { path: 'data.stats.totalSheets', i18n: 'warehouse.rawSheets' },
    { path: 'data.stats.totalRemnants', i18n: 'warehouse.remnants' }
];

const props = defineProps({
  warehouse: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const warehouseType = computed(() => props.warehouse.data?.type || '');
const totalSheets = computed(() => props.warehouse.data?.stats?.totalSheets || 0);
const totalRemnants = computed(() => props.warehouse.data?.stats?.totalRemnants || 0);
</script>
