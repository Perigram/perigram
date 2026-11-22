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
    <div v-for="section in sections" :key="section" class="flex flex-col gap-1">
      <label class="text-supporting text-muted" :for="`template-section-${section}`">{{ section }}</label>
      <Textarea
        :id="`template-section-${section}`"
        :model-value="sectionDrafts[section] ?? JSON.stringify(Array.isArray(draft[section]) ? draft[section] : [], null, 2)"
        rows="4"
        auto-resize
        class="w-full"
        @update:model-value="value => updateSection(section, value)"
      />
      <small class="text-muted">{{ $t('processDesigner.templateSectionJsonHint') }}</small>
      <Message v-if="sectionErrors[section]" severity="error">{{ $t('processDesigner.templateSectionJsonInvalid') }}</Message>
    </div>
    <Message v-if="!fields.length && !sections.length" severity="info">{{ $t('processDesigner.templateValuesNeedPreview') }}</Message>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { templateSectionState, reconcileTemplateSectionDrafts } from '#shared/ui-mapping/template-section-drafts.js';

const props = defineProps({
  tokens: { type: Array, default: () => [] },
  sections: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['update:modelValue']);
const draft = ref({ ...(props.modelValue || {}) });
const sectionErrors = ref({});
const sectionDrafts = ref({});
const sectionNames = computed(() => new Set(props.sections.map(section => String(section))));
const fields = computed(() => [...new Set([
  ...props.tokens.map(token => String(token)),
  ...Object.keys(draft.value || {})
])].filter(token => !sectionNames.value.has(token)));
watch(() => props.modelValue, value => {
  draft.value = { ...(value || {}) };
}, { deep: true });
watch(
  () => templateSectionState(props.sections, props.modelValue),
  (next, previous = []) => {
    const state = reconcileTemplateSectionDrafts(next, previous, sectionDrafts.value, sectionErrors.value);
    sectionDrafts.value = state.drafts;
    sectionErrors.value = state.errors;
  },
  { deep: true }
);

function updateToken(token, value) {
  const next = { ...draft.value, [token]: value };
  draft.value = next;
  emit('update:modelValue', next);
}

function updateSection(section, source) {
  sectionDrafts.value = { ...sectionDrafts.value, [section]: source };
  try {
    const value = JSON.parse(source);
    if (!Array.isArray(value)) throw new Error('Expected a JSON array');
    const next = { ...draft.value, [section]: value };
    draft.value = next;
    sectionErrors.value = { ...sectionErrors.value, [section]: '' };
    emit('update:modelValue', next);
  } catch {
    sectionErrors.value = { ...sectionErrors.value, [section]: 'invalid' };
  }
}
</script>
