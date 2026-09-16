<template>
  <div class="flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
    <ProgressSpinner v-if="state === 'loading'" />
    <i v-else :class="[icon, 'text-muted']" />
    <div class="flex max-w-md flex-col gap-1">
      <p class="m-0 text-label" :class="{ 'text-status-danger': state === 'error' }">
        <slot>{{ message }}</slot>
      </p>
      <small v-if="description || $slots.description" class="text-muted text-supporting">
        <slot name="description">{{ description }}</slot>
      </small>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap justify-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';

const props = defineProps({
  state: { type: String, default: 'empty' },
  message: { type: String, default: '' },
  description: { type: String, default: '' },
  icon: { type: String, default: 'pi pi-inbox' }
});

const icon = computed(() => (props.state === 'error' ? 'pi pi-exclamation-triangle' : props.icon));
</script>
