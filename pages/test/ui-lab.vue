<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-4 rounded-panel border border-content-border bg-content p-5 [box-shadow:var(--ck-shadow-card)]">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 class="m-0 text-2xl font-semibold">{{ $t('uiLab.title') }}</h1>
          <p class="m-0 text-muted-color">{{ $t('uiLab.subtitle') }}</p>
        </div>
        <div class="flex gap-2">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <Button
          v-for="group in groups"
          :key="group.id"
          :label="$t(group.labelKey)"
          :severity="activeSection === group.id ? 'primary' : 'secondary'"
          size="small"
          @click="activeSection = group.id"
        />
        <Button
          :label="$t('uiLab.sections.primitives')"
          :severity="activeSection === 'primitives' ? 'primary' : 'secondary'"
          size="small"
          @click="activeSection = 'primitives'"
        />
        <Button
          :label="$t('uiLab.sections.contract')"
          :severity="activeSection === 'contract' ? 'primary' : 'secondary'"
          size="small"
          @click="activeSection = 'contract'"
        />
      </div>
    </header>

    <section v-if="activeGroup" class="flex flex-col gap-10">
      <article v-for="row in activeRows" :key="row.key" class="flex flex-col gap-4 rounded-panel border border-content-border bg-content p-4 [box-shadow:var(--ck-shadow-card)]">
        <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 class="m-0 text-base font-semibold">{{ $t(row.labelKey) }}</h2>
            <small class="text-muted-color">{{ row.entityType }} · {{ row.propName }}</small>
          </div>
          <div class="flex flex-wrap gap-2">
            <Tag :value="$t(`uiLab.statusPolicy.${row.status}`)" severity="secondary" />
            <Tag :value="row.trace ? $t('uiLab.tracePolicy.enabled') : $t('uiLab.tracePolicy.hidden')" severity="secondary" />
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,20rem)_minmax(0,1fr)]">
          <div class="flex flex-col gap-2">
            <small class="text-muted-color">{{ $t('uiLab.variants.card') }}</small>
            <component :is="row.component" v-bind="row.props" variant="card" />
          </div>
          <div class="flex flex-col gap-2">
            <small class="text-muted-color">{{ $t('uiLab.variants.compact') }}</small>
            <component :is="row.component" v-bind="row.props" variant="compact" />
          </div>
          <div class="flex flex-col gap-2">
            <small class="text-muted-color">{{ $t('uiLab.variants.inline') }}</small>
            <div class="flex min-h-12 items-center">
              <component :is="row.component" v-bind="row.props" variant="inline" />
            </div>
          </div>
        </div>
      </article>
    </section>

    <section v-else-if="activeSection === 'primitives'" class="flex flex-col gap-6">
      <Panel :header="$t('uiLab.primitives.contract')">
        <DataTable :value="primitiveRows" size="small">
          <Column field="key" :header="$t('uiLab.primitives.primitive')" />
          <Column field="kind" :header="$t('uiLab.primitives.kind')" />
          <Column field="componentPath" :header="$t('uiLab.primitives.componentPath')" />
          <Column field="docs" :header="$t('uiLab.contract.docs')" />
        </DataTable>
      </Panel>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel v-for="primitive in primitiveRows" :key="primitive.key" :header="primitive.key">
          <div class="flex flex-col gap-4">
            <small class="text-muted-color">{{ primitive.purpose }}</small>

            <template v-if="primitive.key === 'EntityCard'">
              <EntityCard :entity="primitiveEntity" entity-type="queue">
                <DataBlock :entity="primitiveEntity" :fields="queueFields" />
                <template #footer>
                  <Button :label="$t('common.open')" icon="pi pi-external-link" text size="small" />
                </template>
              </EntityCard>
            </template>

            <template v-else-if="primitive.key === 'EntityPage'">
              <EntityPage :entity="primitiveEntity" entity-type="queue">
                <template #info>
                  <small>{{ primitiveEntity.queueNumber }}</small>
                </template>
                <template #actions>
                  <Button :label="$t('common.update')" icon="pi pi-refresh" text size="small" />
                </template>
                <StateBlock :message="$t('uiLab.primitives.empty')" icon="pi pi-inbox" />
              </EntityPage>
            </template>

            <template v-else-if="primitive.key === 'IdentityBlock'">
            <IdentityBlock :entity="primitiveEntity" variant="header" :fields="['slug', 'serial', 'reference']" />
            <IdentityBlock :entity="primitiveEntity" variant="compact" :fields="['slug', 'serial']" />
            <IdentityBlock :entity="primitiveEntity" variant="inline" icon="pi pi-box" />
            </template>

            <template v-else-if="primitive.key === 'DataBlock'">
              <DataBlock :entity="pileEntity" :fields="pileFields" />
            </template>

            <template v-else-if="primitive.key === 'SpecsBlock'">
              <SpecsBlock :entity="sheetEntity" />
            </template>

            <template v-else-if="primitive.key === 'StatusBadge'">
              <div class="flex flex-wrap gap-2">
                <StatusBadge state="DRAFT" />
                <StatusBadge state="NESTING" />
                <StatusBadge state="COMPLETE" />
              </div>
            </template>

            <template v-else-if="primitive.key === 'EntityStatus'">
            <EntityStatus :entity="primitiveEntity" entity-type="queue" variant="inline" />
            <EntityStatus :entity="primitiveEntity" entity-type="queue" variant="full" :show-actions="false" />
            </template>

            <template v-else-if="primitive.key === 'StatusHistory'">
              <StatusHistory entity-type="queue" :entity="primitiveEntity" :mock-events="mockHistory" />
            </template>

            <template v-else-if="primitive.key === 'TraceLink'">
              <TraceLink type="project" :id="primitiveEntity.lineage.projectId" label="Downtown Complex" slug="downtown-complex" />
            </template>

            <template v-else-if="primitive.key === 'TraceChain'">
              <TraceChain :entity="primitiveEntity" />
            </template>

            <template v-else-if="primitive.key === 'ActionToolbar'">
            <ActionToolbar :title="$t('uiLab.primitives.toolbar')" :subtitle="$t('uiLab.subtitle')">
              <template #actions>
                <Button :label="$t('common.create')" icon="pi pi-plus" size="small" />
              </template>
            </ActionToolbar>
            </template>

            <template v-else-if="primitive.key === 'ResponsiveGrid'">
              <ResponsiveGrid variant="dense">
                <StateBlock :message="$t('uiLab.primitives.empty')" icon="pi pi-inbox" />
                <StateBlock :message="$t('common.loading')" icon="pi pi-spin pi-spinner" />
              </ResponsiveGrid>
            </template>

            <template v-else-if="primitive.key === 'StateBlock'">
              <StateBlock :message="$t('uiLab.primitives.empty')" icon="pi pi-inbox" />
            </template>

            <template v-else-if="primitive.key === 'TableFrame'">
              <TableFrame>
                <DataTable :value="contractRows.slice(0, 2)" size="small">
                  <Column field="label" :header="$t('uiLab.contract.entity')" />
                  <Column field="status" :header="$t('uiLab.contract.status')" />
                </DataTable>
              </TableFrame>
            </template>

            <template v-else-if="primitive.key === 'StandardDialog'">
              <Button :label="$t('common.open')" icon="pi pi-window-maximize" @click="dialogVisible = true" />
              <StandardDialog
                v-model:visible="dialogVisible"
                :header="$t('uiLab.primitives.standardDialog')"
                :cancel-label="$t('common.cancel')"
                :save-label="$t('common.save')"
                show-default-footer
                @cancel="dialogVisible = false"
                @save="dialogVisible = false"
              >
                <DataBlock :entity="pileEntity" :fields="pileFields" />
              </StandardDialog>
            </template>

            <template v-else-if="primitive.key === 'StandardPage'">
              <StandardPage :title="$t('uiLab.primitives.standardPage')" :subtitle="$t('uiLab.subtitle')">
                <StateBlock :message="$t('uiLab.primitives.empty')" icon="pi pi-inbox" />
              </StandardPage>
            </template>
          </div>
        </Panel>
      </div>
    </section>

    <section v-else class="flex flex-col gap-4">
      <Panel :header="$t('uiLab.contract.title')">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div class="flex flex-col">
              <small class="text-muted-color">{{ $t('uiLab.contract.entities') }}</small>
              <span>{{ rows.length }}</span>
            </div>
            <div class="flex flex-col">
              <small class="text-muted-color">{{ $t('uiLab.contract.primitives') }}</small>
              <span>{{ primitiveRows.length }}</span>
            </div>
            <div class="flex flex-col">
              <small class="text-muted-color">{{ $t('uiLab.contract.variants') }}</small>
              <span>{{ variants.join(', ') }}</span>
            </div>
            <div class="flex flex-col">
              <small class="text-muted-color">{{ $t('uiLab.contract.issues') }}</small>
              <span>{{ manifestIssues.length }}</span>
            </div>
            <div class="flex flex-col">
              <small class="text-muted-color">{{ $t('uiLab.contract.source') }}</small>
              <span>utils/design-system.js</span>
            </div>
          </div>
      </Panel>

      <DataTable :value="contractRows" size="small">
        <Column field="label" :header="$t('uiLab.contract.entity')" />
        <Column field="entityType" :header="$t('uiLab.contract.entityType')" />
        <Column field="propName" :header="$t('uiLab.contract.prop')" />
        <Column field="status" :header="$t('uiLab.contract.status')" />
        <Column field="trace" :header="$t('uiLab.contract.trace')" />
        <Column field="docs" :header="$t('uiLab.contract.docs')" />
      </DataTable>

      <Message v-if="manifestIssues.length === 0" severity="success">
        {{ $t('uiLab.contract.ok') }}
      </Message>
      <Message v-for="issue in manifestIssues" v-else :key="`${issue.key}-${issue.issue}`" severity="warn">
        {{ issue.key }}: {{ issue.issue }}
      </Message>
    </section>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'ui-lab-layout' });

import { computed, ref } from 'vue';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Message from 'primevue/message';
import ThemeSwitcher from '~/components/ThemeSwitcher.vue';
import LanguageSwitcher from '~/components/LanguageSwitcher.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import {
  DESIGN_SYSTEM_GROUPS,
  DESIGN_SYSTEM_PRIMITIVES,
  DESIGN_SYSTEM_VARIANTS,
  createDesignSystemDemoRows,
  validateDesignSystemManifest
} from '~/utils/design-system.js';
import {
  createMockHistory,
  createMockPile,
  createMockQueue,
  createMockSheet
} from '~/test-data/factories.js';

const groups = DESIGN_SYSTEM_GROUPS;
const variants = DESIGN_SYSTEM_VARIANTS;
const PRIMITIVE_EXAMPLE_KEYS = [
  'EntityCard',
  'EntityPage',
  'IdentityBlock',
  'DataBlock',
  'SpecsBlock',
  'StatusBadge',
  'EntityStatus',
  'StatusHistory',
  'TraceLink',
  'TraceChain',
  'ActionToolbar',
  'ResponsiveGrid',
  'StateBlock',
  'TableFrame',
  'StandardDialog',
  'StandardPage'
];
const primitiveRows = DESIGN_SYSTEM_PRIMITIVES.map((primitive) => ({
  ...primitive,
  hasExample: PRIMITIVE_EXAMPLE_KEYS.includes(primitive.key),
  docs: primitive.docs.join(', ')
}));
const rows = createDesignSystemDemoRows();
const manifestIssues = validateDesignSystemManifest();

const activeSection = ref(groups[0]?.id || 'contract');
const dialogVisible = ref(false);
const activeGroup = computed(() => groups.find((group) => group.id === activeSection.value));
const activeRows = computed(() => rows.filter((row) => row.group === activeSection.value));

const primitiveEntity = createMockQueue();
const pileEntity = createMockPile();
const sheetEntity = createMockSheet();
const mockHistory = createMockHistory(['DRAFT', 'NESTING', 'READY']);

const pileFields = [
  { path: 'data.stock.total', i18n: 'piles.stockTotal' },
  { path: 'data.stock.used', i18n: 'piles.stockUsed' }
];

const queueFields = [
  { path: 'data.job.items.length', i18n: 'requisition.items' },
  { path: 'summary.runCount', i18n: 'queue.runs' },
  { path: 'summary.sheetCount', i18n: 'results.sheets' }
];

const contractRows = computed(() =>
  rows.map((row) => ({
    label: row.key,
    entityType: row.entityType,
    propName: row.propName,
    status: row.status,
    trace: row.trace ? 'yes' : 'no',
    docs: row.docs.join(', ')
  }))
);
</script>
