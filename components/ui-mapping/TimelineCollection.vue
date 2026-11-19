<template>
  <Timeline :value="page" class="w-full" :pt="timelinePt">
    <template #content="{ item }">
      <div :class="LAYOUT.stackTight">
        <div :class="LAYOUT.rowBetween">
          <InstanceIdentity
            :instance="item"
            :type="type"
            :openable="openable"
            size="small"
            @open="target => $emit('open', target)"
          />
          <div v-if="scalarFields.length" :class="LAYOUT.row">
            <div v-for="field in scalarFields" :key="field.name" class="flex items-baseline gap-1">
              <span class="text-supporting text-muted">{{ field.label }}</span>
              <FieldControl
                :model-value="item.fields?.[field.name]"
                :descriptor="field.descriptor"
                variant="inline"
                  :quantitative="quantitative"
                :pool="pool"
                :bundle="bundle"
              />
            </div>
          </div>
        </div>
        <span v-if="bodyValue(item)" class="text-body line-clamp-3 break-words">{{ bodyValue(item) }}</span>
      </div>
    </template>
  </Timeline>
  <Paginator
    v-if="instances.length > pageSize"
    v-model:first="first"
    :rows="pageSize"
    :total-records="instances.length"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Timeline from 'primevue/timeline';
import Paginator from 'primevue/paginator';
import {
  LAYOUT, fieldLabel, fieldLabelKey, localizedLabel, formatValue,
  SCALAR_BASES, resolveListControls, pageSlice
, typeIsQuantitative } from '#shared/ui-mapping/index.js';
import InstanceIdentity from './InstanceIdentity.vue';
import FieldControl from './FieldControl.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // SPEC §22.8: the type's quantitative dominance earns the dashboard
  // field presentations.
  // Composed list-controls contract from the region tree; recomputed from
  // the type and loaded instances when absent (direct timeline usage).
  controls: { type: Object, default: null },
  // Entry identities render as links when an open handler exists upstream.
  openable: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const quantitative = computed(() => typeIsQuantitative(props.type));

defineEmits(['open']);

const { te, t, locale } = useI18n();

// No #opposite column: hide PrimeVue's always-rendered empty one.
const timelinePt = { eventOpposite: { style: { display: 'none' } } };

const resolvedControls = computed(() => props.controls || resolveListControls(props.type, props.instances));
// The timeline pages through the shared page budget (same rows contract
// as the table); shorter streams render whole without a pager.
const pageSize = computed(() => resolvedControls.value.pagination.rows);
const first = ref(0);
watch(() => props.instances, () => { first.value = 0; });
const page = computed(() => pageSlice(props.instances, first.value, pageSize.value));

const isLongString = descriptor => descriptor.base === 'string'
  && (descriptor.multiline === true || (descriptor.max || 0) >= 120);
const bodyField = computed(() => {
  const entries = Object.entries(props.type?.fields || {});
  const long = entries.find(([, descriptor]) => isLongString(descriptor));
  if (long) return { name: long[0] };
  const structural = entries.find(([, descriptor]) => !SCALAR_BASES.includes(descriptor.base));
  return structural ? { name: structural[0] } : null;
});
const bodyValue = (instance) => {
  if (!bodyField.value) return null;
  const raw = instance.fields?.[bodyField.value.name];
  const descriptor = { base: typeof raw === 'object' && raw !== null ? 'json' : 'string' };
  return formatValue(descriptor, raw, { locale: locale.value });
};
const scalarFields = computed(() => Object.entries(props.type?.fields || {})
  .filter(([name, descriptor]) => SCALAR_BASES.includes(descriptor.base)
    && !isLongString(descriptor)
    && name !== bodyField.value?.name)
  .map(([name, descriptor]) => ({
    name,
    descriptor,
    label: localizedLabel({ te, t }, fieldLabelKey(props.type?.id, name), fieldLabel(name, descriptor))
  })));
</script>
