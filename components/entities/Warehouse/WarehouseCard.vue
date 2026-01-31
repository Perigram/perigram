<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-building"></i>
        <span>{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card class="card-interactive">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <span class="truncate">{{ name }}</span>
                <Badge value="Active" severity="success" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ warehouse.type }}</small>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card class="card-interactive">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ name }}</span>
                <Tag :value="warehouse.type" severity="secondary" />
            </div>
        </template>
        <template #content>
            <Divider />
            <div class="flex flex-col gap-4">
                <div class="flex items-start gap-2">
                    <i class="pi pi-map-marker"></i>
                    <span>{{ warehouse.address }}</span>
                </div>
                <div class="flex justify-between items-center">
                    <small>Org ID</small>
                    <span class="italic">{{ warehouse.lineage?.organizationId }}</span>
                </div>
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<script setup>
/**
 * Warehouse View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Divider from 'primevue/divider';
import Badge from 'primevue/badge';
import Tag from 'primevue/tag';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  warehouse: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name } = useIdentity(props.warehouse);
</script>