<template>
  <div class="flex flex-col gap-2">
    <div v-for="token in fields" :key="token" class="flex flex-col gap-1">
      <label class="text-supporting text-muted" :for="`template-value-${token}`">{{ token }}</label>
      <InputText
        :id="`template-value-${token}`"
        :model-value="String(draft[token] ?? '')"
        size="small"
        class="w-full"
        @update:model-value="value => updateToken(token, value)"
      />
    </div>
    <Message v-if="!fields.length" severity="info">{{ $t('processDesigner.templateValuesNeedPreview') }}</Message>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';

const props = defineProps({
  tokens: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['update:modelValue']);
const draft = ref({ ...(props.modelValue || {}) });
const fields = computed(() => [...new Set([
  ...props.tokens.map(token => String(token)),
  ...Object.keys(draft.value || {})
])]);
watch(() => props.modelValue, value => {
  draft.value = { ...(value || {}) };
}, { deep: true });

function updateToken(token, value) {
  const next = { ...draft.value, [token]: value };
  draft.value = next;
  emit('update:modelValue', next);
}
</script>
