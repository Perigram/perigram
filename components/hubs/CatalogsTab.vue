<template>
  <div class="flex flex-col gap-8">
    <ActionToolbar :title="$t('features.catalogs')" :subtitle="$t('catalog.subtitle') || 'Manage your material types and finish colors.'">
      <template #actions>
        <Button v-if="authStore.isManufacturer" :label="$t('common.create')" icon="pi pi-plus" @click="openCreateDialog" />
      </template>
    </ActionToolbar>

    <ResponsiveGrid v-if="catalogs.length">
        <CatalogCard 
            v-for="catalog in catalogs" 
            :key="catalog._id" 
            :catalog="catalog" 
            variant="card"
            @click="viewCatalog(catalog)"
        />
    </ResponsiveGrid>

    <StateBlock v-if="!loading && catalogs.length === 0" :message="$t('catalog.noCatalogsFound')" icon="pi pi-book">
      <template #actions>
        <Button v-if="authStore.isManufacturer" :label="$t('catalog.createFirstCatalog')" icon="pi pi-plus" text @click="openCreateDialog" />
      </template>
    </StateBlock>
  </div>
</template>

<script setup>
import { useAuthStore } from '~/stores/auth';
import CatalogCard from '~/components/entities/Catalog/CatalogCard.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

const props = defineProps({
    catalogs: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false }
});

const emit = defineEmits(['view', 'create']);
const authStore = useAuthStore();

const viewCatalog = (cat) => emit('view', cat);
const openCreateDialog = () => emit('create');
</script>
