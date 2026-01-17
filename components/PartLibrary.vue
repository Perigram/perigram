<template>
  <div class="part-library">
    <div class="header">
      <Button 
        :label="$t('profile.uploadPart')" 
        icon="pi pi-upload"
        @click="showUploadDialog = true"
      />
    </div>

    <div class="empty-state">
      <i class="pi pi-inbox" style="font-size: 3rem; color: var(--text-color-secondary);"></i>
      <p>{{ $t('profile.partLibraryComingSoon') }}</p>
    </div>

    <!-- Upload Dialog Placeholder -->
    <Dialog 
      v-model:visible="showUploadDialog" 
      :header="$t('profile.uploadPart')"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <p>{{ $t('profile.partUploadComingSoon') }}</p>
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
.part-library {
  padding: 1rem;
}

.header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1.5rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  border: 2px dashed var(--surface-border);
  border-radius: 8px;
  color: var(--text-color-secondary);
}

.empty-state p {
  margin-top: 1rem;
  font-size: 1.1rem;
}
</style>
