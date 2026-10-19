<template>
  <!-- The one pane-header stripe: the height lives here only. -->
  <div data-pane-header class="flex h-10 shrink-0 items-stretch border-b border-chrome-border">
    <!-- The pane's back control: walks the workspace-owned navigation
         history of in-place tab replacements. Always visible, disabled
         while the pane has no history — navigation stays discoverable
         instead of appearing after the fact. -->
    <div class="flex shrink-0 items-center pl-1">
      <Button
        icon="pi pi-arrow-left"
        text
        rounded
        size="small"
        severity="secondary"
        :disabled="!back"
        :aria-label="$t('common.back')"
        :title="$t('common.back')"
        data-testid="pane-back"
        @click="$emit('back')"
      />
    </div>
    <GeneratedWorkspaceTabs
      :tabs="tabs"
      :active-key="activeKey"
      @select="$emit('select-tab', $event)"
      @close-tab="$emit('close-tab', $event)"
      @add="$emit('add')"
    />
    <div class="flex shrink-0 items-stretch pr-0.5">
      <GeneratedWorkspacePaneMenu
        :splittable="splittable"
        :closeable="closeable"
        @split="$emit('split', $event)"
        @close="$emit('close')"
      />
    </div>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import GeneratedWorkspaceTabs from '~/components/generated/GeneratedWorkspaceTabs.vue';
import GeneratedWorkspacePaneMenu from '~/components/generated/GeneratedWorkspacePaneMenu.vue';
import { useI18n } from 'vue-i18n';

defineProps({
  tabs: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true },
  back: { type: Boolean, default: false }
});

const { t } = useI18n();

defineEmits(['select-tab', 'close-tab', 'add', 'split', 'close', 'back']);
</script>
