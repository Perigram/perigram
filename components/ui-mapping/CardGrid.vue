<template>
  <DataView :value="instances" data-key="id" layout="grid" :paginator="instances.length > 8" :rows="8">
    <template #grid="slotProps">
      <div :class="LAYOUT.cardGrid">
        <Card v-for="instance in slotProps.items" :key="instance.id" class="w-full">
          <template #header>
            <PreviewBox :type="type" :payload="instance.payload" :seed="instance.id" />
          </template>
          <template #title>
            <div :class="LAYOUT.rowBetween">
              <div :class="LAYOUT.row">
                <i :class="type?.render?.icon || 'pi pi-circle'" class="text-muted" />
                <span>{{ identityOf(instance) }}</span>
              </div>
              <Tag
                v-if="statusOf(instance)"
                :value="statusOf(instance).label"
                :severity="statusOf(instance).severity"
              />
            </div>
          </template>
          <template #subtitle>{{ subtitleOf(instance) }}</template>
        </Card>
      </div>
    </template>
    <template #empty>
      <Message severity="info" :text="$t('uiMapping.emptyRegion')" />
    </template>
  </DataView>
</template>

<script setup>
import { computed } from 'vue';
import DataView from 'primevue/dataview';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import { LAYOUT, SCALAR_BASES, CARD_FACT_BUDGET, applyBudget, SEVERITY_MAP, instanceIdentity, fieldLabel, formatValue } from '#shared/ui-mapping/index.js';
import PreviewBox from './PreviewBox.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const identityOf = instance => instanceIdentity(props.type, instance);
const statusOf = instance => {
  const value = instance.states?.main;
  if (!value || !props.type?.states?.main) return null;
  const render = props.type.render?.states?.[value];
  return { label: render?.label || startCase(value), severity: SEVERITY_MAP[render?.severity] || 'secondary' };
};
const scalarFields = computed(() => applyBudget(
  Object.entries(props.type?.fields || {})
    .filter(([, descriptor]) => SCALAR_BASES.includes(descriptor.base)
      && !(descriptor.base === 'string' && (descriptor.multiline === true || (descriptor.max || 0) >= 120))),
  CARD_FACT_BUDGET
).visible);
const subtitleOf = instance => scalarFields.value
  .map(([name, descriptor]) => `${fieldLabel(name, descriptor)}: ${formatValue(descriptor, instance.fields?.[name])}`)
  .join(' · ') || instance.id;
</script>
