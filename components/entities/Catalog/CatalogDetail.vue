<template>
    <EntityPage :entity="catalog" entity-type="catalog" :show-status="false">
        <template #actions>
            <div class="flex flex-wrap gap-2" v-if="authStore.can('catalogs', 'edit')">
                <Button icon="pi pi-pencil" severity="secondary" text :aria-label="$t('common.edit')" @click="$emit('edit', catalog)" />
                <Button :label="$t('catalog.addColor')" icon="pi pi-plus" @click="$emit('add-sheet-type', catalog)" />
            </div>
        </template>

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
            <div class="lg:col-span-3">
                <Panel>
                    <div class="flex flex-col gap-4">
                        <p v-if="catalog.data?.description" class="m-0">{{ catalog.data.description }}</p>
                        <DataBlock entity-type="catalog" :entity="catalog" :fields="CATALOG_FIELDS" />
                        <div v-if="catalog.lineage?.manufacturerId" class="flex items-center justify-between gap-4">
                            <small class="text-muted-color">{{ $t('requisition.manufacturer') }}</small>
                            <EntityInlineRef type="organization" :id="catalog.lineage.manufacturerId" />
                        </div>
                    </div>
                </Panel>
            </div>

            <Panel :header="$t('catalog.sheetOptions')">
                <div class="flex flex-col gap-4">
                    <div v-if="catalog.data?.material" class="flex flex-col gap-1">
                        <small class="text-muted-color">{{ $t('catalog.coreMaterial') }}</small>
                        <Tag :value="catalog.data.material" severity="secondary" />
                    </div>
                    <div v-if="foilThicknessOptions.length" class="flex flex-col gap-1">
                        <small class="text-muted-color">{{ $t('catalog.foilOptions') }}</small>
                        <div class="flex flex-wrap gap-2">
                            <Tag v-for="value in foilThicknessOptions" :key="value" :value="`${value} mm`" severity="info" />
                        </div>
                    </div>
                    <div v-if="sheetThicknessOptions.length" class="flex flex-col gap-1">
                        <small class="text-muted-color">{{ $t('catalog.sheetThicknessOptions') }}</small>
                        <div class="flex flex-wrap gap-2">
                            <Tag v-for="value in sheetThicknessOptions" :key="value" :value="`${value} mm`" severity="warn" />
                        </div>
                    </div>
                    <div v-if="widthOptions.length" class="flex flex-col gap-1">
                        <small class="text-muted-color">{{ $t('catalog.widths') }}</small>
                        <div class="flex flex-wrap gap-2">
                            <Tag v-for="value in widthOptions" :key="value" :value="`${value} mm`" severity="success" />
                        </div>
                    </div>
                </div>
            </Panel>
        </div>

        <div class="flex flex-col gap-6">
            <div class="flex items-center gap-2">
                <i class="pi pi-images"></i>
                <h2 class="m-0 text-base">{{ $t('catalog.visualLibrary') }}</h2>
            </div>
            
            <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-6">
                <div v-for="color in colors" :key="color._id" class="flex flex-col gap-1">
                    <ColorCard :color="color" variant="card" />
                    <div v-if="authStore.can('catalogs', 'edit')" class="flex justify-end gap-1">
                        <Button icon="pi pi-pencil" text size="small" :aria-label="$t('common.edit')" @click="$emit('edit-sheet-type', { catalog, sheetType: color })" />
                        <Button icon="pi pi-trash" text size="small" severity="danger" :aria-label="$t('common.delete')" @click="$emit('remove-sheet-type', { catalog, sheetTypeId: color._id })" />
                    </div>
                </div>
            </div>
        </div>
    </EntityPage>
</template>

<script setup>
import { computed } from 'vue';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import EntityPage from '~/components/shared/EntityPage.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import ColorCard from '~/components/entities/Color/ColorCard.vue';
import { useAuthStore } from '~/stores/auth';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const props = defineProps({
    catalog: { type: Object, required: true },
    colors: { type: Array, default: () => [] }
});

defineEmits(['edit', 'add-sheet-type', 'edit-sheet-type', 'remove-sheet-type']);

const authStore = useAuthStore();

const foilThicknessOptions = computed(() => props.catalog.data?.options?.foilThicknesses || []);
const sheetThicknessOptions = computed(() => props.catalog.data?.options?.sheetThicknesses || []);
const widthOptions = computed(() => props.catalog.data?.options?.widths || []);

const CATALOG_FIELDS = resolveEntityDisplayFields({ entityType: 'catalog', surface: 'detail' })
    .filter(field => field.display !== 'entityRef');
</script>
