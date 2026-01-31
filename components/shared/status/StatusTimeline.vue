<template>
  <div class="status-timeline">
    <div v-if="loading" class="flex justify-center p-4">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
    </div>
    
    <div v-else-if="error" class="p-4">
      <i class="pi pi-exclamation-circle"></i>
      {{ error }}
    </div>
    
    <div v-else-if="history.length === 0" class="text-center py-8 italic">
      <i class="pi pi-history text-2xl block"></i>
      No lifecycle events recorded
    </div>
    
    <div v-else class="flex flex-col">
      <div 
        v-for="(entry, index) in history" 
        :key="entry._id || index"
        class="flex gap-4 items-start"
      >
        <div class="flex flex-col items-center">
          <div class="w-8 h-8 rounded-full flex items-center justify-center border">
            <i :class="getStatusIcon(entry.status?.state)"></i>
          </div>
          <div v-if="index < history.length - 1" class="w-0.5 h-full min-h-[30px] border-l my-1"></div>
        </div>
        
        <div class="flex-1 pb-6">
          <div class="flex flex-col gap-1">
            <div class="flex justify-between items-center">
                <span>{{ entry.status?.state }}</span>
                <span class="italic">{{ formatDate(entry.timestamp) }}</span>
            </div>
            
            <div v-if="entry.status?.metadata?.note" class="p-2 border rounded italic">
                "{{ entry.status.metadata.note }}"
            </div>
            
            <div v-if="entry.status?.userId" class="flex items-center gap-1.5">
                <i class="pi pi-user"></i>
                <span>{{ entry.status.userId }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';

const props = defineProps({
  collection: {
    type: String,
    required: true
  },
  entityId: {
    type: String,
    required: false
  }
});

const history = ref([]);
const loading = ref(false);
const error = ref(null);

const fetchHistory = async () => {
  if (!props.collection || !props.entityId || props.entityId === 'undefined') {
      history.value = [];
      return;
  }

  loading.value = true;
  error.value = null;
  try {
    const data = await $fetch(`/api/statuses/${props.collection}/${props.entityId}`);
    if (data.history) history.value = data.history;
  } catch (e) {
    error.value = 'Failed to load history';
  } finally {
    loading.value = false;
  }
};

watch(() => props.entityId, fetchHistory);
onMounted(fetchHistory);

function getStatusIcon(state) {
  const icons = {
    DRAFT: 'pi pi-pencil',
    SENT: 'pi pi-send',
    APPROVED: 'pi pi-thumbs-up',
    IN_FULFILLMENT: 'pi pi-truck',
    FULFILLED: 'pi pi-box',
    REJECTED: 'pi pi-times-circle',
    ACTIVE: 'pi pi-play',
    CLOSED: 'pi pi-lock',
    READY: 'pi pi-check-circle',
    NESTING: 'pi pi-spin pi-spinner',
    CUT: 'pi pi-scissors',
    AVAILABLE: 'pi pi-check',
    'IN-CUTTING': 'pi pi-scissors',
    MILLED: 'pi pi-check-square',
    SCRAP: 'pi pi-trash'
  };
  return icons[state] || 'pi pi-circle';
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.status-timeline {
  max-height: 500px;
  overflow-y: auto;
}
</style>