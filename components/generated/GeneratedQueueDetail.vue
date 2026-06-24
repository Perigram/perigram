<template>
  <QueueEditor
    :queue="queue"
    :queues="[queue]"
    :project-slug="projectId"
    :show-queue-navigation="false"
    edit-mode="process"
    @updated="$emit('refresh')"
    @select-queue="openQueue"
    @queue-deleted="$emit('refresh')"
  />
</template>

<script setup>
import { computed } from 'vue';
import QueueEditor from '~/components/QueueEditor.vue';
import { generatedScreenRoute } from '~/packages/processes/src/screen-contract.js';
import { detailRouteForEntity } from '~/components/generated/entity-detail-routing.js';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  queue: { type: Object, required: true },
  screenKey: { type: String, default: '' }
});

defineEmits(['refresh']);

const authStore = useAuthStore();
const projectId = computed(() => props.queue?.lineage?.projectId?.toString?.() || props.queue?.lineage?.projectId || '');

function openQueue(queueId) {
  const route = detailRouteForEntity({
    entity: props.queue?._id?.toString() === queueId?.toString() ? props.queue : { _id: queueId },
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
