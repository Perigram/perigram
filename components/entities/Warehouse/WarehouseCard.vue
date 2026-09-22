<template>
  <div :class="[`variant-${variant}`]">
    <InstanceCard :entity="warehouse" type-id="warehouse" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-building"></i>
      </template>
      <template #subtitle v-if="variant !== 'card'">
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
      <DataBlock type-id="warehouse" :entity="warehouse" :fields="FIELDS" />
    </InstanceCard>
  </div>
</template>

<script setup>
/**
 * Warehouse View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';

const FIELDS = resolveInstanceDisplayFields({ typeId: 'warehouse', surface: 'card' });

const props = defineProps({
  warehouse: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const warehouseType = computed(() => props.warehouse.data?.type || '');
const totalSheets = computed(() => props.warehouse.data?.stats?.totalSheets || 0);
const totalRemnants = computed(() => props.warehouse.data?.stats?.totalRemnants || 0);
</script>
