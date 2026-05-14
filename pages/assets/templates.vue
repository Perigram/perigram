<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-end items-center px-1">
      <Button 
        :label="$t('assets.newTemplate')" 
        icon="pi pi-plus" 
        @click="showDialog = true"
      />
    </div>
    
    <div class="flex flex-col items-center justify-center gap-3 py-20 border border-dashed rounded">
      <i class="pi pi-inbox text-4xl opacity-50"></i>
      <p class="m-0 text-muted-color">{{ $t('assets.templateManagementComingSoon') }}</p>
    </div>
    
    <StandardDialog
      v-model:visible="showDialog" 
      :header="$t('assets.newTemplate')"
      size="sm"
    >
      <div class="py-4 text-center opacity-60">
        <p>{{ $t('assets.templateCreationComingSoon') }}</p>
      </div>
    </StandardDialog>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const showDialog = ref(false);
</script>
