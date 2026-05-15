<script setup>
import WarehouseHub from '~/components/hubs/WarehouseHub.vue';
import StandardPage from '~/components/shared/StandardPage.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});
</script>

<template>
  <StandardPage :title="$t('features.warehouses')">
    <WarehouseHub />
  </StandardPage>
</template>
