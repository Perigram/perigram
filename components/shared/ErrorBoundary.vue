<template>
  <div>
    <slot v-if="!error" />
    <div v-else class="p-4 bg-red-50 border border-red-200 rounded-lg">
      <div class="flex items-start gap-3">
        <i class="pi pi-exclamation-triangle text-red-500 text-lg"></i>
        <div class="flex-1">
          <h4 class="font-bold text-sm text-red-700 mb-1">{{ title || 'Component Error' }}</h4>
          <p class="text-xs text-red-600 font-mono">{{ error }}</p>
          <button 
            @click="reset" 
            class="mt-2 text-xs text-red-700 hover:text-red-900 underline"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue';

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
