<template>
  <AppMultiSelect
    v-model="model"
    :options="options"
    option-label="label"
    option-value="value"
    filter
    class="w-full"
  />
</template>

<script setup>
import { computed } from 'vue';
import AppMultiSelect from '~/components/shared/InstanceMultiSelect.vue';

const props = defineProps({
  accepts: { type: Array, default: () => [] },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const model = defineModel();
const instanceLabel = instance => {
  const fields = instance.fields || {};
  return fields.serial || fields.title || fields.grade || fields.name || fields.summary || instance.id;
};
const options = computed(() => props.accepts
  .flatMap(typeId => Object.values(props.pool[typeId] || {}))
  .map(instance => ({
    label: `${typeLabel(instance.type)}: ${instanceLabel(instance)}`,
    value: { type: instance.type, id: instance.id }
  })));
const { localizedTypeLabelById } = useLocalizedTypeLabel();
const typeLabel = typeId => localizedTypeLabelById(typeId, props.bundle?.types || []);
</script>
