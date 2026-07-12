<template>
  <Button
    v-if="canEdit"
    icon="pi pi-pencil"
    text
    rounded
    size="small"
    :aria-label="$t('common.edit')"
    @click="openDesigner"
  />
  <StandardDialog
    v-model:visible="visible"
    :header="$t('cassette.designerTitle')"
    size="full"
    :close-on-escape="false"
  >
    <CassetteDesignerV2
      :template="entity"
      :template-options="templateOptions"
      :persisted-template-ids="persistedTemplateIds"
      @load-template="loadTemplate"
      @save-template="handleSaved"
    />
  </StandardDialog>
</template>

<script setup>
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import CassetteDesignerV2 from '~/components/CassetteDesignerV2.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useAuthStore } from '~/stores/auth';
import { hasPermissionGrant } from '#shared/access-control.js';

const props = defineProps({
  entity: { type: Object, required: true }
});

const emit = defineEmits(['refresh']);

const authStore = useAuthStore();
const { activePermissions } = storeToRefs(authStore);
const visible = ref(false);
const cassettes = ref([]);
const currentTemplate = ref(null);
const entity = computed(() => currentTemplate.value || props.entity);
const canEdit = computed(() => hasPermissionGrant({
  permissions: activePermissions.value,
  feature: 'cassettes',
  level: 'write',
  entity: props.entity,
  entityType: 'cassette'
}));
const templateOptions = computed(() => {
  const source = cassettes.value.length ? cassettes.value : [entity.value].filter(Boolean);
  return source.map(cassette => ({
    label: cassette.identity?.name || cassette.identity?.slug || cassette._id,
    value: cassette._id?.toString()
  }));
});
const persistedTemplateIds = computed(() => templateOptions.value.map(item => item.value).filter(Boolean));

async function openDesigner() {
  visible.value = true;
  if (!cassettes.value.length) {
    cassettes.value = await $fetch('/api/cassettes').catch(() => [props.entity]);
  }
}

async function loadTemplate(cassetteId) {
  const id = cassetteId?.toString?.() || cassetteId;
  if (!id) return;
  currentTemplate.value = cassettes.value.find(cassette => cassette._id?.toString() === id)
    || await $fetch(`/api/cassettes/${encodeURIComponent(id)}`).catch(() => null);
}

function handleSaved(payload = {}) {
  currentTemplate.value = payload.savedEntity || currentTemplate.value;
  emit('refresh');
}
</script>
