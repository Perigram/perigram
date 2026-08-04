<template>
  <CassetteDesignerV2
    :template="cassette"
    :template-options="templateOptions"
    :persisted-template-ids="persistedTemplateIds"
    embedded
    @load-template="openTemplate"
    @save-template="$emit('refresh')"
  />
</template>

<script setup>
import { computed } from 'vue';
import CassetteDesignerV2 from '~/components/CassetteDesignerV2.vue';

const props = defineProps({
  cassette: { type: Object, required: true },
  cassettes: { type: Array, default: () => [] }
});

const emit = defineEmits(['open-page', 'refresh']);

const templates = computed(() => {
  const byId = new Map();
  for (const cassette of [props.cassette, ...props.cassettes]) {
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
    entityType: 'cassette'
  });
}

function cassetteId(cassette = null) {
  const value = cassette?._id || cassette?.identity?.uid || '';
  return value ? String(value) : '';
}
</script>
