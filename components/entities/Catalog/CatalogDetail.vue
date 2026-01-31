<template>
    <div class="flex flex-col gap-8">
        <!-- Header -->
        <Panel>
            <template #header>
                <div class="flex items-center gap-4">
                    <i class="pi pi-palette"></i>
                    <h1 class="m-0">{{ catalogName }}</h1>
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2" v-if="authStore.can('catalogs', 'edit')">
                    <Button icon="pi pi-pencil" severity="secondary" text @click="$emit('edit', catalog)" />
                    <Button label="Add Color" icon="pi pi-plus" @click="$emit('add-sheet-type', catalog)" />
                </div>
            </template>
            <div class="flex flex-col gap-6">
                <p class="m-0">{{ catalogDescription }}</p>
                
                <Divider />

                <div class="flex flex-wrap items-center gap-8">
                    <div class="flex flex-col">
                        <small>Core Material</small>
                        <Tag :value="catalog.material" severity="secondary" />
                    </div>
                    
                    <div class="flex flex-col">
                        <small>Foil Options</small>
                        <div class="flex gap-2">
                            <Tag v-for="t in foilThicknessOptions" :key="t" :value="`${t}mm`" severity="info" />
                        </div>
                    </div>

                    <div class="flex flex-col">
                        <small>Sheet Options</small>
                        <div class="flex gap-2">
                            <Tag v-for="t in sheetThicknessOptions" :key="t" :value="`${t}mm`" severity="warn" />
                        </div>
                    </div>

                    <div class="flex flex-col">
                        <small>Widths</small>
                        <div class="flex gap-2">
                            <Tag v-for="w in widthOptions" :key="w" :value="`${w}mm`" severity="success" />
                        </div>
                    </div>
                </div>
            </div>
        </Panel>

        <!-- Color Grid -->
        <div class="flex flex-col gap-6">
            <div class="flex items-center gap-2">
                <i class="pi pi-images"></i>
                <h2 class="m-0 text-base">Visual Library</h2>
            </div>
            
            <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-6">
                <Card 
                    v-for="color in colors" 
                    :key="color._id" 
                    class="card-interactive overflow-hidden"
                >
                    <template #header>
                        <div 
                            class="aspect-square flex items-center justify-center overflow-hidden"
                            :style="{ backgroundColor: getHexCode(color) }"
                        >
                            <img v-if="getTextureUrl(color)" :src="getTextureUrl(color)" class="w-full h-full object-cover" />
                        </div>
                    </template>
                    <template #title>
                        <span class="truncate">{{ getColorName(color) }}</span>
                    </template>
                    <template #subtitle>
                        <small>{{ getColorCode(color) || '---' }}</small>
                    </template>
                    <template #footer v-if="authStore.can('catalogs', 'edit')">
                        <Divider />
                        <div class="flex justify-end gap-2">
                            <Button icon="pi pi-pencil" text @click="$emit('edit-sheet-type', { catalog, sheetType: color })" />
                            <Button icon="pi pi-trash" text severity="danger" @click="$emit('remove-sheet-type', { catalog, sheetTypeId: color._id })" />
                        </div>
                    </template>
                </Card>
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
    catalog: { type: Object, required: true },
    colors: { type: Array, default: () => [] }
});

defineEmits(['edit', 'add-sheet-type', 'edit-sheet-type', 'remove-sheet-type']);

const authStore = useAuthStore();

const catalogName = computed(() => props.catalog.identity?.name || props.catalog.name);
const catalogDescription = computed(() => props.catalog.identity?.description || props.catalog.description);

const foilThicknessOptions = computed(() => props.catalog.options?.foilThicknesses || props.catalog.foilThicknessOptions || []);
const sheetThicknessOptions = computed(() => props.catalog.options?.sheetThicknesses || props.catalog.sheetThicknessOptions || []);
const widthOptions = computed(() => props.catalog.options?.widths || props.catalog.widthOptions || []);

function getColorName(color) { return color.identity?.name || color.color; }
function getColorCode(color) { return color.identity?.code || color.colorCode; }
function getHexCode(color) { return color.visuals?.hexCode || color.colorFallback || '#ccc'; }
function getTextureUrl(color) { return color.visuals?.textureUrl || color.colorThumbnail; }
</script>