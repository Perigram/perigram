<template>
  <Button
    v-if="canEdit"
    :label="menuItem ? $t('common.edit') : undefined"
    icon="pi pi-file-edit"
    text
    :rounded="!menuItem"
    size="small"
    :class="menuItem ? 'w-full justify-start' : null"
    :aria-label="$t('common.edit')"
    @click="openDesigner"
  />
  <DesignerDialog
    v-if="!openInWorkspace"
    v-model:visible="visible"
    :header="$t('cassette.designerTitle')"
    :close-on-escape="false"
  >
    <CassetteDesignerV2
      :template="entity"
      :template-options="templateOptions"
      :persisted-template-ids="persistedTemplateIds"
      :persist="false"
      @load-template="loadTemplate"
      @save-template="handleSaved"
    />
  </DesignerDialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import CassetteDesignerV2 from '~/components/CassetteDesignerV2.vue';
import DesignerDialog from '~/components/shared/DesignerDialog.vue';
import { useAuthStore } from '~/stores/auth';
import { useCassetteDesignerPersistence } from '~/composables/useCassetteDesignerPersistence.js';
import { hasPermissionGrant } from '#shared/access-control.js';

const props = defineProps({
  entity: { type: Object, required: true },
  menuItem: { type: Boolean, default: false },
  openInWorkspace: { type: Boolean, default: false }
});

const emit = defineEmits(['open-page', 'refresh']);

const authStore = useAuthStore();
const { activePermissions } = storeToRefs(authStore);
const { t } = useI18n();
const toast = useToast();
const { hydrateDefinition, listTemplates, loadTemplate: fetchTemplate, save } = useCassetteDesignerPersistence();
const visible = ref(false);
const cassettes = ref([]);
const currentTemplate = ref(null);
const entity = computed(() => currentTemplate.value || props.entity);
const canEdit = computed(() => hasPermissionGrant({
  permissions: activePermissions.value,
  feature: 'cassettes',
  level: 'write',
  entity: props.entity,
  typeId: 'cassette'
}));
const templateOptions = computed(() => {
  const source = cassettes.value.length ? cassettes.value : [entity.value].filter(Boolean);
  return source.map(cassette => ({
    label: cassette.identity?.name || cassette.identity?.slug || cassette._id,
    value: cassette._id?.toString(),
    entity: cassette
  }));
});
const persistedTemplateIds = computed(() => templateOptions.value.map(item => item.value).filter(Boolean));

// The opened entity's OCCS document loads from its payload before the
// designer mounts; payload-less instances keep the blank designer tree.
watch(
  () => props.entity?._id,
  async id => {
    currentTemplate.value = id ? await hydrateDefinition(props.entity) : null;
  },
  { immediate: true }
);

async function openDesigner() {
  if (props.openInWorkspace) {
    emit('open-page', {
      pageId: 'cassette-designer',
      entity: props.entity,
      typeId: 'cassette'
    });
    return;
  }
  visible.value = true;
  if (!cassettes.value.length) {
    cassettes.value = await listTemplates().catch(() => [props.entity]);
  }
}

async function loadTemplate(cassetteId) {
  const id = cassetteId?.toString?.() || cassetteId;
  if (!id) return;
  currentTemplate.value = cassettes.value.find(cassette => cassette._id?.toString() === id)
    || await fetchTemplate(id).catch(() => null);
}

async function handleSaved(payload = {}) {
  try {
    const saved = await save(payload);
    currentTemplate.value = await fetchTemplate(saved._id).catch(() => currentTemplate.value);
    emit('refresh');
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || t('cassette.errors.saveFailed'), life: 5000 });
  }
}
</script>
