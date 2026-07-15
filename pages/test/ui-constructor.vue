<template>
  <EntityPage
    :entity="project"
    entity-type="project"
    :show-status="true"
  >
    <template #info>
      <span>{{ project.data.address }}</span>
      <Tag :value="`${queues.length} ${$t('queue.title')}`" severity="secondary" size="small" />
      <Tag :value="`${project.summary.totalArea} m²`" severity="info" size="small" />
    </template>

    <template #actions>
      <Button :label="$t('uiConstructor.runNesting')" icon="pi pi-play" size="small" />
      <Button :label="$t('uiConstructor.addQueue')" icon="pi pi-plus" severity="secondary" size="small" outlined />
      <Button :label="$t('uiConstructor.exportPack')" icon="pi pi-download" severity="secondary" size="small" text />
    </template>

    <WorkspaceLanes>
      <template #left>
        <ScrollablePanel :header="$t('uiConstructor.queues')" class="h-full">
          <div class="flex flex-col gap-3">
            <button
              v-for="queueItem in queues"
              :key="queueItem._id"
              type="button"
              :class="[
                'min-w-0 rounded-ui border bg-content p-0 text-left transition-colors',
                queueItem._id === activeQueueId
                  ? 'border-primary bg-primary-50'
                  : 'border-content-border hover:border-primary-200'
              ]"
              @click="activeQueueId = queueItem._id"
            >
              <QueueCard
                :queue="queueItem"
                variant="compact"
                :show-footer-actions="false"
                :show-delete="false"
                :expandable="false"
                density="compact"
              />
            </button>
          </div>
        </ScrollablePanel>
      </template>

      <ActionToolbar :title="$t('uiConstructor.productionBoard')" level="2">
        <template #subtitle>
          {{ activeQueue.identity.name }}
        </template>
        <template #actions>
          <Tag :value="$t('uiConstructor.contractSurface')" severity="secondary" />
          <Tag :value="$t('uiConstructor.appComposition')" severity="success" />
        </template>
      </ActionToolbar>

      <Panel :header="$t('uiConstructor.selectedQueue')">
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <QueueCard
            :queue="activeQueue"
            variant="card"
            :show-footer-actions="false"
            :show-delete="false"
          />
          <div class="flex min-w-0 flex-col gap-3">
            <div class="rounded-ui border border-content-border bg-surface-50 p-3">
              <EntitySurfaceContent
                :entity="activeQueue"
                entity-type="queue"
                surface="projectWorkspace"
                :display-extensions="projectWorkspaceExtensions"
              />
            </div>
            <div class="rounded-ui border border-content-border bg-content p-3">
              <div class="mb-2 text-sm font-medium">{{ $t('uiConstructor.guardrails') }}</div>
              <DataBlock entity-type="queue" :entity="activeQueue" :fields="guardedFields" />
              <Divider />
              <div class="flex flex-wrap gap-2">
                <Tag
                  v-for="field in guardedFields"
                  :key="field.path"
                  :value="field.path"
                  :severity="fieldAllowed(field) ? 'success' : 'danger'"
                  size="small"
                />
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <section class="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Panel :header="$t('uiConstructor.runs')">
          <div class="grid grid-cols-1 gap-3">
            <NestingRunCard
              v-for="run in runs"
              :key="run._id"
              :run="run"
              variant="compact"
              :sheet-designs="sheetDesigns"
              :is-chosen="run._id === chosenRunId"
            />
          </div>
        </Panel>

        <Panel :header="$t('uiConstructor.sheetOutputs')">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SheetDesignCard
              v-for="design in sheetDesigns"
              :key="design._id"
              :design="design"
              variant="compact"
            />
          </div>
        </Panel>
      </section>

      <template #right>
        <div class="flex flex-col gap-4">
          <Panel :header="$t('uiConstructor.projectFacts')">
            <EntitySurfaceContent
              :entity="project"
              entity-type="project"
              surface="projectDashboard"
              :display-extensions="projectWorkspaceExtensions"
            />
          </Panel>

          <Panel :header="$t('uiConstructor.materialSources')">
            <div class="grid grid-cols-1 gap-3">
              <PileCard :pile="materialPile" variant="compact" />
              <RemnantCard :remnant="remnant" variant="compact" />
              <WarehouseCard :warehouse="warehouse" variant="compact" />
            </div>
          </Panel>

          <Panel :header="$t('uiConstructor.surfaceRange')">
            <div class="flex flex-col gap-3">
              <div
                v-for="surface in surfaceRange"
                :key="surface.name"
                class="flex items-center justify-between gap-3 rounded-ui border border-content-border bg-content px-3 py-2"
              >
                <span class="min-w-0 truncate text-sm font-medium">{{ surface.name }}</span>
                <div class="flex shrink-0 gap-2">
                  <Tag :value="surface.preview" severity="secondary" size="small" />
                  <Tag :value="surface.display" severity="info" size="small" />
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </template>
    </WorkspaceLanes>
  </EntityPage>
</template>

<script setup>
definePageMeta({ layout: 'ui-lab-layout' });

import { computed, ref } from 'vue';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import PileCard from '~/components/entities/MaterialPile/PileCard.vue';
import NestingRunCard from '~/components/entities/NestingRun/NestingRunCard.vue';
import QueueCard from '~/components/entities/Queue/QueueCard.vue';
import RemnantCard from '~/components/entities/Remnant/RemnantCard.vue';
import SheetDesignCard from '~/components/entities/SheetDesign/SheetDesignCard.vue';
import WarehouseCard from '~/components/entities/Warehouse/WarehouseCard.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import ScrollablePanel from '~/components/shared/ScrollablePanel.vue';
import WorkspaceLanes from '~/components/shared/WorkspaceLanes.vue';
import { findEntityFieldPolicy } from '~/shared/entity-field-access.js';
import { useAuthStore } from '~/stores/auth';
import {
  MOCK_IDS,
  createMockNestingRun,
  createMockPile,
  createMockProject,
  createMockQueue,
  createMockRemnant,
  createMockSheetDesign,
  createMockUser,
  createMockWarehouse
} from '~/test-data/factories.js';

const authStore = useAuthStore();
const demoUser = createMockUser();

if (!authStore.isUserSet) {
  authStore.user = {
    ...demoUser.data,
    id: demoUser._id,
    userId: demoUser._id,
    organizationId: demoUser.lineage?.organizationId,
    memberships: demoUser.data?.memberships,
    permissions: demoUser.data?.permissions
  };
  authStore.isUserSet = true;
}

const project = createMockProject({
  identity: {
    uid: MOCK_IDS.projectId,
    name: 'Downtown Complex / Production Workspace',
    slug: 'downtown-complex'
  },
  status: {
    state: 'ACTIVE',
    timestamp: new Date(),
    lifecycle: { actors: [], attachments: {}, data: {} }
  },
  summary: { queueCount: 3, totalArea: 150.5, outputSheets: 18 }
});

const queues = [
  createMockQueue({
    _id: 'queue-demo-facade-a',
    identity: { uid: 'queue-demo-facade-a', name: 'Facade cassette batch A', slug: 'facade-cassette-batch-a' },
    data: {
      queueNumber: 'Q-2406-A',
      job: {
        items: [
          { id: 'cassette-a', type: 'PARAMETRIC', quantity: 14 },
          { id: 'cassette-b', type: 'PARAMETRIC', quantity: 8 }
        ],
        materialPool: [{ type: 'PILE', id: 'pile-demo-001', available: 42 }]
      },
      physicalOutputs: [{ entityType: 'cassetteInstance', id: 'cassette-instance-a' }]
    },
    summary: { runCount: 3, sheetCount: 9, totalArea: 62.4 }
  }),
  createMockQueue({
    _id: 'queue-demo-facade-b',
    identity: { uid: 'queue-demo-facade-b', name: 'Atrium return panels', slug: 'atrium-return-panels' },
    data: {
      queueNumber: 'Q-2406-B',
      job: {
        items: [{ id: 'cassette-c', type: 'PARAMETRIC', quantity: 18 }],
        materialPool: [{ type: 'REMNANT', id: 'remnant-demo-001', available: 7 }]
      }
    },
    summary: { runCount: 1, sheetCount: 4, totalArea: 28.7 }
  }),
  createMockQueue({
    _id: 'queue-demo-service',
    identity: { uid: 'queue-demo-service', name: 'Service core infill', slug: 'service-core-infill' },
    data: {
      queueNumber: 'Q-2406-C',
      job: {
        items: [{ id: 'cassette-d', type: 'PARAMETRIC', quantity: 11 }],
        materialPool: [{ type: 'PILE', id: 'pile-demo-001', available: 19 }]
      }
    },
    summary: { runCount: 2, sheetCount: 5, totalArea: 31.9 }
  })
];

const activeQueueId = ref(queues[0]._id);
const activeQueue = computed(() => queues.find(queue => queue._id === activeQueueId.value) || queues[0]);

const sheetDesigns = [
  createMockSheetDesign({
    _id: 'sheet-design-demo-a',
    identity: { uid: 'sheet-design-demo-a', name: 'ACP 4mm sheet A', serial: 'SD-2406-A' },
    lineage: { queueId: queues[0]._id, runId: 'run-demo-balanced', projectSlug: project.identity.slug },
    summary: { placedCount: 12, cassetteCount: 5 },
    data: {
      materialPool: [{ type: 'PILE', id: 'pile-demo-001' }],
      geometry: createMockSheetDesign().data.geometry
    }
  }),
  createMockSheetDesign({
    _id: 'sheet-design-demo-b',
    identity: { uid: 'sheet-design-demo-b', name: 'ACP 4mm sheet B', serial: 'SD-2406-B' },
    lineage: { queueId: queues[0]._id, runId: 'run-demo-balanced', projectSlug: project.identity.slug },
    summary: { placedCount: 10, cassetteCount: 4 },
    data: {
      materialPool: [{ type: 'REMNANT', id: 'remnant-demo-001' }],
      geometry: createMockSheetDesign().data.geometry
    }
  })
];

const runs = [
  createMockNestingRun({
    _id: 'run-demo-balanced',
    identity: { uid: 'run-demo-balanced', name: 'Balanced yield', slug: 'balanced-yield' },
    lineage: { projectId: project._id, queueId: queues[0]._id, projectSlug: project.identity.slug },
    data: {
      results: { efficiency: 93.8, sheetCount: 5, remnantArea: 0.8 },
      materialPool: [{ type: 'PILE', id: 'pile-demo-001', available: 42 }],
      sheetDesignIds: sheetDesigns.map(design => design._id)
    }
  }),
  createMockNestingRun({
    _id: 'run-demo-fast',
    identity: { uid: 'run-demo-fast', name: 'Fast setup', slug: 'fast-setup' },
    lineage: { projectId: project._id, queueId: queues[0]._id, projectSlug: project.identity.slug },
    data: {
      results: { efficiency: 88.1, sheetCount: 6, remnantArea: 1.7 },
      materialPool: [{ type: 'PILE', id: 'pile-demo-001', available: 34 }]
    }
  })
];
const chosenRunId = runs[0]._id;

const materialPile = createMockPile({
  identity: { uid: 'pile-demo-001', name: 'ACP silver 4mm', serial: 'P-101' },
  summary: { reservedSheets: 14 }
});
const remnant = createMockRemnant({
  identity: { uid: 'remnant-demo-001', name: 'Reusable corner offcut', serial: 'REM-17' }
});
const warehouse = createMockWarehouse({
  identity: { uid: MOCK_IDS.warehouseId, name: 'Main logistic hub', serial: 'WH-01', reference: 'A-03' }
});

const projectWorkspaceExtensions = {
  fieldGroups: {
    project: {
      projectDashboard: [
        { path: 'summary.queueCount', i18n: 'queue.title', display: 'count', priority: 10 },
        { path: 'summary.totalArea', i18n: 'common.area', suffix: ' m²', display: 'area', priority: 20 },
        { path: 'summary.outputSheets', i18n: 'results.sheets', display: 'count', priority: 30 }
      ]
    },
    queue: {
      projectWorkspace: [
        { path: 'data.queueNumber', i18n: 'queue.name', display: 'code', priority: 10 },
        { path: 'summary.totalArea', i18n: 'common.area', suffix: ' m²', display: 'area', priority: 20 },
        { path: 'data.job.items.length', i18n: 'queue.jobItems', display: 'count', priority: 30 },
        { path: 'summary.sheetCount', i18n: 'results.sheets', display: 'count', priority: 40 }
      ]
    }
  },
  surfaces: {
    project: {
      surfaces: {
        projectDashboard: {
          preview: 'none',
          dataDisplay: 'compact',
          fieldGroups: ['projectDashboard'],
          relations: 'none',
          actions: 'none',
          status: 'hidden',
          trace: 'hidden'
        }
      }
    },
    queue: {
      surfaces: {
        projectWorkspace: {
          preview: 'none',
          dataDisplay: 'sectioned',
          fieldGroups: ['projectWorkspace'],
          relations: 'inlineRefs',
          actions: 'toolbar',
          status: 'inline',
          trace: 'hidden'
        }
      }
    }
  }
};

const guardedFields = [
  { path: 'summary.totalArea', i18n: 'common.area', suffix: ' m²' },
  { path: 'data.job.items.length', i18n: 'queue.jobItems' },
  { path: 'data.secretMargin', i18n: 'common.metadata', prefix: '$' },
  { path: 'data.job.internalCost', i18n: 'common.metadata', prefix: '$' }
];

const surfaceRange = [
  { name: 'projectDashboard', preview: 'none', display: 'compact' },
  { name: 'projectWorkspace', preview: 'none', display: 'sectioned' },
  { name: 'card', preview: 'small', display: 'grid' },
  { name: 'detail', preview: 'large', display: 'sectioned' }
];

function fieldAllowed(field) {
  return Boolean(findEntityFieldPolicy('queue', field.path));
}
</script>
