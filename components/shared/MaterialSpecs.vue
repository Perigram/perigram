<template>
    <div class="flex flex-col gap-4">
        <div class="flex items-center gap-2">
            <i class="pi pi-cog"></i>
            <h4 class="m-0 text-base">{{ $t('catalog.materialSpecs') }}</h4>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
            <!-- Sheet Thickness -->
            <div class="flex flex-col">
                <small>{{ $t('catalog.sheetThickness') }}</small>
                <span>{{ resolvedSpecs.sheetThickness || resolvedSpecs.thickness }} mm</span>
            </div>

            <!-- Foil Thickness -->
            <div class="flex flex-col">
                <small>{{ $t('catalog.foilThickness') }}</small>
                <span>{{ resolvedSpecs.foilThickness || 0 }} mm</span>
            </div>

            <div class="col-span-2">
                <Divider />
            </div>

            <!-- Dimensions -->
            <div class="flex flex-col">
                <small>{{ $t('catalog.dimensions') }}</small>
                <span>{{ formattedDimensions }}</span>
            </div>

            <!-- Area -->
            <div class="flex flex-col">
                <small>{{ $t('common.area') }}</small>
                <span>{{ formattedArea }}</span>
            </div>

            <!-- Material Core -->
            <div v-if="resolvedSpecs.material" class="flex flex-col col-span-2">
                <small>{{ $t('catalog.baseMaterial') }}</small>
                <span class="truncate">{{ resolvedSpecs.material }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import Divider from 'primevue/divider';
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
