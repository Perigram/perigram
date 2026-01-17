<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-end items-center px-1">
      <Button 
        :label="$t('assets.newTemplate')" 
        icon="pi pi-plus" 
        @click="showDialog = true"
      />
    </div>
    
    <div class="text-center py-20 px-6 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)]">
      <i class="pi pi-inbox text-6xl text-[var(--p-text-muted-color)] mb-4 opacity-50 block"></i>
      <p class="text-lg text-[var(--p-text-secondary-color)]">{{ $t('assets.templateManagementComingSoon') }}</p>
    </div>
    
    <Dialog 
      v-model:visible="showDialog" 
      :header="$t('assets.newTemplate')"
      :modal="true"
      :style="{ width: '95vw', maxWidth: '500px' }"
    >
      <div class="py-4 text-center opacity-60">
        <p>{{ $t('assets.templateCreationComingSoon') }}</p>
      </div>
    </Dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const showDialog = ref(false);
</script>
