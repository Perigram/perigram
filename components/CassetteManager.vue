<template>
  <div>
    <div class="flex justify-end mb-5">
      <Button 
        :label="$t('cassette.upload')" 
        icon="pi pi-upload"
        @click="showUploadDialog = true"
      />
    </div>

    <div v-if="!cassettes || cassettes.length === 0" class="flex flex-col items-center justify-center p-16 text-center border-2 border-dashed border-surface-d rounded-lg text-surface-500">
      <i class="pi pi-inbox text-5xl mb-4"></i>
      <p>{{ !cassettes ? 'Loading cassettes...' : $t('cassette.noCassettes') }}</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="cassette in cassettes" :key="cassette._id" class="border border-surface-d rounded-lg overflow-hidden bg-surface-0">
        <div class="flex justify-between items-start p-4 bg-surface-50">
          <h3 class="text-lg font-semibold">{{ cassette.name }}</h3>
          <Tag 
            :value="cassette.processingStatus" 
            :severity="getStatusSeverity(cassette.processingStatus)"
          />
        </div>

        <div class="p-4">
          <div class="flex justify-between text-sm mb-2">
            <span class="text-surface-600">{{ $t('common.created') }}:</span>
            <span>{{ formatDate(cassette.createdAt) }}</span>
          </div>
        </div>

        <div class="flex gap-2 p-4 pt-0">
          <Button 
            :label="$t('common.edit')"
            icon="pi pi-pencil" 
            severity="secondary"
            size="small"
            class="flex-1"
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { cassettesStore } from '~/composables/cassettes';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import CassetteEditorDialog from './CassetteEditorDialog.vue';

const { actions } = cassettesStore;
const { fetchCassettes, selectCassette, deleteCassette } = actions;

// Create local reactive state
const cassettes = ref([]);
const showUploadDialog = ref(false);
const showEditDialog = ref(false);
const editingCassette = ref(null);

onMounted(async () => {
  console.log('[CassetteManager] Component mounted');
  const result = await fetchCassettes();
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
    await deleteCassette(cassetteId);
  }
};

const editCassette = (cassette) => {
  editingCassette.value = cassette;
  showEditDialog.value = true;
};

const handleUploaded = async () => {
  showUploadDialog.value = false;
  const result = await fetchCassettes();
  cassettes.value = result || [];
};
</script>
