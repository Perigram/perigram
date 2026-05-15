<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-end items-center">
      <Button 
        :label="$t('assets.newTemplate')" 
        icon="pi pi-plus" 
        @click="showDialog = true"
      />
    </div>
    
    <StateBlock :message="$t('assets.templateManagementComingSoon')" icon="pi pi-inbox" />
    
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
import StateBlock from '~/components/shared/StateBlock.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const showDialog = ref(false);
</script>
