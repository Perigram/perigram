<template>
  <div class="flex w-full min-w-0 items-center gap-2">
    <TreeSelect
      v-if="hierarchical"
      :model-value="treeSelection"
      :options="treeOptions"
      option-label="label"
      option-value="key"
      selection-mode="single"
      placeholder="—"
      filter
      filter-mode="lenient"
      :filter-placeholder="t('common.search')"
      class="min-w-0 flex-1"
      @update:model-value="keys => selectTreeKey(keys)"
    >
      <template #option="{ node }">
        <div
          v-if="node.instance"
          class="pointer-events-none w-full min-w-0"
          :class="node.selectable ? '' : 'opacity-60'"
        >
          <InstanceInlineRef
            :type="node.typeId"
            :entity="node.instance"
            :fetch="false"
            :interactive="false"
            variant="option"
            :show-type-label="!node.selectable"
          />
        </div>
        <span v-else :class="node.selectable ? '' : 'opacity-60'">{{ node.label }}</span>
      </template>
    </TreeSelect>
    <AutoComplete v-else
      :model-value="selectedOption"
      :suggestions="filteredOptions"
      option-label="label"
      force-selection
      dropdown
      fluid
      class="min-w-0 flex-1"
      :complete-on-focus="true"
      @complete="search"
      @update:model-value="option => (model = option?.value ?? null)"
    >
      <template #option="{ option }">
        <div v-if="option.entity" class="pointer-events-none w-full min-w-0">
          <InstanceInlineRef
            :type="option.typeId"
            :entity="option.entity"
            :fetch="false"
            :interactive="false"
            variant="option"
            :show-type-label="accepts.length > 1"
          />
        </div>
        <span v-else>{{ option.label }}</span>
      </template>
    </AutoComplete>
    <RefRowActions
      :type-ids="accepts"
      :create-actions="createActions"
      @select="applyCreated"
      @construct-create="action => emit('construct-create', action)"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import AutoComplete from 'primevue/autocomplete';
import TreeSelect from 'primevue/treeselect';
import { useI18n } from 'vue-i18n';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import RefRowActions from './RefRowActions.vue';
import { instanceOptionLabel, instancePickerOptions } from '~/utils/instance-select.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { useInstancesStore } from '~/stores/instances';
import { useAuthStore } from '~/stores/auth';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import {
  containmentAncestors,
  normalizeHierarchyType,
  traceContextExclusions,
  visibleTraceAncestors
} from '~/utils/instance-hierarchy.js';

const props = defineProps({
  accepts: { type: Array, default: () => [] },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Compiled create actions by type id (SPEC §22.13): entries for the
  // accepted types render the picker's create affordance.
  createActions: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['construct-create']);
const model = defineModel();
const query = ref('');
const instances = useInstancesStore();
const authStore = useAuthStore();
const effectiveContainment = useEffectiveContainment();
const { t, te } = useI18n();
const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));
const typeRecordOf = typeId => typesById.value[typeId] || null;
const normalize = typeId => normalizeHierarchyType(typeId);
const bundleIdOf = normalized => {
  for (const typeId of props.accepts) {
    if (normalize(typeId) === normalized) return typeId;
  }
  return (props.bundle?.types || []).find(type => normalize(type.id) === normalized)?.id || normalized;
};

// The ancestor types the accepted types nest under through the effective
// containment contract, transitively — the tree navigates these levels
// down to the accepted instances.
const ancestorTypeIds = computed(() => {
  const found = new Set();
  const accepted = new Set((props.accepts || []).map(normalize));
  const queue = [...accepted];
  while (queue.length) {
    const child = queue.shift();
    for (const triple of effectiveContainment()) {
      if (normalize(triple.childType) !== child) continue;
      const parent = normalize(triple.parentType);
      if (parent === 'organization' || accepted.has(parent) || found.has(parent)) continue;
      found.add(parent);
      queue.push(parent);
    }
  }
  return [...found].map(bundleIdOf);
});

// Ref rows in create dialogs name types the surrounding screen may not
// source; load each accepted and ancestor type's instances on demand and
// merge them over the host pool.
const fetchedTypes = ref({});
async function ensureType(typeId) {
  const key = instances.canonicalTypeKey(typeId);
  if (!key || fetchedTypes.value[key]) return;
  fetchedTypes.value[key] = true;
  try {
    // An empty cache is a first-use cache: fetch instead of trusting a
    // prior empty observation, so a dialog opened before the store's first
    // read still lists the records already in the database.
    const cached = Object.keys(instances.records?.[key] || {}).length > 0;
    await instances.listInstances(key, {}, { silent: true, force: !cached });
  } catch {
    fetchedTypes.value[key] = false;
  }
}
watch(() => [...(props.accepts || []), ...ancestorTypeIds.value], ids => {
  for (const typeId of ids || []) ensureType(typeId);
}, { immediate: true });

const sourcedTypes = computed(() => [...new Set([...(props.accepts || []), ...ancestorTypeIds.value])]);
const mergedPool = computed(() => {
  const pool = { ...(props.pool || {}) };
  for (const typeId of sourcedTypes.value) {
    const key = instances.canonicalTypeKey(typeId);
    const bucket = key ? instances.records[key] : null;
    if (!bucket) continue;
    const entries = Object.values(bucket)
      .map(entry => entry?.instance || entry?.dto)
      .filter(Boolean)
      .map(instance => ({ ...instance, id: String(instance.id ?? instance._id ?? '') }))
      .filter(instance => instance.id);
    if (!entries.length) continue;
    const byId = { ...(pool[typeId] || {}) };
    for (const instance of entries) byId[instance.id] = instance;
    pool[typeId] = byId;
  }
  return pool;
});
const poolInstancesOf = typeId => Object.values(mergedPool.value[typeId] || {});

// A type with declared containment ancestry renders as the ancestry tree:
// accepted instances nested under their ancestors (the same walk the
// record's chain renders), ancestors as pure navigation levels.
const hierarchical = computed(() => ancestorTypeIds.value.length > 0);

// Records the model references beyond the pool — a picker create's
// record, a host-applied construct result — supplement the derived
// options so the closed control resolves their labels.
const supplemented = ref([]);
const supplementFor = (typeId, id, entity) => {
  if (!entity || supplemented.value.some(entry => entry.value.id === String(id))) return;
  supplemented.value.push({
    label: instanceOptionLabel(entity, typeRecordOf(typeId), { unnamedLabel: t('common.unnamed') }),
    value: { type: typeId, id: String(id) },
    entity,
    typeId
  });
};

const tree = computed(() => {
  if (!hierarchical.value) return { roots: [], byKey: new Map() };
  const containment = effectiveContainment();
  const exclusions = traceContextExclusions({
    activeOrganizationId: authStore.organizationData?._id || authStore.userData?.organizationId || ''
  });
  const byKey = new Map();
  const ordered = [];
  const selectableTypes = new Set((props.accepts || []).map(normalize));
  const nodeOf = (bundleTypeId, id, instance) => {
    const key = `${bundleTypeId}:${id}`;
    let node = byKey.get(key);
    if (!node) {
      node = {
        key,
        id,
        typeId: bundleTypeId,
        instance: null,
        label: '',
        selectable: selectableTypes.has(normalize(bundleTypeId)),
        parentNodeKey: null,
        children: []
      };
      byKey.set(key, node);
      ordered.push(node);
    }
    if (instance && !node.instance) {
      node.instance = instance;
      node.label = instanceOptionLabel(instance, typeRecordOf(bundleTypeId), { unnamedLabel: t('common.unnamed') });
    }
    return node;
  };
  const chainOf = instance => visibleTraceAncestors(
    containmentAncestors(instance, instance.type, containment),
    exclusions
  );
  for (const acceptedTypeId of props.accepts || []) {
    for (const instance of poolInstancesOf(acceptedTypeId)) {
      const leaf = nodeOf(acceptedTypeId, instance.id, instance);
      let parent = null;
      for (const ref of chainOf(instance)) {
        const bundleId = bundleIdOf(ref.type);
        const record = poolInstancesOf(bundleId)
          .find(row => row.id === String(ref.id) || String(row._id ?? '') === String(ref.id)) || null;
        const node = nodeOf(bundleId, String(ref.id), record);
        if (parent && node.parentNodeKey == null) {
          node.parentNodeKey = parent.key;
          parent.children.push(node);
        }
        parent = node;
      }
      if (parent && leaf.parentNodeKey == null) {
        leaf.parentNodeKey = parent.key;
        parent.children.push(leaf);
      }
    }
  }
  for (const entry of supplemented.value) {
    if (!(props.accepts || []).includes(entry.typeId)) continue;
    nodeOf(entry.typeId, entry.value.id, entry.entity);
  }
  for (const node of ordered) {
    if (!node.label) node.label = generatedEntityLabel(node.typeId, { t, te });
  }
  const roots = ordered.filter(node => node.parentNodeKey == null);
  return { roots, byKey };
});
const treeOptions = computed(() => tree.value.roots);
// PrimeVue 4 TreeSelect models the selection as a checked-keys map
// (`{ [key]: true }`) in every mode; the model stays the `{ type, id }`
// instance ref.
function selectedTreeKey(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  return Object.keys(value).find(key => value[key] === true || value[key]?.checked) || null;
}
function selectTreeKey(keys) {
  const key = selectedTreeKey(keys);
  const node = key ? tree.value.byKey.get(key) : null;
  model.value = node ? { type: node.typeId, id: node.id } : null;
}
const treeSelection = computed(() => {
  if (!props.model?.id || !props.model.type) return null;
  return { [`${bundleIdOf(normalize(props.model.type))}:${props.model.id}`]: true };
});
const options = computed(() => {
  const derived = instancePickerOptions(mergedPool.value, props.accepts, {
    typeRecordFor: typeRecordOf,
    typeLabelFor: typeId => generatedEntityLabel(typeId, { t, te }),
    unnamedLabel: t('common.unnamed'),
    refValue: true
  });
  const known = new Set(derived.map(option => option.value?.id));
  return [...derived, ...supplemented.value.filter(option => !known.has(option.value?.id))];
});
const search = event => {
  query.value = String(event.query || '');
  for (const typeId of sourcedTypes.value) ensureType(typeId);
};
const filteredOptions = computed(() => {
  const needle = query.value.toLowerCase();
  return options.value.filter(option => option.label.toLowerCase().includes(needle));
});

// The autocomplete's input label resolves from the option object; the
// model stays the bare `{ type, id }` instance ref, translated here.
const selectedOption = computed(() => options.value.find(option => (
  option.value?.type === props.model?.type && option.value?.id === props.model?.id
)) || null);

function applyCreated(option) {
  if (!option?.id) return;
  supplementFor(option.type, option.id, option.entity);
  model.value = { type: option.type, id: String(option.id) };
}

// A model ref the pool never carried (the host applied a construct
// dialog's created record) resolves through the entity store for its
// label.
watch(() => props.model, async ref => {
  if (!ref?.id || !ref.type) return;
  if (options.value.some(option => option.value?.id === String(ref.id))) return;
  const typeKey = instances.canonicalTypeKey(ref.type);
  if (!typeKey) return;
  const entity = instances.instanceFor(typeKey, String(ref.id))
    || await instances.resolveReadableReference(typeKey, String(ref.id), { silent: true }).catch(() => null);
  if (entity && model.value?.id === ref.id) supplementFor(ref.type, String(ref.id), entity);
}, { immediate: true });
</script>
