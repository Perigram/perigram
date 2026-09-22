<template>
    <InstancePage :entity="remnant" type-id="remnant">
        <template #actions>
            <Button icon="pi pi-qrcode" text :aria-label="$t('common.printTag')" />
        </template>

        <template #sidebar>
            <Panel :header="$t('common.source')">
                <div class="flex flex-col gap-3">
                    <div class="flex items-center justify-between gap-4">
                        <small class="text-muted">{{ $t('results.material') }}</small>
                        <InstanceInlineRef v-if="pile" type="materialPile" :entity="pile" />
                        <span v-else>—</span>
                    </div>
                    <div v-if="sheet" class="flex items-center justify-between gap-4">
                        <small class="text-muted">{{ $t('results.sheet') }}</small>
                        <InstanceInlineRef type="sheet" :entity="sheet" />
                    </div>
                    <div v-if="warehouse" class="flex items-center justify-between gap-4">
                        <small class="text-muted">{{ $t('entities.warehouse') }}</small>
                        <InstanceInlineRef type="warehouse" :entity="warehouse" />
                    </div>
                </div>
            </Panel>

            <Panel :header="$t('requisition.lifecycleTimeline')">
                <StatusHistory :entity="remnant" type-id="remnant" />
            </Panel>
        </template>

        <div class="flex flex-col gap-6">
            <MetricPanel :metrics="remnantMetrics" />

            <Panel :header="$t('warehouse.recoveredArea')">
                <GeometryPreview :entity="remnant" />
            </Panel>
        </div>
    </InstancePage>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import { useInstancesStore } from '~/stores/instances';
import InstancePage from '~/components/shared/InstancePage.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import MetricPanel from '~/components/shared/MetricPanel.vue';

const { t } = useI18n();

const props = defineProps({
    remnant: {
        type: Object,
        required: true
    }
});

const instances = useInstancesStore();
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
const remnantMetrics = computed(() => [
    { key: 'area', label: t('results.area'), value: formattedArea.value }
]);

watch(pileId, async (id) => {
    pile.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    pile.value = await instances.fetchInstance(instances.canonicalTypeKey('materialPile'), normalizedId).catch(() => null);
}, { immediate: true });

watch(sheetId, async (id) => {
    sheet.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    sheet.value = await instances.fetchInstance(instances.canonicalTypeKey('sheet'), normalizedId).catch(() => null);
}, { immediate: true });

watch(warehouseId, async (id) => {
    warehouse.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    warehouse.value = await instances.fetchInstance(instances.canonicalTypeKey('warehouse'), normalizedId).catch(() => null);
}, { immediate: true });
</script>
