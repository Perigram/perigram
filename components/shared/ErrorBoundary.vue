<template>
  <div>
    <slot v-if="!error" />
    <div v-else class="p-4 border rounded">
      <div class="flex items-start gap-3">
        <i class="pi pi-exclamation-triangle"></i>
        <div class="flex-1">
          <h4>{{ title || $t('common.componentError') }}</h4>
          <p class="italic">{{ error }}</p>
          <Button :label="$t('common.tryAgain')" size="small" class="mt-2" @click="reset" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue';
import Button from 'primevue/button';

const props = defineProps({
  title: {
    type: String,
    default: ''
  }
});

const error = ref(null);

onErrorCaptured((err) => {
  console.error('[ErrorBoundary]', err);
  error.value = err.toString();
  return false; // Prevent propagation
});

const reset = () => {
  error.value = null;
};
</script>
