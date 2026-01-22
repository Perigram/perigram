<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between">
        <h1 class="text-2xl font-black">{{ $t('features.requisitions') }}</h1>
    </div>

    <RequisitionsTab />
  </div>
</template>

<script setup>
import RequisitionsTab from '~/components/hubs/RequisitionsTab.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});
</script>
