<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between gap-4 px-1">
      <h2 class="text-xl font-bold text-[var(--p-text-color)]">{{ $t('nav.cassettes') }}</h2>
      <div class="flex gap-2">
        <Button 
          :label="$t('cassette.upload')" 
          icon="pi pi-upload"
          outlined
          @click="showUploadDialog = true"
        />
        <Button 
          :label="$t('cassette.designer')" 
          icon="pi pi-pencil"
          @click="showDesignerDialog = true"
        />
      </div>
    </div>

    <div v-if="!cassettes || cassettes.length === 0" class="text-center py-20 px-6 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)]">
      <i class="pi pi-inbox text-6xl text-[var(--p-text-muted-color)] mb-4 opacity-50 block"></i>
      <p class="text-lg text-[var(--p-text-secondary-color)]">{{ !cassettes ? $t('cassette.loading') : $t('cassette.noCassettes') }}</p>
    </div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
      <div v-for="cassette in cassettes" :key="cassette._id" 
        class="flex flex-col gap-2 p-3 border border-surface-200 dark:border-surface-800 rounded-xl bg-surface-0 dark:bg-surface-900 hover:border-primary hover:shadow-lg transition-all duration-300 group"
      >
        <div class="w-full aspect-square bg-surface-50 dark:bg-surface-800 rounded-lg overflow-hidden border border-surface-200 dark:border-surface-800 mb-1 relative">
          <CassetteThumbnail :cassette="cassette" />
          
          <!-- Actions overlay -->
          <div class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 bg-surface-0/80 dark:bg-surface-900/80 backdrop-blur-sm border border-surface-200 dark:border-surface-800 rounded p-0.5 shadow-md">
            <Button 
                icon="pi pi-pencil" 
                size="small" 
                text 
                severity="secondary" 
                class="h-6 w-6" 
                @click="editCassette(cassette)" 
            />
            <Button 
                icon="pi pi-trash" 
                size="small" 
                text 
                severity="danger" 
                class="h-6 w-6" 
                @click="handleDelete(cassette._id)" 
            />
          </div>
        </div>
        
        <div class="flex flex-col min-w-0">
          <Inplace @open="onRenameStart(cassette)">
            <template #display>
              <h3 class="m-0 text-[10px] font-black uppercase tracking-wider text-surface-900 dark:text-surface-0 truncate cursor-pointer hover:text-primary transition-colors" v-tooltip.top="$t('cassette.clickToRename')">
                {{ getCassetteName(cassette) }}
              </h3>
            </template>
            <template #content="{ closeCallback }">
              <div class="flex items-center gap-1 w-full">
                <InputText v-model="editingName" size="small" class="flex-1 text-[10px] h-6 px-1" autofocus @keyup.enter="onRename(cassette, closeCallback)" @keyup.esc="closeCallback" />
              </div>
            </template>
          </Inplace>
          <div class="flex items-center justify-between gap-2 mt-1">
            <EntityStatus :entity="cassette" variant="compact" class="scale-75 origin-left" />
            <span class="text-[8px] font-medium text-surface-400 truncate">{{ formatDate(cassette.status?.timestamp || cassette.origin?.timestamp) }}</span>
          </div>
        </div>
      </div>
    </div>

    <CassetteEditorDialog 
      v-model="showUploadDialog"
      @uploaded="handleUploaded"
    />

    <Dialog 
      v-model:visible="showDesignerDialog"
      :header="$t('cassette.designerTitle')"
      :style="{ width: '95vw', height: '95vh' }"
      :modal="true"
      @hide="editingCassette = null"
    >
      <CassetteDesigner :initial-data="editingCassette" @saved="showDesignerDialog = false" />
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCassettesStore } from '~/stores/cassettes';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import Inplace from 'primevue/inplace';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';
import CassetteEditorDialog from './CassetteEditorDialog.vue';
import CassetteDesigner from './CassetteDesigner.vue';
import CassetteThumbnail from './CassetteThumbnail.vue';
import EntityStatus from './entities/shared/EntityStatus.vue';
import { useIdentity } from '~/composables/useBlocks';

const { t } = useI18n();
const cassettesStore = useCassettesStore();
const { cassettes } = storeToRefs(cassettesStore);
const toast = useToast();

// UI State
const showUploadDialog = ref(false);
const showDesignerDialog = ref(false);
const editingCassette = ref(null);
const editingName = ref('');

onMounted(async () => {
  await cassettesStore.fetchCassettes();
});

const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString();
};

const getCassetteName = (cassette) => {
    const { name } = useIdentity(cassette);
    return name.value;
};

const handleDelete = async (cassetteId) => {
  if (confirm(t('messages.confirmDeleteCassette'))) {
    await cassettesStore.deleteCassette(cassetteId);
    // Since cassettes is a local ref copy/reference, we might need to refresh
    // But if fetchCassettes returned the store state array reference, it might be auto-updated.
    // To be safe and cleaner with Pinia:
    const result = await cassettesStore.fetchCassettes();
    cassettes.value = result || [];
  }
};

const editCassette = (cassette) => {
  editingCassette.value = cassette;
  showDesignerDialog.value = true;
};

const onRenameStart = (cassette) => {
  editingName.value = getCassetteName(cassette);
};

const onRename = async (cassette, closeCallback) => {
  const newName = editingName.value.trim();
  if (!newName) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('cassette.errors.nameRequired'), life: 3000 });
    return;
  }
  
  if (newName === getCassetteName(cassette)) {
    closeCallback();
    return;
  }

  try {
    await cassettesStore.updateCassette(cassette._id, { name: newName });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('cassette.messages.renamed'), life: 2000 });
    closeCallback();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('cassette.errors.renameFailed'), life: 3000 });
  }
};

const handleUploaded = async () => {
  showUploadDialog.value = false;
  const result = await cassettesStore.fetchCassettes();
  cassettes.value = result || [];
};
</script>

<style scoped lang="scss">
</style>