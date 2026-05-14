<template>
    <div class="flex flex-col gap-8">
        <TraceChain :entity="design" />

        <div class="flex justify-between items-start gap-4 min-w-0">
            <div class="flex flex-wrap items-start gap-4 min-w-0">
                <IdentityBlock :entity="design" variant="header" />
                <div class="min-w-0">
                    <EntityStatus :entity="design" entity-type="sheet_design" variant="inline" />
                </div>
            </div>
            <div class="flex gap-2">
                <Button :label="$t('sheetDesign.downloadDxf')" icon="pi pi-download" />
                <Button :label="$t('sheetDesign.exportGCode')" icon="pi pi-file-export" text />
            </div>
        </div>

        <div class="grid-details">
            <div class="lg:col-span-3 flex flex-col gap-8">
                <!-- Geometry Viewer -->
                <Panel>
                    <div class="aspect-[2/1] flex items-center justify-center italic opacity-20">
                        GEOMETRY PREVIEW
                    </div>
                </Panel>

                <!-- Stats -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <Panel>
                        <div class="flex flex-col gap-1"><span class="text-xl">{{ design.specs?.utilization }}%</span><small>{{ $t('sheetDesign.utilization') }}</small></div>
                    </Panel>
                    <Panel>
                        <div class="flex flex-col gap-1"><span class="text-xl">{{ design.specs?.partsCount }}</span><small>{{ $t('sheetDesign.parts') }}</small></div>
                    </Panel>
                    <Panel>
                        <div class="flex flex-col gap-1"><span class="text-xl">{{ design.specs?.cuttingLength }} m</span><small>{{ $t('sheetDesign.cuttingLength') }}</small></div>
                    </Panel>
                    <Panel>
                        <div class="flex flex-col gap-1"><span class="text-xl">{{ design.specs?.estimatedTime }} min</span><small>{{ $t('sheetDesign.estimatedTime') }}</small></div>
                    </Panel>
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
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import Button from 'primevue/button';
import Panel from 'primevue/panel';

defineProps({
    design: { type: Object, required: true }
});
</script>
