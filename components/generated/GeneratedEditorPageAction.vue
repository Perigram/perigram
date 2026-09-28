<template>
  <Button
    v-if="surface"
    :label="iconOnly ? undefined : actionLabel"
    icon="pi pi-file-edit"
    size="small"
    severity="secondary"
    :outlined="!iconOnly && !menuItem"
    :rounded="iconOnly"
    :text="iconOnly || menuItem"
    :class="menuItem ? 'w-full justify-start whitespace-normal text-left' : null"
    :aria-label="actionLabel"
    :title="iconOnly ? actionLabel : undefined"
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

// The generic editor action: opens the type's registered editor workspace
// page. In-workspace hosts forward the open-page event up their pane
// chain; everywhere else the workspace-page-open seam runs (a mounted home
// workspace opens the pane tab immediately, otherwise home is navigated
// and the pending page consumed). Mobile has no panes and no route, so it
// keeps the dialog hosting the same page presentation.
const props = defineProps({
  entity: { type: Object, default: null },
  typeId: { type: String, default: '' },
  menuItem: { type: Boolean, default: false },
  iconOnly: { type: Boolean, default: false },
  openInWorkspace: { type: Boolean, default: false }
});

const emit = defineEmits(['open-page', 'refresh']);

const { t, te } = useI18n();
const dialogVisible = ref(false);

const surface = computed(() => (props.typeId ? resolveFileSurface(null, props.typeId) : null));
const actionLabel = computed(() => (
  surface.value?.workspacePage?.labelKey && te(surface.value.workspacePage.labelKey)
    ? t(surface.value.workspacePage.labelKey)
    : t('common.edit')
));
const pageRecord = computed(() => ({
  entity: props.entity,
  instanceId: String(props.entity?._id || props.entity?.identity?.uid || ''),
  typeId: props.typeId
}));
const dialogProps = computed(() => surface.value?.workspacePage?.props?.(pageRecord.value, props.typeId) || {});

function openEditor() {
  if (!surface.value) return;
  if (props.openInWorkspace) {
    emit('open-page', {
      pageId: surface.value.surface,
      entity: props.entity,
      typeId: props.typeId
    });
    return;
  }
  const mobile = typeof window !== 'undefined'
    && window.matchMedia?.('(max-width: 767px)')?.matches;
  if (!mobile && openWorkspacePageFromChrome({ pageId: surface.value.surface })) return;
  dialogVisible.value = true;
}
</script>
