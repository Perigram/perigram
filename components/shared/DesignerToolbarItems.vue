<template>
  <template v-for="(item, index) in items" :key="index">
    <Divider v-if="item.separator" layout="vertical" />
    <ToggleButton
      v-else-if="typeof item.pressed === 'boolean'"
      v-tooltip.bottom="item.label"
      :model-value="item.pressed"
      :on-icon="item.icon"
      :off-icon="item.icon"
      on-label=""
      off-label=""
      class="!h-[2.1875rem] !w-8 !rounded-full !p-0"
      :disabled="item.disabled"
      :aria-label="item.label"
      @update:model-value="value => item.onClick?.(value, $event)"
    />
    <OverlayBadge v-else-if="item.attention">
      <Button v-bind="toolbarButtonProps(item)" v-tooltip.bottom="item.label" @click="item.onClick?.($event)" />
    </OverlayBadge>
    <Button v-else v-bind="toolbarButtonProps(item)" v-tooltip.bottom="item.label" @click="item.onClick?.($event)" />
  </template>
</template>

<script setup>
// The one toolbar item list renderer (the designer-chrome contract):
// icon-only geometry for every item — plain buttons and pressed
// ToggleButtons alike — with the label as tooltip and accessible name.
import Divider from 'primevue/divider';
import ToggleButton from 'primevue/togglebutton';
import Button from 'primevue/button';
import OverlayBadge from 'primevue/overlaybadge';

defineProps({
  items: { type: Array, default: () => [] }
});

function toolbarButtonProps(item) {
  return {
    icon: item.icon,
    severity: 'secondary',
    variant: 'text',
    size: 'small',
    disabled: item.disabled,
    loading: item.loading,
    'aria-label': item.label,
    ...(item.hasPopup ? { 'aria-haspopup': 'dialog' } : {})
  };
}
</script>
