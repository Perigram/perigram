<template>
  <div class="p-8 min-h-screen">
    <div class="max-w-4xl mx-auto space-y-12">
      
      <div class="flex justify-between items-center border-b pb-4">
        <h1>{{ $t('uiLab.title') }}</h1>
        <div class="flex gap-4">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </div>

      <nav class="flex gap-4 overflow-x-auto pb-2">
        <Button 
          v-for="tab in tabs" 
          :key="tab.id"
          :label="tab.label"
          :severity="activeTab === tab.id ? 'primary' : 'secondary'"
          @click="activeTab = tab.id"
          class="whitespace-nowrap"
        />
      </nav>

      <div class="space-y-16">
        <template v-if="activeTab !== 'shared'">
            <div v-for="comp in activeComponents" :key="comp.title" class="space-y-8">
            <h2 class="text-base">{{ comp.title }}</h2>
            
            <div class="space-y-12">
                <div class="space-y-2">
                    <small>{{ $t('uiLab.variants.card') }}</small>
                    <div class="max-w-md">
                        <component :is="comp.component" v-bind="comp.props" variant="card" />
                    </div>
                </div>

                <div class="space-y-2">
                    <small>{{ $t('uiLab.variants.compact') }}</small>
                    <div class="max-w-sm">
                        <component :is="comp.component" v-bind="comp.props" variant="compact" />
                    </div>
                </div>

                <div class="space-y-2">
                    <small>{{ $t('uiLab.variants.inline') }}</small>
                    <div class="flex items-center gap-4">
                        <component :is="comp.component" v-bind="comp.props" variant="inline" />
                    </div>
                </div>
            </div>
            </div>
        </template>

        <template v-else>
            <div class="space-y-12">
                <section class="space-y-4">
                    <h3 class="text-base">{{ $t('uiLab.statusHistory') }}</h3>
                    <div class="border rounded p-8">
                        <StatusHistory 
                            entityType="project" 
                            :targetId="mocks.project._id.toString()" 
                            :mockEvents="mockHistory"
                        />
                    </div>
                </section>

                <section class="space-y-4">
                    <h3 class="text-base">{{ $t('uiLab.traceabilityChain') }}</h3>
                    <div class="space-y-8">
                        <div class="border rounded p-4">
                            <small class="block mb-2">{{ $t('uiLab.fullChain') }}</small>
                            <TraceChain :lineage="fullLineage" />
                        </div>
                        <div class="border rounded p-4">
                            <small class="block mb-2">{{ $t('uiLab.collapsedChain') }}</small>
                            <TraceChain :lineage="fullLineage" :expandable="true" />
                        </div>
                    </div>
                </section>
            </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import Button from 'primevue/button';

// Components
import ProjectCard from '~/components/entities/Project/ProjectCard.vue';
import QueueCard from '~/components/entities/Queue/QueueCard.vue';
import NestingRunCard from '~/components/entities/NestingRun/NestingRunCard.vue';
import SheetDesignCard from '~/components/entities/SheetDesign/SheetDesignCard.vue';
import CassetteDesignCard from '~/components/entities/CassetteDesign/CassetteDesignCard.vue';
import CassetteInstanceCard from '~/components/entities/CassetteInstance/CassetteInstanceCard.vue';
import RequisitionCard from '~/components/entities/Requisition/RequisitionCard.vue';

import PileCard from '~/components/entities/MaterialPile/PileCard.vue';
import SheetCard from '~/components/entities/Sheet/SheetCard.vue';
import RemnantCard from '~/components/entities/Remnant/RemnantCard.vue';

import CatalogCard from '~/components/entities/Catalog/CatalogCard.vue';
import ColorCard from '~/components/entities/Color/ColorCard.vue';
import WarehouseCard from '~/components/entities/Warehouse/WarehouseCard.vue';
import ToolProfileCard from '~/components/entities/ToolProfile/ToolProfileCard.vue';
import PenTemplateCard from '~/components/entities/PenTemplate/PenTemplateCard.vue';
import LayerStandardCard from '~/components/entities/LayerStandard/LayerStandardCard.vue';

import CassetteTemplateCard from '~/components/entities/CassetteTemplate/CassetteTemplateCard.vue';
import BatchPileCard from '~/components/entities/BatchPile/BatchPileCard.vue';
import UserCard from '~/components/entities/User/UserCard.vue';
import OrganizationCard from '~/components/entities/Organization/OrganizationCard.vue';
import ArtifactCard from '~/components/entities/Artifact/ArtifactCard.vue';

import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';

import ThemeSwitcher from '~/components/ThemeSwitcher.vue';
import LanguageSwitcher from '~/components/LanguageSwitcher.vue';

import {
  createMockProject,
  createMockQueue,
  createMockSheet,
  createMockPile,
  createMockCatalog,
  createMockRemnant,
  createMockSheetDesign,
  createMockCassetteDesign,
  createMockCassetteInstance,
  createMockWarehouse,
  createMockUser,
  createMockOrganization,
  createMockArtifact,
  createMockColor,
  createMockNestingRun,
  createMockToolProfile,
  createMockPenTemplate,
  createMockLayerStandard,
  createMockHistory,
  createMockRequisition,
  createMockCassetteTemplate,
  createMockBatchPile
} from '~/test-data/factories.js';

const activeTab = ref('production');

const tabs = [
  { id: 'production', label: 'Production' },
  { id: 'material', label: 'Material' },
  { id: 'master', label: 'Master Data' },
  { id: 'system', label: 'System & Users' },
  { id: 'shared', label: 'History & Trace' }
];

const mocks = {
    requisition: createMockRequisition(),
    project: createMockProject({
        summary: {
            queueCount: 5,
            totalArea: 125.4
        }
    }),
    queue: createMockQueue({
        summary: {
            runCount: 2,
            sheetCount: 12,
            totalArea: 45.6
        }
    }),
    run: createMockNestingRun(),
    sheetDesign: createMockSheetDesign(),
    cassetteDesign: createMockCassetteDesign(),
    cassetteTemplate: createMockCassetteTemplate(),
    instance: createMockCassetteInstance(),
    pile: createMockPile(),
    batchPile: createMockBatchPile(),
    sheet: createMockSheet(),
    remnant: createMockRemnant(),
    catalog: createMockCatalog({
        summary: {
            colorCount: 8
        }
    }),
    color: createMockColor(),
    warehouse: createMockWarehouse(),
    tool: createMockToolProfile(),
    pen: createMockPenTemplate(),
    layer: createMockLayerStandard(),
    user: createMockUser(),
    org: createMockOrganization(),
    artifact: createMockArtifact()
};

const mockHistory = createMockHistory(['DRAFT', 'ACTIVE', 'CLOSED']);

const fullLineage = {
    organizationId: 'mock-org-acme',
    warehouseId: 'mock-warehouse-main',
    projectId: 'mock-project-downtown',
    queueId: 'mock-queue-morning'
};

const componentsMap = {
  production: [
    { title: 'Project', component: ProjectCard, props: { project: mocks.project } },
    { title: 'Queue', component: QueueCard, props: { queue: mocks.queue } },
    { title: 'Nesting Run', component: NestingRunCard, props: { run: mocks.run } },
    { title: 'Sheet Design', component: SheetDesignCard, props: { design: mocks.sheetDesign } },
    { title: 'Cassette Design', component: CassetteDesignCard, props: { design: mocks.cassetteDesign } },
    { title: 'Cassette Template', component: CassetteTemplateCard, props: { template: mocks.cassetteTemplate } },
    { title: 'Cassette Instance', component: CassetteInstanceCard, props: { instance: mocks.instance } },
    { title: 'Requisition', component: RequisitionCard, props: { requisition: mocks.requisition } },
  ],
  material: [
    { title: 'Material Pile', component: PileCard, props: { pile: mocks.pile } },
    { title: 'Batch Pile', component: BatchPileCard, props: { pile: mocks.batchPile } },
    { title: 'Physical Sheet', component: SheetCard, props: { sheet: mocks.sheet } },
    { title: 'Remnant', component: RemnantCard, props: { remnant: mocks.remnant } },
  ],
  master: [
    { title: 'Material Catalog', component: CatalogCard, props: { catalog: mocks.catalog } },
    { title: 'Finish Color', component: ColorCard, props: { color: mocks.color } },
    { title: 'Warehouse', component: WarehouseCard, props: { warehouse: mocks.warehouse } },
    { title: 'Tool Profile', component: ToolProfileCard, props: { tool: mocks.tool } },
    { title: 'Pen Template', component: PenTemplateCard, props: { pen: mocks.pen } },
    { title: 'Layer Standard', component: LayerStandardCard, props: { standard: mocks.layer } },
  ],
  system: [
    { title: 'User Profile', component: UserCard, props: { user: mocks.user } },
    { title: 'Organization', component: OrganizationCard, props: { organization: mocks.org } },
    { title: 'Artifact / File', component: ArtifactCard, props: { artifact: mocks.artifact } },
  ]
};

const activeComponents = computed(() => componentsMap[activeTab.value] || []);
</script>
