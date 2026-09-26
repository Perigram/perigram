<template>
  <div class="flex flex-col gap-8">
    <ActionToolbar :title="$t('uiLab.title')" :subtitle="$t('uiLab.subtitle')" :level="1">
        <template #actions>
            <ThemeSwitcher />
            <LanguageSwitcher />
        </template>
    </ActionToolbar>

    <Tabs :value="activeSection" @update:value="value => activeSection = value">
        <TabList>
            <Tab v-for="group in groups" :key="group.id" :value="group.id">{{ $t(group.labelKey) }}</Tab>
            <Tab value="primitives">{{ $t('uiLab.sections.primitives') }}</Tab>
            <Tab value="contract">{{ $t('uiLab.sections.contract') }}</Tab>
        </TabList>
    </Tabs>

    <section v-if="activeGroup" class="flex flex-col gap-10">
      <article v-for="row in activeRowsWithModels" :key="row.key" class="flex flex-col gap-4">
        <ActionToolbar :title="$t(row.labelKey)" :subtitle="`${row.typeId} · ${row.propName}`" :level="2">
            <template #actions>
                <Tag :value="$t(`uiLab.statusPolicy.${row.status}`)" severity="secondary" />
                <Tag :value="row.trace ? $t('uiLab.tracePolicy.enabled') : $t('uiLab.tracePolicy.hidden')" severity="secondary" />
            </template>
        </ActionToolbar>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div class="flex flex-col gap-2">
            <small class="text-muted">{{ $t('uiLab.variants.card') }}</small>
            <component :is="row.component" v-bind="row.props" variant="card" />
          </div>
          <div class="flex flex-col gap-2">
            <small class="text-muted">{{ $t('uiLab.variants.compact') }}</small>
            <component :is="row.component" v-bind="row.props" variant="compact" />
          </div>
          <div class="flex flex-col gap-2">
            <small class="text-muted">{{ $t('uiLab.variants.inline') }}</small>
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
            <small class="text-muted">{{ primitive.purpose }}</small>

            <template v-if="primitive.key === 'InstanceCard'">
              <InstanceCard :instance="primitiveEntity" type-id="cassette">
                <DataBlock type-id="cassette" :entity="primitiveEntity" :fields="demoFields" />
                <template #footer>
                  <Button :label="$t('common.open')" icon="pi pi-external-link" text size="small" />
                </template>
              </InstanceCard>
            </template>

            <template v-else-if="primitive.key === 'InstancePage'">
              <InstancePage :instance="primitiveEntity" type-id="cassette">
                <template #info>
                  <small>{{ primitiveEntity.identity?.serial }}</small>
                </template>
                <template #actions>
                  <Button :label="$t('common.update')" icon="pi pi-refresh" text size="small" />
                </template>
                <StateBlock :message="$t('uiLab.primitives.empty')" icon="pi pi-inbox" />
              </InstancePage>
            </template>

            <template v-else-if="primitive.key === 'InstanceSelect'">
              <InstanceSelect
                v-model="primitiveSelectedQueueId"
                :options="primitiveQueueOptions"
                option-label="label"
                option-value="value"
                type-id="cassette"
                class="w-full"
              />
            </template>

            <template v-else-if="primitive.key === 'InstanceMultiSelect'">
              <InstanceMultiSelect
                v-model="primitiveSelectedQueueIds"
                :options="primitiveQueueOptions"
                option-label="label"
                option-value="value"
                type-id="cassette"
                class="w-full"
              />
            </template>

            <template v-else-if="primitive.key === 'DataBlock'">
              <DataBlock type-id="sheet_design" :entity="sheetDesignEntity" :fields="demoFields" />
            </template>


            <template v-else-if="primitive.key === 'InstanceState'">
            <InstanceState :instance="primitiveEntity" type-id="cassette" variant="inline" />
            <InstanceState :instance="primitiveEntity" type-id="cassette" variant="full" :show-actions="false" />
            </template>


            <template v-else-if="primitive.key === 'StateHistory'">
              <StateHistory type-id="cassette" :instance="primitiveEntity" :mock-events="mockHistory" />
            </template>

            <template v-else-if="primitive.key === 'GeometryPreview'">
              <GeometryPreview :entity="sheetDesignEntity" />
            </template>

            <template v-else-if="primitive.key === 'DrawingCanvas'">
              <DrawingCanvas :source="sheetDesignEntity" source-type="geometry-preview" mode="card" />
            </template>

            <template v-else-if="primitive.key === 'DesignerSurface'">
              <DesignerSurface class="h-48 rounded-ui border border-content-border p-2">
                <StateBlock :message="$t('uiLab.primitives.empty')" icon="pi pi-image" />
              </DesignerSurface>
            </template>

            <template v-else-if="primitive.key === 'DesignerWorkspace'">
              <DesignerWorkspace layout="lanes" class="h-48 rounded-ui border border-content-border p-2">
                <template #palette><StateBlock :message="$t('common.details')" /></template>
                <StateBlock :message="$t('uiLab.primitives.empty')" icon="pi pi-image" />
                <template #inspector><StateBlock :message="$t('common.settings')" /></template>
              </DesignerWorkspace>
            </template>

            <template v-else-if="primitive.key === 'ThreeViewport'">
              <ThreeViewport class="h-48 rounded-ui border border-content-border" />
            </template>

            <template v-else-if="primitive.key === 'TraceLink'">
              <TraceLink type="organization" :id="MOCK_IDS.organizationId" :label="$t('uiLab.fixtures.downtownComplex')" slug="acme-manufacturing" />
            </template>

            <template v-else-if="primitive.key === 'TraceChain'">
              <TraceChain :entity="primitiveEntity" type-id="cassette" />
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
                <DataBlock type-id="sheet_design" :entity="sheetDesignEntity" :fields="demoFields" />
              </StandardDialog>
            </template>

            <template v-else-if="primitive.key === 'DesignerDialog'">
              <Button :label="$t('common.open')" icon="pi pi-window-maximize" @click="designerDialogVisible = true" />
              <DesignerDialog
                v-model:visible="designerDialogVisible"
                :header="$t('cassette.designerTitle')"
              >
                <StateBlock :message="$t('uiLab.primitives.empty')" icon="pi pi-image" />
              </DesignerDialog>
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
          <MetricPanel :metrics="contractMetrics" />
      </Panel>

      <DataTable :value="contractRows" size="small">
        <Column field="label" :header="$t('uiLab.contract.entity')" />
        <Column field="typeId" :header="$t('uiLab.contract.typeId')" />
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
import Select from '~/components/shared/InstanceSelect.vue';
import Tag from 'primevue/tag';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import ThemeSwitcher from '~/components/ThemeSwitcher.vue';
import LanguageSwitcher from '~/components/LanguageSwitcher.vue';
import frameworkManifest from '~/framework.manifest.json';
import InstanceState from '~/components/shared/state/InstanceState.vue';
import StateHistory from '~/components/shared/state/StateHistory.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import DesignerDialog from '~/components/shared/DesignerDialog.vue';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';
import ThreeViewport from '~/components/shared/ThreeViewport.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import InstancePage from '~/components/shared/InstancePage.vue';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import InstanceMultiSelect from '~/components/shared/InstanceMultiSelect.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import MetricPanel from '~/components/shared/MetricPanel.vue';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
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
  createMockCassette,
  createMockHistory,
  createMockSheetDesign
} from '~/test-data/factories.js';
import { useInstancesStore } from '~/stores/instances';

const groups = DESIGN_SYSTEM_GROUPS;
const variants = DESIGN_SYSTEM_VARIANTS;
const { t } = useI18n();
const ENTITY_COLLECTION_BY_TYPE = new Map((frameworkManifest.entities || []).map(entity => [entity.type, entity.collection]));
const PRIMITIVE_EXAMPLE_KEYS = [
  'InstanceCard',
  'InstancePage',
  'InstanceSelect',
  'InstanceMultiSelect',
  'DataBlock',
  'InstanceState',
  'StateHistory',
  'DrawingCanvas',
  'DesignerSurface',
  'DesignerWorkspace',
  'DesignerDialog',
  'ThreeViewport',
  'GeometryPreview',
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
const instances = useInstancesStore();

const activeSection = ref(groups[0]?.id || 'contract');
const contractMetrics = computed(() => [
    { key: 'entities', label: t('uiLab.contract.entities'), value: rows.length },
    { key: 'primitives', label: t('uiLab.contract.primitives'), value: primitiveRows.length },
    { key: 'variants', label: t('uiLab.contract.variants'), value: variants.join(', ') },
    { key: 'issues', label: t('uiLab.contract.issues'), value: manifestIssues.length },
    { key: 'source', label: t('uiLab.contract.source'), value: 'utils/design-system.js' }
]);
const dialogVisible = ref(false);
const designerDialogVisible = ref(false);
const activeGroup = computed(() => groups.find((group) => group.id === activeSection.value));
const activeRows = computed(() => rows.filter((row) => row.group === activeSection.value));
const activeRowsWithModels = computed(() => activeRows.value);

const primitiveEntity = createMockCassette();
const primitiveAlternateQueue = createMockCassette({
  _id: 'cassette-demo-evening',
  identity: {
    ...primitiveEntity.identity,
    uid: 'cassette-demo-evening',
    name: 'Evening Run Cassette',
    slug: 'evening-run-cassette'
  }
});
const primitiveQueueOptions = [primitiveEntity, primitiveAlternateQueue].map(entity => ({
  label: entity.identity.name,
  value: entity._id,
  entity
}));
const primitiveSelectedQueueId = ref(primitiveEntity._id);
const primitiveSelectedQueueIds = ref(primitiveQueueOptions.map(option => option.value));
const sheetDesignEntity = createMockSheetDesign();
const mockHistory = createMockHistory(['DRAFT', 'NESTING', 'READY']);

seedDemoTraceEntities();

const demoFields = [
  { path: 'specs.width', i18n: 'uiLab.contract.source' },
  { path: 'specs.length', i18n: 'uiLab.contract.source' }
];



const contractRows = computed(() =>
  rows.map((row) => ({
    label: row.key,
    typeId: row.typeId,
    propName: row.propName,
    status: row.status,
    trace: row.trace ? 'yes' : 'no',
    docs: row.docs.join(', ')
  }))
);

function seedDemoTraceEntities() {
  const demoEntities = [
    { type: 'organization', id: MOCK_IDS.organizationId, name: 'Acme Manufacturing' }
  ];

  for (const item of demoEntities) {
    instances.upsertRecord(item.type, {
      _id: item.id,
      identity: { uid: item.id, name: item.name, slug: item.slug }
    });
  }
}
</script>
