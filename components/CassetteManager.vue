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

    <DataTable 
      :value="cassettes" 
      :loading="loading"
      selectionMode="single"
      v-model:selection="selectedCassetteData"
      @row-select="onRowSelect"
      :paginator="true" 
      :rows="10"
      responsiveLayout="scroll"
    >
      <template #empty>
        <div class="empty-state">
          {{ $t('cassette.noCassettes') }}
        </div>
      </template>

      <Column field="name" :header="$t('cassette.name')" />
      
      <Column field="processingStatus" :header="$t('cassette.status')">
        <template #body="slotProps">
          <Tag 
            :value="slotProps.data.processingStatus" 
            :severity="getStatusSeverity(slotProps.data.processingStatus)"
          />
        </template>
      </Column>

      <Column field="createdAt" :header="$t('common.created')">
        <template #body="slotProps">
          {{ formatDate(slotProps.data.createdAt) }}
        </template>
      </Column>

      <Column :header="$t('common.actions')">
        <template #body="slotProps">
          <div class="actions">
            <Button 
              icon="pi pi-pencil" 
              severity="secondary"
              size="small"
              @click="editCassette(slotProps.data)"
            />
            <Button 
              icon="pi pi-trash" 
              severity="danger"
              size="small"
              @click="handleDelete(slotProps.data._id)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <CassetteUploadDialog 
      v-if="showUploadDialog" 
      @close="showUploadDialog = false"
      @uploaded="handleUploaded"
    />

    <CassetteEditorDialog 
      v-if="showEditDialog && editingCassette" 
      :cassette="editingCassette"
      @close="showEditDialog = false"
      @saved="handleSaved"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { cassettesStore } from '~/composables/cassettes';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import CassetteUploadDialog from './CassetteUploadDialog.vue';
import CassetteEditorDialog from './CassetteEditorDialog.vue';

const { getters, actions } = cassettesStore;
const cassettes = computed(() => getters.cassettes.value);
const loading = computed(() => getters.uploadStatus.value === 'uploading');

const { fetchCassettes, selectCassette, deleteCassette } = actions;

const showUploadDialog = ref(false);
const showEditDialog = ref(false);
const editingCassette = ref(null);
const selectedCassetteData = ref(null);

onMounted(async () => {
  await fetchCassettes();
});

const onRowSelect = (event) => {
  selectCassette(event.data._id);
};

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

const handleUploaded = async (cassette) => {
  showUploadDialog.value = false;
  editingCassette.value = cassette;
  showEditDialog.value = true;
};

const handleSaved = () => {
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
}

.actions {
  display: flex;
  gap: 8px;
}
</style>
