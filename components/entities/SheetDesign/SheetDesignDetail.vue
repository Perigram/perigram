<template>
    <EntityPage :entity="design" entity-type="sheet_design">
        <template #actions>
                <Button
                    :label="$t('sheetDesign.downloadDxf')"
                    icon="pi pi-download"
                    :loading="generatingDxf"
                    data-testid="sheet-design-generate-dxf"
                    @click="generateDxf"
                />
                <Button :label="$t('sheetDesign.exportGCode')" icon="pi pi-file-export" text />
        </template>

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
            <div class="lg:col-span-3 flex flex-col gap-8">
                <Panel>
                    <GeometryPreview :entity="design" />
                </Panel>

                <Panel>
                    <DataBlock entity-type="sheetDesign" :entity="design" :fields="SHEET_DESIGN_FIELDS" />
                </Panel>
            </div>

            <!-- Sidebar -->
            <div class="flex flex-col gap-8">
                <Panel :header="$t('cassetteInstance.tracking')">
                    <StatusHistory :entity="design" entity-type="sheet_design" />
                </Panel>
                <Panel :header="$t('sheetDesign.cassetteDesigns')">
                    <div v-if="cassetteDesigns.length" class="flex flex-col gap-2">
                        <div
                            v-for="item in cassetteDesigns"
                            :key="item.cassetteDesignId"
                            class="flex items-center justify-between gap-2"
                        >
                            <EntityInlineRef type="cassetteDesign" :id="item.cassetteDesignId" />
                            <Tag :value="item.count" size="small" />
                        </div>
                    </div>
                    <div v-else class="text-muted-color">
                        {{ $t('common.notAvailable') }}
                    </div>
                </Panel>
                <Panel :header="$t('sheetDesign.materialSources')">
                    <div v-if="materialPool.length" class="flex flex-col gap-2">
                        <div
                            v-for="item in materialPool"
                            :key="`${item.type}-${item.id}`"
                            class="flex items-center justify-between gap-3"
                        >
                            <div class="flex min-w-0 flex-col">
                                <span class="truncate">{{ item.label || item.id }}</span>
                                <small class="text-muted-color">{{ item.specs || $t('common.notAvailable') }}</small>
                            </div>
                            <Tag :value="item.available || 1" size="small" />
                        </div>
                    </div>
                    <div v-else class="text-muted-color">
                        {{ $t('common.notAvailable') }}
                    </div>
                </Panel>
                <Panel :header="$t('sheetDesign.instances')">
                    <div class="flex flex-col gap-2">
                        <EntityInlineRef
                            v-for="cid in design.data?.instanceIds || []"
                            :key="cid"
                            type="cassetteInstance"
                            :id="cid"
                        />
                    </div>
                </Panel>
            </div>
        </div>
    </EntityPage>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import EntityPage from '~/components/shared/EntityPage.vue';
import { cassetteDesignCountsForSheetDesign } from '~/utils/sheetDesigns.js';

const props = defineProps({
    design: { type: Object, required: true }
});
const { t } = useI18n();
const toast = useToast();
const generatingDxf = ref(false);

const SHEET_DESIGN_FIELDS = [
    { path: 'summary.efficiency', i18n: 'sheetDesign.utilization', suffix: '%' },
    { path: 'summary.placedCount', i18n: 'sheetDesign.parts' },
    { path: 'specs.cuttingLength', i18n: 'sheetDesign.cuttingLength', suffix: ' m' },
    { path: 'specs.estimatedTime', i18n: 'sheetDesign.estimatedTime', suffix: ' min' }
];

const cassetteDesigns = computed(() => cassetteDesignCountsForSheetDesign(props.design).map(item => ({
    ...item,
    cassetteDesignId: item.cassetteDesignId?.toString?.() || item.cassetteDesignId
})));
const materialPool = computed(() => props.design.data?.materialPool || []);

const generateDxf = async () => {
    generatingDxf.value = true;
    try {
        const response = await $fetch('/api/commands/generateAttachment/run', {
            method: 'POST',
            body: {
                entities: { sheetDesign: props.design._id },
                parameters: { kind: 'LAYOUT_DXF' }
            }
        });
        const attachmentId = response?.result?.data?.attachmentId || response?.result?.attachments?.[0]?.id;
        if (attachmentId && import.meta.client) {
            window.location.href = `/api/artifacts/${encodeURIComponent(attachmentId)}`;
        }
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('sheetDesign.dxfRequested'), life: 3000 });
    } catch {
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('sheetDesign.dxfRequestFailed'), life: 4000 });
    } finally {
        generatingDxf.value = false;
    }
};
</script>
