<template>
  <div class="status-timeline">
    <div v-if="loading" class="flex justify-center p-4">
      <ProgressSpinner style="width: 30px; height: 30px" />
    </div>
    
    <div v-else-if="error" class="text-red-500 p-4">
      {{ error }}
    </div>
    
    <div v-else-if="history.length === 0" class="text-sm opacity-60 p-4">
      No status history
    </div>
    
    <div v-else class="space-y-3">
      <div 
        v-for="(entry, index) in history" 
        :key="index"
        class="flex gap-3 items-start"
      >
        <div class="flex flex-col items-center">
          <div class="w-8 h-8 rounded-full flex items-center justify-center bg-surface-100 dark:bg-surface-800">
            <i :class="getStatusIcon(entry.status)" class="text-sm"></i>
          </div>
          <div v-if="index < history.length - 1" class="w-0.5 h-full min-h-[20px] bg-surface-200 dark:bg-surface-700 my-1"></div>
        </div>
        
        <div class="flex-1 pb-2">
          <div class="flex items-center gap-2 mb-1">
            <EntityStatus :entity="entry" variant="inline" />
            <span class="text-xs opacity-60">{{ formatDate(entry.timestamp) }}</span>
          </div>
          <div v-if="entry.note" class="text-sm opacity-80">{{ entry.note }}</div>
          <div v-if="entry.userId" class="text-xs opacity-50 mt-1">by {{ entry.userId }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';
import EntityStatus from '~/components/entities/shared/EntityStatus.vue';

const props = defineProps({
  collection: {
    type: String,
    required: true
  },
  entityId: {
    type: String,
    required: true
  }
});

const history = ref([]);
const loading = ref(true);
const error = ref(null);

onMounted(async () => {
  try {
    const response = await fetch(`/api/statuses/${props.collection}/${props.entityId}`);
    const data = await response.json();
    
    if (data.history) {
      history.value = data.history;
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function getStatusIcon(status) {
  const icons = {
    draft: 'pi pi-file-edit',
    ready: 'pi pi-check-circle',
    processing: 'pi pi-spin pi-spinner',
    completed: 'pi pi-check',
    error: 'pi pi-times-circle',
    cancelled: 'pi pi-ban',
    sent: 'pi pi-send',
    approved: 'pi pi-thumbs-up',
    rejected: 'pi pi-thumbs-down',
    in_fulfillment: 'pi pi-truck',
    fulfilled: 'pi pi-box',
    active: 'pi pi-play',
    inactive: 'pi pi-pause',
    CUT: 'pi pi-scissors'
  };
  return icons[status] || 'pi pi-circle';
}

function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleString();
}
</script>

<style scoped>
.status-timeline {
  max-height: 400px;
  overflow-y: auto;
}
</style>
