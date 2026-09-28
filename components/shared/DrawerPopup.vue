<template>
  <!-- The drawer-card popup chrome (the shared bottom-right pattern the
       chat popup established): PrimeVue owns stacking, the app tokens
       supply the surface, and the hosted content supplies its own
       headers and controls, so the Dialog header stays hidden. Non-modal
       on purpose: the desktop keeps working under the popup. -->
  <Dialog
    v-model:visible="visibleModel"
    :close-on-escape="false"
    :aria-label="label"
    position="bottomright"
    :style="{ width }"
    :pt="drawerPt"
  >
    <div v-if="visibleModel" class="flex min-h-0 max-h-[calc(100dvh-6rem)] flex-col">
      <slot />
    </div>
  </Dialog>
</template>

<script setup>
import Dialog from 'primevue/dialog';

const props = defineProps({
  visible: { type: Boolean, default: false },
  label: { type: String, default: '' },
  width: { type: String, default: 'min(94vw, 25rem)' }
});

const emit = defineEmits(['update:visible']);

const visibleModel = computed({
  get: () => props.visible,
  set: value => emit('update:visible', value)
});

const drawerPt = {
  root: { class: 'bg-content !rounded-ui' },
  header: { class: 'hidden' },
  content: { class: 'p-0 overflow-hidden' }
};
</script>
