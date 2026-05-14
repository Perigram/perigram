<script setup>
/**
 * Catalog View Component - v24 Standardized
 */
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  catalog: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = () => emit('view', props.catalog);

const CATALOG_FIELDS = [
  { path: 'summary.colorCount', i18n: 'catalog.colorsAvailable' },
  { path: 'data.pricing.pricePerSqm', i18n: 'catalog.pricePerSqm', prefix: '$' }
];
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="catalog" variant="inline" icon="pi pi-book" />
    </template>

    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="catalog" entity-type="catalog" variant="compact" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex items-center gap-2">
                <i class="pi pi-book"></i>
                <IdentityBlock :entity="catalog" variant="compact" />
            </div>
        </template>
        <template #subtitle>
            <Tag :value="catalog.data?.material || catalog.material" severity="secondary" size="small" />
        </template>
      </EntityCard>
    </template>

    <template v-else-if="variant === 'card'">
      <EntityCard :entity="catalog" entity-type="catalog" variant="card" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="catalog" />
                <Tag :value="catalog.data?.material || catalog.material" severity="secondary" size="small" />
            </div>
        </template>
        <Divider />
        <DataBlock :entity="catalog" :fields="CATALOG_FIELDS" />
        <template #footer>
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('catalogs', 'edit')" icon="pi pi-pencil" text rounded size="small" :aria-label="$t('common.edit')" @click="$emit('edit', catalog)" />
                <Button v-if="authStore.can('catalogs', 'delete')" icon="pi pi-trash" text rounded size="small" severity="danger" :aria-label="$t('common.delete')" @click="$emit('delete', catalog)" />
            </div>
        </template>
      </EntityCard>
    </template>
  </div>
</template>
