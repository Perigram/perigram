<template>
  <div>
    <h1>{{ $t('batch.pageTitle') }}</h1>
    <div v-if="loading">{{ $t('batch.loading') }}</div>
    <div v-else-if="batch">
      <h2>{{ batch.name }}</h2>
      <pre>{{ batch }}</pre>
    </div>
    <div v-else>
      <p>{{ $t('batch.notFound') }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { batchesStore } from '~/composables/batches';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const { t } = useI18n();
const { batchId } = route.params;
const { getters, actions } = batchesStore;

const loading = ref(true);
const batch = ref(null);

onMounted(async () => {
  loading.value = true;
  try {
    batch.value = await actions.getBatch(batchId);
  } catch (error) {
    console.error('Failed to load batch:', error);
  } finally {
    loading.value = false;
  }
});
</script>