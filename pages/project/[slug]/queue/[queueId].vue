<template>
  <div>
    <h1>{{ $t('queue.pageTitle') }}</h1>
    <div v-if="loading">{{ $t('queue.loading') }}</div>
    <div v-else-if="queue">
      <h2>{{ queue.identity?.name }}</h2>
      <pre>{{ queue }}</pre>
    </div>
    <div v-else>
      <p>{{ $t('queue.notFound') }}</p>
    </div>
  </div>
</template>

<script setup>

import { ref, onMounted } from 'vue';

import { useRoute } from 'vue-router';

import { useI18n } from 'vue-i18n';

import { useQueuesStore } from '~/stores/queues';



definePageMeta({

  layout: 'app',

  middleware: 'auth',

});



const route = useRoute();

const { t } = useI18n();

const { queueId } = route.params;

const queuesStore = useQueuesStore();



const loading = ref(true);

const queue = ref(null);



onMounted(async () => {

  loading.value = true;

  try {

    queue.value = await queuesStore.getQueue(queueId);

  } catch (error) {

    console.error('Failed to load queue:', error);

  } finally {

    loading.value = false;

  }

});

</script>
