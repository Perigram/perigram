<template>
  <CassetteDesignerV2
    :template="designerCassette"
    :template-options="templateOptions"
    :persisted-template-ids="persistedTemplateIds"
    :persist="false"
    @load-template="openTemplate"
    @save-template="handleSave"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import CassetteDesignerV2 from '~/components/CassetteDesignerV2.vue';
import { useCassetteDesignerPersistence } from '~/composables/useCassetteDesignerPersistence.js';

const props = defineProps({
  cassette: { type: Object, required: true },
  cassettes: { type: Array, default: () => [] }
});

const emit = defineEmits(['open-page', 'refresh']);

const { t } = useI18n();
const toast = useToast();
const { hydrateDefinition, loadTemplate, save } = useCassetteDesignerPersistence();

// The opened cassette's OCCS document loads from its payload before the
// designer mounts; payload-less instances keep the blank designer tree.
const designerCassette = ref(props.cassette);
watch(
  () => props.cassette?._id,
  async () => {
    designerCassette.value = await hydrateDefinition(props.cassette);
  },
  { immediate: true }
);

const templates = computed(() => {
  const byId = new Map();
  for (const cassette of [designerCassette.value, ...props.cassettes]) {
    const id = cassetteId(cassette);
    if (id) byId.set(id, cassette);
  }
  return [...byId.values()];
});
const templateOptions = computed(() => templates.value.map(cassette => ({
  label: cassette.identity?.name || cassette.identity?.slug || cassetteId(cassette),
  value: cassetteId(cassette),
  entity: cassette
})));
const persistedTemplateIds = computed(() => templateOptions.value.map(option => option.value));

function openTemplate(cassetteIdValue) {
  const cassette = templates.value.find(item => cassetteId(item) === String(cassetteIdValue || ''));
  if (!cassette) return;
  emit('open-page', {
    pageId: 'cassette-designer',
    entity: cassette,
    typeId: 'cassette'
  });
}

async function handleSave(payload = {}) {
  try {
    const saved = await save(payload);
    const refreshed = await loadTemplate(saved._id).catch(() => null);
    if (refreshed) designerCassette.value = refreshed;
    emit('refresh');
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || t('cassette.errors.saveFailed'), life: 5000 });
  }
}

function cassetteId(cassette = null) {
  const value = cassette?._id || cassette?.identity?.uid || '';
  return value ? String(value) : '';
}
</script>
