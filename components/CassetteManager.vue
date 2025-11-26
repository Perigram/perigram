<template>
  <div class="cassette-manager">
    <div class="header">
      <h2>{{ $t('cassette.title') }}</h2>
      <Button 
        :label="$t('cassette.upload')" 
        icon="pi pi-upload"
        @click="showUploadDialog = true"
      />
    </div>

    <div v-if="!cassettes || cassettes.length === 0" class="empty-state">
      <i class="pi pi-inbox" style="font-size: 3rem; color: var(--text-color-secondary);"></i>
      <p>{{ !cassettes ? 'Loading cassettes...' : $t('cassette.noCassettes') }}</p>
    </div>

    <div v-else class="cassettes-grid">
      <div v-for="cassette in cassettes" :key="cassette._id" class="cassette-card">
        <div class="cassette-card-header">
          <h3>{{ cassette.name }}</h3>
          <Tag 
            :value="cassette.processingStatus" 
            :severity="getStatusSeverity(cassette.processingStatus)"
          />
        </div>

        <div class="cassette-card-body">
          <div class="info-row">
            <span class="label">{{ $t('common.created') }}:</span>
            <span>{{ formatDate(cassette.createdAt) }}</span>
          </div>
        </div>

        <div class="cassette-card-actions">
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

<style scoped>
.cassette-manager {
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
}

.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-color-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.cassettes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  padding: 20px 0;
}

.cassette-card {
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 16px;
  background: var(--surface-card);
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.cassette-card-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.cassette-card-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  flex: 1;
  word-break: break-word;
}

.cassette-card-body {
  flex: 1;
}

.info-row {
  display: flex;
  gap: 8px;
  font-size: 14px;
}

.info-row .label {
  font-weight: 500;
  color: var(--text-color-secondary);
}

.cassette-card-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid var(--surface-border);
}
</style>
