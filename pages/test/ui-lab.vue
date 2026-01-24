<template>
  <div class="flex h-screen bg-surface-50">
    <!-- Sidebar -->
    <aside class="w-64 border-r bg-surface-0">
      <div class="p-6 flex flex-col h-full">
        <h2 class="text-xl font-black mb-8 tracking-tighter">V24 UI LAB</h2>
        <nav class="space-y-1">
          <Button 
            v-for="tab in tabs" 
            :key="tab.id"
            :label="tab.label"
            :severity="activeTab === tab.id ? 'primary' : 'secondary'"
            :variant="activeTab === tab.id ? 'default' : 'text'"
            class="w-full justify-start font-bold"
            @click="activeTab = tab.id"
          />
        </nav>
        
        <div class="mt-auto pt-6 border-t">
          <div class="flex gap-2">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-auto p-10">
      <div class="max-w-5xl mx-auto space-y-10">
        
        <!-- ENGINES TAB -->
        <div v-if="activeTab === 'engines'" class="space-y-8">
          <section>
            <h3 class="text-xs font-black uppercase text-surface-400 mb-4 tracking-widest">Lineage & Navigation</h3>
            <div class="p-6 border rounded-2xl bg-surface-0 shadow-sm">
              <LineageBreadcrumbs :lineage="mockQueue.lineage" />
            </div>
          </section>

          <section>
            <h3 class="text-xs font-black uppercase text-surface-400 mb-4 tracking-widest">Status Engine & Timeline</h3>
            <div class="p-6 border rounded-2xl bg-surface-0 shadow-sm">
              <StatusTimeline entityType="Project" targetId="mock-id" />
            </div>
          </section>
        </div>

        <!-- COMPONENTS TAB (V24 VARIANTS) -->
        <div v-if="activeTab === 'variants'" class="space-y-12">
          
          <!-- PROJECT VARIANTS -->
          <section class="space-y-4">
            <h3 class="text-xs font-black uppercase text-surface-400 tracking-widest">Project Variants</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-4">
                <span class="text-[10px] font-bold text-surface-300 uppercase">Card (Default)</span>
                <ProjectView :project="mockProject" variant="card" />
              </div>
              <div class="space-y-4">
                <span class="text-[10px] font-bold text-surface-300 uppercase">Compact</span>
                <ProjectView :project="mockProject" variant="compact" />
                <span class="text-[10px] font-bold text-surface-300 uppercase mt-4 block">Inline</span>
                <div class="p-4 border rounded-lg bg-surface-0 flex items-center gap-4">
                  <ProjectView :project="mockProject" variant="inline" />
                </div>
              </div>
            </div>
          </section>

          <!-- QUEUE VARIANTS -->
          <section class="space-y-4">
            <h3 class="text-xs font-black uppercase text-surface-400 tracking-widest">Queue Variants</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <QueueView :queue="mockQueue" variant="card" />
              <div class="space-y-4">
                <QueueView :queue="mockQueue" variant="compact" />
                <QueueView :queue="{ ...mockQueue, identity: { ...mockQueue.identity, queueNumber: 2, name: 'Backup Run' } }" variant="compact" />
              </div>
              <div class="p-4 border rounded-lg bg-surface-0 flex flex-col gap-2">
                <QueueView :queue="mockQueue" variant="inline" />
                <QueueView :queue="{ ...mockQueue, status: { state: 'NESTING' } }" variant="inline" />
              </div>
            </div>
          </section>

          <!-- PHYSICAL VARIANTS -->
          <section class="space-y-4">
            <h3 class="text-xs font-black uppercase text-surface-400 tracking-widest">Physical & Material</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <PileView :pile="mockPile" variant="card" />
              <div class="space-y-4">
                <SheetView :sheet="mockSheet" variant="compact" />
                <SheetView :sheet="mockSheet" variant="card" />
              </div>
            </div>
          </section>

        </div>

        <!-- ATOMS TAB -->
        <div v-if="activeTab === 'atoms'" class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Panel header="Status Badges">
            <div class="flex flex-wrap gap-2">
              <Tag value="DRAFT" severity="secondary" />
              <Tag value="PENDING" severity="warn" />
              <Tag value="ACTIVE" severity="primary" />
              <Tag value="READY" severity="success" />
              <Tag value="FAILED" severity="danger" />
            </div>
          </Panel>
          <Panel header="Action Buttons">
            <div class="flex flex-wrap gap-2">
              <Button label="Primary" size="small" />
              <Button label="Secondary" severity="secondary" size="small" />
              <Button label="Outlined" outlined size="small" />
              <Button label="Text" text size="small" />
            </div>
          </Panel>
        </div>

      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Panel from 'primevue/panel';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import ProgressBar from 'primevue/progressbar';

// v24 Components
import ProjectView from '~/components/entities/Project/ProjectView.vue';
import QueueView from '~/components/entities/Queue/QueueView.vue';
import PileView from '~/components/entities/MaterialPile/PileView.vue';
import SheetView from '~/components/entities/Sheet/SheetView.vue';
import LineageBreadcrumbs from '~/components/shared/LineageBreadcrumbs.vue';
import StatusTimeline from '~/components/entities/shared/StatusTimeline.vue';
import ThemeSwitcher from '~/components/ThemeSwitcher.vue';
import LanguageSwitcher from '~/components/LanguageSwitcher.vue';

// Factory imports
import {
  createMockProject,
  createMockQueue,
  createMockSheet,
  createMockPile,
  createMockCatalog
} from '~/test-data/factories.js';

const tabs = [
  { id: 'variants', label: 'Entity Variants' },
  { id: 'engines', label: 'Core Engines' },
  { id: 'atoms', label: 'UI Atoms' }
];

const activeTab = ref('variants');

// Mock Data
const mockProject = createMockProject();
const mockQueue = createMockQueue();
const mockSheet = createMockSheet();
const mockPile = createMockPile();
</script>