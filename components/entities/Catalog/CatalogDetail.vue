<template>
    <div class="flex flex-col gap-6">
        <!-- Header -->
        <Panel>
            <template #header>
                <div class="flex items-center gap-2">
                    <i class="pi pi-palette text-primary"></i>
                    <h2 class="text-xl font-bold m-0">{{ catalog.name }}</h2>
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2" v-if="authStore.can('catalogs', 'edit')">
                    <Button icon="pi pi-pencil" severity="secondary" text size="small" @click="$emit('edit', catalog)" v-tooltip.top="$t('catalog.editMetadata')" />
                    <Button :label="$t('catalog.addColor')" icon="pi pi-plus" size="small" @click="$emit('add-sheet-type', catalog)" />
                </div>
            </template>
            <div class="flex flex-col gap-3">
                <p class="text-surface-600 dark:text-surface-400 m-0 opacity-80">{{ catalog.description }}</p>
                
                <div class="flex flex-wrap items-center gap-6 border-t border-surface-200 dark:border-surface-700 pt-3 mt-1">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-black uppercase opacity-40">{{ $t('catalog.coreMaterial') }}:</span>
                        <Tag :value="catalog.material" severity="secondary" class="text-[10px]" />
                    </div>
                    
                    <div class="flex items-center gap-2 border-l border-surface-200 dark:border-surface-700 pl-4">
                        <span class="text-[10px] font-black uppercase opacity-40">{{ $t('catalog.foilOptions') }}:</span>
                        <div class="flex gap-1">
                            <Tag v-for="t in catalog.foilThicknessOptions" :key="t" :value="`${t}mm`" severity="info" class="text-[8px]" />
                        </div>
                    </div>

                    <div class="flex items-center gap-2 border-l border-surface-200 dark:border-surface-700 pl-4">
                        <span class="text-[10px] font-black uppercase opacity-40">{{ $t('catalog.sheetOptions') }}:</span>
                        <div class="flex gap-1">
                            <Tag v-for="t in catalog.sheetThicknessOptions" :key="t" :value="`${t}mm`" severity="warn" class="text-[8px]" />
                        </div>
                    </div>

                    <div class="flex items-center gap-2 border-l border-surface-200 dark:border-surface-700 pl-4">
                        <span class="text-[10px] font-black uppercase opacity-40">{{ $t('catalog.widths') }}:</span>
                        <div class="flex gap-1">
                            <Tag v-for="w in catalog.widthOptions" :key="w" :value="`${w}mm`" severity="success" class="text-[8px]" />
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
            
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                <div 
                    v-for="type in colors" 
                    :key="type._id" 
                    class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden flex flex-col group relative hover:border-primary transition-colors"
                >
                    <!-- Visual Cover -->
                    <div 
                        class="aspect-square flex items-center justify-center overflow-hidden border-b border-surface-200 dark:border-surface-700"
                        :style="{ backgroundColor: type.colorFallback || '#ccc' }"
                    >
                        <img v-if="type.colorThumbnail" :src="type.colorThumbnail" class="w-full h-full object-cover" />
                        <div v-else class="flex flex-col items-center gap-1 opacity-20">
                            <i class="pi pi-palette text-2xl"></i>
                            <span class="text-[8px] font-black uppercase">{{ type.color }}</span>
                        </div>
                    </div>
                    
                    <!-- Color Meta -->
                    <div class="p-3 flex flex-col gap-1">
                        <span class="font-bold text-sm truncate" :title="type.color">{{ type.color }}</span>
                        <div class="flex justify-between items-center">
                            <span class="text-[10px] font-mono opacity-60 uppercase tracking-tighter">{{ type.colorCode || $t('catalog.noCode') }}</span>
                            <span class="text-[10px] font-black text-primary" v-if="type.pricePerSqm">${{ type.pricePerSqm }}/m²</span>
                        </div>
                    </div>

                    <!-- Actions overlay -->
                    <div v-if="authStore.can('catalogs', 'edit')" class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded p-0.5 shadow-md">
                        <Button icon="pi pi-pencil" size="small" text severity="secondary" @click="$emit('edit-sheet-type', { catalog, sheetType: type })" />
                        <Button icon="pi pi-trash" size="small" text severity="danger" @click="$emit('remove-sheet-type', { catalog, sheetTypeId: type._id })" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useAuthStore } from '~/stores/auth';

defineProps({
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
</script>