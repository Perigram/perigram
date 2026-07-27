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
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { useEntity } from '~/composables/useEntity.js';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { canDeleteGeneratedEntity, uiEntityType } from '~/components/generated/delete-visibility.js';

const props = defineProps({
  entity: { type: Object, required: true },
  entityType: { type: String, required: true },
  menuItem: { type: Boolean, default: false }
});

const emit = defineEmits(['deleted']);

const authStore = useAuthStore();
const domainUi = useCutkitDomainUi();
const toast = useToast();
const { t } = useI18n();
const loading = ref(false);

const normalizedType = computed(() => uiEntityType(domainUi, props.entityType));
const visible = computed(() => canDeleteGeneratedEntity({
  authStore,
  domainUi,
  entity: props.entity,
  entityType: props.entityType
}));
const entityId = computed(() => props.entity?._id || props.entity?.identity?.uid || '');

async function removeEntity() {
  if (!visible.value || loading.value) return;
  loading.value = true;
  try {
    await useEntity(normalizedType.value, entityId.value).remove(entityId.value);
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
