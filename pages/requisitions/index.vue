<template>
  <StandardPage :title="$t('features.requisitions')">
    <RequisitionsTab />
  </StandardPage>
</template>

<script setup>
import RequisitionsTab from '~/components/hubs/RequisitionsTab.vue';
import StandardPage from '~/components/shared/StandardPage.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});
</script>
