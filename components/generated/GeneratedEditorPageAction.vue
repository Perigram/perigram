<template>
  <Button
    v-if="surface"
    :label="menuItem ? actionLabel : undefined"
    icon="pi pi-file-edit"
    text
    :rounded="!menuItem"
    :class="menuItem ? 'w-full justify-start' : null"
    :aria-label="actionLabel"
    @click="openEditor"
  />
  <DesignerDialog
    v-if="surface && !openInWorkspace"
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

// The generic editor action: opens the type's registered editor workspace
// page. Inside the home workspace it emits the page-open request up the
// pane chain; outside it (mobile detail routes, standalone screens) the
// same page presentation hosts in a dialog.
const props = defineProps({
  entity: { type: Object, default: null },
  typeId: { type: String, default: '' },
  menuItem: { type: Boolean, default: false },
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
  dialogVisible.value = true;
}
</script>
