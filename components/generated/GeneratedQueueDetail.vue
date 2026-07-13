<template>
  <QueueEditor
    :queue="queue"
    :queues="[queue]"
    :project-slug="projectId"
    :show-queue-navigation="false"
    :process-actions="processActions"
    :producer-actions="cassetteProducerActions"
    edit-mode="process"
    @updated="$emit('refresh')"
    @select-queue="openQueue"
    @queue-deleted="$emit('refresh')"
    @execute-producer="executeProducer"
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
  screenKey: { type: String, default: '' },
  processActions: { type: Array, default: () => [] }
});

const emit = defineEmits(['refresh', 'execute-action']);

const authStore = useAuthStore();
const projectId = computed(() => props.queue?.lineage?.projectId?.toString?.() || props.queue?.lineage?.projectId || '');
const cassetteProducerActions = computed(() => authStore.actionManifest.filter(action =>
  (action.trigger?.mode || 'manual') === 'manual' &&
  (action.outputs || []).some(output => output.entityType === 'cassette_design')
));

function executeProducer(action) {
  emit('execute-action', action, props.queue, {
    outputTarget: { entityType: 'queue', entityId: props.queue._id, path: 'data.job.items', accepts: ['cassette_design'] }
  });
}

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
