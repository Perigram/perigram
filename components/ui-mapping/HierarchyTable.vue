<template>
  <div :class="LAYOUT.scrollX" class="[&_td]:align-top">
    <TreeTable :value="nodes" :expanded-keys="expandedKeys" size="small" data-key="key" class="min-w-max">
    <Column>
      <template #body="{ node }">
        <div class="flex items-center gap-2">
          <i :class="node.data.icon" class="text-muted" />
          <span class="text-body">{{ node.data.label }}</span>
        </div>
      </template>
    </Column>
    <Column v-if="hasStatus" :header="$t('uiMapping.statusColumn')">
      <template #body="{ node }">
        <Tag
          v-if="node.data.status"
          :value="node.data.status.label"
          :severity="node.data.status.severity"
        />
      </template>
    </Column>
    <Column v-for="field in scalarFields" :key="field.name" :header="field.label">
      <template #body="{ node }">
        <FieldControl
          :model-value="node.data.fields?.[field.name]"
          :descriptor="field.descriptor"
          variant="row"
          :pool="pool"
          :bundle="bundle"
        />
      </template>
    </Column>
    </TreeTable>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import TreeTable from 'primevue/treetable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import { LAYOUT, fieldLabel, SCALAR_BASES, tableColumnCount, applyBudget, SEVERITY_MAP, instanceIdentity } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const identityOf = instance => instanceIdentity(typesById.value[instance.type], instance);
const statusOf = (instance, type) => {
  const value = instance.states?.main;
  if (!value || !type?.states?.main) return null;
  const render = type.render?.states?.[value];
  return { label: render?.label || startCase(value), severity: SEVERITY_MAP[render?.severity] || 'secondary' };
};
const scalarFields = computed(() => Object.entries(props.type?.fields || {})
  .filter(([, descriptor]) => SCALAR_BASES.includes(descriptor.base)
    && !(descriptor.base === 'string' && (descriptor.multiline === true || (descriptor.max || 0) >= 120)))
  .slice(0, tableColumnCount(props.type))
  .map(([name, descriptor]) => ({ name, descriptor, label: fieldLabel(name, descriptor) })));
const hasStatus = computed(() => Boolean(props.type?.states?.main));

const buildNode = (instance, seen = new Set()) => {
  if (seen.has(instance.id)) return null;
  const nextSeen = new Set([...seen, instance.id]);
  const type = typesById.value[instance.type];
  const children = Object.entries(type?.edges?.children || {}).flatMap(([edgeKey, edge]) => {
    const byId = props.pool[edge.types?.[0]] || {};
    return Object.values(byId).filter(candidate => !nextSeen.has(candidate.id) && candidate.lineage?.[edgeKey]?.id === instance.id);
  });
  return {
    key: instance.id,
    data: {
      icon: type?.render?.icon || 'pi pi-circle',
      label: identityOf(instance),
      status: statusOf(instance, type),
      fields: instance.fields
    },
    children: children.map(child => buildNode(child, nextSeen)).filter(Boolean)
  };
};

const nodes = computed(() => props.instances.map(instance => buildNode(instance)).filter(Boolean));
const collectKeys = node => [node.key, ...node.children.flatMap(collectKeys)];
const expandedKeys = computed(() => Object.fromEntries(nodes.value.flatMap(collectKeys).map(key => [key, true])));
</script>
