<template>
  <StandardDialog
    :visible="visible"
    size="sm"
    :title="t('editors.pickInstance')"
    @update:visible="shown => { if (!shown) emit('close'); }"
  >
    <InstanceSelect
      :options="options"
      option-value="value"
      :placeholder="t('editors.pickInstance')"
      @update:model-value="pick"
    />
  </StandardDialog>
</template>

<script setup>
// The inline instance picker (SPEC §26): the shared InstanceSelect over
// the listable collections; a pick inserts an `#instance:` link.
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { instanceOptionLabel } from '~/utils/instance-select.js';

const props = defineProps({
  visible: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'pick']);
const { t } = useI18n();
const authStore = useAuthStore();
const instances = useInstancesStore();

const bundle = computed(() => authStore.processPayload?.bundle || { types: [] });
const listableTypeIds = computed(() => new Set((authStore.screenManifest || [])
  .filter(screen => screen.template === 'typeList' && screen.typeId)
  .map(screen => String(screen.typeId))));
const typeIds = computed(() => {
  const ids = (bundle.value.types || [])
    .map(type => String(type.id))
    .filter(id => id && (!listableTypeIds.value.size || listableTypeIds.value.has(id)));
  return ids.length ? ids : (bundle.value.types || []).map(type => String(type.id)).filter(Boolean);
});

const options = computed(() => {
  const rows = [];
  for (const typeId of typeIds.value) {
    const bucket = instances.instancePool?.[typeId] || {};
    for (const entity of Object.values(bucket)) {
      const id = String(entity?.id ?? entity?._id ?? '');
      if (!id) continue;
      rows.push({
        ...entity,
        typeId,
        value: { type: typeId, id }
      });
    }
  }
  return rows;
});

function pick(value) {
  if (!value?.type || !value?.id) return;
  const option = options.value.find(candidate => (
    candidate.value.type === value.type && candidate.value.id === value.id
  ));
  const typeRecord = (bundle.value.types || []).find(type => type.id === value.type) || null;
  emit('pick', {
    type: value.type,
    id: String(value.id),
    label: option ? instanceOptionLabel(option, typeRecord, { unnamedLabel: t('common.unnamed') }) : String(value.id),
    entity: option || null
  });
  emit('close');
}

watch(() => props.visible, async visible => {
  if (!visible) return;
  await Promise.all(typeIds.value.map(async typeId => {
    const key = instances.canonicalTypeKey(typeId);
    if (!key) return;
    await instances.listInstances(key, {}, { silent: true }).catch(() => {});
  }));
}, { immediate: true });
</script>
