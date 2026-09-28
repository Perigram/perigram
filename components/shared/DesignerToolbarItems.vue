<template>
  <template v-for="(item, index) in items" :key="index">
    <Divider v-if="item.separator" layout="vertical" />
    <Button
      v-else
      v-tooltip.bottom="item.label"
      v-bind="toolbarButtonProps(item)"
      @click="event => item.onClick?.(typeof item.pressed === 'boolean' ? !item.pressed : event)"
    />
  </template>
</template>

<script setup>
// The one toolbar item list renderer (the designer-chrome contract):
// icon-only buttons with the label as tooltip and accessible name — one
// control family, one geometry. A boolean `pressed` item is the same
// button outlined (never a ToggleButton: its filled surface and shape
// read as a different control among quiet text buttons).
import Divider from 'primevue/divider';
import Button from 'primevue/button';

defineProps({
  items: { type: Array, default: () => [] }
});

function toolbarButtonProps(item) {
  const pressed = item.pressed === true;
  return {
    icon: pressed && item.onIcon ? item.onIcon : item.icon,
    severity: 'secondary',
    variant: pressed ? 'outlined' : 'text',
    size: 'small',
    disabled: item.disabled,
    loading: item.loading,
    'aria-label': item.label,
    ...(typeof item.pressed === 'boolean' ? { 'aria-pressed': pressed } : {}),
    ...(item.hasPopup ? { 'aria-haspopup': 'dialog' } : {})
  };
}
</script>
