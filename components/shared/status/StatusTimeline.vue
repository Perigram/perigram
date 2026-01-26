<template>
  <div class="status-timeline">
    <div v-if="loading" class="flex justify-center p-4">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
    </div>
    
    <div v-else-if="error" class="text-red-500 text-xs p-4">
      <i class="pi pi-exclamation-circle mr-1"></i>
      {{ error }}
    </div>
    
    <div v-else-if="history.length === 0" class="text-center py-8 opacity-40 italic text-sm">
      <i class="pi pi-history text-2xl mb-2 block"></i>
      No lifecycle events recorded
    </div>
    
    <div v-else class="flex flex-col">
      <div 
        v-for="(entry, index) in history" 
        :key="entry._id || index"
        class="flex gap-4 items-start group"
      >
        <div class="flex flex-col items-center">
          <div 
            class="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-transform group-hover:scale-110"
            :class="getStatusClasses(entry.status?.state)"
          >
            <i :class="getStatusIcon(entry.status?.state)" class="text-xs"></i>
          </div>
          <div v-if="index < history.length - 1" class="w-0.5 h-full min-h-[30px] bg-surface-200 dark:bg-surface-700 my-1"></div>
        </div>
        
        <div class="flex-1 pb-6">
          <div class="flex flex-col gap-1">
            <div class="flex justify-between items-center">
                <span class="text-xs font-black uppercase tracking-wider" :class="getStatusTextClass(entry.status?.state)">
                    {{ entry.status?.state }}
                </span>
                <span class="text-[10px] font-bold opacity-40">{{ formatDate(entry.timestamp) }}</span>
            </div>
            
            <div v-if="entry.status?.metadata?.note" class="bg-surface-50 dark:bg-surface-900/50 p-2 rounded-lg border border-surface-200 dark:border-surface-700 text-xs italic opacity-80 mt-1">
                "{{ entry.status.metadata.note }}"
            </div>
            
            <div v-if="entry.status?.userId" class="flex items-center gap-1.5 mt-2 opacity-60">
                <i class="pi pi-user text-[10px]"></i>
                <span class="text-[10px] font-bold">{{ entry.status.userId }}</span>
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
    // collection name vs entity type normalization
    const type = props.collection.replace(/s$/, '');
    const data = await $fetch(`/api/statuses/${props.collection}/${props.entityId}`);
    
    if (data.history) {
      history.value = data.history;
    }
  } catch (e) {
    console.error('Status history fetch failed:', e);
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

function getStatusClasses(state) {
    const map = {
        DRAFT: 'bg-zinc-100 text-zinc-500 border-zinc-200',
        SENT: 'bg-blue-50 text-blue-600 border-blue-100',
        APPROVED: 'bg-green-50 text-green-600 border-green-100',
        IN_FULFILLMENT: 'bg-amber-50 text-amber-600 border-amber-100',
        FULFILLED: 'bg-green-100 text-green-700 border-green-200',
        REJECTED: 'bg-red-50 text-red-600 border-red-100',
        CUT: 'bg-purple-50 text-purple-600 border-purple-100'
    };
    return map[state] || 'bg-surface-100 text-surface-500 border-surface-200';
}

function getStatusTextClass(state) {
    const map = {
        DRAFT: 'text-zinc-500',
        SENT: 'text-blue-600',
        APPROVED: 'text-green-600',
        REJECTED: 'text-red-600'
    };
    return map[state] || 'text-surface-600';
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
  padding-right: 4px;
}
.status-timeline::-webkit-scrollbar { width: 4px; }
.status-timeline::-webkit-scrollbar-thumb { background: var(--p-surface-200); border-radius: 4px; }
</style>