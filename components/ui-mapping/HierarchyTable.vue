<template>
  <div :class="[LAYOUT.scrollX, 'ck-collection-rows']">
    <TreeTable :value="nodes" :expanded-keys="expandedKeys" size="small" data-key="key" class="min-w-max" :paginator="nodes.length > 10" :rows="10" :pt="tablePt">
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
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import TreeTable from 'primevue/treetable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import { LAYOUT, fieldLabel, fieldLabelKey, localizedLabel, SCALAR_BASES, tableColumnCount, applyBudget, titleFor, iconFor, childrenOfParent, hierarchyRootInstances, stateDisplayFor } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // Row identities render as links when an open handler exists upstream.
  openable: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Per-type state policy map: the status column exists exactly when the
  // compiled process authored a state vocabulary for the type.
  statePolicy: { type: Object, default: null },
  // Lazy child loading: `async (typeId) => screenInstance[]`. The tree is
  // ONE containment view — parents come from the region source, children
  // of the declared edges load through this seam when absent from the
  // pool. The app owns the fetch (store); the generator stays pure.
  loadType: { type: Function, default: null }
});

defineEmits(['open']);

// Same row-surface recipe as CollectionTable (content rows over the
// transparent table box, clipped corners, muted transparent header band).
const tablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' },
  // TreeTable has no rowClass prop — its rows bind the `row` pt section.
  // The surface is the preset's row background; the clip rounds the corners
  // (a row's background is not clipped by its radius) at the card radius.
  row: { class: '[clip-path:inset(0_round_var(--p-border-radius-xl))]' }
};

const { te, t } = useI18n();

// Declared child types of the region type: the containment edges the tree
// renders, resolved from the bundle (never guessed from lineage spelling).
const childTypeIds = computed(() => {
  const ids = new Set();
  for (const declaration of Object.values(props.type?.edges?.children || {})) {
    for (const childTypeId of declaration?.types || []) ids.add(childTypeId);
  }
  return [...ids];
});

// Locally loaded children overlay the provided pool: the region source
// carries the parents, the edges name the child types, and the loader
// fills them once per type. Loaded rows are plain pool entries — nesting
// and root scoping read them exactly like pool rows.
const loadedChildren = ref({});
const effectivePool = computed(() => {
  const overlay = Object.fromEntries(Object.entries(loadedChildren.value)
    .map(([typeId, byId]) => [typeId, { ...(props.pool[typeId] || {}), ...byId }]));
  return { ...props.pool, ...overlay };
});

async function ensureChildTypes() {
  if (!props.loadType) return;
  for (const childTypeId of childTypeIds.value) {
    if (props.pool[childTypeId] && Object.keys(props.pool[childTypeId]).length) continue;
    if (loadedChildren.value[childTypeId]) continue;
    try {
      const rows = await props.loadType(childTypeId);
      loadedChildren.value = {
        ...loadedChildren.value,
        [childTypeId]: Object.fromEntries((rows || []).filter(Boolean).map(row => [row.id, row]))
      };
    } catch {
      loadedChildren.value = { ...loadedChildren.value, [childTypeId]: {} };
    }
  }
}
onMounted(ensureChildTypes);
watch(() => [props.type?.id, props.loadType], ensureChildTypes);

const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));
const identityOf = instance => titleFor(instance, typesById.value[instance.type], { unnamedLabel: t('common.unnamed') });
const statusOf = (instance, type) => {
  const display = stateDisplayFor(props.statePolicy, instance?.state);
  return display ? { label: display.label, severity: display.severity } : null;
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
const hasStatus = computed(() => Boolean(props.statePolicy));

const buildNode = (instance, seen = new Set()) => {
  if (seen.has(instance.id)) return null;
  const nextSeen = new Set([...seen, instance.id]);
  const type = typesById.value[instance.type];
  // Children resolve through the shared hierarchy matcher over the
  // effective pool (region pool + lazily loaded child rows): every
  // children edge contributes instances whose lineage carries the edge's
  // DECLARED lineageKey pointing here — never the edge's map key.
  const children = childrenOfParent(type, effectivePool.value, instance.id)
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

const nodes = computed(() => hierarchyRootInstances(props.instances, props.bundle, effectivePool.value)
  .map(instance => buildNode(instance))
  .filter(Boolean));
const collectKeys = node => [node.key, ...node.children.flatMap(collectKeys)];
// Roots expand once their children are known — the tree is the point of
// this projection; deeper levels start collapsed.
const expandedKeys = computed(() => Object.fromEntries(nodes.value
  .flatMap(node => [node.key, ...node.children.map(child => child.key)])
  .map(key => [key, true])));
</script>

<style scoped>
/* Row-surface rhythm (layout-only declarations): the same separated-cell
   gap as CollectionTable, so tree rows read as rounded surface cards. */
.ck-collection-rows :deep(.p-treetable-table) {
  border-collapse: separate;
  border-spacing: 0 0.25rem;
}
</style>
