<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-end items-center px-1">
      <Button 
        :label="$t('profile.uploadPart')" 
        icon="pi pi-upload"
        @click="showUploadDialog = true"
      />
    </div>

    <div class="text-center py-20 px-6 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)] opacity-40">
      <i class="pi pi-inbox text-6xl mb-4 block"></i>
      <p class="text-lg font-bold uppercase tracking-[0.2em] m-0">{{ $t('profile.partLibraryComingSoon') }}</p>
    </div>

    <!-- Upload Dialog Placeholder -->
    <Dialog 
      v-model:visible="showUploadDialog" 
      :header="$t('profile.uploadPart')"
      :modal="true"
      :style="{ width: '95vw', maxWidth: '500px' }"
    >
      <div class="py-4 text-center opacity-60">
        <p>{{ $t('profile.partUploadComingSoon') }}</p>
      </div>
    </Dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';

const showUploadDialog = ref(false);
</script>

<style scoped>
</style>
