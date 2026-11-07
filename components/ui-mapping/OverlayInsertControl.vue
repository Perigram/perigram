<template>
  <Button
    icon="pi pi-plus"
    text
    rounded
    size="small"
    severity="secondary"
    :aria-label="t('uiMapping.addBlock')"
    :title="t('uiMapping.addBlock')"
    :disabled="!session.loaded"
    @click="event => menu?.toggle(event)"
  />
  <Menu ref="menu" :model="items" popup />
</template>

<script setup>
// The insert picker (SPEC §26): the document-section vocabulary — a text
// block or a saved-view embed — the same pair the slash panel carries,
// keyed to document sections.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Menu from 'primevue/menu';

const props = defineProps({
  session: { type: Object, required: true },
  // The flow index the new block takes.
  at: { type: Number, default: 0 }
});

const { t } = useI18n();
const menu = ref();
const items = computed(() => [
  {
    label: t('uiMapping.textBlock'),
    icon: 'pi pi-align-left',
    command: () => props.session.insertText(props.at)
  },
  {
    label: t('uiMapping.view'),
    icon: 'pi pi-objects-column',
    command: () => props.session.openViewPicker(props.at)
  }
]);
</script>
