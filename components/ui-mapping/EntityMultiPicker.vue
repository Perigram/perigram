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
import AppMultiSelect from '~/components/shared/EntityMultiSelect.vue';

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
const typeLabel = typeId => (props.bundle?.types || []).find(type => type.id === typeId)?.render?.label || typeId;
</script>
