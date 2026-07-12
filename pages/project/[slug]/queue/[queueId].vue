<template>
  <StateBlock v-if="loading" state="loading" :message="$t('queue.loading')" />
  <QueueDetail v-else-if="queue" :queue="queue" @run-nesting="goToQueueEditor" />
  <StateBlock v-else :message="$t('queue.notFound')" icon="pi pi-inbox" />
</template>

<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import QueueDetail from '~/components/entities/Queue/QueueDetail.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useEntity } from '~/composables/useEntity';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const router = useRouter();
const { entity: queue, loading, fetch: loadQueue } = useEntity('queue', route.params.queueId);

const goToQueueEditor = () => {
  router.push(`/project/${route.params.slug}/queues`);
};

onMounted(async () => {
  await loadQueue();
});
</script>
