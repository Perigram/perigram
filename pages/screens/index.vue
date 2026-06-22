<template>
  <StandardPage>
    <StateBlock state="empty" :message="$t('generatedScreen.noScreens')" />
  </StandardPage>
</template>

<script setup>
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});
</script>
