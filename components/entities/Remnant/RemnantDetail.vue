<template>
    <EntityPage :entity="remnant" entity-type="remnant" :status-actions="statusActions">
        <template #actions>
            <Button icon="pi pi-qrcode" text :aria-label="$t('common.printTag')" />
        </template>

        <Panel>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="flex flex-col">
                    <small>{{ $t('results.area') }}</small>
                    <span>{{ formattedArea }}</span>
                </div>
                <div class="flex flex-col">
                    <small>{{ $t('results.material') }}</small>
                    <EntityInlineRef v-if="pile" type="materialPile" :entity="pile" />
                    <span v-else>—</span>
                </div>
            </div>
        </Panel>

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
            <div class="lg:col-span-3">
                <Panel :header="$t('warehouse.recoveredArea')">
                    <GeometryPreview :entity="remnant" />
                </Panel>
            </div>

            <div class="lg:col-span-3">
                <Panel :header="$t('common.traceability')">
                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div v-if="sheet" class="flex items-center justify-between gap-4">
                            <small class="text-muted-color">{{ $t('results.sheet') }}</small>
                            <EntityInlineRef type="sheet" :entity="sheet" />
                        </div>
                        <div v-if="warehouse" class="flex items-center justify-between gap-4">
                            <small class="text-muted-color">{{ $t('entities.warehouse') }}</small>
                            <EntityInlineRef type="warehouse" :entity="warehouse" />
                        </div>
                    </div>
                </Panel>
            </div>

            <div class="flex flex-col gap-8">
                <Panel :header="$t('requisition.lifecycleTimeline')">
                    <StatusHistory :entity="remnant" entity-type="remnant" />
                </Panel>
            </div>
        </div>
    </EntityPage>
</template>

<script setup>
import { computed } from 'vue';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import { useEntity } from '~/composables/useEntity';
import EntityPage from '~/components/shared/EntityPage.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';

const props = defineProps({
    remnant: {
        type: Object,
        required: true
    }
});

const { t } = useI18n();
const { changeStatus } = useEntity('remnant', props.remnant?._id || props.remnant?.id);
const pileEntity = useEntity('materialPile');
const sheetEntity = useEntity('sheet');
const warehouseEntity = useEntity('warehouse');
const state = computed(() => props.remnant.status?.state || 'UNKNOWN');
const specs = computed(() => props.remnant.specs || props.remnant.data?.specs || {});
const pileId = computed(() => props.remnant.lineage?.pileId || null);
const sheetId = computed(() => props.remnant.lineage?.sheetId || null);
const warehouseId = computed(() => props.remnant.lineage?.warehouseId || null);
const pile = ref(null);
const sheet = ref(null);
const warehouse = ref(null);
const formattedArea = computed(() => {
    const area = Number(specs.value.area || 0);
    return `${area.toFixed(2)} m²`;
});

const statusActions = computed(() => {
    if (state.value !== 'AVAILABLE') return [];
    return [{ label: t('common.markUsed'), icon: 'pi pi-check-circle', severity: 'success', command: () => changeStatus('USED') }];
});

watch(pileId, async (id) => {
    pile.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    pile.value = await pileEntity.fetch(normalizedId).catch(() => null);
}, { immediate: true });

watch(sheetId, async (id) => {
    sheet.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    sheet.value = await sheetEntity.fetch(normalizedId).catch(() => null);
}, { immediate: true });

watch(warehouseId, async (id) => {
    warehouse.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    warehouse.value = await warehouseEntity.fetch(normalizedId).catch(() => null);
}, { immediate: true });
</script>
