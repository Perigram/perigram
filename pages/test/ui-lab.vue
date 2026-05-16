<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-4 rounded-panel border border-content-border bg-content p-5 [box-shadow:var(--ck-shadow-card)]">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 class="m-0 text-2xl font-semibold">{{ $t('uiLab.title') }}</h1>
          <p class="m-0 text-muted-color">{{ $t('uiLab.subtitle') }}</p>
        </div>
        <div class="flex gap-2">
          <Button icon="pi pi-download" :label="$t('uiLab.feedback.export')" severity="secondary" size="small" @click="exportFeedback" />
          <Button icon="pi pi-trash" :label="$t('common.reset')" severity="danger" outlined size="small" @click="resetFeedback" />
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
      <Message v-if="reviewError" severity="warn">
        {{ reviewError }}
      </Message>
      <Message v-else-if="reviewLoading" severity="info">
        {{ $t('common.loading') }}
      </Message>

      <article v-for="row in activeRowsWithModels" :key="row.key" class="flex flex-col gap-4 rounded-panel border border-content-border bg-content p-4 [box-shadow:var(--ck-shadow-card)]">
        <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 class="m-0 text-base font-semibold">{{ $t(row.labelKey) }}</h2>
            <small class="text-muted-color">{{ row.entityType }} · {{ row.propName }}</small>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Tag :value="$t(`uiLab.statusPolicy.${row.status}`)" severity="secondary" />
            <Tag :value="row.trace ? $t('uiLab.tracePolicy.enabled') : $t('uiLab.tracePolicy.hidden')" severity="secondary" />
            <Button
              :icon="reviewExpanded(row.key) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
              :label="$t('uiLab.review.toggle')"
              severity="secondary"
              text
              size="small"
              @click="toggleReview(row.key)"
            />
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

        <div class="grid grid-cols-1 gap-3 border-t border-content-border pt-4 md:grid-cols-[12rem_1fr]">
          <Select
            v-model="feedbackFor('entity', row.key).decision"
            :options="feedbackDecisionOptions"
            optionLabel="label"
            optionValue="value"
          />
          <Textarea
            v-model="feedbackFor('entity', row.key).note"
            :placeholder="$t('uiLab.feedback.placeholder')"
            rows="2"
            class="w-full"
            auto-resize
          />
        </div>

        <Panel v-if="reviewExpanded(row.key) && row.model" :header="$t('uiLab.review.title')">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div class="flex flex-col gap-1">
                <small class="text-muted-color">{{ $t('uiLab.review.collection') }}</small>
                <strong>{{ row.model.collection }}</strong>
              </div>
              <div class="flex flex-col gap-1">
                <small class="text-muted-color">{{ $t('uiLab.review.fields') }}</small>
                <strong>{{ row.model.fields?.length || 0 }}</strong>
              </div>
              <div class="flex flex-col gap-1">
                <small class="text-muted-color">{{ $t('uiLab.review.source') }}</small>
                <strong>{{ row.model.feature }}</strong>
              </div>
              <div class="flex flex-col gap-1">
                <small class="text-muted-color">{{ $t('uiLab.review.issues') }}</small>
                <strong>{{ row.model.issues?.length || 0 }}</strong>
              </div>
            </div>

            <Message v-if="row.model.issues?.length" severity="warn" class="mt-4">
              {{ row.model.issues.map((issue) => `${issue.field}: ${issue.issue}`).join(' · ') }}
            </Message>

            <div class="mt-4 overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr>
                    <th class="text-left py-2">{{ $t('admin.dataModelReview.field') }}</th>
                    <th class="text-left py-2">{{ $t('common.type') }}</th>
                    <th class="text-left py-2">{{ $t('uiLab.review.flags') }}</th>
                    <th class="text-left py-2">{{ $t('admin.dataModelReview.decision') }}</th>
                    <th class="text-left py-2">{{ $t('admin.dataModelReview.target') }}</th>
                    <th class="text-left py-2">{{ $t('common.note') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="field in row.model.fields || []" :key="field.name" class="border-t border-content-border align-top">
                    <td class="py-3 pr-3 font-mono">{{ field.name }}</td>
                    <td class="py-3 pr-3">{{ field.type }}</td>
                    <td class="py-3 pr-3">
                      <div class="flex flex-wrap gap-2">
                        <Tag
                          v-for="issue in field.issues || []"
                          :key="issue"
                          :value="issue"
                          severity="warn"
                          size="small"
                        />
                      </div>
                    </td>
                    <td class="py-3 pr-3 min-w-48">
                      <Select
                        v-model="reviewFieldFeedbackFor(row, field).decision"
                        :options="reviewDecisionOptions"
                        optionLabel="label"
                        optionValue="value"
                        class="w-full"
                      />
                    </td>
                    <td class="py-3 pr-3 min-w-44">
                      <InputText
                        v-if="reviewFieldFeedbackFor(row, field).decision === 'rename' || reviewFieldFeedbackFor(row, field).decision === 'move'"
                        v-model="reviewFieldFeedbackFor(row, field).target"
                        :placeholder="$t('uiLab.review.targetPlaceholder')"
                        class="w-full"
                      />
                    </td>
                    <td class="py-3 min-w-64">
                      <Textarea
                        v-model="reviewFieldFeedbackFor(row, field).note"
                        :placeholder="$t('uiLab.feedback.placeholder')"
                        rows="2"
                        class="w-full"
                        auto-resize
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
        </Panel>
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

            <div class="grid grid-cols-1 gap-3 border-t border-content-border pt-4 md:grid-cols-[12rem_1fr]">
              <Select
                v-model="feedbackFor('primitive', primitive.key).decision"
                :options="feedbackDecisionOptions"
                optionLabel="label"
                optionValue="value"
              />
              <Textarea
                v-model="feedbackFor('primitive', primitive.key).note"
                :placeholder="$t('uiLab.feedback.placeholder')"
                rows="2"
                class="w-full"
                auto-resize
              />
            </div>
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

import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import ThemeSwitcher from '~/components/ThemeSwitcher.vue';
import LanguageSwitcher from '~/components/LanguageSwitcher.vue';
import frameworkManifest from '~/framework.manifest.json';
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
  createDesignSystemDemoRows,
  validateDesignSystemManifest
} from '~/utils/design-system.js';
import {
  DESIGN_SYSTEM_GROUPS,
  DESIGN_SYSTEM_PRIMITIVES,
  DESIGN_SYSTEM_VARIANTS
} from '~/utils/design-system-contract.js';
import {
  MOCK_IDS,
  createMockHistory,
  createMockPile,
  createMockQueue,
  createMockSheet
} from '~/test-data/factories.js';
import { useEntityStore } from '~/stores/entities';

const groups = DESIGN_SYSTEM_GROUPS;
const variants = DESIGN_SYSTEM_VARIANTS;
const FEEDBACK_STORAGE_KEY = 'cutkit:ui-lab-feedback:v1';
const { t } = useI18n();
const ENTITY_COLLECTION_BY_TYPE = new Map((frameworkManifest.entities || []).map(entity => [entity.type, entity.collection]));
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
const entityStore = useEntityStore();
const feedback = ref(loadFeedback());
const reviewModels = ref([]);
const reviewLoading = ref(false);
const reviewError = ref(null);
const expandedReviews = ref(new Set(rows.map(row => row.key)));

const activeSection = ref(groups[0]?.id || 'contract');
const dialogVisible = ref(false);
const activeGroup = computed(() => groups.find((group) => group.id === activeSection.value));
const activeRows = computed(() => rows.filter((row) => row.group === activeSection.value));
const activeRowsWithModels = computed(() => activeRows.value.map((row) => ({
  ...row,
  model: reviewModelForRow(row)
})));

const primitiveEntity = createMockQueue();
const pileEntity = createMockPile();
const sheetEntity = createMockSheet();
const mockHistory = createMockHistory(['DRAFT', 'NESTING', 'READY']);

seedDemoTraceEntities();

const pileFields = [
  { path: 'data.stock.total', i18n: 'piles.stockTotal' },
  { path: 'data.stock.used', i18n: 'piles.stockUsed' }
];

const queueFields = [
  { path: 'data.job.items.length', i18n: 'requisition.items' },
  { path: 'summary.runCount', i18n: 'queue.runs' },
  { path: 'summary.sheetCount', i18n: 'results.sheets' }
];

const feedbackDecisionOptions = computed(() => [
  { label: t('uiLab.feedback.decisions.unchecked'), value: 'unchecked' },
  { label: t('uiLab.feedback.decisions.fix'), value: 'fix' },
  { label: t('uiLab.feedback.decisions.improve'), value: 'improve' },
  { label: t('uiLab.feedback.decisions.ok'), value: 'ok' }
]);

const reviewDecisionOptions = computed(() => [
  { label: t('admin.dataModelReview.decisions.unchecked'), value: 'unchecked' },
  { label: t('admin.dataModelReview.decisions.keep'), value: 'keep' },
  { label: t('admin.dataModelReview.decisions.remove'), value: 'remove' },
  { label: t('admin.dataModelReview.decisions.rename'), value: 'rename' },
  { label: t('admin.dataModelReview.decisions.move'), value: 'move' },
  { label: t('admin.dataModelReview.decisions.investigate'), value: 'investigate' }
]);

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

function feedbackKey(scope, key) {
  return `${scope}:${key}`;
}

function feedbackFor(scope, key, meta = {}) {
  const id = feedbackKey(scope, key);
  if (!feedback.value[id]) {
    feedback.value[id] = { scope, key, decision: 'unchecked', note: '' };
  }
  if (meta.component && !feedback.value[id].component) feedback.value[id].component = meta.component;
  if (meta.field && !feedback.value[id].field) feedback.value[id].field = meta.field;
  return feedback.value[id];
}

function reviewModelForRow(row) {
  const collection = ENTITY_COLLECTION_BY_TYPE.get(row.entityType);
  if (!collection) return null;
  return reviewModels.value.find(model => model.collection === collection) || null;
}

function reviewFieldFeedbackFor(row, field) {
  return feedbackFor('model', `${row.key}:${field.name}`, {
    component: row.key,
    field: field.name
  });
}

function reviewExpanded(key) {
  return expandedReviews.value.has(key);
}

function toggleReview(key) {
  const next = new Set(expandedReviews.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedReviews.value = next;
}

function loadFeedback() {
  if (!import.meta.client) return {};
  const saved = localStorage.getItem(FEEDBACK_STORAGE_KEY);
  if (!saved) return {};
  try {
    return JSON.parse(saved);
  } catch {
    return {};
  }
}

async function loadReviewModels() {
  reviewLoading.value = true;
  reviewError.value = null;
  try {
    const result = await $fetch('/api/debug/data-models');
    if (!result.success) throw new Error(result.error || t('admin.dataModelReview.loadFailed'));
    reviewModels.value = result.models || [];
  } catch (err) {
    reviewError.value = err.data?.message || err.message || t('admin.dataModelReview.loadFailed');
  } finally {
    reviewLoading.value = false;
  }
}

function buildFeedbackMarkdown() {
  const rows = Object.values(feedback.value)
    .filter(item => (item.decision && item.decision !== 'unchecked') || item.note);

  const lines = [
    t('uiLab.feedback.planTitle'),
    '',
    `${t('admin.dataModelReview.generated')}: ${new Date().toISOString()}`,
    '',
    `| ${t('uiLab.feedback.scope')} | ${t('uiLab.feedback.component')} | ${t('admin.dataModelReview.decision')} | ${t('common.note')} |`,
    '|---|---|---|---|'
  ];

  for (const row of rows.filter(item => item.scope !== 'model')) {
    lines.push(`| ${row.scope} | \`${row.component || row.key}\` | ${row.decision || 'unchecked'} | ${(row.note || '').replace(/\n/g, ' ')} |`);
  }

  const modelRows = rows.filter(item => item.scope === 'model');
  if (modelRows.length) {
    lines.push(
      '',
      t('uiLab.review.planTitle'),
      '',
      `| ${t('uiLab.feedback.component')} | ${t('admin.dataModelReview.field')} | ${t('admin.dataModelReview.decision')} | ${t('admin.dataModelReview.target')} | ${t('common.note')} |`,
      '|---|---|---|---|---|'
    );
    for (const row of modelRows) {
      lines.push(`| \`${row.component || row.key}\` | \`${row.field || row.key}\` | ${row.decision || 'unchecked'} | ${row.target || ''} | ${(row.note || '').replace(/\n/g, ' ')} |`);
    }
  }

  return lines.join('\n');
}

function exportFeedback() {
  const blob = new Blob([buildFeedbackMarkdown()], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ui-lab-feedback.md';
  link.click();
  URL.revokeObjectURL(url);
}

function resetFeedback() {
  feedback.value = {};
  if (import.meta.client) localStorage.removeItem(FEEDBACK_STORAGE_KEY);
}

function seedDemoTraceEntities() {
  const demoEntities = [
    { type: 'organization', id: MOCK_IDS.organizationId, name: 'Acme Manufacturing' },
    { type: 'project', id: MOCK_IDS.projectId, name: 'Downtown Complex', slug: 'downtown-complex' },
    { type: 'queue', id: MOCK_IDS.queueId, name: 'Morning Production Run' },
    { type: 'warehouse', id: MOCK_IDS.warehouseId, name: 'Main Logistic Hub' },
    { type: 'catalog', id: MOCK_IDS.catalogId, name: 'Standard Metals' }
  ];

  for (const item of demoEntities) {
    if (!entityStore.registry[item.type]) entityStore.registry[item.type] = {};
    entityStore.registry[item.type][item.id] = {
      _id: item.id,
      id: item.id,
      identity: { uid: item.id, name: item.name, slug: item.slug },
      name: item.name,
      slug: item.slug
    };
  }
}

onMounted(async () => {
  await loadReviewModels();
});

watch(feedback, value => {
  if (import.meta.client) {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(value));
  }
}, { deep: true });
</script>
