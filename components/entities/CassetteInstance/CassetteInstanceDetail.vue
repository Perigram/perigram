<template>
    <EntityPage :entity="instance" entity-type="cassette_instance">
        <template #actions>
                <Button :label="$t('cassetteInstance.printLabel')" icon="pi pi-print" text />
        </template>

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
            <div class="lg:col-span-3 flex flex-col gap-8">
                <Panel :header="$t('cassette.geometry')">
                    <CassetteThumbnail v-if="designIdValue" :cassette="design" :cassette-id="designIdValue" />
                </Panel>

                <!-- Tracking Timeline -->
                <div class="flex flex-col gap-4">
                    <div class="flex items-center gap-2">
                        <i class="pi pi-history"></i>
                        <h2 class="m-0 text-section-heading">{{ $t('cassetteInstance.tracking') }}</h2>
                    </div>
                    <Panel>
                        <StatusHistory :entity="instance" entity-type="cassette_instance" />
                    </Panel>
                </div>

                <!-- References -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Panel :header="$t('cassetteInstance.parentDesign')">
                        <EntityInlineRef v-if="design" type="cassetteDesign" :entity="design" />
                        <span v-else>—</span>
                    </Panel>
                    <Panel :header="$t('entities.cassetteTemplate')">
                        <EntityInlineRef v-if="template" type="cassetteTemplate" :entity="template" />
                        <span v-else>—</span>
                    </Panel>
                    <Panel :header="$t('cassetteInstance.materialSource')">
                        <div class="flex flex-col gap-3">
                            <EntityInlineRef v-if="sheet" type="sheet" :entity="sheet" />
                            <EntityInlineRef v-if="pile" type="materialPile" :entity="pile" />
                            <EntityInlineRef v-if="warehouse" type="warehouse" :entity="warehouse" />
                            <span v-if="!sheet && !pile && !warehouse">—</span>
                        </div>
                    </Panel>
                </div>
            </div>

            <!-- Sidebar -->
            <div class="flex flex-col gap-8">
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
            </div>
        </div>
    </EntityPage>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Divider from 'primevue/divider';
import EntityPage from '~/components/shared/EntityPage.vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { useEntity } from '~/composables/useEntity';

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
const designEntity = useEntity('cassetteDesign');
const templateEntity = useEntity('cassetteTemplate');
const sheetEntity = useEntity('sheet');
const pileEntity = useEntity('materialPile');
const warehouseEntity = useEntity('warehouse');

watch(designId, async (id) => {
    design.value = null;
    template.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    const loadedDesign = await designEntity.fetch(normalizedId, { silent: true }).catch(() => null);
    design.value = loadedDesign;
    const templateId = loadedDesign?.lineage?.templateId || loadedDesign?.data?.templateId || null;
    const normalizedTemplateId = templateId?.toString?.() || templateId;
    if (normalizedTemplateId) {
        template.value = await templateEntity.fetch(normalizedTemplateId, { silent: true }).catch(() => null);
    }
}, { immediate: true });

watch(sheetId, async (id) => {
    sheet.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    sheet.value = await sheetEntity.fetch(normalizedId, { silent: true }).catch(() => null);
}, { immediate: true });

watch(pileId, async (id) => {
    pile.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    pile.value = await pileEntity.fetch(normalizedId, { silent: true }).catch(() => null);
}, { immediate: true });

watch(warehouseId, async (id) => {
    warehouse.value = null;
    const normalizedId = id?.toString?.() || id;
    if (!normalizedId) return;
    warehouse.value = await warehouseEntity.fetch(normalizedId, { silent: true }).catch(() => null);
}, { immediate: true });
</script>
