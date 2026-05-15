<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-4 rounded-panel border border-content-border bg-content p-5 shadow-card">
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
      <article v-for="row in activeRows" :key="row.key" class="flex flex-col gap-4 rounded-panel border border-content-border bg-content p-4 shadow-card">
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

    <section v-else-if="activeSection === 'primitives'" class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Panel :header="$t('uiLab.primitives.identity')">
          <div class="flex flex-col gap-4">
            <IdentityBlock :entity="primitiveEntity" variant="header" :fields="['slug', 'serial', 'reference']" />
            <IdentityBlock :entity="primitiveEntity" variant="compact" :fields="['slug', 'serial']" />
            <IdentityBlock :entity="primitiveEntity" variant="inline" icon="pi pi-box" />
          </div>
      </Panel>

      <Panel :header="$t('uiLab.primitives.status')">
          <div class="flex flex-col gap-4">
            <EntityStatus :entity="primitiveEntity" entity-type="queue" variant="inline" />
            <EntityStatus :entity="primitiveEntity" entity-type="queue" variant="full" :show-actions="false" />
            <StatusHistory entity-type="queue" :entity="primitiveEntity" :mock-events="mockHistory" />
          </div>
      </Panel>

      <Panel :header="$t('uiLab.primitives.trace')">
          <TraceChain :entity="primitiveEntity" />
      </Panel>

      <Panel :header="$t('uiLab.primitives.data')">
          <div class="flex flex-col gap-4">
            <SpecsBlock :entity="sheetEntity" />
            <DataBlock :entity="pileEntity" :fields="pileFields" />
          </div>
      </Panel>
    </section>

    <section v-else class="flex flex-col gap-4">
      <Panel :header="$t('uiLab.contract.title')">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div class="flex flex-col">
              <small class="text-muted-color">{{ $t('uiLab.contract.entities') }}</small>
              <span>{{ rows.length }}</span>
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
import TraceChain from '~/components/shared/links/TraceChain.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import {
  DESIGN_SYSTEM_GROUPS,
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
const rows = createDesignSystemDemoRows();
const manifestIssues = validateDesignSystemManifest();

const activeSection = ref(groups[0]?.id || 'contract');
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
