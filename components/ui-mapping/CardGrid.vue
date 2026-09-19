<template>
  <DataView :value="instances" data-key="id" layout="grid" :paginator="instances.length > 8" :rows="8">
    <template #grid="slotProps">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="instance in slotProps.items"
          :key="instance.id"
          class="bg-content border-content-border flex flex-col gap-3 rounded-ui border p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex min-w-0 items-center gap-2">
              <Avatar :icon="type?.render?.icon || 'pi pi-circle'" shape="circle" />
              <span class="text-body truncate">{{ identityOf(instance) }}</span>
            </div>
            <Tag v-if="statusOf(instance)" :value="statusOf(instance).label" :severity="statusOf(instance).severity" />
          </div>
          <PreviewBox :type="type" :payload="instance.payload" :seed="instance.id" />
          <div v-for="field in scalarFields" :key="field.name" class="flex min-w-0 flex-col gap-1">
            <span class="text-supporting text-muted">{{ field.label }}</span>
            <FieldControl
              :model-value="instance.fields?.[field.name]"
              :descriptor="field.descriptor"
              variant="row"
              :pool="pool"
              :bundle="bundle"
            />
          </div>
        </div>
      </div>
    </template>
    <template #empty>
      <span class="text-supporting text-muted">{{ $t('uiMapping.emptyRegion') }}</span>
    </template>
  </DataView>
</template>

<script setup>
import { computed } from 'vue';
import DataView from 'primevue/dataview';
import Avatar from 'primevue/avatar';
import Tag from 'primevue/tag';
import { fieldLabel, SEVERITY_MAP } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import PreviewBox from './PreviewBox.vue';

const SCALAR_BASES = new Set(['string', 'number', 'quantity', 'instant', 'boolean', 'enum']);

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const identityOf = instance => {
  const fields = instance.fields || {};
  return fields.serial || fields.title || fields.grade || fields.name || fields.summary || instance.id;
};
const statusOf = instance => {
  const value = instance.states?.main;
  if (!value || !props.type?.states?.main) return null;
  const render = props.type.render?.states?.[value];
  return { label: render?.label || startCase(value), severity: SEVERITY_MAP[render?.severity] || 'secondary' };
};
const scalarFields = computed(() => Object.entries(props.type?.fields || {})
  .filter(([, descriptor]) => SCALAR_BASES.has(descriptor.base)
    && !(descriptor.base === 'string' && (descriptor.multiline === true || (descriptor.max || 0) >= 120)))
  .slice(0, 2)
  .map(([name, descriptor]) => ({ name, descriptor, label: fieldLabel(name, descriptor) })));
</script>
