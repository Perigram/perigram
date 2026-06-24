<template>
  <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
  <StateBlock v-else-if="error" state="error" :message="errorMessage" />
  <QueueEditor
    v-else
    :queue="queue"
    :queues="queuesForEditor"
    :project-slug="projectId"
    @updated="$emit('refresh')"
    @select-queue="openQueue"
    @queue-deleted="$emit('refresh')"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import QueueEditor from '~/components/QueueEditor.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { generatedScreenRoute } from '~/packages/processes/src/screen-contract.js';
import { detailRouteForEntity } from '~/components/generated/entity-detail-routing.js';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  queue: { type: Object, required: true },
  screenKey: { type: String, default: '' }
});

defineEmits(['refresh']);

const authStore = useAuthStore();
const queues = ref([]);
const loading = ref(false);
const error = ref(null);
const projectId = computed(() => props.queue?.lineage?.projectId?.toString?.() || props.queue?.lineage?.projectId || '');
const queuesForEditor = computed(() => queues.value.length ? queues.value : [props.queue].filter(Boolean));
const errorMessage = computed(() => error.value?.data?.message || error.value?.message || '');

watch(() => props.queue?._id, () => {
  loadQueues();
}, { immediate: true });

async function loadQueues() {
  if (!projectId.value) {
    queues.value = [props.queue].filter(Boolean);
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    queues.value = await $fetch(`/api/project/${encodeURIComponent(projectId.value)}/queues`);
  } catch (err) {
    error.value = err;
    queues.value = [props.queue].filter(Boolean);
  } finally {
    loading.value = false;
  }
}

function openQueue(queueId) {
  const queue = queuesForEditor.value.find(item => item._id?.toString() === queueId?.toString());
  const route = detailRouteForEntity({
    entity: queue || { _id: queueId },
    entityType: 'queue',
    screenKey: props.screenKey.replace(/_detail$/, ''),
    manifest: authStore.screenManifest
  }) || {
    path: generatedScreenRoute(props.screenKey),
    query: { entityId: queueId, queueId }
  };
  navigateTo(route);
}
</script>
