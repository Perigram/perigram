<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-col gap-3 border-b border-content-border pb-4">
      <div class="flex flex-col gap-1">
        <h1 class="m-0 text-2xl font-semibold">{{ $t('uiConstructor.title') }}</h1>
        <p class="m-0 max-w-5xl text-muted-color">{{ $t('uiConstructor.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Tag :value="$t('uiConstructor.coreContract')" severity="secondary" />
        <Tag :value="$t('uiConstructor.appExtension')" severity="info" />
        <Tag :value="$t('uiConstructor.strictness')" severity="warn" />
      </div>
    </header>

    <section class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(24rem,0.8fr)]">
      <Panel :header="$t('uiConstructor.surfaceMatrix')">
        <DataTable :value="surfaceRows" size="small" responsive-layout="scroll">
          <Column field="surface" :header="$t('uiConstructor.surface')" />
          <Column field="preview" :header="$t('uiConstructor.preview')" />
          <Column field="dataDisplay" :header="$t('uiConstructor.dataDisplay')" />
          <Column field="status" :header="$t('uiConstructor.status')" />
          <Column field="trace" :header="$t('uiConstructor.trace')" />
          <Column :header="$t('uiConstructor.fieldGroups')">
            <template #body="{ data }">
              <div class="flex flex-wrap gap-1">
                <Tag
                  v-for="group in data.fieldGroups"
                  :key="group"
                  :value="group"
                  severity="secondary"
                  size="small"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </Panel>

      <Panel :header="$t('uiConstructor.entityInput')">
        <DataTable :value="entityRows" size="small">
          <Column field="label" :header="$t('uiConstructor.path')" />
          <Column field="value" :header="$t('uiConstructor.value')" />
        </DataTable>
      </Panel>
    </section>

    <section class="grid grid-cols-1 gap-4 2xl:grid-cols-3">
      <Panel
        v-for="scenario in scenarios"
        :key="scenario.id"
        :header="$t(scenario.titleKey)"
      >
        <div class="flex h-full flex-col gap-4">
          <div class="flex flex-wrap gap-2">
            <Tag :value="scenario.surface" severity="secondary" size="small" />
            <Tag :value="scenario.display.surfaceContract.dataDisplay" severity="info" size="small" />
            <Tag :value="scenario.display.surfaceContract.preview" severity="secondary" size="small" />
          </div>

          <EntityCard
            :entity="queue"
            entity-type="queue"
            :surface="scenario.surface"
            :variant="scenario.variant"
            :display-extensions="scenario.extensions"
            :display-overrides="scenario.overrides"
          >
            <template v-if="scenario.variant === 'compact'" #compact-content>
              <EntitySurfaceContent
                :entity="queue"
                entity-type="queue"
                :surface="scenario.surface"
                :display-extensions="scenario.extensions"
                :display-overrides="scenario.overrides"
              />
            </template>
            <EntitySurfaceContent
              v-else
              :entity="queue"
              entity-type="queue"
              :surface="scenario.surface"
              :display-extensions="scenario.extensions"
              :display-overrides="scenario.overrides"
            />
          </EntityCard>

          <DataTable :value="scenario.fieldRows" size="small" responsive-layout="scroll">
            <Column field="group" :header="$t('uiConstructor.group')" />
            <Column field="path" :header="$t('uiConstructor.path')" />
            <Column field="display" :header="$t('uiConstructor.display')" />
            <Column :header="$t('uiConstructor.policy')">
              <template #body="{ data }">
                <Tag
                  :value="$t(data.allowed ? 'uiConstructor.allowed' : 'uiConstructor.rejected')"
                  :severity="data.allowed ? 'success' : 'danger'"
                  size="small"
                />
              </template>
            </Column>
          </DataTable>
        </div>
      </Panel>
    </section>

    <section class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Panel :header="$t('uiConstructor.strictness')">
        <div class="flex flex-col gap-4">
          <Message severity="warn">{{ $t('uiConstructor.strictnessNote') }}</Message>
          <DataTable :value="strictRows" size="small" responsive-layout="scroll">
            <Column field="path" :header="$t('uiConstructor.path')" />
            <Column :header="$t('uiConstructor.result')">
              <template #body="{ data }">
                <Tag
                  :value="$t(data.allowed ? 'uiConstructor.allowed' : 'uiConstructor.rejected')"
                  :severity="data.allowed ? 'success' : 'danger'"
                  size="small"
                />
              </template>
            </Column>
            <Column :header="$t('uiConstructor.reason')">
              <template #body="{ data }">
                {{ $t(data.reasonKey) }}
              </template>
            </Column>
          </DataTable>
        </div>
      </Panel>

      <Panel :header="$t('uiConstructor.filteredRender')">
        <div class="flex flex-col gap-4">
          <DataBlock entity-type="queue" :entity="queue" :fields="unsafeFields" />
          <DataTable :value="unsafeFields" size="small" responsive-layout="scroll">
            <Column field="path" :header="$t('uiConstructor.requestedField')" />
            <Column :header="$t('uiConstructor.policy')">
              <template #body="{ data }">
                <Tag
                  :value="$t(fieldAllowed(data) ? 'uiConstructor.allowed' : 'uiConstructor.rejected')"
                  :severity="fieldAllowed(data) ? 'success' : 'danger'"
                  size="small"
                />
              </template>
            </Column>
          </DataTable>
        </div>
      </Panel>
    </section>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'ui-lab-layout' });

import { computed } from 'vue';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import { createMockQueue, createMockUser } from '~/test-data/factories.js';
import { useAuthStore } from '~/stores/auth';
import { findEntityFieldPolicy } from '~/shared/entity-field-access.js';
import { resolveDataPath } from '~/utils/data-display.js';
import { resolveEntityDisplayContract } from '~/utils/entity-display-contract.js';

const queue = createMockQueue({
  data: {
    queueNumber: 'Q-2406',
    job: {
      items: [
        { id: 'cassette-a', quantity: 4 },
        { id: 'cassette-b', quantity: 2 }
      ],
      materialPool: [{ type: 'PILE', id: 'pile-demo', available: 6 }]
    },
    physicalOutputs: [{ entityType: 'cassetteInstance', id: 'instance-demo' }]
  },
  summary: {
    runCount: 3,
    sheetCount: 2,
    totalArea: 14.8
  }
});

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

const appExtensions = {
  fieldGroups: {
    queue: {
      appPlanning: [
        { path: 'data.queueNumber', i18n: 'queue.name', display: 'code', priority: 5 },
        { path: 'summary.totalArea', i18n: 'common.area', suffix: ' m²', display: 'area', priority: 10 },
        { path: 'data.job.items.length', i18n: 'queue.jobItems', display: 'count', priority: 20 }
      ],
      appUnsafe: [
        { path: 'data.secretMargin', i18n: 'common.metadata', display: 'money', priority: 10 },
        { path: 'data.job.internalCost', i18n: 'common.metadata', display: 'money', priority: 20 }
      ]
    }
  },
  surfaces: {
    queue: {
      surfaces: {
        card: {
          preview: 'none',
          fieldGroups: ['appPlanning'],
          dataDisplay: 'grid',
          relations: 'none',
          actions: 'none',
          status: 'hidden',
          trace: 'hidden'
        }
      }
    }
  }
};

const compactOverride = {
  fieldGroups: ['summary'],
  fieldLimit: 1,
  dataDisplay: 'compact',
  preview: 'none',
  relations: 'none',
  trace: 'hidden'
};

const productionOverride = {
  fieldGroups: ['summary', 'production'],
  dataDisplay: 'sectioned',
  preview: 'none',
  relations: 'inlineRefs',
  actions: 'toolbar'
};

const unsafeFields = [
  { path: 'summary.totalArea', i18n: 'common.area', suffix: ' m²' },
  { path: 'data.job.items.length', i18n: 'queue.jobItems' },
  { path: 'data.secretMargin', i18n: 'common.metadata', prefix: '$' },
  { path: 'data.job.internalCost', i18n: 'common.metadata', prefix: '$' }
];

const scenarioDefs = [
  {
    id: 'core',
    titleKey: 'uiConstructor.coreCard',
    surface: 'card',
    variant: 'card'
  },
  {
    id: 'app',
    titleKey: 'uiConstructor.appExtension',
    surface: 'card',
    variant: 'card',
    extensions: appExtensions,
    overrides: { fieldGroups: ['appPlanning'], preview: 'none', status: 'hidden', trace: 'hidden' }
  },
  {
    id: 'compact',
    titleKey: 'uiConstructor.tightOverride',
    surface: 'compact',
    variant: 'compact',
    overrides: compactOverride
  },
  {
    id: 'production',
    titleKey: 'uiConstructor.productionOverride',
    surface: 'detail',
    variant: 'card',
    overrides: productionOverride
  }
];

const scenarios = computed(() => scenarioDefs.map(definition => {
  const display = resolveEntityDisplayContract({
    entityType: 'queue',
    surface: definition.surface,
    extensions: definition.extensions,
    overrides: definition.overrides
  });

  return {
    ...definition,
    display,
    fieldRows: display.fields.map(field => ({
      group: field.group,
      path: field.path,
      display: field.display || 'text',
      allowed: fieldAllowed(field)
    }))
  };
}));

const surfaceRows = computed(() => ['inline', 'compact', 'card', 'detail'].map(surface => {
  const resolved = resolveEntityDisplayContract({ entityType: 'queue', surface });
  return {
    surface,
    preview: resolved.surfaceContract.preview,
    dataDisplay: resolved.surfaceContract.dataDisplay,
    status: resolved.surfaceContract.status,
    trace: resolved.surfaceContract.trace,
    fieldGroups: resolved.surfaceContract.fieldGroups
  };
}));

const entityRows = computed(() => [
  entityRow('data.queueNumber'),
  entityRow('data.job.items.length'),
  entityRow('summary.runCount'),
  entityRow('summary.sheetCount'),
  entityRow('summary.totalArea'),
  entityRow('data.job.materialPool')
]);

const strictRows = computed(() => unsafeFields.map(field => {
  const allowed = fieldAllowed(field);
  return {
    path: field.path,
    allowed,
    reasonKey: allowed
      ? 'uiConstructor.policyReason'
      : 'uiConstructor.missingPolicyReason'
  };
}));

function entityRow(path) {
  const value = resolveDataPath(queue, path);
  return {
    label: path,
    value: Array.isArray(value) ? String(value.length) : String(value ?? '')
  };
}

function fieldAllowed(field) {
  return Boolean(findEntityFieldPolicy('queue', field.path));
}
</script>
