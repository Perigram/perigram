<template>
  <Button
    v-if="replaceable"
    icon="pi pi-file-import"
    size="small"
    severity="secondary"
    :rounded="true"
    :text="true"
    :aria-label="actionLabel"
    :title="actionLabel"
    :loading="uploading"
    @click="fileInput?.click()"
  />
  <input
    ref="fileInput"
    type="file"
    class="hidden"
    :accept="acceptList"
    @change="onFileChosen"
  />
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import { useInstancesStore } from '~/stores/instances';
import { useAuthStore } from '~/stores/auth';
import { useRegistryStore } from '~/stores/registry';
import { hasPermissionGrant } from '#shared/access-control.js';
import { resolveTypeFeature } from '#shared/field-access-policies.js';

// The generic replace affordance (SPEC §24): every revision-scoped
// payload type's detail swaps its bytes in place through the revisioned
// payload channel — the record keeps its identity, pins, and history.
const props = defineProps({
  entity: { type: Object, default: null },
  type: { type: Object, default: null }
});

const emit = defineEmits(['refresh']);

const { t } = useI18n();
const toast = useToast();
const instances = useInstancesStore();
const authStore = useAuthStore();
const registry = useRegistryStore();
const fileInput = ref(null);
const uploading = ref(false);

const instanceId = computed(() => String(props.entity?._id || props.entity?.id || ''));
const actionLabel = computed(() => t('common.replaceFile'));
const acceptList = computed(() => {
  const mime = props.type?.payload?.mime || [];
  return mime.some(entry => entry.includes('*')) ? undefined : mime.join(',');
});

const canWrite = computed(() => hasPermissionGrant({
  permissions: authStore.activePermissions || {},
  feature: resolveTypeFeature(props.type?.id, registry.typeRecord(props.type?.id)),
  level: 'write',
  entity: props.entity,
  typeId: props.type?.id
}));

const replaceable = computed(() => Boolean(
  props.type?.id && props.type?.payload && props.type?.revisions && instanceId.value && canWrite.value
));

async function onFileChosen(event) {
  const file = event.target?.files?.[0];
  event.target.value = '';
  if (!file || !replaceable.value) return;
  uploading.value = true;
  try {
    // Uploads stay online-only (PWA law): the payload transport is a
    // direct fetch, same as the editor persistence channel.
    const form = new FormData();
    form.append('file', file);
    const typeId = instances.canonicalTypeKey(props.type.id);
    const updated = await $fetch(`/api/instances/${encodeURIComponent(props.type.id)}/${encodeURIComponent(instanceId.value)}/payload`, {
      method: 'PUT',
      body: form
    });
    instances.notifyMutated(typeId, instanceId.value, { snapshot: updated, reason: 'payload-replaced' });
    toast.add({ severity: 'success', summary: t('common.success'), detail: updated?.payload?.name || file.name, life: 2500 });
    emit('refresh');
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || file.name, life: 5000 });
  } finally {
    uploading.value = false;
  }
}
</script>
