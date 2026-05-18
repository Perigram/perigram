<template>
    <div class="flex flex-col gap-8">
        <!-- Header -->
        <Panel>
            <template #header>
                <div class="flex items-center gap-4">
                    <i class="pi pi-palette"></i>
                    <IdentityBlock :entity="catalog" variant="compact" />
                </div>
            </template>
            <template #icons>
                <div class="flex gap-2" v-if="authStore.can('catalogs', 'edit')">
                    <Button icon="pi pi-pencil" severity="secondary" text @click="$emit('edit', catalog)" />
                    <Button :label="$t('catalog.addColor')" icon="pi pi-plus" @click="$emit('add-sheet-type', catalog)" />
                </div>
            </template>
            <div class="flex flex-col gap-6">
                <p class="m-0">{{ catalog.data?.description }}</p>
                
                <Divider />

                <div class="flex flex-wrap items-center gap-8">
                    <div class="flex flex-col">
                        <small>{{ $t('catalog.coreMaterial') }}</small>
                        <Tag :value="catalog.data?.material" severity="secondary" />
                    </div>
                    
                    <div class="flex flex-col">
                        <small>{{ $t('catalog.foilOptions') }}</small>
                        <div class="flex gap-2">
                            <Tag v-for="t in foilThicknessOptions" :key="t" :value="`${t}mm`" severity="info" />
                        </div>
                    </div>

                    <div class="flex flex-col">
                        <small>{{ $t('catalog.sheetOptions') }}</small>
                        <div class="flex gap-2">
                            <Tag v-for="t in sheetThicknessOptions" :key="t" :value="`${t}mm`" severity="warn" />
                        </div>
                    </div>

                    <div class="flex flex-col">
                        <small>{{ $t('catalog.widths') }}</small>
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
                <h2 class="m-0 text-base">{{ $t('catalog.visualLibrary') }}</h2>
            </div>
            
            <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-6">
                <div v-for="color in colors" :key="color._id" class="flex flex-col gap-1">
                    <ColorCard :color="color" variant="card" />
                    <div v-if="authStore.can('catalogs', 'edit')" class="flex justify-end gap-1">
                        <Button icon="pi pi-pencil" text size="small" @click="$emit('edit-sheet-type', { catalog, sheetType: color })" />
                        <Button icon="pi pi-trash" text size="small" severity="danger" @click="$emit('remove-sheet-type', { catalog, sheetTypeId: color._id })" />
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
import Divider from 'primevue/divider';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import ColorCard from '~/components/entities/Color/ColorCard.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
    catalog: { type: Object, required: true },
    colors: { type: Array, default: () => [] }
});

defineEmits(['edit', 'add-sheet-type', 'edit-sheet-type', 'remove-sheet-type']);

const authStore = useAuthStore();

const foilThicknessOptions = computed(() => props.catalog.data?.options?.foilThicknesses || []);
const sheetThicknessOptions = computed(() => props.catalog.data?.options?.sheetThicknesses || []);
const widthOptions = computed(() => props.catalog.data?.options?.widths || []);
</script>
