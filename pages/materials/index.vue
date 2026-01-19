<template>
  <div class="space-y-4">
    <h1 class="text-3xl font-bold">{{ $t('materials.title') }}</h1>

    <TabView>
      <TabPanel header="Warehouses" v-if="isContractor">
        <WarehousesTab />
      </TabPanel>
      
      <TabPanel header="Catalogs" v-if="isManufacturer">
        <CatalogsTab />
      </TabPanel>
      
      <TabPanel header="Requisitions">
        <RequisitionsTab />
      </TabPanel>
      
      <TabPanel header="Material Batches">
        <BatchesTab />
      </TabPanel>
      
      <TabPanel header="Sheets" v-if="isContractor">
        <SheetsTab />
      </TabPanel>
      
      <TabPanel header="Remnants" v-if="isContractor">
        <RemnantsTab />
      </TabPanel>
    </TabView>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import WarehousesTab from '~/components/materials/WarehousesTab.vue';
import CatalogsTab from '~/components/materials/CatalogsTab.vue';
import RequisitionsTab from '~/components/materials/RequisitionsTab.vue';
import BatchesTab from '~/components/materials/BatchesTab.vue';
import SheetsTab from '~/components/materials/SheetsTab.vue';
import RemnantsTab from '~/components/materials/RemnantsTab.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const authStore = useAuthStore();

const isManufacturer = computed(() => authStore.organizationData?.type === 'Manufacturer');
const isContractor = computed(() => authStore.organizationData?.type === 'Contractor');
</script>
