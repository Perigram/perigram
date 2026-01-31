<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between">
        <h1>{{ $t('features.catalogs') }}</h1>
    </div>

    <CatalogsTab />
  </div>
</template>

<script setup>
import CatalogsTab from '~/components/hubs/CatalogsTab.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});
</script>
