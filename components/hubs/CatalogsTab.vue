<template>
  <div class="flex flex-col gap-8">
    <div class="flex justify-between items-center">
      <div class="flex flex-col">
        <h2 class="m-0">{{ $t('features.catalogs') }}</h2>
        <small>{{ $t('catalog.subtitle') || 'Manage your material types and finish colors.' }}</small>
      </div>
      <Button v-if="authStore.isManufacturer" :label="$t('common.create')" icon="pi pi-plus" @click="openCreateDialog" />
    </div>

    <div class="grid-hub">
        <CatalogCard 
            v-for="catalog in catalogs" 
            :key="catalog._id" 
            :catalog="catalog" 
            variant="card"
            @click="viewCatalog(catalog)"
        />
    </div>

    <div v-if="!loading && catalogs.length === 0" class="flex flex-col items-center py-20">
        <i class="pi pi-book text-4xl"></i>
        <p>{{ $t('catalog.noCatalogsFound') }}</p>
        <Button v-if="authStore.isManufacturer" :label="$t('catalog.createFirstCatalog')" icon="pi pi-plus" text @click="openCreateDialog" />
    </div>
  </div>
</template>

<script setup>
import { useAuthStore } from '~/stores/auth';
import CatalogCard from '~/components/entities/Catalog/CatalogCard.vue';

const props = defineProps({
    catalogs: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false }
});

const emit = defineEmits(['view', 'create']);
const authStore = useAuthStore();

const viewCatalog = (cat) => emit('view', cat);
const openCreateDialog = () => emit('create');
</script>
