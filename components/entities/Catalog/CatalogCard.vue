<script setup>
/**
 * Catalog View Component - v24 Standardized
 */
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { computed } from 'vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  catalog: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = () => emit('view', props.catalog);
const material = computed(() => props.catalog.data?.material || '');

const CATALOG_FIELDS = [
  { path: 'summary.colorCount', i18n: 'catalog.colorsAvailable' },
  { path: 'data.options.sheetThicknesses', i18n: 'catalog.sheetThicknessOptions', suffix: ' mm' },
  { path: 'data.options.foilThicknesses', i18n: 'catalog.foilThicknessOptions', suffix: ' mm' },
  { path: 'data.pricing.pricePerSqm', i18n: 'catalog.pricePerSqm', prefix: '$' }
];

</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="catalog" entity-type="catalog" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-book"></i>
      </template>
      <template #subtitle>
        <Tag v-if="material" :value="material" severity="secondary" size="small" />
      </template>
      <Divider />
      <div v-if="catalog.lineage?.manufacturerId" class="flex items-center justify-between gap-4">
        <small class="text-muted-color">{{ $t('requisition.manufacturer') }}</small>
        <TraceLink type="organization" :id="catalog.lineage.manufacturerId" />
      </div>
      <DataBlock :entity="catalog" :fields="CATALOG_FIELDS" />
      <template #footer>
        <div class="flex justify-end gap-2" @click.stop>
          <Button v-if="authStore.can('catalogs', 'edit')" icon="pi pi-pencil" text rounded size="small" :aria-label="$t('common.edit')" @click="$emit('edit', catalog)" />
        </div>
      </template>
    </EntityCard>
  </div>
</template>
