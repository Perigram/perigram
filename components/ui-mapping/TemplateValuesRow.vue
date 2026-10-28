<template>
  <div v-if="tokens.length" class="flex min-w-0 flex-col gap-2">
    <div
      v-for="token in tokens"
      :key="token"
      class="flex min-w-0 items-center gap-2"
    >
      <span class="min-w-0 flex-1 truncate text-supporting" :title="token">{{ token }}</span>
      <InputText
        :model-value="modelValue?.[token] ?? ''"
        size="small"
        class="min-w-0 flex-1"
        :aria-label="token"
        @update:model-value="value => set(token, value)"
      />
    </div>
  </div>
</template>

<script setup>
import InputText from 'primevue/inputtext';

// The fill dialog's per-token values form (SPEC §24): the composition's
// meta channel names the template's tokens; each takes a scalar input and
// the model stays the operator's values map.
const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  tokens: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:modelValue']);

function set(token, value) {
  emit('update:modelValue', { ...props.modelValue, [token]: value });
}
</script>
