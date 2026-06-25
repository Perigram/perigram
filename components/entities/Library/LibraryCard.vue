<template>
  <div class="h-full">
    <EntityCard :entity="library" entity-type="library" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-book"></i>
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <Tag v-if="materialLabel" :value="materialLabel" severity="secondary" size="small" />
      </template>
      <template #compact-content>
        <div class="mt-3 flex flex-wrap gap-2">
          <Tag v-if="cassetteCount" :value="`${cassetteCount} ${$t('entities.cassette')}`" severity="info" size="small" />
        </div>
      </template>
      <Divider />
      <DataBlock entity-type="library" :entity="library" :fields="FIELDS" />
    </EntityCard>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const props = defineProps({
  library: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const FIELDS = resolveEntityDisplayFields({ entityType: 'library', surface: 'card' });

const cassetteCount = computed(() => props.library.summary?.cassetteCount || 0);
const materialLabel = computed(() => {
  const material = props.library.data?.material;
  if (!material) return '';
  if (typeof material === 'string') return material;
  return material.name || material.code || material.label || '';
});
</script>
