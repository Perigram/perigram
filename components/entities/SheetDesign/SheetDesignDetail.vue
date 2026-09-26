<template>
    <InstancePage :instance="design" type-id="sheet_design">
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

        <div class="flex flex-col gap-8">
            <Panel>
                <SheetDesignEditor v-if="canEdit" :design="design" editable @saved="$emit('saved', $event)" />
                <GeometryPreview v-else :entity="design" />
            </Panel>

            <Panel>
                <DataBlock type-id="sheetDesign" :entity="design" :fields="SHEET_DESIGN_FIELDS" />
            </Panel>
        </div>

        <template #sidebar>
            <div class="flex flex-col gap-8">
                <Panel :header="$t('cassetteInstance.tracking')">
                    <StateHistory :instance="design" type-id="sheet_design" />
                </Panel>
                <Panel :header="$t('sheetDesign.cassetteDesigns')">
                    <div v-if="cassetteDesigns.length" class="flex flex-col gap-2">
                        <div
                            v-for="item in cassetteDesigns"
                            :key="item.cassetteDesignId"
                            class="flex items-center justify-between gap-2"
                        >
                            <InstanceInlineRef type="cassetteDesign" :id="item.cassetteDesignId" />
                            <Tag :value="item.count" size="small" />
                        </div>
                    </div>
                    <div v-else class="text-muted">
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
                                <small class="text-muted">{{ item.specs || $t('common.notAvailable') }}</small>
                            </div>
                            <Tag :value="item.available || 1" size="small" />
                        </div>
                    </div>
                    <div v-else class="text-muted">
                        {{ $t('common.notAvailable') }}
                    </div>
                </Panel>
                <Panel :header="$t('sheetDesign.instances')">
                    <div class="flex flex-col gap-2">
                        <InstanceInlineRef
                            v-for="cid in design.data?.instanceIds || []"
                            :key="cid"
                            type="cassetteInstance"
                            :id="cid"
                        />
                    </div>
                </Panel>
            </div>
        </template>
    </InstancePage>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import StateHistory from '~/components/shared/state/StateHistory.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import SheetDesignEditor from '~/components/SheetDesignEditor.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import InstancePage from '~/components/shared/InstancePage.vue';
import { cassetteDesignCountsForSheetDesign } from '~/utils/sheetDesigns.js';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useAuthStore } from '~/stores/auth';
import { hasPermissionGrant } from '#shared/access-control.js';

const props = defineProps({
    design: { type: Object, required: true }
});
defineEmits(['saved']);
const { t } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
const generatingDxf = ref(false);
const canEdit = computed(() => hasPermissionGrant({
    permissions: authStore.activePermissions,
    feature: 'sheet_designs',
    level: 'write',
    entity: props.design,
    typeId: 'sheet_design'
}));

const { typeById } = useFileTypeView();
const SHEET_DESIGN_FIELDS = computed(() => resolveInstanceDisplayFields({ typeId: 'sheetDesign', surface: 'detail', typeRecord: typeById('sheet-design') })
    .filter(field => field.role !== 'previewSource'));

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
