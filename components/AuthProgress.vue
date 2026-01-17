<template>
    <div class="flex flex-col items-center justify-center py-20 gap-8 animate-in fade-in duration-500">
        <h1 class="text-3xl font-black text-[var(--p-text-color)] m-0 tracking-tight">{{ $t('auth.authenticating') }}</h1>
        <ProgressSpinner style="width: 80px; height: 80px" strokeWidth="4" />
        <p class="text-[var(--p-text-secondary-color)] font-medium m-0 animate-pulse">
            {{ $t('auth.authenticatingWait') }}
        </p>
    </div>
</template>
<script setup>
import ProgressSpinner from 'primevue/progressspinner'
</script>
<style scoped>
</style>