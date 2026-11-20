<template>
  <div v-if="templateRef?.id" class="flex min-w-0 flex-col gap-2">
    <div v-if="loading" class="text-supporting text-muted">{{ t('uiMapping.loadingRegion') }}</div>
    <Message v-else-if="error" severity="error" :closable="false">{{ error }}</Message>
    <div
      v-for="name in names"
      v-else
      :key="name"
      class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2"
    >
      <span class="min-w-0 truncate text-supporting" :title="name">{{ name }}</span>
      <InputText
        :model-value="values[name] ?? ''"
        size="small"
        class="min-w-0"
        @update:model-value="value => assign(name, value)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { instancePayloadFileUrl } from '~/components/generated/file-preview-contract.js';
import { useFileTypeView } from '~/composables/useFileTypeView';
import { useInstancesStore } from '~/stores/instances';

// The `cassette-parameters` control pin: the picked template's OCCS
// parameter table becomes one input per parameter. The plugin owns the
// parse through its served editor surface.
const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  templateRef: { type: Object, default: null }
});
const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();
const instances = useInstancesStore();
const view = useFileTypeView();
const names = ref([]);
const loading = ref(false);
const error = ref('');

const values = computed(() => (
  props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue)
    ? props.modelValue
    : {}
));

async function parameterSourceOf(typeId, text) {
  const binding = (view.editors.value || []).find(candidate => candidate?.type === typeId);
  const declared = binding ? (view.surfaces.value || []).find(surface => surface?.id === binding.surface) : null;
  const parametersOf = declared?.url ? await import(/* @vite-ignore */ declared.url).then(module => module.parametersOf) : null;
  return typeof parametersOf === 'function' ? parametersOf(text) : {};
}

watch(() => props.templateRef, async template => {
  names.value = [];
  error.value = '';
  if (!template?.id) {
    emit('update:modelValue', {});
    return;
  }
  loading.value = true;
  try {
    const typeId = instances.canonicalTypeKey(template.type || 'cassette-template');
    const instance = await instances.fetchInstance(typeId, String(template.id), { force: true });
    const url = instancePayloadFileUrl(instance?.payload || instance);
    const text = url ? await (await fetch(url)).text() : '';
    const source = await parameterSourceOf(typeId, text);
    names.value = Object.keys(source);
    emit('update:modelValue', Object.fromEntries(names.value.map(name => [name, source[name]])));
  } catch (cause) {
    error.value = cause?.message || String(cause);
  } finally {
    loading.value = false;
  }
}, { immediate: true });

function assign(name, value) {
  emit('update:modelValue', { ...values.value, [name]: value });
}
</script>
