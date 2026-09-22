<script setup>
/**
 * SheetCard - v24 Standardized
 * Browsing flow: identify material (color), gauge size (specs), spot state.
 * Provenance (pile/run) lives on the detail page, not in grid cards.
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import InstanceCard from '~/components/shared/InstanceCard.vue';

const props = defineProps({
    sheet: { type: Object, required: true },
    variant: { type: String, default: 'card' }
});

const colorName = computed(() => props.sheet.specs?.color || props.sheet.data?.specs?.color || '');
const materialName = computed(() => props.sheet.specs?.material || props.sheet.data?.specs?.material || '');
const colorHex = computed(() => props.sheet.specs?.colorHex || props.sheet.data?.specs?.colorHex || 'var(--p-content-border-color)');
const colorLabel = computed(() => colorName.value || materialName.value);
</script>

<template>
  <div class="h-full">
    <InstanceCard :entity="sheet" type-id="sheet" :variant="variant">
      <template #before-identity>
        <i class="ck-entity-icon ck-entity-icon-sheet-instance"></i>
      </template>
      <template #compact-content>
        <div class="mt-3 flex flex-col gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <span class="h-4 w-4 shrink-0 rounded-ui" :style="{ backgroundColor: colorHex }" :aria-label="colorName" />
            <span class="truncate text-body">{{ colorLabel || sheet.identity?.name }}</span>
          </div>
          <SpecsBlock type-id="sheet" :entity="sheet" variant="compact" />
        </div>
      </template>
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-4">
          <div class="flex min-w-0 items-center gap-2">
            <span class="h-5 w-5 shrink-0 rounded-ui" :style="{ backgroundColor: colorHex }" :aria-label="colorName" />
            <span class="truncate text-body">{{ colorLabel || sheet.identity?.name }}</span>
          </div>
          <small v-if="materialName && colorName" class="shrink-0 text-muted">{{ materialName }}</small>
        </div>
        <Divider />
        <SpecsBlock type-id="sheet" :entity="sheet" />
      </div>
    </InstanceCard>
  </div>
</template>
