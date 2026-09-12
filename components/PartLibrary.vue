<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-end items-center px-1">
      <Button 
        :label="$t('profile.uploadPart')" 
        icon="pi pi-upload"
        @click="showUploadDialog = true"
      />
    </div>

    <div class="flex flex-col items-center justify-center gap-3 py-20 border border-dashed rounded opacity-60">
      <i class="pi pi-inbox"></i>
      <p class="m-0">{{ $t('profile.partLibraryComingSoon') }}</p>
    </div>

    <!-- Upload Dialog Placeholder -->
    <StandardDialog
      v-model:visible="showUploadDialog" 
      :header="$t('profile.uploadPart')"
      size="sm"
    >
      <div class="py-4 text-center opacity-60">
        <p>{{ $t('profile.partUploadComingSoon') }}</p>
      </div>
    </StandardDialog>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';

const showUploadDialog = ref(false);
</script>
