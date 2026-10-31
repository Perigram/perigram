<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div v-if="loading" class="text-supporting text-muted">{{ t('uiMapping.loadingRegion') }}</div>
    <Message v-else-if="error" severity="error" :closable="false">{{ error }}</Message>
    <template v-else-if="templateRef && spots.length">
      <div
        v-for="spot in spots"
        :key="spot"
        class="flex min-w-0 items-center gap-2"
      >
        <span class="min-w-0 flex-1 truncate text-supporting" :title="spot">{{ spot }}</span>
        <Select
          :model-value="pickedIdFor(spot)"
          :options="optionsFor(spot)"
          option-label="label"
          option-value="value"
          :placeholder="t('uiMapping.pickPart')"
          filter
          size="small"
          class="min-w-0 flex-1"
          :create-actions="createActions"
          @update:model-value="value => assign(spot, value)"
          @create-select="option => assignCreated(spot, option)"
          @construct-create="action => emit('construct-create', action)"
        />
        <RefRowActions
          :value="pickedInstanceFor(spot)"
          :editor-actions="editorActions"
        />
      </div>
    </template>
    <div v-else-if="templateRef" class="flex items-center gap-2">
      <span class="text-supporting text-muted">{{ t('uiMapping.noSpots') }}</span>
      <RefRowActions
        :type-ids="accepts"
        :create-actions="createActions"
        @construct-create="action => emit('construct-create', action)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Message from 'primevue/message';
import Select from '~/components/shared/InstanceSelect.vue';
import RefRowActions from './RefRowActions.vue';
import { instanceOptionLabel, instancePickerOptions } from '~/utils/instance-select.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { useInstancesStore } from '~/stores/instances';
import { useFileTypeView } from '~/composables/useFileTypeView';
import { instancePayloadFileUrl } from '~/components/generated/file-preview-contract.js';

// The spot-parts assignment row (SPEC §24): the picked template names the
// placement anchors; each anchor takes any part of the accepted types —
// name equality only auto-fills, it never gates.
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  templateRef: { type: Object, default: null },
  accepts: { type: Array, default: () => [] },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  editorActions: { type: Object, default: null },
  createActions: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['update:modelValue', 'construct-create']);
const { t, te } = useI18n();
const instances = useInstancesStore();
const view = useFileTypeView();
const spots = ref([]);
const loading = ref(false);
const error = ref('');

// The anchor names come from the plugin's own parse law (dxf-markers.js)
// through the served editor surface module — the one home SPEC §24 gives
// the `{spot:}` vocabulary.
async function anchorNamesOf(typeId, text) {
  const binding = (view.editors.value || []).find(candidate => candidate?.type === typeId);
  const declared = binding ? (view.surfaces.value || []).find(surface => surface?.id === binding.surface) : null;
  const spotNames = declared?.url ? await import(declared.url).then(mod => mod.spotNamesOf) : null;
  return typeof spotNames === 'function' ? spotNames(text) : [];
}

const entries = computed(() => Array.isArray(props.modelValue) ? props.modelValue : []);
const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));
// A per-spot create lands its record in the options at once — the pool
// catches up on the next load.
const createdParts = ref([]);
const parts = computed(() => {
  const derived = instancePickerOptions(props.pool, props.accepts, {
    typeRecordFor: typeId => typesById.value[typeId] || null,
    typeLabelFor: typeId => generatedEntityLabel(typeId, { t, te }),
    unnamedLabel: t('common.unnamed')
  });
  const known = new Set(derived.map(option => option.value));
  return [...derived, ...createdParts.value.filter(option => !known.has(option.value))];
});

const pickedIdFor = spot => entries.value.find(entry => entry.spot === spot)?.id || null;
const pickedInstanceFor = spot => {
  const entry = entries.value.find(candidate => candidate.spot === spot);
  return entry ? { type: entry.type, id: entry.id } : null;
};
const optionsFor = spot => parts.value
  .filter(option => {
    const taken = entries.value.find(entry => entry.id === option.value && entry.spot !== spot);
    return !taken;
  });

function assign(spot, id) {
  const next = entries.value.filter(entry => entry.spot !== spot);
  if (id) {
    const option = parts.value.find(candidate => candidate.value === String(id));
    if (option) next.push({ type: option.typeId, id: String(id), spot });
  }
  emit('update:modelValue', next);
}

function assignCreated(spot, option) {
  if (!option?.id) return;
  createdParts.value.push({
    label: instanceOptionLabel(option.entity, typesById.value[option.type] || null, { unnamedLabel: t('common.unnamed') }),
    value: String(option.id),
    entity: option.entity,
    typeId: option.type
  });
  const next = entries.value.filter(entry => entry.spot !== spot);
  next.push({ type: option.type, id: String(option.id), spot });
  emit('update:modelValue', next);
}

watch(() => props.templateRef, async ref => {
  spots.value = [];
  error.value = '';
  const keep = ref ? [] : entries.value;
  if (!ref?.id) {
    emit('update:modelValue', keep);
    return;
  }
  loading.value = true;
  try {
    const typeId = instances.canonicalTypeKey(ref.type || '');
    const instance = await instances.fetchInstance(typeId, String(ref.id), { force: true });
    const url = instancePayloadFileUrl(instance?.payload || instance);
    const text = url ? await (await fetch(url)).text() : '';
    spots.value = await anchorNamesOf(typeId, text);
    // Name equality is the zero-config default, an assignment suggestion:
    // same-named parts prefill, everything else stays a free pick.
    const next = [];
    const used = new Set();
    for (const spot of spots.value) {
      const match = parts.value.find(option => (
        !used.has(option.value)
        && instanceOptionLabel(option.entity, typesById.value[option.typeId]) === spot
      ));
      if (match) {
        used.add(match.value);
        next.push({ type: match.typeId, id: match.value, spot });
      }
    }
    emit('update:modelValue', next);
  } catch (cause) {
    error.value = cause?.message || String(cause);
  } finally {
    loading.value = false;
  }
}, { immediate: true });
</script>
