<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="warehouse" variant="inline" icon="pi pi-building" />
    </template>

    <template v-else-if="variant === 'compact'">
      <StandardCard class="card-interactive">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <IdentityBlock :entity="warehouse" variant="compact" />
                <EntityStatus :entity="warehouse" entity-type="warehouse" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ warehouse.type }}</small>
        </template>
      </StandardCard>
    </template>

    <template v-else-if="variant === 'card'">
      <StandardCard class="card-interactive">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="warehouse" />
                <Tag v-if="warehouse.type" :value="warehouse.type" severity="secondary" size="small" />
            </div>
        </template>
        <Divider />
        <div class="flex flex-col gap-3">
            <DataBlock :entity="warehouse" :fields="WAREHOUSE_FIELDS" />
            <EntityStatus :entity="warehouse" entity-type="warehouse" variant="inline" />
        </div>
      </StandardCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Warehouse View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { WAREHOUSE_FIELDS } from '~/constants/entityFields';

const props = defineProps({
  warehouse: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>
