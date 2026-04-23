<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="warehouse" variant="inline" icon="pi pi-building" />
    </template>

    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="warehouse" entity-type="warehouse" variant="compact" class="card-interactive" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex items-start justify-between gap-3 min-w-0">
                <IdentityBlock :entity="warehouse" variant="compact" />
                <div class="shrink-0">
                    <EntityStatus :entity="warehouse" entity-type="warehouse" variant="inline" />
                </div>
            </div>
        </template>
        <template #subtitle>
            <small>{{ warehouse.type }}</small>
        </template>
      </EntityCard>
    </template>

    <template v-else-if="variant === 'card'">
      <EntityCard :entity="warehouse" entity-type="warehouse" variant="card" class="card-interactive" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex justify-between items-start gap-3 min-w-0">
                <IdentityBlock :entity="warehouse" />
                <Tag v-if="warehouse.type" :value="warehouse.type" severity="secondary" size="small" />
            </div>
        </template>
        <Divider />
        <div class="flex flex-col gap-3">
            <DataBlock :entity="warehouse" :fields="FIELDS" />
            <EntityStatus :entity="warehouse" entity-type="warehouse" variant="inline" />
        </div>
      </EntityCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Warehouse View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import EntityCard from '~/components/shared/EntityCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

const FIELDS = [
    { path: 'type',          i18n: 'warehouse.type' },
    { path: 'address',       i18n: 'warehouse.address' },
    { path: 'contactPerson', i18n: 'warehouse.contactPerson' }
];

const props = defineProps({
  warehouse: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>
