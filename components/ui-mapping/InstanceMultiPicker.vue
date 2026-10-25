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
import { titleFor } from '#shared/ui-mapping/index.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';

const props = defineProps({
  accepts: { type: Array, default: () => [] },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const model = defineModel();
const { t, te } = useI18n();
const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));
// Option labels ride the one title resolver: the declared identifier
// field, else the localized unnamed placeholder.
const options = computed(() => props.accepts
  .flatMap(typeId => Object.values(props.pool[typeId] || {}))
  .map(instance => ({
    label: `${generatedEntityLabel(instance.type, { t, te })}: ${titleFor(instance, typesById.value[instance.type], { unnamedLabel: t('common.unnamed') })}`,
    value: { type: instance.type, id: instance.id }
  })));
</script>
