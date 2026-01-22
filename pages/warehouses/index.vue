<script setup>
import WarehouseHub from '~/components/hubs/WarehouseHub.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between">
        <h1 class="text-2xl font-black">{{ $t('features.warehouses') }}</h1>
    </div>

    <WarehouseHub />
  </div>
</template>