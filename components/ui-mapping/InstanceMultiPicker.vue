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
import { useI18n } from 'vue-i18n';
import AppMultiSelect from '~/components/shared/InstanceMultiSelect.vue';
import { instancePickerOptions } from '~/utils/instance-select.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';

const props = defineProps({
  accepts: { type: Array, default: () => [] },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const model = defineModel();
const { t, te } = useI18n();
const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));
const options = computed(() => instancePickerOptions(props.pool, props.accepts, {
  typeRecordFor: typeId => typesById.value[typeId] || null,
  typeLabelFor: typeId => generatedEntityLabel(typeId, { t, te }),
  unnamedLabel: t('common.unnamed'),
  refValue: true
}));
</script>
