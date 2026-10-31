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
        <div v-if="node.instance" class="pointer-events-none w-full min-w-0">
          <InstanceInlineRef
            :type="node.typeId"
            :entity="node.instance"
            :fetch="false"
            :interactive="false"
            variant="option"
          />
        </div>
        <span v-else>{{ node.label }}</span>
      </template>
    </TreeSelect>
    <AutoComplete v-else
      :model-value="selectedOption"
      :suggestions="suggestions"
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
import { childrenOfParent } from '#shared/ui-mapping/index.js';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import RefRowActions from './RefRowActions.vue';
import { instanceOptionLabel, instancePickerOptions } from '~/utils/instance-select.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { useInstancesStore } from '~/stores/instances';

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
const suggestions = ref([]);
const instances = useInstancesStore();
const { t, te } = useI18n();
const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));
const typeRecordOf = typeId => typesById.value[typeId] || null;

// Ref rows in create dialogs name types the surrounding screen may not
// source; load each accepted type's instances on demand and merge them
// over the host pool.
const fetchedTypes = ref({});
async function ensureType(typeId) {
  const key = instances.canonicalTypeKey(typeId);
  if (!key || fetchedTypes.value[key]) return;
  fetchedTypes.value[key] = true;
  try {
    await instances.listInstances(key, {}, { silent: true });
  } catch {
    fetchedTypes.value[key] = false;
  }
}
watch(() => props.accepts, ids => {
  for (const typeId of ids || []) ensureType(typeId);
}, { immediate: true, deep: true });

const mergedPool = computed(() => {
  const pool = { ...(props.pool || {}) };
  for (const typeId of props.accepts || []) {
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

const acceptedType = computed(() => typeRecordOf(props.accepts[0]));
const hierarchical = computed(() => Boolean(Object.keys(acceptedType.value?.edges?.children || {}).length));
const buildNode = (instance, seen = new Set()) => {
  if (seen.has(instance.id)) return null;
  const nextSeen = new Set([...seen, instance.id]);
  const type = typeRecordOf(instance.type);
  // Children resolve through the shared hierarchy matcher (declared
  // lineageKey, never the edge's map key) — the same matcher the
  // workspace explorer nests through.
  const children = childrenOfParent(type, mergedPool.value, instance.id)
    .filter(child => !nextSeen.has(child.id));
  return {
    key: instance.id,
    label: instanceOptionLabel(instance, type, { unnamedLabel: t('common.unnamed') }),
    typeId: instance.type,
    instance,
    children: children.map(child => buildNode(child, nextSeen)).filter(Boolean)
  };
};
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
const treeOptions = computed(() => hierarchical.value
  ? [
      ...Object.values(mergedPool.value[props.accepts[0]] || {}).map(instance => buildNode(instance)).filter(Boolean),
      ...supplemented.value
        .filter(entry => entry.typeId === props.accepts[0])
        .map(entry => ({ key: entry.value.id, label: entry.label, typeId: entry.typeId, instance: entry.entity, children: [] }))
    ]
  : []);
// PrimeVue 4 TreeSelect models the selection as a checked-keys map
// (`{ [key]: true }`) in every mode; the model stays the `{ type, id }`
// instance ref.
function selectedTreeKey(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  return Object.keys(value).find(key => value[key] === true || value[key]?.checked) || null;
}
function selectTreeKey(keys) {
  const id = selectedTreeKey(keys);
  model.value = id ? { type: props.accepts[0], id } : null;
}
const treeSelection = computed(() => (props.model?.id ? { [props.model.id]: true } : null));
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
  const query = String(event.query || '').toLowerCase();
  suggestions.value = options.value.filter(option => option.label.toLowerCase().includes(query));
};

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
