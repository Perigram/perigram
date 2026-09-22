<template>
    <InstancePage :entity="sheet" type-id="sheet">
        <template #actions>
            <Button icon="pi pi-qrcode" text :aria-label="$t('common.printTag')" />
        </template>

        <template #sidebar>
            <Panel v-if="warehouseId || pileId || runId" :header="$t('common.source')">
                <div class="flex flex-col gap-3">
                    <div v-if="warehouseId" class="flex items-center justify-between gap-4">
                        <small class="text-muted">{{ $t('entities.warehouse') }}</small>
                        <InstanceInlineRef type="warehouse" :id="warehouseId" />
                    </div>
                    <div v-if="pileId" class="flex items-center justify-between gap-4">
                        <small class="text-muted">{{ $t('entities.materialPile') }}</small>
                        <InstanceInlineRef type="materialPile" :id="pileId" />
                    </div>
                    <div v-if="runId" class="flex items-center justify-between gap-4">
                        <small class="text-muted">{{ $t('entities.nestingRun') }}</small>
                        <InstanceInlineRef type="nestingRun" :id="runId" />
                    </div>
                </div>
            </Panel>

            <Panel :header="$t('common.history')">
                <StatusHistory :entity="sheet" type-id="sheet" />
            </Panel>
        </template>

        <div class="flex flex-col gap-6">
            <Panel>
                <div class="flex flex-col gap-6 md:flex-row md:items-center">
                    <div class="flex shrink-0 items-center gap-4">
                        <div
                            class="w-12 h-12 border rounded"
                            :style="{ backgroundColor: colorHex }"
                        ></div>
                        <div class="flex flex-col">
                            <span class="text-section-heading">{{ colorName }}</span>
                            <small>{{ materialName }}</small>
                        </div>
                    </div>
                    <div class="min-w-0 flex-1">
                        <SpecsBlock type-id="sheet" :entity="sheet" />
                    </div>
                </div>
            </Panel>

            <Fieldset :legend="$t('sheets.physicalRepresentation')">
                <div class="aspect-[16/9] border rounded flex items-center justify-center relative overflow-hidden">
                    <div
                        class="border border-dashed rounded flex items-center justify-center flex-col gap-4"
                        :style="geometryStyle"
                    >
                        <small>{{ $t('sheets.surface') }}</small>
                        <span class="text-metric">{{ sheetWidth }}x{{ sheetLength }}</span>
                    </div>
                </div>
            </Fieldset>
        </div>
    </InstancePage>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Panel from 'primevue/panel';
import Fieldset from 'primevue/fieldset';
import Button from 'primevue/button';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import InstancePage from '~/components/shared/InstancePage.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';

const props = defineProps({
    sheet: { type: Object, required: true }
});

const { t } = useI18n();

const sheetSpecs = computed(() => props.sheet.specs || props.sheet.data?.specs || {});
const sheetWidth = computed(() => sheetSpecs.value.width || 0);
const sheetLength = computed(() => sheetSpecs.value.length || 0);
const warehouseId = computed(() => props.sheet.lineage?.warehouseId || null);
const pileId = computed(() => props.sheet.lineage?.pileId || props.sheet.lineage?.materialPileId || null);
const runId = computed(() => props.sheet.lineage?.runId || props.sheet.lineage?.nestingRunId || null);

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
