<template>
  <span class="inline-flex">
    <Button
      :icon="order < 0 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down'"
      text
      rounded
      size="small"
      :severity="modelValue ? undefined : 'secondary'"
      :aria-label="$t('uiMapping.sortLabel')"
      @click="toggle"
    />

    <Popover ref="popover">
      <div class="flex min-w-44 flex-col gap-0.5">
        <Button
          v-for="option in options"
          :key="option.value"
          :label="option.label"
          text
          size="small"
          class="justify-start"
          :severity="option.value === modelValue ? undefined : 'secondary'"
          @click="select(option.value)"
        />
        <Button
          v-if="modelValue"
          :icon="order < 0 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down'"
          :label="$t('uiMapping.sortOrderLabel')"
          text
          size="small"
          class="justify-start"
          @click="flip"
        />
      </div>
    </Popover>
  </span>
</template>

<script setup>
import { ref } from 'vue';

// The collection sort control: a self-contained popover over the shared
// list-controls `sortKeys` contract. The list of keys renders INLINE
// (buttons, not a select overlay) — a nested overlay sits outside the
// popover's DOM subtree, where the popover's outside-click handling
// closes the control the moment a key is picked; the same trap the
// filter builder documents. Picking a key and flipping the order emit
// upward; persistence stays with the host (utils/ui-sort-preference).
const props = defineProps({
  options: { type: Array, default: () => [] },
  modelValue: { type: String, default: null },
  order: { type: Number, default: 1 }
});
const emit = defineEmits(['update:modelValue', 'update:order']);

const popover = ref();

function toggle(event) {
  popover.value?.toggle(event);
}
function select(value) {
  emit('update:modelValue', value);
  popover.value?.hide();
}
function flip() {
  emit('update:order', props.order < 0 ? 1 : -1);
}
</script>
