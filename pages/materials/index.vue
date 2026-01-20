<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-[var(--p-text-color)]">{{ $t('features.materials') }}</h1>
    </div>

    <TabView>
      <TabPanel v-if="authStore.hasPermission('warehouses', 'read')" :header="$t('features.warehouses')">
        <WarehousesTab />
      </TabPanel>
      
      <TabPanel v-if="authStore.hasPermission('catalogs', 'read')" :header="$t('features.catalogs')">
        <CatalogsTab />
      </TabPanel>
      
      <TabPanel v-if="authStore.hasPermission('requisitions', 'read')" :header="$t('features.requisitions')">
        <RequisitionsTab />
      </TabPanel>
      
      <TabPanel v-if="authStore.hasPermission('materials', 'read')" :header="$t('features.batches')">
        <BatchesTab />
      </TabPanel>
      
      <TabPanel v-if="authStore.hasPermission('materials', 'read')" :header="$t('features.sheets')">
        <SheetsTab />
      </TabPanel>
      
      <TabPanel v-if="authStore.hasPermission('materials', 'read')" :header="$t('features.remnants')">
        <RemnantsTab />
      </TabPanel>
    </TabView>
  </div>
</template>

<script setup>
import { useAuthStore } from '~/stores/auth';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
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
</script>
