<template>
    <EntityPage :entity="sheet" entity-type="sheet">
        <template #actions>
            <Button icon="pi pi-qrcode" text :aria-label="$t('common.printTag')" />
        </template>

        <Panel>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <!-- Visual Swatch -->
                <Panel :header="$t('sheets.materialColor')">
                    <div class="flex items-center gap-4">
                        <div 
                            class="w-12 h-12 border rounded"
                            :style="{ backgroundColor: colorHex }"
                        ></div>
                        <div class="flex flex-col">
                            <span class="text-xl">{{ colorName }}</span>
                            <small>{{ materialName }}</small>
                        </div>
                    </div>
                </Panel>

                <!-- Physical Specs -->
                <div class="lg:col-span-3">
                    <SpecsBlock entity-type="sheet" :entity="sheet" />
                </div>
            </div>
        </Panel>

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
            <div class="lg:col-span-3">
                 <Fieldset :legend="$t('sheets.physicalRepresentation')">
                    <div class="aspect-[16/9] border rounded flex items-center justify-center relative overflow-hidden">
                        <div 
                            class="border border-dashed rounded flex items-center justify-center flex-col gap-4"
                            :style="geometryStyle"
                        >
                            <small>{{ $t('sheets.surface') }}</small>
                            <span class="text-2xl">{{ sheetWidth }}x{{ sheetLength }}</span>
                        </div>
                    </div>
                 </Fieldset>
            </div>

            <div class="flex flex-col gap-8">
                <Panel
                  v-if="warehouseId || pileId"
                  :header="$t('common.source')"
                >
                    <div class="flex flex-col gap-3">
                        <div v-if="warehouseId" class="flex items-center justify-between gap-4">
                            <small class="text-muted-color">{{ $t('entities.warehouse') }}</small>
                            <EntityInlineRef type="warehouse" :id="warehouseId" />
                        </div>
                        <div v-if="pileId" class="flex items-center justify-between gap-4">
                            <small class="text-muted-color">{{ $t('entities.materialPile') }}</small>
                            <EntityInlineRef type="materialPile" :id="pileId" />
                        </div>
                    </div>
                </Panel>

                <Panel :header="$t('common.history')">
                    <StatusHistory :entity="sheet" entity-type="sheet" />
                </Panel>
            </div>
        </div>
    </EntityPage>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Panel from 'primevue/panel';
import Fieldset from 'primevue/fieldset';
import Button from 'primevue/button';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';

const props = defineProps({
    sheet: { type: Object, required: true }
});

const { t } = useI18n();

const sheetSpecs = computed(() => props.sheet.specs || props.sheet.data?.specs || {});
const sheetWidth = computed(() => sheetSpecs.value.width || 0);
const sheetLength = computed(() => sheetSpecs.value.length || 0);
const warehouseId = computed(() => props.sheet.lineage?.warehouse?.entityId || null);
const pileId = computed(() => props.sheet.lineage?.materialPile?.entityId || null);

const colorName = computed(() => props.sheet.specs?.color || t('common.unknown'));
const materialName = computed(() => props.sheet.specs?.material || t('common.unknown'));
const colorHex = computed(() => props.sheet.specs?.colorHex || 'var(--p-content-border-color)');

const geometryStyle = computed(() => {
    const max = 400;
    const width = sheetWidth.value || 2000;
    const length = sheetLength.value || 1000;
    const ratio = width / length;
    let w, h;
    if (ratio > 1) {
        w = max; h = max / ratio;
    } else {
        h = max; w = max * ratio;
    }
    return { width: `${w}px`, height: `${h}px` };
});
</script>
