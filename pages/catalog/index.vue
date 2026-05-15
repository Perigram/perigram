<template>
  <StandardPage :title="$t('features.catalogs')">
    <CatalogsTab />
  </StandardPage>
</template>

<script setup>
import CatalogsTab from '~/components/hubs/CatalogsTab.vue';
import StandardPage from '~/components/shared/StandardPage.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});
</script>
