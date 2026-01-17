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

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <div v-for="cassette in cassettes" :key="cassette._id" 
        class="flex flex-col gap-4 p-5 border border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)] hover:border-[var(--p-primary-color)] hover:shadow-lg transition-all duration-300"
      >
        <div class="flex justify-between items-start gap-3">
          <div class="flex-1 min-w-0">
            <Inplace @open="onRenameStart(cassette)">
              <template #display>
                <h3 class="m-0 text-lg font-bold text-[var(--p-text-color)] truncate cursor-pointer hover:text-[var(--p-primary-color)] transition-colors" v-tooltip.top="$t('cassette.clickToRename')">
                  {{ cassette.name }}
                </h3>
              </template>
              <template #content="{ closeCallback }">
                <div class="flex items-center gap-2 w-full">
                  <InputText v-model="editingName" size="small" class="flex-1" autofocus @keyup.enter="onRename(cassette, closeCallback)" @keyup.esc="closeCallback" />
                  <Button icon="pi pi-check" size="small" text rounded severity="success" @click="onRename(cassette, closeCallback)" />
                  <Button icon="pi pi-times" size="small" text rounded severity="danger" @click="closeCallback" />
                </div>
              </template>
            </Inplace>
          </div>
          <Tag 
            :value="cassette.processingStatus" 
            :severity="getStatusSeverity(cassette.processingStatus)"
            class="uppercase text-[10px]"
          />
        </div>

        <div class="flex items-center gap-2 text-xs text-[var(--p-text-muted-color)]">
          <i class="pi pi-calendar"></i>
          <span>{{ $t('common.created') }}: {{ formatDate(cassette.createdAt) }}</span>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-[var(--p-content-border-color)] mt-auto">
          <Button 
            icon="pi pi-pencil" 
            severity="secondary"
            text
            rounded
            size="small"
            @click="editCassette(cassette)"
            v-tooltip.top="$t('common.edit')"
          />
          <Button 
            icon="pi pi-trash" 
            severity="danger"
            text
            rounded
            size="small"
            @click="handleDelete(cassette._id)"
            v-tooltip.top="$t('common.delete')"
          />
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
      <CassetteDesigner :initial-data="editingCassette" />
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCassettesStore } from '~/stores/cassettes';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import Inplace from 'primevue/inplace';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';
import CassetteEditorDialog from './CassetteEditorDialog.vue';
import CassetteDesigner from './CassetteDesigner.vue';

const { t } = useI18n();
const cassettesStore = useCassettesStore();
const toast = useToast();

// Create local reactive state
const cassettes = ref([]);
const showUploadDialog = ref(false);
const showEditDialog = ref(false);
const showDesignerDialog = ref(false);
const editingCassette = ref(null);
const editingName = ref('');

onMounted(async () => {
  console.log('[CassetteManager] Component mounted');
  const result = await cassettesStore.fetchCassettes();
  cassettes.value = result || [];
  console.log('[CassetteManager] Loaded cassettes:', cassettes.value.length);
});

const getStatusSeverity = (status) => {
  const severityMap = {
    'done': 'success',
    'pending': 'warning',
    'error': 'danger'
  };
  return severityMap[status] || 'info';
};

const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString();
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
  editingName.value = cassette.name;
};

const onRename = async (cassette, closeCallback) => {
  const newName = editingName.value.trim();
  if (!newName) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('cassette.errors.nameRequired'), life: 3000 });
    return;
  }
  
  if (newName === cassette.name) {
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