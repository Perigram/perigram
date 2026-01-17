<template>
  <div class="p-4">
    <div class="flex justify-end items-center mb-8">
      <Button 
        :label="$t('assets.newTemplate')" 
        icon="pi pi-plus" 
        @click="showDialog = true"
      />
    </div>
    
    <div class="text-center py-12">
      <i class="pi pi-inbox text-5xl mb-4 opacity-50"></i>
      <p>{{ $t('assets.templateManagementComingSoon') }}</p>
    </div>
    
    <Dialog 
      v-model:visible="showDialog" 
      :header="$t('assets.newTemplate')"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <p>{{ $t('assets.templateCreationComingSoon') }}</p>
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
