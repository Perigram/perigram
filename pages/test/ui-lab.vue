<template>
  <div class="p-8 min-h-screen bg-[var(--p-background-color)] text-[var(--p-text-color)]">
    <div class="max-w-4xl mx-auto space-y-12">
      
      <div class="flex justify-between items-center border-b pb-4">
        <h1>UI LAB v24</h1>
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
            <h2>{{ comp.title }}</h2>
            
            <div class="space-y-12">
                <div class="space-y-2">
                    <small class="font-bold">Card</small>
                    <div class="max-w-md">
                        <component :is="comp.component" v-bind="comp.props" variant="card" />
                    </div>
                </div>

                <div class="space-y-2">
                    <small class="font-bold">Compact</small>
                    <div class="max-w-sm">
                        <component :is="comp.component" v-bind="comp.props" variant="compact" />
                    </div>
                </div>

                <div class="space-y-2">
                    <small class="font-bold">Inline</small>
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
                    <h3>Status Timeline</h3>
                    <StatusTimeline 
                        entityType="project" 
                        :targetId="mocks.project._id.toString()" 
                        :mockEvents="mockHistory"
                    />
                </section>

                <section class="space-y-4">
                    <h3>Traceability (Lineage)</h3>
                    <div class="space-y-8">
                        <div>
                            <small class="font-bold">Full Chain</small>
                            <LineageView :lineage="fullLineage" />
                        </div>
                        <div>
                            <small class="font-bold">Collapsed Chain</small>
                            <LineageView :lineage="fullLineage" :expandable="true" />
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
import { ObjectId } from 'bson';

// Components
import ProjectView from '~/components/entities/Project/ProjectView.vue';
import QueueView from '~/components/entities/Queue/QueueView.vue';
import NestingRunView from '~/components/entities/NestingRun/NestingRunView.vue';
import SheetDesignView from '~/components/entities/SheetDesign/SheetDesignView.vue';
import CassetteDesignView from '~/components/entities/CassetteDesign/CassetteDesignView.vue';
import CassetteInstanceView from '~/components/entities/CassetteInstance/CassetteInstanceView.vue';

import PileView from '~/components/entities/MaterialPile/PileView.vue';
import SheetView from '~/components/entities/Sheet/SheetView.vue';
import RemnantView from '~/components/entities/Remnant/RemnantView.vue';

import CatalogView from '~/components/entities/Catalog/CatalogView.vue';
import ColorView from '~/components/entities/Color/ColorView.vue';
import WarehouseView from '~/components/entities/Warehouse/WarehouseView.vue';
import ToolProfileView from '~/components/entities/ToolProfile/ToolProfileView.vue';
import PenTemplateView from '~/components/entities/PenTemplate/PenTemplateView.vue';
import LayerStandardView from '~/components/entities/LayerStandard/LayerStandardView.vue';

import UserView from '~/components/entities/User/UserView.vue';
import OrganizationView from '~/components/entities/Organization/OrganizationView.vue';
import ArtifactView from '~/components/entities/Artifact/ArtifactView.vue';

import StatusTimeline from '~/components/entities/shared/StatusTimeline.vue';
import LineageView from '~/components/entities/shared/LineageView.vue';

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
  createMockHistory
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
    instance: createMockCassetteInstance(),
    pile: createMockPile(),
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
    organizationId: new ObjectId(),
    warehouseId: new ObjectId(),
    projectId: new ObjectId(),
    queueId: new ObjectId()
};

const componentsMap = {
  production: [
    { title: 'Project', component: ProjectView, props: { project: mocks.project } },
    { title: 'Queue', component: QueueView, props: { queue: mocks.queue } },
    { title: 'Nesting Run', component: NestingRunView, props: { run: mocks.run } },
    { title: 'Sheet Design', component: SheetDesignView, props: { design: mocks.sheetDesign } },
    { title: 'Cassette Design', component: CassetteDesignView, props: { design: mocks.cassetteDesign } },
    { title: 'Cassette Instance', component: CassetteInstanceView, props: { instance: mocks.instance } },
  ],
  material: [
    { title: 'Material Pile', component: PileView, props: { pile: mocks.pile } },
    { title: 'Physical Sheet', component: SheetView, props: { sheet: mocks.sheet } },
    { title: 'Remnant', component: RemnantView, props: { remnant: mocks.remnant } },
  ],
  master: [
    { title: 'Material Catalog', component: CatalogView, props: { catalog: mocks.catalog } },
    { title: 'Finish Color', component: ColorView, props: { color: mocks.color } },
    { title: 'Warehouse', component: WarehouseView, props: { warehouse: mocks.warehouse } },
    { title: 'Tool Profile', component: ToolProfileView, props: { tool: mocks.tool } },
    { title: 'Pen Template', component: PenTemplateView, props: { pen: mocks.pen } },
    { title: 'Layer Standard', component: LayerStandardView, props: { standard: mocks.layer } },
  ],
  system: [
    { title: 'User Profile', component: UserView, props: { user: mocks.user } },
    { title: 'Organization', component: OrganizationView, props: { organization: mocks.org } },
    { title: 'Artifact / File', component: ArtifactView, props: { artifact: mocks.artifact } },
  ]
};

const activeComponents = computed(() => componentsMap[activeTab.value] || []);
</script>
