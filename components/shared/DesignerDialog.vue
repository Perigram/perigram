<template>
  <Dialog
    v-bind="$attrs"
    modal
    :class="['designer-dialog m-0 h-[100dvh] max-h-[100dvh] w-[100dvw] max-w-none rounded-none', $attrs.class]"
  >
    <DesignerSurface>
      <slot />
    </DesignerSurface>

    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </Dialog>
</template>

<script setup>
import Dialog from 'primevue/dialog';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';

defineOptions({ inheritAttrs: false });
</script>

<style scoped>
:deep(.p-dialog-content) {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0;
}
</style>
