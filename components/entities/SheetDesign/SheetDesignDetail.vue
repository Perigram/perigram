<template>
    <div class="flex flex-col gap-8">
        <TraceChain :entity="design" />

        <div class="flex justify-between items-center">
            <div class="flex items-center gap-4">
                <IdentityBlock :entity="design" variant="header" />
                <EntityStatus :entity="design" entity-type="sheet_design" variant="inline" />
            </div>
            <div class="flex gap-2">
                <Button :label="$t('sheetDesign.downloadDxf')" icon="pi pi-download" />
                <Button :label="$t('sheetDesign.exportGCode')" icon="pi pi-file-export" text />
            </div>
        </div>

        <div class="grid-details">
            <div class="lg:col-span-3 flex flex-col gap-8">
                <!-- Geometry Viewer -->
                <StandardCard>
                    <div class="aspect-[2/1] flex items-center justify-center italic opacity-20">
                        GEOMETRY PREVIEW
                    </div>
                </StandardCard>

                <!-- Stats -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <StandardCard>
                        <template #title>{{ design.specs?.utilization }}%</template>
                        <template #subtitle>{{ $t('sheetDesign.utilization') }}</template>
                    </StandardCard>
                    <StandardCard>
                        <template #title>{{ design.specs?.partsCount }}</template>
                        <template #subtitle>{{ $t('sheetDesign.parts') }}</template>
                    </StandardCard>
                    <StandardCard>
                        <template #title>{{ design.specs?.cuttingLength }} m</template>
                        <template #subtitle>{{ $t('sheetDesign.cuttingLength') }}</template>
                    </StandardCard>
                    <StandardCard>
                        <template #title>{{ design.specs?.estimatedTime }} min</template>
                        <template #subtitle>{{ $t('sheetDesign.estimatedTime') }}</template>
                    </StandardCard>
                </div>
            </div>

            <!-- Sidebar -->
            <div class="flex flex-col gap-8">
                <Panel :header="$t('cassetteInstance.tracking')">
                    <StatusHistory :entity="design" entity-type="sheet_design" />
                </Panel>
                <Panel :header="$t('sheetDesign.instances')">
                    <div class="flex flex-col gap-2">
                        <TraceLink v-for="cid in design.instanceIds" :key="cid" type="cassetteInstance" :id="cid" />
                    </div>
                </Panel>
            </div>
        </div>
    </div>
</template>

<script setup>
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import Button from 'primevue/button';
import Panel from 'primevue/panel';

defineProps({
    design: { type: Object, required: true }
});
</script>
