<template>
  <div v-if="tokens.length || sections.length" class="flex min-w-0 flex-col gap-2">
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
    <div v-for="section in sections" :key="section" class="flex min-w-0 flex-col gap-1">
      <label class="text-supporting text-muted" :for="'template-section-' + section">{{ section }}</label>
      <Textarea
        :id="'template-section-' + section"
        :model-value="sectionDrafts[section] ?? JSON.stringify(Array.isArray(modelValue?.[section]) ? modelValue[section] : [], null, 2)"
        rows="4"
        auto-resize
        class="w-full"
        @update:model-value="value => setSection(section, value)"
      />
      <small class="text-muted">{{ $t('processDesigner.templateSectionJsonHint') }}</small>
      <small v-if="sectionErrors[section]" class="text-status-danger">{{ $t('processDesigner.templateSectionJsonInvalid') }}</small>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { templateSectionState, reconcileTemplateSectionDrafts } from '#shared/ui-mapping/template-section-drafts.js';

// The fill dialog's per-token values form (SPEC §24): the composition's
// meta channel names scalar tokens and repeat sections; both update the
// operator's values map without persisting template metadata.
const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  tokens: { type: Array, default: () => [] },
  sections: { type: Array, default: () => [] }
});

const sectionErrors = ref({});
const sectionDrafts = ref({});
watch(
  () => templateSectionState(props.sections, props.modelValue),
  (next, previous = []) => {
    const state = reconcileTemplateSectionDrafts(next, previous, sectionDrafts.value, sectionErrors.value);
    sectionDrafts.value = state.drafts;
    sectionErrors.value = state.errors;
  },
  { deep: true }
);

const emit = defineEmits(['update:modelValue']);

function set(token, value) {
  emit('update:modelValue', { ...props.modelValue, [token]: value });
}

function setSection(section, source) {
  sectionDrafts.value = { ...sectionDrafts.value, [section]: source };
  try {
    const value = JSON.parse(source);
    if (!Array.isArray(value)) throw new Error('Expected an array');
    emit('update:modelValue', { ...props.modelValue, [section]: value });
    sectionErrors.value = { ...sectionErrors.value, [section]: false };
  } catch {
    sectionErrors.value = { ...sectionErrors.value, [section]: true };
  }
}
</script>
