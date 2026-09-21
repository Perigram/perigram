<template>
  <Button
    v-if="visible"
    :label="menuItem ? t('common.delete') : undefined"
    icon="pi pi-trash"
    text
    :rounded="!menuItem"
    severity="danger"
    size="small"
    :class="menuItem ? 'w-full justify-start' : null"
    :aria-label="t('common.delete')"
    :loading="loading"
    @click.stop="removeEntity"
  />
</template>

<script setup>
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { canDeleteGeneratedEntity } from '~/components/generated/delete-visibility.js';

const props = defineProps({
  entity: { type: Object, required: true },
  typeId: { type: String, required: true },
  menuItem: { type: Boolean, default: false }
});

const emit = defineEmits(['deleted']);

const authStore = useAuthStore();
const instances = useInstancesStore();
const toast = useToast();
const confirm = useConfirm();
const { t } = useI18n();
const loading = ref(false);

const normalizedType = computed(() => instances.canonicalTypeKey(props.typeId));
const visible = computed(() => canDeleteGeneratedEntity({
  authStore,
  entity: props.entity,
  typeId: props.typeId
}));
const entityId = computed(() => props.entity?._id || props.entity?.identity?.uid || '');

function removeEntity() {
  if (!visible.value || loading.value) return;
  confirm.require({
    message: t('messages.confirmDelete'),
    header: t('common.confirmation'),
    icon: 'pi pi-exclamation-triangle',
    accept: performDelete
  });
}

async function performDelete() {
  loading.value = true;
  try {
    await instances.removeInstance(normalizedType.value, entityId.value, { typeId: props.typeId, entity: props.entity });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('common.delete'), life: 2000 });
    emit('deleted');
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('common.error'),
      detail: error?.data?.message || error?.message || t('common.error'),
      life: 4000
    });
  } finally {
    loading.value = false;
  }
}

</script>
