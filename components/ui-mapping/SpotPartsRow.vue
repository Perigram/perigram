<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div v-if="loading" class="text-supporting text-muted">{{ t('uiMapping.loadingRegion') }}</div>
    <Message v-else-if="error" severity="error" :closable="false">{{ error }}</Message>
    <template v-else-if="spots.length">
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
          @update:model-value="value => assign(spot, value)"
        />
      </div>
    </template>
    <span v-else class="text-supporting text-muted">{{ t('uiMapping.noSpots') }}</span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Select from 'primevue/select';
import Message from 'primevue/message';
import { spotNamesOf } from '#shared/dxf-spots.js';
import { titleFor } from '#shared/ui-mapping/index.js';
import { useInstancesStore } from '~/stores/instances';
import { instancePayloadFileUrl } from '~/components/generated/file-preview-contract.js';

// The spot-parts assignment row (SPEC §24): the picked template names the
// placement anchors; each anchor takes any part of the accepted types —
// name equality only auto-fills, it never gates.
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  templateRef: { type: Object, default: null },
  accepts: { type: Array, default: () => [] },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});
const emit = defineEmits(['update:modelValue']);
const { t, te } = useI18n();
const instances = useInstancesStore();
const spots = ref([]);
const loading = ref(false);
const error = ref('');

const entries = computed(() => Array.isArray(props.modelValue) ? props.modelValue : []);
const parts = computed(() => props.accepts
  .flatMap(typeId => Object.values(props.pool[typeId] || {}))
  .map(instance => ({
    instance,
    label: `${typeLabelOf(instance.type)}: ${titleFor(instance, typeRecordOf(instance.type), { unnamedLabel: t('common.unnamed') })}`
  })));

function typeRecordOf(typeId) {
  return (props.bundle?.types || []).find(candidate => candidate.id === typeId) || null;
}
function typeLabelOf(typeId) {
  const record = typeRecordOf(typeId);
  const key = `entities.${typeId}`;
  return record?.name || (te(key) ? t(key) : typeId);
}

const pickedIdFor = spot => entries.value.find(entry => entry.spot === spot)?.id || null;
const optionsFor = spot => parts.value
  .filter(({ instance }) => {
    const taken = entries.value.find(entry => entry.id === String(instance.id) && entry.spot !== spot);
    return !taken;
  })
  .map(({ instance, label }) => ({ label, value: String(instance.id), type: instance.type }));

function assign(spot, id) {
  const next = entries.value.filter(entry => entry.spot !== spot);
  if (id) {
    const option = parts.value.find(({ instance }) => String(instance.id) === String(id));
    if (option) next.push({ type: option.instance.type, id: String(id), spot });
  }
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
    spots.value = spotNamesOf(text);
    // Name equality is the zero-config default, an assignment suggestion:
    // same-named parts prefill, everything else stays a free pick.
    const next = [];
    const used = new Set();
    for (const spot of spots.value) {
      const match = parts.value.find(({ instance: candidate }) => (
        !used.has(String(candidate.id))
        && titleFor(candidate, typeRecordOf(candidate.type), { unnamedLabel: '' }) === spot
      ));
      if (match) {
        used.add(String(match.instance.id));
        next.push({ type: match.instance.type, id: String(match.instance.id), spot });
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
