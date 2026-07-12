<template>
  <StandardPage :title="$t('assets.templates')">
    <template #actions>
      <Button 
        :label="$t('assets.newTemplate')" 
        icon="pi pi-plus" 
        @click="showDialog = true"
      />
    </template>
    
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
  </StandardPage>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const showDialog = ref(false);
</script>
