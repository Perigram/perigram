<template>
    <InstancePage :entity="instance" type-id="cassette_instance">
        <template #actions>
                <Button :label="$t('cassetteInstance.printLabel')" icon="pi pi-print" text />
        </template>

        <template #sidebar>
            <Panel :header="$t('common.metadata')">
                <div class="flex flex-col gap-4">
                    <div class="flex justify-between items-center">
                        <small>{{ $t('common.created') }}</small>
                        <span>{{ instance.lineage?.createdAt ? new Date(instance.lineage.createdAt).toLocaleDateString() : '—' }}</span>
                    </div>
                    <Divider />
                    <div class="flex justify-between items-center">
                        <small>{{ $t('common.project') }}</small>
                        <span>{{ instance.lineage?.projectSlug || '—' }}</span>
                    </div>
                </div>
            </Panel>

            <Panel :header="$t('cassetteInstance.parentDesign')">
                <InstanceInlineRef v-if="design" type="cassetteDesign" :entity="design" />
                <span v-else>—</span>
            </Panel>

            <Panel :header="$t('entities.cassetteTemplate')">
                <InstanceInlineRef v-if="template" type="cassetteTemplate" :entity="template" />
                <span v-else>—</span>
            </Panel>

            <Panel :header="$t('cassetteInstance.materialSource')">
                <div class="flex flex-col gap-3">
                    <InstanceInlineRef v-if="sheet" type="sheet" :entity="sheet" />
                    <InstanceInlineRef v-if="pile" type="materialPile" :entity="pile" />
                    <InstanceInlineRef v-if="warehouse" type="warehouse" :entity="warehouse" />
                    <span v-if="!sheet && !pile && !warehouse">—</span>
                </div>
            </Panel>
        </template>

        <div class="flex flex-col gap-8">
            <Panel :header="$t('cassette.geometry')">
                <CassetteThumbnail v-if="designIdValue" :cassette="design" :cassette-id="designIdValue" />
            </Panel>

            <div class="flex flex-col gap-4">
                <ActionToolbar :title="$t('cassetteInstance.tracking')" :level="2" />
                <Panel>
                    <StatusHistory :entity="instance" type-id="cassette_instance" />
                </Panel>
            </div>
        </div>
    </InstancePage>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Divider from 'primevue/divider';
import InstancePage from '~/components/shared/InstancePage.vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import { useInstancesStore } from '~/stores/instances';

const props = defineProps({
    instance: { type: Object, required: true }
});

const designId = computed(() => props.instance.lineage?.cassetteDesignId || props.instance.lineage?.designId || props.instance.data?.cassetteDesignId || null);
const designIdValue = computed(() => designId.value?.toString?.() || designId.value || '');
const sheetId = computed(() => props.instance.lineage?.sheetId || null);
const pileId = computed(() => props.instance.lineage?.pileId || null);
const warehouseId = computed(() => props.instance.lineage?.warehouseId || null);
const design = ref(null);
const template = ref(null);
const sheet = ref(null);
const pile = ref(null);
const warehouse = ref(null);
const instances = useInstancesStore();

watch(designId, async (id) => {
    design.value = null;
    template.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    const loadedDesign = await instances.fetchInstance(instances.canonicalTypeKey('cassetteDesign'), normalizedId).catch(() => null);
    design.value = loadedDesign;
    const templateId = loadedDesign?.lineage?.templateId || loadedDesign?.data?.templateId || null;
    const normalizedTemplateId = templateId?.toString?.() || templateId;
    if (normalizedTemplateId) {
        template.value = await instances.fetchInstance(instances.canonicalTypeKey('cassetteTemplate'), normalizedTemplateId).catch(() => null);
    }
}, { immediate: true });

watch(sheetId, async (id) => {
    sheet.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    sheet.value = await instances.fetchInstance(instances.canonicalTypeKey('sheet'), normalizedId).catch(() => null);
}, { immediate: true });

watch(pileId, async (id) => {
    pile.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    pile.value = await instances.fetchInstance(instances.canonicalTypeKey('materialPile'), normalizedId).catch(() => null);
}, { immediate: true });

watch(warehouseId, async (id) => {
    warehouse.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    warehouse.value = await instances.fetchInstance(instances.canonicalTypeKey('warehouse'), normalizedId).catch(() => null);
}, { immediate: true });
</script>
