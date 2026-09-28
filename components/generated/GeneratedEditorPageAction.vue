<template>
  <Button
    v-if="surface"
    :label="menuItem ? actionLabel : undefined"
    icon="pi pi-file-edit"
    size="small"
    severity="secondary"
    :rounded="!menuItem"
    :text="true"
    :class="menuItem ? 'w-full justify-start whitespace-normal text-left' : null"
    :aria-label="actionLabel"
    :title="menuItem ? undefined : actionLabel"
    @click="openEditor"
  />
  <DesignerDialog
    v-if="surface && dialogVisible"
    v-model:visible="dialogVisible"
    :header="actionLabel"
    :close-on-escape="false"
  >
    <component
      :is="surface.workspacePage.component"
      v-bind="dialogProps"
      @refresh="$emit('refresh')"
    />
  </DesignerDialog>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import DesignerDialog from '~/components/shared/DesignerDialog.vue';
import { resolveFileSurface } from '~/components/generated/file-surfaces.js';
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';
import { useInstancesStore } from '~/stores/instances';

// The generic editor action: opens the type's registered editor workspace
// page. Hosts may hand over a ui-mapping instance record (flat `id`) — the
// wire DTO is fetched for those before opening, so every path (pane chain,
// workspace-page seam, mobile dialog) binds the same wire entity. In-workspace
// hosts forward the open-page event up their pane chain; everywhere else the
// workspace-page-open seam runs (a mounted home workspace opens the pane tab
// immediately, otherwise home is navigated and the pending page consumed).
// Mobile has no panes and no route, so it keeps the dialog.
const props = defineProps({
  entity: { type: Object, default: null },
  typeId: { type: String, default: '' },
  menuItem: { type: Boolean, default: false },
  openInWorkspace: { type: Boolean, default: false }
});

const emit = defineEmits(['open-page', 'refresh']);

const { t, te } = useI18n();
const instances = useInstancesStore();
const dialogVisible = ref(false);

const surface = computed(() => (props.typeId ? resolveFileSurface(null, props.typeId) : null));
const actionLabel = computed(() => (
  surface.value?.workspacePage?.labelKey && te(surface.value.workspacePage.labelKey)
    ? t(surface.value.workspacePage.labelKey)
    : t('common.edit')
));
const dialogEntity = ref(null);
const pageRecord = computed(() => ({
  entity: dialogEntity.value || props.entity,
  instanceId: String(props.entity?._id || props.entity?.identity?.uid || props.entity?.id || ''),
  typeId: props.typeId
}));
const dialogProps = computed(() => surface.value?.workspacePage?.props?.(pageRecord.value, props.typeId) || {});

function isWireEntity(entity = null) {
  return Boolean(entity?._id || entity?.identity?.uid);
}

async function resolveWireEntity() {
  if (isWireEntity(props.entity)) return props.entity;
  const id = String(props.entity?.id || '');
  if (!id) return null;
  try {
    return await instances.fetchInstance(instances.canonicalTypeKey(props.typeId), id);
  } catch {
    return null;
  }
}

async function openEditor() {
  if (!surface.value) return;
  const entity = await resolveWireEntity();
  if (!entity) return;
  if (props.openInWorkspace) {
    emit('open-page', {
      pageId: surface.value.surface,
      entity,
      typeId: props.typeId
    });
    return;
  }
  const mobile = typeof window !== 'undefined'
    && window.matchMedia?.('(max-width: 767px)')?.matches;
  if (!mobile && openWorkspacePageFromChrome({
    pageId: surface.value.surface,
    entity,
    typeId: props.typeId
  })) return;
  dialogEntity.value = entity;
  dialogVisible.value = true;
}
</script>
