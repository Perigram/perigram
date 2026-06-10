<script setup>
/**
 * SpecsBlock - v24 Standardized
 * Displays physical dimensions, thickness, and area.
 */
import { computed, toRef } from 'vue';
import { useSpecs } from '~/composables/useBlocks';

const props = defineProps({
  entity: { type: Object, required: true },
  variant: { type: String, default: 'default' } // default, compact
});

const { specs, formattedDimensions, formattedArea } = useSpecs(toRef(props, 'entity'));

const metricRows = computed(() => [
  specs.value.sheetThickness ? { key: 'sheetThickness', label: 'catalog.sheetThickness', value: `${specs.value.sheetThickness} mm` } : null,
  specs.value.foilThickness ? { key: 'foilThickness', label: 'catalog.foilThickness', value: `${specs.value.foilThickness} mm` } : null,
  specs.value.area ? { key: 'area', label: 'common.area', value: formattedArea.value } : null
].filter(Boolean));

const hasSpecs = computed(() => Boolean(formattedDimensions.value || metricRows.value.length));
</script>

<template>
  <div v-if="hasSpecs" class="specs-block min-w-0">
    <!-- Compact Variant -->
    <template v-if="variant === 'compact'">
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-color">
            <span v-if="formattedDimensions" class="font-medium">{{ formattedDimensions }}</span>
            <span v-if="specs.sheetThickness">{{ specs.sheetThickness }} mm</span>
            <span v-if="specs.foilThickness">{{ $t('catalog.foilThickness') }} {{ specs.foilThickness }} mm</span>
            <span v-if="specs.area">{{ formattedArea }}</span>
        </div>
    </template>

    <!-- Default Variant -->
    <template v-else>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div v-if="formattedDimensions" class="min-w-0 rounded-ui border border-content-border bg-content px-3 py-3">
                <small class="text-muted-color">{{ $t('catalog.dimensions') }}</small>
                <div class="mt-1 break-words font-semibold">{{ formattedDimensions }}</div>
            </div>
            <dl v-if="metricRows.length" class="m-0 grid min-w-0 grid-cols-1 gap-2">
                <div
                    v-for="row in metricRows"
                    :key="row.key"
                    class="flex min-w-0 items-center justify-between gap-3 rounded-ui border border-content-border px-3 py-2"
                >
                    <dt class="min-w-0 text-xs text-muted-color">{{ $t(row.label) }}</dt>
                    <dd class="m-0 min-w-0 break-words text-right font-medium">{{ row.value }}</dd>
                </div>
            </dl>
        </div>
    </template>
  </div>
</template>
