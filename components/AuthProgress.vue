<template>
  <div class="flex flex-col items-center justify-center min-h-screen">
    <h1>{{ $t('auth.authenticating') }}</h1>
    <ProgressSpinner />
    <p>{{ $t('auth.authenticatingWait') }}</p>
  </div>
</template>

<script setup>
import ProgressSpinner from 'primevue/progressspinner';
</script>
