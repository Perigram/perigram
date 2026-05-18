<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="warehouse" variant="inline" icon="pi pi-building" />
    </template>

    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="warehouse" entity-type="warehouse" variant="compact" class="card-interactive" :show-trace="false">
        <template #subtitle>
            <small>{{ warehouseType }}</small>
        </template>
      </EntityCard>
    </template>

    <template v-else-if="variant === 'card'">
      <EntityCard :entity="warehouse" entity-type="warehouse" variant="card" class="card-interactive" :show-trace="false">
        <template #subtitle>
            <small>{{ warehouseType }}</small>
        </template>
        <Divider />
        <DataBlock :entity="warehouse" :fields="FIELDS" />
      </EntityCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Warehouse View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
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
</script>
