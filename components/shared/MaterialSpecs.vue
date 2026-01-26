<template>
    <div class="flex flex-col gap-3 p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl">
        <h4 class="text-[10px] font-black uppercase opacity-40 m-0 flex items-center gap-2">
            <i class="pi pi-cog"></i>
            {{ $t('catalog.materialSpecs') }}
        </h4>
        
        <div class="grid grid-cols-2 gap-y-3 gap-x-6">
            <!-- Sheet Thickness -->
            <div class="flex flex-col">
                <span class="text-[10px] opacity-60">{{ $t('catalog.sheetThickness') }}</span>
                <div class="flex items-baseline gap-1">
                    <span class="text-sm font-black">{{ resolvedSpecs.sheetThickness || resolvedSpecs.thickness }}</span>
                    <span class="text-[10px] font-bold opacity-40">mm</span>
                </div>
            </div>

            <!-- Foil Thickness -->
            <div class="flex flex-col">
                <span class="text-[10px] opacity-60">{{ $t('catalog.foilThickness') }}</span>
                <div class="flex items-baseline gap-1">
                    <span class="text-sm font-black">{{ resolvedSpecs.foilThickness || 0 }}</span>
                    <span class="text-[10px] font-bold opacity-40">mm</span>
                </div>
            </div>

            <!-- Dimensions -->
            <div class="flex flex-col col-span-2 pt-2 border-t border-dashed border-surface-200 dark:border-surface-700">
                <span class="text-[10px] opacity-60">{{ $t('catalog.dimensions') }}</span>
                <div class="flex items-center gap-2">
                    <span class="text-sm font-black">{{ formattedDimensions }}</span>
                </div>
            </div>

            <!-- Area -->
            <div class="flex flex-col col-span-2 pt-2">
                <span class="text-[10px] opacity-60">{{ $t('common.area') }}</span>
                <span class="text-sm font-black">{{ formattedArea }}</span>
            </div>

            <!-- Material Core -->
            <div v-if="resolvedSpecs.material" class="flex flex-col col-span-2">
                <span class="text-[10px] opacity-60">{{ $t('catalog.baseMaterial') }}</span>
                <span class="text-xs font-bold truncate">{{ resolvedSpecs.material }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useSpecs } from '~/composables/useBlocks';

const props = defineProps({
    specs: {
        type: Object,
        required: true
    }
});

// Robust resolution: handle both a direct specs block or an entity containing a specs block
const resolvedSpecs = computed(() => {
    if (props.specs.specs) return props.specs.specs;
    return props.specs;
});

const { formattedDimensions, formattedArea } = useSpecs({ specs: resolvedSpecs.value });
</script>
