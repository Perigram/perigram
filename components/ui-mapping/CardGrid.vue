<template>
  <DataView :value="instances" data-key="id" layout="grid" :paginator="instances.length > 8" :rows="8">
    <template #grid="slotProps">
      <ResponsiveGrid variant="dense" responsive-context="container">
        <Card v-for="instance in slotProps.items" :key="instance.id" :class="[LAYOUT.clip, 'w-full']">
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
          <template #subtitle>{{ type?.render?.label }}</template>
          <template #content>
            <div :class="spacing ? spacing.stackTight : 'flex flex-col gap-3'">
              <div v-for="field in scalarFields" :key="field.name" :class="LAYOUT.rowBetween">
                <span class="text-supporting text-muted">{{ field.label }}</span>
                <FieldControl
                  :model-value="instance.fields?.[field.name]"
                  :descriptor="field.descriptor"
                  variant="inline"
                  :pool="pool"
                  :bundle="bundle"
                />
              </div>
            </div>
          </template>
        </Card>
      </ResponsiveGrid>
    </template>
    <template #empty>
      <Message severity="info" :text="$t('uiMapping.emptyRegion')" />
    </template>
  </DataView>
</template>

<script setup>
import { computed, inject } from 'vue';
import DataView from 'primevue/dataview';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import { LAYOUT, SCALAR_BASES, cardFactCount, SEVERITY_MAP, instanceIdentity, fieldLabel } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import PreviewBox from './PreviewBox.vue';

const spacing = inject('uiMappingSpacing', null);

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
const scalarFields = computed(() => Object.entries(props.type?.fields || {})
  .filter(([, descriptor]) => SCALAR_BASES.includes(descriptor.base)
    && !(descriptor.base === 'string' && (descriptor.multiline === true || (descriptor.max || 0) >= 120)))
  .slice(0, cardFactCount(props.type))
  .map(([name, descriptor]) => ({ name, descriptor, label: fieldLabel(name, descriptor) })));
</script>
