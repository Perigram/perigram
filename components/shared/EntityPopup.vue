<template>
  <StandardDialog
    v-model:visible="visible"
    size="full"
    :show-default-footer="false"
  >
    <template #header>
      <div class="flex w-full min-w-0 items-center justify-between gap-2 pr-6">
        <span class="min-w-0 truncate text-label">{{ title }}</span>
        <Button
          icon="pi pi-external-link"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="$t('common.expand')"
          :title="$t('common.expand')"
          @click="expand"
        />
      </div>
    </template>
    <div class="max-h-[70vh] overflow-y-auto">
      <DirectoryDetailSurface
        v-if="visible && isDirectoryType"
        :key="`${request.typeId}:${request.instanceId}`"
        :type-id="request.typeId"
        :instance-id="request.instanceId"
        bounded
      />
      <GeneratedDetailScreen
        v-else-if="visible && detailScreen"
        :screen="detailScreen"
        :navigation="navigation"
        @open-instance="openInstance"
      />
      <div v-else-if="visible" class="p-4">
        <StateBlock :message="$t('common.notAvailable')" />
      </div>
    </div>
  </StandardDialog>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import GeneratedDetailScreen from '~/components/generated/GeneratedDetailScreen.vue';
import DirectoryDetailSurface from '~/components/directory/DirectoryDetailSurface.vue';
import { resolveDetailScreen } from '~/components/generated/detail-screen-actions.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { useEntityPopup } from '~/composables/useEntityPopup';
import { useInstancesStore } from '~/stores/instances';
import { useAuthStore } from '~/stores/auth';
import { titleFor, typeLabelKey, localizedLabel } from '#shared/ui-mapping/index.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useI18n } from 'vue-i18n';

const { request, close } = useEntityPopup();
const instances = useInstancesStore();
const authStore = useAuthStore();
const { typeById } = useFileTypeView();
const { t, te } = useI18n();

const visible = computed({
  get: () => Boolean(request.value),
  set: value => { if (!value) close(); }
});
const isDirectoryType = computed(() => ['user', 'organization'].includes(request.value?.typeId));

const detailScreen = computed(() => {
  const current = request.value;
  if (!current || isDirectoryType.value) return null;
  const base = resolveDetailScreen({
    screens: authStore.screenManifest || [],
    typeId: current.typeId
  });
  if (!base) return null;
  return {
    ...base,
    scope: {
      ...(base.scope || {}),
      instanceId: current.instanceId,
      [`${current.typeId}Id`]: current.instanceId
    }
  };
});

const navigation = computed(() => ({
  icon: 'pi pi-arrow-left',
  label: t('common.back'),
  command: () => close()
}));

// The popup title is the entity's display name — never an id. The title
// resolver runs over the resolved record; until hydration lands (or for
// cross-tenant directory cards) the localized type label stands in.
const title = computed(() => {
  const current = request.value;
  if (!current) return '';
  const typeRecord = typeById(current.typeId);
  const record = instances.records?.[instances.canonicalTypeKey(current.typeId)]?.[String(current.instanceId)]?.dto;
  if (typeRecord && record) {
    const resolved = titleFor(dtoToScreenInstance(record, typeRecord), typeRecord, { unnamedLabel: '' });
    if (resolved) return resolved;
  }
  return typeLabelOf(current.typeId);
});

function typeLabelOf(typeId = '') {
  const record = typeById(typeId);
  if (!record) return typeId;
  return localizedLabel({ te, t }, typeLabelKey(typeId), record.name || '');
}

function expand() {
  const current = request.value;
  if (!current) return;
  close();
  openInstanceInWorkspace({ typeId: current.typeId, instanceId: current.instanceId });
}

function openInstance(instance = {}) {
  if (!instance?.type || !instance?.id) return;
  request.value = { typeId: instance.type, instanceId: String(instance.id) };
}
</script>
