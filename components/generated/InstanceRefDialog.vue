<template>
  <StandardDialog
    :visible="visible"
    size="sm"
    :title="t('editors.pickInstance')"
    @update:visible="shown => { if (!shown) emit('close'); }"
  >
    <div class="flex max-h-96 min-w-72 flex-col gap-2">
      <InputText
        v-model="query"
        size="small"
        class="w-full"
        :placeholder="t('common.search')"
        :aria-label="t('common.search')"
      />
      <div class="flex min-h-0 flex-col overflow-y-auto">
        <button
          v-for="option in options"
          :key="`${option.type}:${option.id}`"
          type="button"
          class="flex w-full items-center gap-2 rounded-ui px-2 py-1 text-left hover:bg-chrome-subtle"
          @click="emit('pick', option)"
        >
          <i class="pi pi-circle text-muted" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ option.label }}</span>
          <span class="ml-auto shrink-0 text-muted text-supporting">{{ option.typeLabel }}</span>
        </button>
        <span v-if="!options.length" class="py-2 text-center text-muted text-supporting">{{ t('editors.noInstances') }}</span>
      </div>
    </div>
  </StandardDialog>
</template>

<script setup>
// The inline instance picker (SPEC §26): the text editor inserts an
// instance reference as a markdown link on the `instance:` scheme.
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import InputText from 'primevue/inputtext';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { generatedEntityLabel } from '~/utils/generated-labels';
import { instanceOptionLabel } from '~/utils/instance-select.js';

const props = defineProps({
  visible: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'pick']);
const { te, t } = useI18n();
const authStore = useAuthStore();
const instances = useInstancesStore();
const query = ref('');

const bundle = computed(() => authStore.processPayload?.bundle || { types: [] });
const typeRecords = computed(() => new Map((bundle.value.types || []).map(type => [String(type.id), type])));
const listableTypeIds = computed(() => new Set((authStore.screenManifest || [])
  .filter(screen => screen.template === 'typeList' && screen.typeId)
  .map(screen => String(screen.typeId))));
const typeIds = computed(() => {
  const ids = [...listableTypeIds.value];
  return ids.length ? ids : [...typeRecords.value.keys()];
});

const options = computed(() => {
  const needle = query.value.trim().toLowerCase();
  const rows = [];
  for (const typeId of typeIds.value) {
    const typeRecord = typeRecords.value.get(typeId) || null;
    const typeLabel = typeRecord ? generatedEntityLabel(typeRecord, { t, te }) : typeId;
    const bucket = instances.instancePool?.[typeId] || {};
    for (const entity of Object.values(bucket)) {
      const id = String(entity?._id ?? entity?.id ?? '');
      if (!id) continue;
      const label = instanceOptionLabel(entity, typeRecord, { unnamedLabel: t('common.unnamed') });
      if (needle && !label.toLowerCase().includes(needle) && !typeLabel.toLowerCase().includes(needle)) continue;
      rows.push({ type: typeId, id, label, typeLabel, entity });
    }
  }
  return rows.slice(0, 80);
});

watch(() => props.visible, async visible => {
  if (!visible) {
    query.value = '';
    return;
  }
  await Promise.all(typeIds.value.map(async typeId => {
    const key = instances.canonicalTypeKey(typeId);
    if (!key) return;
    await instances.listInstances(key, {}, { silent: true }).catch(() => {});
  }));
}, { immediate: true });
</script>
