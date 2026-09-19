<template>
  <div :class="LAYOUT.scrollX" class="[&_td]:align-top">
    <DataTable
    :value="instances"
    size="small"
    striped-rows
    data-key="id"
    :class="virtual ? '' : 'min-w-max'"
    :scrollable="virtual"
    :scroll-height="virtual ? '26rem' : undefined"
    :virtual-scroller-options="virtual ? { itemSize: 40 } : undefined"
    :paginator="!virtual && instances.length > 10"
    :rows="10"
  >
      <template #empty>
        <span class="text-supporting text-muted">{{ $t('uiMapping.emptyRegion') }}</span>
      </template>
    <Column class="w-8">
      <template #body="{ data }">
        <i :class="type?.render?.icon || 'pi pi-circle'" class="text-muted" />
      </template>
    </Column>
    <Column :header="$t('uiMapping.identityColumn')">
      <template #body="{ data }">
        <span class="text-body block max-w-72 truncate">{{ identityOf(data) }}</span>
      </template>
    </Column>
    <Column v-if="hasStatus" :header="$t('uiMapping.statusColumn')">
      <template #body="{ data }">
        <Tag v-if="statusOf(data)" :value="statusOf(data).label" :severity="statusOf(data).severity" />
      </template>
    </Column>
    <Column v-for="field in scalarFields" :key="field.name" :header="field.label">
      <template #body="{ data }">
        <FieldControl
          :model-value="data.fields?.[field.name]"
          :descriptor="field.descriptor"
          variant="row"
          :pool="pool"
          :bundle="bundle"
        />
      </template>
    </Column>
    <Column v-if="relationKey" :header="relationLabel">
      <template #body="{ data }">
        <div class="flex flex-wrap items-center gap-1">
          <InstanceChip
            v-for="ref in budgetedRefs(data)"
            :key="ref.id"
            :value="ref"
            :pool="pool"
            :bundle="bundle"
          />
          <Tag v-if="hiddenRefCount(data) > 0" :value="`+${hiddenRefCount(data)}`" severity="contrast" />
        </div>
      </template>
    </Column>
    </DataTable>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import { LAYOUT, fieldLabel, SCALAR_BASES, tableColumnCount, ROW_RELATION_BUDGET, applyBudget, SEVERITY_MAP, instanceIdentity } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import InstanceChip from './InstanceChip.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const virtual = computed(() => props.instances.length > 50);
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const identityOf = instance => instanceIdentity(props.type, instance);
const hasStatus = computed(() => Boolean(props.type?.states?.main));
const statusOf = instance => {
  const value = instance.states?.main;
  if (!value) return null;
  const render = props.type.render?.states?.[value];
  return { label: render?.label || startCase(value), severity: SEVERITY_MAP[render?.severity] || 'secondary' };
};
const scalarFields = computed(() => Object.entries(props.type?.fields || {})
  .filter(([, descriptor]) => SCALAR_BASES.includes(descriptor.base)
    && !(descriptor.base === 'string' && (descriptor.multiline === true || (descriptor.max || 0) >= 120)))
  .slice(0, tableColumnCount(props.type))
  .map(([name, descriptor]) => ({ name, descriptor, label: fieldLabel(name, descriptor) })));
const relationKey = computed(() => Object.keys(props.type?.edges?.relations || {})[0] || null);
const relationLabel = computed(() => (relationKey.value ? startCase(relationKey.value) : ''));
const budgetedRefs = instance => {
  const refs = instance.relations?.[relationKey.value];
  const list = Array.isArray(refs) ? refs : refs ? [refs] : [];
  return applyBudget(list, ROW_RELATION_BUDGET).visible;
};
const hiddenRefCount = instance => {
  const refs = instance.relations?.[relationKey.value];
  const list = Array.isArray(refs) ? refs : refs ? [refs] : [];
  return applyBudget(list, ROW_RELATION_BUDGET).hidden;
};
</script>
