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
</script>

<template>
  <div v-if="specs" class="specs-block flex flex-col gap-2">
    <!-- Compact Variant -->
    <template v-if="variant === 'compact'">
        <div class="flex items-center gap-2 text-xs opacity-70">
            <span>{{ formattedDimensions }}</span>
            <span v-if="specs.sheetThickness">({{ specs.sheetThickness }}mm)</span>
        </div>
    </template>

    <!-- Default Variant -->
    <template v-else>
        <div class="grid grid-cols-2 gap-x-4 gap-y-2">
            <div v-if="specs.sheetThickness" class="flex flex-col">
                <small class="text-muted-color">{{ $t('catalog.sheetThickness') }}</small>
                <span class="font-medium">{{ specs.sheetThickness }} mm</span>
            </div>
            <div v-if="specs.foilThickness" class="flex flex-col">
                <small class="text-muted-color">{{ $t('catalog.foilThickness') }}</small>
                <span class="font-medium">{{ specs.foilThickness }} mm</span>
            </div>
            <div class="flex flex-col">
                <small class="text-muted-color">{{ $t('catalog.dimensions') }}</small>
                <span class="font-medium">{{ formattedDimensions }}</span>
            </div>
            <div class="flex flex-col">
                <small class="text-muted-color">{{ $t('common.area') }}</small>
                <span class="font-medium">{{ formattedArea }}</span>
            </div>
        </div>
    </template>
  </div>
</template>
