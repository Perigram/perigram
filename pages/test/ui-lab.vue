<template>
  <div class="flex h-screen">
    <!-- Sidebar -->
    <aside class="w-64 border-r">
      <div class="p-4">
        <h2 class="text-xl font-bold mb-4">UI Lab</h2>
        <nav class="space-y-2">
          <Button 
            v-for="tab in tabs" 
            :key="tab.id"
            :label="tab.label"
            :severity="activeTab === tab.id ? 'primary' : 'secondary'"
            text
            class="w-full justify-start"
            @click="activeTab = tab.id"
          />
        </nav>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-auto p-6">
      <Message v-if="error" severity="error" class="mb-4">
        <pre>{{ error }}</pre>
      </Message>

      <div v-else class="space-y-6">
        <!-- ATOMS TAB -->
        <div v-if="activeTab === 'atoms'" class="space-y-4">
          <Panel header="Theme & Language Controls">
            <div class="flex gap-4">
              <ErrorBoundary title="ThemeSwitcher">
                <ThemeSwitcher />
              </ErrorBoundary>
              <ErrorBoundary title="LanguageSwitcher">
                <LanguageSwitcher />
              </ErrorBoundary>
            </div>
          </Panel>

          <Panel header="Buttons">
            <div class="flex gap-2">
              <ErrorBoundary title="Button Primary">
                <Button label="Primary" />
              </ErrorBoundary>
              <ErrorBoundary title="Button Secondary">
                <Button label="Secondary" severity="secondary" />
              </ErrorBoundary>
              <ErrorBoundary title="Button Success">
                <Button label="Success" severity="success" />
              </ErrorBoundary>
              <ErrorBoundary title="Button Warning">
                <Button label="Warning" severity="warn" />
              </ErrorBoundary>
              <ErrorBoundary title="Button Danger">
                <Button label="Danger" severity="danger" />
              </ErrorBoundary>
            </div>
          </Panel>

          <Panel header="Icons">
            <div class="flex gap-2">
              <ErrorBoundary title="Icons">
                <i class="pi pi-check"></i>
                <i class="pi pi-times"></i>
                <i class="pi pi-search"></i>
                <i class="pi pi-filter"></i>
              </ErrorBoundary>
            </div>
          </Panel>

          <Panel header="Badges">
            <div class="flex gap-2">
              <ErrorBoundary title="Tag Success">
                <Tag value="Success" severity="success" />
              </ErrorBoundary>
              <ErrorBoundary title="Tag Info">
                <Tag value="Info" severity="info" />
              </ErrorBoundary>
              <ErrorBoundary title="Tag Warning">
                <Tag value="Warning" severity="warn" />
              </ErrorBoundary>
              <ErrorBoundary title="Tag Danger">
                <Tag value="Danger" severity="danger" />
              </ErrorBoundary>
            </div>
          </Panel>

          <Panel header="Status Indicators">
            <div class="space-y-2">
              <ErrorBoundary title="ProgressSpinner">
                <ProgressSpinner style="width: 50px; height: 50px" />
              </ErrorBoundary>
            </div>
          </Panel>
        </div>

        <!-- DISPLAY TAB -->
        <div v-if="activeTab === 'display'" class="space-y-4">
          <Panel header="Project Statistics">
            <ErrorBoundary title="ProjectStatistics">
              <ProjectStatistics :statistics="mockStats" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Recent Projects">
            <ErrorBoundary title="RecentProjects">
              <RecentProjects :projects="mockProjects" />
            </ErrorBoundary>
          </Panel>

          <Panel header="History Timeline">
            <ErrorBoundary title="HistoryTimeline">
              <HistoryTimeline :history="mockHistory" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Material Specs">
            <ErrorBoundary title="MaterialSpecs">
              <MaterialSpecs :material="mockRequisition.material" :sheetThickness="mockRequisition.sheetThickness" />
            </ErrorBoundary>
          </Panel>
        </div>

        <!-- ENTITIES TAB -->
        <div v-if="activeTab === 'entities'" class="space-y-4">
          <Panel header="Project Card">
            <ErrorBoundary title="ProjectCard">
              <ProjectCard :project="mockProjects[0]" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Queue Card">
            <ErrorBoundary title="QueueCard">
              <QueueCard :queue="mockQueues[0]" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Sheet Card">
            <ErrorBoundary title="SheetCard">
              <SheetCard :sheet="mockSheets[0]" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Batch Card">
            <ErrorBoundary title="BatchCard">
              <BatchCard :batch="mockBatches[0]" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Warehouse Card">
            <ErrorBoundary title="WarehouseCard">
              <WarehouseCard :warehouse="mockWarehouses[0]" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Requisition Card">
            <ErrorBoundary title="RequisitionCard">
              <RequisitionCard :requisition="mockRequisitions[0]" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Remnant Card">
            <ErrorBoundary title="RemnantCard">
              <RemnantCard :remnant="mockRemnants[0]" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Catalog Card">
            <ErrorBoundary title="CatalogCard">
              <CatalogCard :catalog="mockCatalogs[0]" />
            </ErrorBoundary>
          </Panel>
        </div>

        <!-- FORMS TAB -->
        <div v-if="activeTab === 'forms'" class="space-y-4">
          <Panel header="Project Form">
            <ErrorBoundary title="ProjectForm">
              <ProjectForm :project="mockProjects[0]" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Queue Form">
            <ErrorBoundary title="QueueForm">
              <QueueForm :queue="mockQueues[0]" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Sheet Form">
            <ErrorBoundary title="SheetForm">
              <SheetForm :sheet="mockSheets[0]" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Batch Form">
            <ErrorBoundary title="BatchForm">
              <BatchForm :batch="mockBatches[0]" />
            </ErrorBoundary>
          </Panel>

          <Panel header="Requisition Form">
            <ErrorBoundary title="RequisitionForm">
              <RequisitionForm :requisition="mockRequisitions[0]" />
            </ErrorBoundary>
          </Panel>
        </div>

        <!-- DATA MODEL TAB -->
        <div v-if="activeTab === 'models'" class="space-y-4">
          <Panel header="Data Model Overview">
            <p class="mb-4">Procedurally extracted from server/features/*/repository.js</p>
            
            <Message v-if="modelsError" severity="error">
              {{ modelsError }}
            </Message>
            
            <ProgressSpinner v-else-if="!dataModels" />
            
            <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ErrorBoundary v-for="(model, name) in dataModels" :key="name" :title="`Model: ${name}`">
                <DataModelCard :name="name" :model="model" />
              </ErrorBoundary>
            </div>
          </Panel>

          <Panel header="Entity Relationships">
            <p>Visual data flow and connections</p>
            <Message v-if="!dataModels" severity="info">
              Failed to load data models from server
            </Message>
            <div v-else class="p-4 border rounded">
              <pre class="text-xs">{{ JSON.stringify(Object.keys(dataModels), null, 2) }}</pre>
            </div>
          </Panel>
        </div>

        <!-- HUBS TAB -->
        <div v-if="activeTab === 'hubs'" class="space-y-4">
          <Panel header="Sheets Hub">
            <ErrorBoundary title="SheetsTab">
              <SheetsTab />
            </ErrorBoundary>
          </Panel>

          <Panel header="Batches Hub">
            <ErrorBoundary title="BatchesTab">
              <BatchesTab />
            </ErrorBoundary>
          </Panel>

          <Panel header="Remnants Hub">
            <ErrorBoundary title="RemnantsTab">
              <RemnantsTab />
            </ErrorBoundary>
          </Panel>

          <Panel header="Requisitions Hub">
            <ErrorBoundary title="RequisitionsTab">
              <RequisitionsTab />
            </ErrorBoundary>
          </Panel>

          <Panel header="Catalogs Hub">
            <ErrorBoundary title="CatalogsTab">
              <CatalogsTab />
            </ErrorBoundary>
          </Panel>

          <Panel header="Warehouse Hub">
            <ErrorBoundary title="WarehouseHub">
              <WarehouseHub />
            </ErrorBoundary>
          </Panel>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onErrorCaptured, onMounted, h } from 'vue';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';

// Component Imports
import ProjectStatistics from '~/components/ProjectStatistics.vue';
import RecentProjects from '~/components/RecentProjects.vue';
import HistoryTimeline from '~/components/HistoryTimeline.vue';
import MaterialSpecs from '~/components/MaterialSpecs.vue';
import ProjectCard from '~/components/entities/ProjectCard.vue';
import QueueCard from '~/components/entities/QueueCard.vue';
import SheetCard from '~/components/entities/SheetCard.vue';
import BatchCard from '~/components/entities/BatchCard.vue';
import WarehouseCard from '~/components/entities/WarehouseCard.vue';
import RequisitionCard from '~/components/entities/RequisitionCard.vue';
import RemnantCard from '~/components/entities/RemnantCard.vue';
import CatalogCard from '~/components/entities/CatalogCard.vue';
import ProjectForm from '~/components/forms/ProjectForm.vue';
import QueueForm from '~/components/forms/QueueForm.vue';
import SheetForm from '~/components/forms/SheetForm.vue';
import BatchForm from '~/components/forms/BatchForm.vue';
import RequisitionForm from '~/components/forms/RequisitionForm.vue';
import SheetsTab from '~/components/hubs/SheetsTab.vue';
import BatchesTab from '~/components/hubs/BatchesTab.vue';
import RemnantsTab from '~/components/hubs/RemnantsTab.vue';
import RequisitionsTab from '~/components/hubs/RequisitionsTab.vue';
import CatalogsTab from '~/components/hubs/CatalogsTab.vue';
import WarehouseHub from '~/components/hubs/WarehouseHub.vue';
import ThemeSwitcher from '~/components/ThemeSwitcher.vue';
import LanguageSwitcher from '~/components/LanguageSwitcher.vue';
import ErrorBoundary from '~/components/shared/ErrorBoundary.vue';

// Factory imports
import {
  createMockProject,
  createMockQueue,
  createMockSheet,
  createMockBatch,
  createMockWarehouse,
  createMockRequisition,
  createMockRemnant,
  createMockCatalog,
  createMockStatistics,
  createMockHistory
} from '~/test-data/factories.js';

// Tabs configuration
const tabs = [
  { id: 'atoms', label: 'Atoms' },
  { id: 'display', label: 'Display' },
  { id: 'entities', label: 'Entities' },
  { id: 'forms', label: 'Forms' },
  { id: 'models', label: 'Data Model' },
  { id: 'hubs', label: 'Hubs' }
];

// State
const activeTab = ref('atoms');
const error = ref(null);
const dataModels = ref(null);
const modelsError = ref(null);

// Mock data using factories
const mockStats = createMockStatistics();
const mockHistory = [createMockHistory(), createMockHistory({ status: 'in-progress' })];
const mockProjects = [createMockProject(), createMockProject({ name: 'Harbor Plaza' })];
const mockQueues = [createMockQueue(), createMockQueue({ name: 'Batch #2' })];
const mockSheets = [createMockSheet(), createMockSheet({ thickness: 6 })];
const mockBatches = [createMockBatch(), createMockBatch({ status: 'in-progress' })];
const mockWarehouses = [createMockWarehouse()];
const mockRequisitions = [createMockRequisition()];
const mockRemnants = [createMockRemnant()];
const mockCatalogs = [createMockCatalog()];

// Data Model Card Component
const DataModelCard = {
  props: ['name', 'model'],
  setup(props) {
    return () => h(Panel, { header: props.name, toggleable: true, collapsed: true }, {
      default: () => [
        h('p', { class: 'text-sm mb-4' }, props.model.description || 'No description'),
        h('div', { class: 'space-y-2' }, [
          h('h4', { class: 'font-semibold text-sm' }, `${props.model.fields?.length || 0} Fields`),
          props.model.fields && props.model.fields.length > 0
            ? h('ul', { class: 'text-sm space-y-1' }, 
                props.model.fields.map(field => 
                  h('li', { class: 'flex justify-between' }, [
                    h('span', { class: 'font-mono' }, field.name),
                    h('span', { class: 'text-sm' }, field.type)
                  ])
                )
              )
            : h('p', { class: 'text-sm' }, 'No fields detected'),
          props.model.related && props.model.related.length > 0
            ? h('div', { class: 'mt-4' }, [
                h('h4', { class: 'font-semibold text-sm mb-2' }, 'Related'),
                h('div', { class: 'flex gap-2 flex-wrap' },
                  props.model.related.map(rel => h(Tag, { value: rel, severity: 'info' }))
                )
              ])
            : null
        ])
      ]
    });
  }
};

// Load data models
onMounted(async () => {
  try {
    const response = await fetch('/api/debug/data-models');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    dataModels.value = await response.json();
  } catch (e) {
    modelsError.value = e.message;
  }
});

// Error handler
onErrorCaptured((err) => {
  error.value = err.message || String(err);
  return false;
});
</script>
