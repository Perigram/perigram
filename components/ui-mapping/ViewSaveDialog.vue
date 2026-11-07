<template>
  <StandardDialog
    :visible="visible"
    size="sm"
    :title="$t('uiMapping.saveView')"
    :subtitle="typeLabel || undefined"
    show-default-footer
    :cancel-label="$t('uiMapping.dialogCancel')"
    :save-label="$t('common.save')"
    :loading="loading"
    :save-disabled="!nameValue.trim()"
    @update:visible="shown => { if (!shown) emit('close'); }"
    @cancel="emit('close')"
    @save="emit('save', nameValue.trim())"
  >
    <InputText
      v-model="nameValue"
      size="small"
      class="w-full"
      :placeholder="$t('uiMapping.viewName')"
      :aria-label="$t('uiMapping.viewName')"
      @keydown.enter.prevent.stop="nameValue.trim() && emit('save', nameValue.trim())"
    />
  </StandardDialog>
</template>

<script setup>
// The save-the-view dialog (SPEC §26): names the region's current view
// state. The subtitle carries the type label — type ids never render.
import { ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import StandardDialog from '../shared/StandardDialog.vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  typeLabel: { type: String, default: '' },
  loading: { type: Boolean, default: false }
});

const emit = defineEmits(['save', 'close']);
const nameValue = ref('');
watch(() => props.visible, visible => {
  if (visible) nameValue.value = '';
});
</script>
