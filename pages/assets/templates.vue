<template>
  <div class="p-4">
    <div class="flex justify-end items-center mb-8">
      <Button 
        label="New Template" 
        icon="pi pi-plus" 
        @click="showDialog = true"
      />
    </div>
    
    <div class="text-center py-12">
      <i class="pi pi-inbox text-5xl mb-4 opacity-50"></i>
      <p>Template management coming soon</p>
    </div>
    
    <Dialog 
      v-model:visible="showDialog" 
      header="New Template"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <p>Template creation coming soon</p>
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
