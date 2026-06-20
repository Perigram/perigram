<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-col gap-2 border-b border-content-border pb-4">
      <h1 class="m-0 text-2xl font-semibold">{{ $t('uiConstructor.title') }}</h1>
      <p class="m-0 text-muted-color">{{ $t('uiConstructor.subtitle') }}</p>
    </header>

    <Panel :header="$t('uiConstructor.contractMatrix')">
      <DataTable :value="surfaceRows" size="small">
        <Column field="surface" :header="$t('uiConstructor.surface')" />
        <Column field="preview" :header="$t('uiConstructor.preview')" />
        <Column field="dataDisplay" :header="$t('uiConstructor.dataDisplay')" />
        <Column field="fieldGroups" :header="$t('uiConstructor.fieldGroups')" />
        <Column field="fieldCount" :header="$t('uiConstructor.fieldCount')" />
      </DataTable>
    </Panel>

    <section class="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Panel :header="$t('uiConstructor.coreCard')">
        <EntityCard :entity="queue" entity-type="queue" surface="card" variant="card">
          <EntitySurfaceContent :entity="queue" entity-type="queue" surface="card" />
        </EntityCard>
      </Panel>

      <Panel :header="$t('uiConstructor.appExtension')">
        <EntityCard
          :entity="queue"
          entity-type="queue"
          surface="card"
          variant="card"
          :display-extensions="appExtensions"
          :display-overrides="appSurfaceOverride"
        >
          <EntitySurfaceContent
            :entity="queue"
            entity-type="queue"
            surface="card"
            :display-extensions="appExtensions"
            :display-overrides="appSurfaceOverride"
          />
        </EntityCard>
      </Panel>

      <Panel :header="$t('uiConstructor.tightOverride')">
        <div class="flex flex-col gap-4">
          <EntityCard
            :entity="queue"
            entity-type="queue"
            surface="compact"
            variant="compact"
            :display-overrides="tightSurfaceOverride"
          >
            <template #compact-content>
              <EntitySurfaceContent
                :entity="queue"
                entity-type="queue"
                surface="compact"
                :display-overrides="tightSurfaceOverride"
              />
            </template>
          </EntityCard>
          <EntityCard :entity="material" entity-type="material" surface="inline" variant="inline">
            <template #expanded>
              <EntitySurfaceContent :entity="material" entity-type="material" surface="card" />
            </template>
          </EntityCard>
        </div>
      </Panel>
    </section>

    <Panel :header="$t('uiConstructor.strictness')">
      <div class="flex flex-col gap-4">
        <Message severity="info">{{ $t('uiConstructor.strictnessNote') }}</Message>
        <DataTable :value="strictRows" size="small">
          <Column field="path" :header="$t('uiConstructor.path')" />
          <Column :header="$t('uiConstructor.result')">
            <template #body="{ data }">
              <Tag
                :value="$t(data.allowed ? 'uiConstructor.allowed' : 'uiConstructor.rejected')"
                :severity="data.allowed ? 'success' : 'danger'"
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
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import { createMockMaterial, createMockQueue, createMockUser } from '~/test-data/factories.js';
import { useAuthStore } from '~/stores/auth';
import { findEntityFieldPolicy } from '~/shared/entity-field-access.js';
import { resolveEntityDisplayContract } from '~/utils/entity-display-contract.js';

const queue = createMockQueue();
const material = createMockMaterial();
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
        { path: 'summary.totalArea', i18n: 'common.area', suffix: ' m²', display: 'area', priority: 10 },
        { path: 'data.job.items.length', i18n: 'queue.jobItems', display: 'count', priority: 20 }
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

const appSurfaceOverride = {
  fieldGroups: ['appPlanning'],
  preview: 'none',
  status: 'hidden',
  trace: 'hidden'
};

const tightSurfaceOverride = {
  fieldGroups: ['summary'],
  fieldLimit: 1,
  dataDisplay: 'compact',
  preview: 'none',
  relations: 'none'
};

const surfaceRows = computed(() => ['inline', 'compact', 'card', 'detail'].map(surface => {
  const resolved = resolveEntityDisplayContract({ entityType: 'queue', surface });
  return {
    surface,
    preview: resolved.surfaceContract.preview,
    dataDisplay: resolved.surfaceContract.dataDisplay,
    fieldGroups: resolved.surfaceContract.fieldGroups.join(', '),
    fieldCount: resolved.fields.length
  };
}));

const strictRows = computed(() => [
  strictRow('queue', 'summary.totalArea'),
  strictRow('queue', 'data.job.items.length'),
  strictRow('queue', 'data.secretMargin'),
  strictRow('queue', 'data.job.internalCost')
]);

function strictRow(entityType, path) {
  const allowed = Boolean(findEntityFieldPolicy(entityType, path));
  return {
    path,
    allowed,
    reasonKey: allowed
      ? 'uiConstructor.policyReason'
      : 'uiConstructor.missingPolicyReason'
  };
}
</script>
