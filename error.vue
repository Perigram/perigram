<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-[var(--p-surface-950)] text-white p-4">
    <div class="flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-700">
      <h1 class="text-[12rem] font-black leading-none m-0 tracking-tighter opacity-20 select-none">404</h1>
      
      <div class="flex flex-col items-center gap-2 -mt-20">
        <p class="text-2xl font-bold uppercase tracking-[0.3em] m-0 text-white/90">
          {{ $t('errors.pageNotFound') }}
        </p>
        <div class="w-12 h-1 bg-[var(--p-primary-color)] rounded-full"></div>
      </div>

      <div class="mt-4">
        <Button 
          as="router-link"
          to="/"
          :label="$t('errors.goHome')"
          icon="pi pi-home"
          size="large"
          class="px-8 font-bold uppercase tracking-wider"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import Button from 'primevue/button'
</script>
