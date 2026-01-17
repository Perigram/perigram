<template>
    <div class="flex flex-col gap-6 py-12 px-1 items-center justify-center text-center opacity-60">
        <i class="pi pi-database text-6xl text-[var(--p-text-muted-color)] mb-4"></i>
        <div class="flex flex-col gap-2 max-w-md">
            <h2 class="text-xl font-bold text-[var(--p-text-color)] m-0 uppercase tracking-[0.2em]">{{ $t('project.data') }}</h2>
            <p class="text-sm font-medium leading-relaxed">{{ $t('profile.projectDataComingSoon') }}</p>
        </div>
    </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: 'auth',
});
</script>
