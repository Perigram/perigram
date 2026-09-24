<template>
  <div :class="[LAYOUT.scrollX, 'ck-collection-rows']">
    <TreeTable :value="nodes" :expanded-keys="expandedKeys" size="small" data-key="key" class="min-w-max" :paginator="nodes.length > 10" :rows="10" :pt="tablePt" :row-class="rowSurfaceClass">
    <Column>
      <template #body="{ node }">
        <div class="flex items-center gap-2">
          <i :class="node.data.icon" class="text-muted" />
          <Button
            v-if="openable && node.data.instance"
            link
            size="small"
            :label="node.data.label"
            class="max-w-72 text-left [&_.p-button-label]:truncate"
            @click="$emit('open', node.data.instance)"
          />
          <span v-else class="text-body block max-w-72 truncate">{{ node.data.label }}</span>
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
import { useI18n } from 'vue-i18n';
import TreeTable from 'primevue/treetable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import { LAYOUT, fieldLabel, fieldLabelKey, localizedLabel, SCALAR_BASES, tableColumnCount, applyBudget, SEVERITY_MAP, titleFor, iconFor, childrenOfParent } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // Row identities render as links when an open handler exists upstream.
  openable: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }});

defineEmits(['open']);

// Same Notion-style row surfaces as CollectionTable: rounded content rows
// over the transparent table box, muted transparent header band — through
// TreeTable's official pt/rowClass channels.
const tablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' }
};
// Row paint comes from the preset (row.background = content surface);
// the recipe adds the rounded hairline ring here. The ring rides
// outline+outline-offset — tr borders do not paint in separated-border
// mode, while an inset outline follows the row's border-radius.
const rowSurfaceClass = () => 'rounded-ui outline-1 -outline-offset-1 outline-content-border';

const { te, t } = useI18n();

const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const identityOf = instance => titleFor(instance, typesById.value[instance.type], { unnamedLabel: t('common.unnamed') });
const statusOf = (instance, type) => {
  const value = instance.states?.main;
  if (!value || !type?.states?.main) return null;
  const render = type.states?.main?.render?.[value];
  return { label: render?.label || startCase(value), severity: SEVERITY_MAP[render?.severity] || 'secondary' };
};
const scalarFields = computed(() => Object.entries(props.type?.fields || {})
  .filter(([, descriptor]) => SCALAR_BASES.includes(descriptor.base)
    && !(descriptor.base === 'string' && (descriptor.multiline === true || (descriptor.max || 0) >= 120)))
  .slice(0, tableColumnCount(props.type))
  .map(([name, descriptor]) => ({
    name,
    descriptor,
    label: localizedLabel({ te, t }, fieldLabelKey(props.type?.id, name), fieldLabel(name, descriptor))
  })));
const hasStatus = computed(() => Boolean(props.type?.states?.main));

const buildNode = (instance, seen = new Set()) => {
  if (seen.has(instance.id)) return null;
  const nextSeen = new Set([...seen, instance.id]);
  const type = typesById.value[instance.type];
  // Children resolve through the shared hierarchy matcher: every children
  // edge contributes instances whose lineage carries the edge's DECLARED
  // lineageKey pointing here — never the edge's map key.
  const children = childrenOfParent(type, props.pool, instance.id)
    .filter(child => !nextSeen.has(child.id));
  return {
    key: instance.id,
    data: {
      icon: iconFor(type),
      label: identityOf(instance),
      status: statusOf(instance, type),
      fields: instance.fields,
      instance
    },
    children: children.map(child => buildNode(child, nextSeen)).filter(Boolean)
  };
};

const nodes = computed(() => props.instances.map(instance => buildNode(instance)).filter(Boolean));
const collectKeys = node => [node.key, ...node.children.flatMap(collectKeys)];
const expandedKeys = computed(() => Object.fromEntries(nodes.value.flatMap(collectKeys).map(key => [key, true])));
</script>

<style scoped>
/* Row-surface rhythm (layout-only declarations): the same separated-cell
   gap as CollectionTable, so tree rows read as rounded surface cards. */
.ck-collection-rows :deep(.p-treetable-table) {
  border-collapse: separate;
  border-spacing: 0 0.25rem;
}
</style>
