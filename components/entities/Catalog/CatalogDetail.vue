<template>
    <div class="flex flex-col gap-6">
        <!-- Header -->
        <Panel>
            <template #header>
                <div class="flex items-center gap-2">
                    <i class="pi pi-palette text-primary"></i>
                    <h2 class="text-xl font-bold m-0">{{ catalogName }}</h2>
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2" v-if="authStore.can('catalogs', 'edit')">
                    <Button icon="pi pi-pencil" severity="secondary" text size="small" @click="$emit('edit', catalog)" v-tooltip.top="$t('catalog.editMetadata')" />
                    <Button :label="$t('catalog.addColor')" icon="pi pi-plus" size="small" @click="$emit('add-sheet-type', catalog)" />
                </div>
            </template>
            <div class="flex flex-col gap-3">
                <p class="text-surface-600 dark:text-surface-400 m-0 opacity-80">{{ catalogDescription }}</p>
                
                <div class="flex flex-wrap items-center gap-6 border-t border-surface-200 dark:border-surface-700 pt-3 mt-1">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-black uppercase opacity-40">{{ $t('catalog.coreMaterial') }}:</span>
                        <Tag :value="catalog.material" severity="secondary" class="text-[10px]" />
                    </div>
                    
                    <div class="flex items-center gap-2 border-l border-surface-200 dark:border-surface-700 pl-4">
                        <span class="text-[10px] font-black uppercase opacity-40">{{ $t('catalog.foilOptions') }}:</span>
                        <div class="flex gap-1">
                            <Tag v-for="t in foilThicknessOptions" :key="t" :value="`${t}mm`" severity="info" class="text-[8px]" />
                        </div>
                    </div>

                    <div class="flex items-center gap-2 border-l border-surface-200 dark:border-surface-700 pl-4">
                        <span class="text-[10px] font-black uppercase opacity-40">{{ $t('catalog.sheetOptions') }}:</span>
                        <div class="flex gap-1">
                            <Tag v-for="t in sheetThicknessOptions" :key="t" :value="`${t}mm`" severity="warn" class="text-[8px]" />
                        </div>
                    </div>

                    <div class="flex items-center gap-2 border-l border-surface-200 dark:border-surface-700 pl-4">
                        <span class="text-[10px] font-black uppercase opacity-40">{{ $t('catalog.widths') }}:</span>
                        <div class="flex gap-1">
                            <Tag v-for="w in widthOptions" :key="w" :value="`${w}mm`" severity="success" class="text-[8px]" />
                        </div>
                    </div>
                </div>
            </div>
        </Panel>

        <!-- Color Grid -->
        <div class="flex flex-col gap-4">
            <h3 class="text-sm font-black uppercase opacity-40 flex items-center gap-2">
                <i class="pi pi-images"></i>
                {{ $t('catalog.visualLibrary') }}
            </h3>
            
            <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
                <div 
                    v-for="color in colors" 
                    :key="color._id" 
                    class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden flex flex-col group relative hover:border-primary transition-colors"
                >
                    <!-- Visual Cover -->
                    <div 
                        class="aspect-video flex items-center justify-center overflow-hidden border-b border-surface-200 dark:border-surface-700"
                        :style="{ backgroundColor: getHexCode(color) }"
                    >
                        <img v-if="getTextureUrl(color)" :src="getTextureUrl(color)" class="w-full h-full object-cover" />
                        <div v-else class="flex flex-col items-center gap-1 opacity-20">
                            <span class="text-[7px] font-black uppercase tracking-tighter">{{ getColorName(color) }}</span>
                        </div>
                    </div>
                    
                    <!-- Color Meta -->
                    <div class="p-2 flex flex-col gap-0.5">
                        <span class="font-bold text-[10px] truncate leading-tight" :title="getColorName(color)">{{ getColorName(color) }}</span>
                        <div class="flex justify-between items-center">
                            <span class="text-[8px] font-mono opacity-50 uppercase tracking-tighter">{{ getColorCode(color) || '---' }}</span>
                        </div>
                    </div>

                    <!-- Actions overlay -->
                    <div v-if="authStore.can('catalogs', 'edit')" class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded p-0.5 shadow-md">
                        <Button icon="pi pi-pencil" size="small" text severity="secondary" class="h-6 w-6" @click="$emit('edit-sheet-type', { catalog, sheetType: color })" />
                        <Button icon="pi pi-trash" size="small" text severity="danger" class="h-6 w-6" @click="$emit('remove-sheet-type', { catalog, sheetTypeId: color._id })" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
    catalog: {
        type: Object,
        required: true
    },
    colors: {
        type: Array,
        default: () => []
    }
});

defineEmits(['edit', 'add-sheet-type', 'edit-sheet-type', 'remove-sheet-type']);

const authStore = useAuthStore();

// V24 Block Accessors
const catalogName = computed(() => props.catalog.identity?.name || props.catalog.name);
const catalogDescription = computed(() => props.catalog.identity?.description || props.catalog.description);

const foilThicknessOptions = computed(() => props.catalog.options?.foilThicknesses || props.catalog.foilThicknessOptions || []);
const sheetThicknessOptions = computed(() => props.catalog.options?.sheetThicknesses || props.catalog.sheetThicknessOptions || []);
const widthOptions = computed(() => props.catalog.options?.widths || props.catalog.widthOptions || []);

function getColorName(color) {
    return color.identity?.name || color.color;
}

function getColorCode(color) {
    return color.identity?.code || color.colorCode;
}

function getHexCode(color) {
    return color.visuals?.hexCode || color.colorFallback || '#ccc';
}

function getTextureUrl(color) {
    return color.visuals?.textureUrl || color.colorThumbnail;
}
</script>
