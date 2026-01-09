<template>
  <div class="p-5">
    <div class="flex justify-end items-center mb-5 gap-2">
      <Button 
        :label="$t('cassette.upload')" 
        icon="pi pi-upload"
        @click="showUploadDialog = true"
      />
      <Button 
        label="Designer" 
        icon="pi pi-pencil"
        @click="showDesignerDialog = true"
      />
    </div>

    <div v-if="!cassettes || cassettes.length === 0" class="text-center py-12 flex flex-col items-center gap-4">
      <i class="pi pi-inbox text-5xl"></i>
      <p>{{ !cassettes ? 'Loading cassettes...' : $t('cassette.noCassettes') }}</p>
    </div>

    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 py-5">
      <div v-for="cassette in cassettes" :key="cassette._id" class="flex flex-col gap-3 h-full p-4 border border-[var(--separator-primary)] rounded-lg bg-[var(--fill-tertiary)]">
        <div class="flex justify-between items-start gap-3">
          <div class="flex-1 overflow-hidden">
            <Inplace @open="onRenameStart(cassette)">
              <template #display>
                <h3 class="m-0 text-lg font-semibold break-words cursor-pointer hover:text-[var(--accent-primary)]" v-tooltip.top="'Click to rename'">{{ cassette.name }}</h3>
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
          />
        </div>

        <div class="flex-1">
          <div class="flex gap-2 text-sm">
            <span>{{ $t('common.created') }}:</span>
            <span>{{ formatDate(cassette.createdAt) }}</span>
          </div>
        </div>

        <div class="flex gap-2 justify-end pt-2">
          <Button 
            :label="$t('common.edit')"
            icon="pi pi-pencil" 
            severity="secondary"
            size="small"
            @click="editCassette(cassette)"
          />
          <Button 
            icon="pi pi-trash" 
            severity="danger"
            size="small"
            @click="handleDelete(cassette._id)"
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
      header="Cassette Designer"
      :style="{ width: '90vw', height: '90vh' }"
      :modal="true"
      @hide="editingCassette = null"
    >
      <CassetteDesigner :initial-data="editingCassette" />
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useCassettesStore } from '~/stores/cassettes';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import Inplace from 'primevue/inplace';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';
import CassetteEditorDialog from './CassetteEditorDialog.vue';
import CassetteDesigner from './CassetteDesigner.vue';

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
  if (confirm('Delete this cassette?')) {
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
    toast.add({ severity: 'error', summary: 'Error', detail: 'Name cannot be empty', life: 3000 });
    return;
  }
  
  if (newName === cassette.name) {
    closeCallback();
    return;
  }

  try {
    await cassettesStore.updateCassette(cassette._id, { name: newName });
    toast.add({ severity: 'success', summary: 'Success', detail: 'Cassette renamed', life: 2000 });
    closeCallback();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to rename cassette', life: 3000 });
  }
};

const handleUploaded = async () => {
  showUploadDialog.value = false;
  const result = await cassettesStore.fetchCassettes();
  cassettes.value = result || [];
};
</script>
