<template>
  <div class="flex flex-col gap-8">
    <ActionToolbar :title="$t('features.catalogs')" :subtitle="$t('catalog.subtitle')">
      <template #actions>
        <Button v-if="canCreateCatalog" :label="$t('common.create')" icon="pi pi-plus" @click="openCreateDialog" />
      </template>
    </ActionToolbar>

    <ResponsiveGrid v-if="catalogs.length">
        <CatalogCard 
            v-for="catalog in catalogs" 
            :key="catalog._id" 
            :catalog="catalog" 
            variant="card"
            @view="viewCatalog"
        />
    </ResponsiveGrid>

    <StateBlock v-if="!loading && catalogs.length === 0" :message="$t('catalog.noCatalogsFound')" icon="pi pi-book">
      <template #actions>
        <Button v-if="canCreateCatalog" :label="$t('catalog.createFirstCatalog')" icon="pi pi-plus" text @click="openCreateDialog" />
      </template>
    </StateBlock>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import CatalogCard from '~/components/entities/Catalog/CatalogCard.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

defineProps({
    catalogs: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false }
});

const emit = defineEmits(['view', 'create']);
const authStore = useAuthStore();
const canCreateCatalog = computed(() =>
    authStore.hasPermission('catalogs', 'admin') || authStore.hasPermission('materials', 'write')
);

const viewCatalog = (cat) => emit('view', cat);
const openCreateDialog = () => emit('create');
</script>
