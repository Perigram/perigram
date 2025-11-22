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

    <DataView 
      :value="cassettes" 
      :layout="'grid'"
      :paginator="true" 
      :rows="9"
    >
      <template #empty>
        <div class="empty-state">
          <i class="pi pi-inbox" style="font-size: 3rem; color: var(--text-color-secondary);"></i>
          <p>{{ $t('cassette.noCassettes') }}</p>
        </div>
      </template>

      <template #grid="slotProps">
        <div class="cassette-card">
          <div class="cassette-card-header">
            <h3>{{ slotProps.item.name }}</h3>
            <Tag 
              :value="slotProps.item.processingStatus" 
              :severity="getStatusSeverity(slotProps.item.processingStatus)"
            />
          </div>

          <div class="cassette-card-body">
            <div class="info-row">
              <span class="label">{{ $t('common.created') }}:</span>
              <span>{{ formatDate(slotProps.item.createdAt) }}</span>
            </div>
          </div>

          <div class="cassette-card-actions">
            <Button 
              :label="$t('common.edit')"
              icon="pi pi-pencil" 
              severity="secondary"
              size="small"
              @click="editCassette(slotProps.item)"
            />
            <Button 
              icon="pi pi-trash" 
              severity="danger"
              size="small"
              @click="handleDelete(slotProps.item._id)"
            />
          </div>
        </div>
      </template>
    </DataView>

    <CassetteEditorDialog 
      v-if="showUploadDialog || (showEditDialog && editingCassette)" 
      :cassette="editingCassette"
      @close="closeDialogs"
      @uploaded="handleUploaded"
      @saved="handleSaved"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, toRefs, isRef, isReactive } from 'vue';
import { cassettesStore } from '~/composables/cassettes';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import Tag from 'primevue/tag';
import CassetteEditorDialog from './CassetteEditorDialog.vue';

const { getters, actions } = cassettesStore;

const { fetchCassettes, selectCassette, deleteCassette } = actions;

// Don't destructure computed refs - use directly to maintain reactivity
const cassettes = getters.cassettes;
const uploadStatus = getters.uploadStatus;

const showUploadDialog = ref(false);
const showEditDialog = ref(false);
const editingCassette = ref(null);

onMounted(async () => {
  console.log('[CassetteManager] Fetching cassettes...');
  await fetchCassettes();
  console.log('[CassetteManager] Cassettes loaded:', cassettes.value);
  console.log('[CassetteManager] Cassettes type:', typeof cassettes);
  console.log('[CassetteManager] Cassettes is ref:', isRef(cassettes));
  console.log('[CassetteManager] Cassettes is reactive:', isReactive(cassettes));
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
  closeDialogs();
  await fetchCassettes();
};

const handleSaved = async () => {
  closeDialogs();
  await fetchCassettes();
};

const closeDialogs = () => {
  showUploadDialog.value = false;
  showEditDialog.value = false;
  editingCassette.value = null;
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

:deep(.p-dataview-content) {
  background: transparent;
}

:deep(.p-dataview .p-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
</style>
