<script setup>
/**
 * Catalog View Component - v24 Standardized
 */
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import { computed } from 'vue';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { useAuthStore } from '~/stores/auth';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';

const props = defineProps({
  catalog: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = (event) => {
  if (isInteractiveEventTarget(event)) return;
  emit('view', props.catalog);
};
const material = computed(() => props.catalog.data?.material || '');
const sheetOptionCount = computed(() => props.catalog.data?.options?.sheetThicknesses?.length || 0);
const foilOptionCount = computed(() => props.catalog.data?.options?.foilThicknesses?.length || 0);

const CATALOG_FIELDS = resolveInstanceDisplayFields({ typeId: 'catalog', surface: 'card' })
  .filter(field => field.display !== 'entityRef');

</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <InstanceCard :entity="catalog" type-id="catalog" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-book"></i>
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <div class="flex flex-wrap gap-2">
          <Tag v-if="material" :value="material" severity="secondary" size="small" />
          <Tag v-if="catalog.summary?.colorCount" :value="`${catalog.summary.colorCount} ${$t('catalog.colorsAvailable')}`" severity="info" size="small" />
        </div>
      </template>
      <template #compact-content>
        <div class="mt-3 flex flex-wrap gap-2">
          <Tag v-if="sheetOptionCount" :value="`${sheetOptionCount} ${$t('catalog.sheetOptions')}`" severity="secondary" size="small" />
          <Tag v-if="foilOptionCount" :value="`${foilOptionCount} ${$t('catalog.foilOptions')}`" severity="secondary" size="small" />
        </div>
      </template>
      <Divider />
      <div v-if="catalog.lineage?.manufacturerId" class="flex items-center justify-between gap-4">
        <small class="text-muted">{{ $t('requisition.manufacturer') }}</small>
        <InstanceInlineRef type="organization" :id="catalog.lineage.manufacturerId" />
      </div>
      <DataBlock type-id="catalog" :entity="catalog" :fields="CATALOG_FIELDS" />
      <template #footer>
        <div class="flex justify-end gap-2" @click.stop>
          <Button v-if="authStore.can('catalogs', 'edit')" icon="pi pi-pencil" text rounded size="small" :aria-label="$t('common.edit')" @click="$emit('edit', catalog)" />
        </div>
      </template>
    </InstanceCard>
  </div>
</template>
