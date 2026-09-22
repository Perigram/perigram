<template>
  <div class="h-full">
    <InstanceCard :entity="material" type-id="material" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-database"></i>
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <Tag v-if="material.data?.code" :value="material.data.code" severity="secondary" size="small" />
      </template>
      <template #compact-content>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <Tag v-if="material.data?.code" :value="material.data.code" severity="secondary" size="small" />
          <span v-if="material.data?.thickness" class="text-muted text-body">{{ material.data.thickness }} mm</span>
        </div>
      </template>
      <Divider />
      <DataBlock type-id="material" :entity="material" :fields="FIELDS" />
    </InstanceCard>
  </div>
</template>

<script setup>
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';

const FIELDS = resolveInstanceDisplayFields({ typeId: 'material', surface: 'card' });

defineProps({
  material: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>
