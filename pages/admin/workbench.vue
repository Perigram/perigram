<template>
  <div class="flex w-full flex-col gap-4 p-4 md:p-6">
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-end gap-2">
        <div class="flex items-center gap-2">
          <Button icon="pi pi-refresh" :label="$t('common.reset')" severity="secondary" size="small" @click="resetWorkbench" />
          <Button icon="pi pi-download" :label="$t('admin.workbench.exportDraft')" size="small" @click="downloadDraft" />
        </div>
      </div>

      <div v-if="activeWorkbenchSection === 'commands'" class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Panel :header="$t('admin.workbench.sectionsCommands')" class="lg:sticky lg:top-4">
          <div class="flex flex-col gap-3">
            <Message v-if="commandsError" severity="warn">{{ commandsError }}</Message>
            <InputText v-model="commandSearch" :placeholder="$t('common.search')" class="w-full" />
            <div class="flex flex-col gap-2">
              <label>{{ $t('admin.commands.command') }}</label>
              <button
                v-for="command in visibleCommands"
                :key="command.id"
                type="button"
                class="flex min-w-0 flex-col gap-2 rounded-ui border border-content-border bg-content px-3 py-2 text-left"
                :class="selectedCommandId === command.id ? 'border-primary' : ''"
                @click="selectedCommandId = command.id"
              >
                <span class="flex min-w-0 flex-col">
                  <strong class="truncate">{{ command.label || command.id }}</strong>
                  <small class="text-muted-color">{{ command.id }}</small>
                </span>
                <span class="flex flex-wrap gap-1">
                  <Tag
                    v-for="input in command.input?.entities || []"
                    :key="input.name"
                    :value="input.type"
                    severity="secondary"
                    size="small"
                  />
                  <Tag :value="command.handlerRegistered ? $t('admin.commands.handler') : $t('admin.commands.noHandler')" :severity="command.handlerRegistered ? 'success' : 'warn'" size="small" />
                </span>
              </button>
            </div>
            <Message v-if="!commandsLoading && commandOptions.length === 0" severity="info">
              {{ $t('admin.commands.noCommands') }}
            </Message>
          </div>
        </Panel>

        <div class="flex min-w-0 flex-col gap-4">
          <Panel v-if="selectedCommand" :header="$t('admin.commands.input')">
            <div class="flex flex-col gap-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="flex min-w-0 flex-col">
                  <strong>{{ selectedCommand.label }}</strong>
                  <small class="text-muted-color">{{ selectedCommand.id }}</small>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Tag :value="selectedCommand.handlerRegistered ? $t('admin.commands.handler') : $t('admin.commands.noHandler')" :severity="selectedCommand.handlerRegistered ? 'success' : 'warn'" size="small" />
                </div>
              </div>
              <TypedSettingsForm
                v-model="commandEntities"
                :fields="commandEntityFields"
                :context="typedSettingsContext"
              />
              <TypedSettingsForm
                v-model="commandParameters"
                :fields="visibleCommandParameterFields"
                :context="typedSettingsContext"
              />
                <div v-if="commandInputPreviews.length" class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <component
                  :is="preview.component"
                  v-for="preview in commandInputPreviews"
                  :key="preview.key"
                  v-bind="preview.props"
                  v-on="preview.listeners || {}"
                  variant="compact"
                />
              </div>
            </div>
            <Button
              class="mt-3"
              icon="pi pi-play"
              :label="$t('admin.commands.run')"
              :loading="commandRunning"
              :disabled="!selectedCommand || !selectedCommand.runnable"
              @click="runSelectedCommand"
            />
          </Panel>

          <Panel :header="$t('admin.commands.lastOutput')">
            <div class="flex min-w-0 flex-col gap-3">
              <div class="flex items-center justify-between gap-3">
                <strong>{{ $t('admin.commands.lastOutput') }}</strong>
                <Button icon="pi pi-refresh" text rounded size="small" :aria-label="$t('common.update')" :loading="commandRunsLoading" @click="loadCommandRuns" />
              </div>
              <div class="flex min-h-48 flex-col gap-3 rounded-ui border border-content-border bg-content p-3">
                <div v-if="lastCommandRun" class="flex flex-wrap items-center gap-2">
                  <Tag :value="lastCommandRun.status" :severity="commandRunSeverity(lastCommandRun.status)" size="small" />
                  <small class="text-muted-color">{{ formatDateTime(lastCommandRun.finishedAt || lastCommandRun.createdAt) }}</small>
                </div>
                <div v-if="commandOutputPreviews.length" class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <component
                    :is="preview.component"
                    v-for="preview in commandOutputPreviews"
                    :key="preview.key"
                    v-bind="preview.props"
                    v-on="preview.listeners || {}"
                    variant="compact"
                  />
                </div>
                <Message v-if="commandMissingOutputRefs.length" severity="warn">
                  {{ $t('admin.commands.missingOutputRefs') }} {{ commandMissingOutputRefs.join(', ') }}
                </Message>
                <Panel v-if="lastCommandRun" :header="$t('admin.commands.debugOutput')">
                  <pre class="m-0 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{{ commandRunOutput(lastCommandRun) }}</pre>
                </Panel>
                <Message v-if="!lastCommandRun" severity="info">{{ $t('admin.commands.noOutput') }}</Message>
              </div>
            </div>
          </Panel>

          <Panel :header="$t('admin.tasks.related')">
            <div class="flex min-w-0 flex-col gap-3">
              <div class="flex items-center justify-between gap-3">
                <strong>{{ $t('admin.tasks.related') }}</strong>
                <Button icon="pi pi-refresh" text rounded size="small" :aria-label="$t('common.update')" :loading="tasksLoading" @click="loadTasks" />
              </div>
              <div v-if="selectedCommandTaskDefinitions.length" class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <article
                  v-for="task in selectedCommandTaskDefinitions"
                  :key="task.id"
                  class="flex min-w-0 flex-col gap-2 rounded-ui border border-content-border bg-content p-3"
                >
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="flex min-w-0 flex-col">
                      <strong class="truncate">{{ task.label || task.id }}</strong>
                      <small class="text-muted-color">{{ task.id }}</small>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <Tag :value="task.service" severity="secondary" size="small" />
                      <Tag :value="task.executor?.type || 'server'" severity="info" size="small" />
                      <Tag v-if="task.executor?.target" :value="task.executor.target" severity="secondary" size="small" />
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <Tag
                      v-for="item in taskOutputTags(task)"
                      :key="item"
                      :value="item"
                      severity="secondary"
                      size="small"
                    />
                  </div>
                </article>
              </div>
              <Message v-else severity="info">{{ $t('admin.tasks.noRelated') }}</Message>
              <div class="flex flex-col gap-2">
                <article
                  v-for="run in selectedCommandTaskRuns"
                  :key="run._id"
                  class="flex min-w-0 flex-col gap-2 rounded-ui border border-content-border bg-content p-3"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex min-w-0 flex-col">
                      <strong class="truncate">{{ run.taskId }}</strong>
                      <small class="text-muted-color">{{ run._id }}</small>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <Tag :value="run.status" :severity="taskRunSeverity(run.status)" size="small" />
                      <Tag :value="`${$t('admin.tasks.attempts')}: ${run.attempts || 0}/${run.maxAttempts || 0}`" severity="secondary" size="small" />
                    </div>
                  </div>
                  <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <small class="text-muted-color">{{ $t('admin.tasks.worker') }}: {{ run.workerId || run.lockedBy || $t('admin.tasks.systemWorker') }}</small>
                    <small class="text-muted-color">{{ $t('admin.tasks.lease') }}: {{ formatDateTime(run.leaseExpiresAt) || $t('common.notAvailable') }}</small>
                    <small class="text-muted-color">{{ $t('common.created') }}: {{ formatDateTime(run.createdAt) }}</small>
                  </div>
                  <pre class="m-0 max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{{ taskRunDebug(run) }}</pre>
                </article>
                <Message v-if="selectedCommandTaskDefinitions.length && selectedCommandTaskRuns.length === 0" severity="info">
                  {{ $t('admin.tasks.noRuns') }}
                </Message>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div v-else-if="activeWorkbenchSection === 'context'" class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
        <Panel :header="$t('admin.commands.fixtures')">
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-2">
              <Tag :value="fixtureStore.context.label" severity="secondary" size="small" />
              <Tag :value="fixtureStore.seeded ? $t('admin.commands.seeded') : $t('admin.commands.notSeeded')" :severity="fixtureStore.seeded ? 'success' : 'warn'" size="small" />
            </div>
            <Message v-if="fixtureStore.error" severity="warn">{{ fixtureStore.error }}</Message>
            <Message v-else-if="workflowCompileIssues.length" severity="warn">
              {{ workflowCompileIssues.join(' ') }}
            </Message>
            <div class="flex flex-wrap gap-2">
              <Button icon="pi pi-refresh" :label="$t('admin.commands.rebuildScenario')" severity="secondary" size="small" @click="rebuildFixtureScenario" />
              <Button icon="pi pi-database" :label="$t('admin.commands.seedScenario')" :loading="fixtureStore.loading" size="small" :disabled="workflowCompileIssues.length > 0" @click="seedFixtureScenario" />
            </div>
            <div class="flex flex-col gap-3 rounded-ui border border-content-border bg-content p-3">
              <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div class="flex min-w-0 flex-col gap-1">
                  <label>{{ $t('admin.workbench.manualEntity') }}</label>
                  <Select
                    :model-value="manualEntityType"
                    :options="manualEntityTypeOptions"
                    option-label="label"
                    option-value="value"
                    :placeholder="$t('admin.workbench.manualEntity')"
                    class="w-full"
                    @update:model-value="selectManualEntityType"
                  >
                    <template #value="{ value, placeholder }">
                      <span v-if="value" class="truncate">{{ manualEntityTypeLabel(value) }}</span>
                      <span v-else>{{ placeholder }}</span>
                    </template>
                    <template #option="{ option }">
                      <div class="flex min-w-0 flex-col">
                        <span class="truncate">{{ option.label }}</span>
                        <small class="truncate text-muted-color">{{ option.value }}</small>
                      </div>
                    </template>
                  </Select>
                </div>
                <Button
                  v-if="manualEntityType !== 'cassette'"
                  icon="pi pi-plus"
                  :label="$t('admin.workbench.createManualEntity')"
                  size="small"
                  :disabled="!canCreateManualEntity"
                  @click="createManualEntity"
                />
              </div>
              <div v-if="manualEntityType === 'cassette'" class="h-[38rem] overflow-hidden rounded-ui border border-content-border">
                <CassetteDesigner
                  :key="manualCassetteDesignerKey"
                  :persist="false"
                  @saved="createManualCassetteTemplate"
                />
              </div>
              <TypedSettingsForm
                v-else
                v-model="manualEntityDraft"
                :fields="manualEntityFields"
                :context="typedSettingsContext"
              />
              <div v-if="manualEntityPreviews.length" class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <component
                  :is="preview.component"
                  v-for="preview in manualEntityPreviews"
                  :key="preview.key"
                  v-bind="preview.props"
                  v-on="preview.listeners || {}"
                  variant="compact"
                />
              </div>
            </div>
            <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <component
                :is="preview.component"
                v-for="preview in scenarioEntityPreviews"
                :key="preview.key"
                v-bind="preview.props"
                v-on="preview.listeners || {}"
                variant="card"
              />
            </div>
          </div>
        </Panel>

        <Panel :header="$t('admin.commands.testAccess')">
          <div class="flex flex-col gap-3">
            <label class="flex items-center gap-2">
              <Checkbox v-model="workbenchTestAccess.enabled" binary />
              <span>{{ $t('admin.commands.overrideAccess') }}</span>
            </label>
            <div v-if="workbenchTestAccess.enabled" class="grid grid-cols-1 gap-3">
              <div v-for="field in workbenchAccessFields" :key="field.name" class="flex min-w-0 flex-col gap-1">
                <label>{{ field.label }}</label>
                <Select
                  :model-value="workbenchTestAccess.permissions[field.name]"
                  :options="accessLevelOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                  @update:model-value="value => setWorkbenchAccessLevel(field.name, value)"
                />
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div v-else class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Panel :header="$t('admin.workbench.entities')" class="lg:sticky lg:top-4">
          <div class="flex flex-col gap-3">
            <InputText v-model="search" :placeholder="$t('common.search')" class="w-full" />
            <div class="flex max-h-[calc(100vh-12rem)] flex-col gap-1 overflow-y-auto pr-1">
              <button
              v-for="entity in visibleEntities"
              :key="entity.key"
              type="button"
              class="flex min-w-0 items-center justify-between gap-2 rounded-ui border border-content-border bg-content px-2 py-2 text-left"
              :class="selectedEntityKey === entity.key ? 'border-primary' : ''"
              @click="selectedEntityKey = entity.key"
            >
              <span class="flex min-w-0 flex-col">
                <strong class="truncate">{{ $t(entity.labelKey) }}</strong>
                <small class="truncate text-muted-color">{{ entity.entityType }}</small>
              </span>
              <Tag :value="entity.backend?.blocks?.length || 0" severity="secondary" size="small" />
            </button>
            </div>
          </div>
        </Panel>

        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap gap-2">
            <Button
              v-for="tab in entityWorkbenchTabs"
              :key="tab.value"
              :label="$t(tab.labelKey)"
              :severity="activeEntityTab === tab.value ? 'primary' : 'secondary'"
              size="small"
              @click="activeEntityTab = tab.value"
            />
          </div>

          <Panel v-if="activeEntityTab === 'ui'" :header="$t('admin.workbench.sectionsUi')">
          <div class="flex flex-col gap-4">
            <Message v-if="selectedUiRows.length === 0" severity="warn">
              {{ $t('uiLab.contract.missingComponent') }}
            </Message>
            <article v-for="row in selectedUiRows" :key="row.key" class="flex flex-col gap-4">
              <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 class="m-0 text-base font-semibold">{{ $t(row.labelKey) }}</h3>
                  <small class="text-muted-color">{{ row.entityType }} · {{ row.propName }}</small>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <Tag :value="$t(`uiLab.statusPolicy.${row.status}`)" severity="secondary" size="small" />
                  <Tag :value="row.trace ? $t('uiLab.tracePolicy.enabled') : $t('uiLab.tracePolicy.hidden')" severity="secondary" size="small" />
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
          </div>
        </Panel>

          <Panel v-else-if="activeEntityTab === 'workflow'" :header="$t('admin.workbench.sectionsWorkflow')" class="order-2">
          <div class="flex flex-col gap-4">
            <Message severity="info">{{ $t('admin.workbench.workflowNoRoles') }}</Message>
            <WorkflowDesignerV2 v-model="workflows[selectedEntity.type]" :feature="entityFeature(selectedEntity.type)" />
          </div>
        </Panel>

          <Panel v-else-if="activeEntityTab === 'data'" :header="$t('admin.workbench.sectionsData')" class="order-4">
          <Message v-if="modelError" severity="warn">{{ modelError }}</Message>
          <Message v-else-if="modelLoading" severity="info">{{ $t('common.loading') }}</Message>
          <div v-else class="flex flex-col gap-3">
            <div class="flex flex-wrap gap-2">
              <Tag :value="selectedModel?.collection || selectedEntity.collection" severity="secondary" size="small" />
              <Tag :value="`${compactModelFields.length} fields`" severity="secondary" size="small" />
              <Tag v-if="selectedModel?.issues?.length" :value="`${selectedModel.issues.length} issues`" severity="warn" size="small" />
            </div>
            <div class="flex flex-wrap gap-2">
              <div v-for="field in compactModelFields" :key="field.name" class="flex max-w-full flex-wrap items-center gap-2 rounded-ui border border-content-border bg-content px-2 py-1">
                <span class="font-mono text-sm">{{ field.name }}</span>
                <Tag :value="field.type" severity="secondary" size="small" />
                <Tag v-for="issue in field.issues || []" :key="issue" :value="issue" severity="warn" size="small" />
                <Select v-model="dataDecisionFor(field).decision" :options="dataDecisionOptions" option-label="label" option-value="value" size="small" />
                <InputText
                  v-if="dataDecisionFor(field).decision === 'rename' || dataDecisionFor(field).decision === 'move'"
                  v-model="dataDecisionFor(field).target"
                  :placeholder="$t('admin.dataModelReview.targetPlaceholder')"
                />
              </div>
            </div>
          </div>
        </Panel>

          <Panel v-else :header="$t('admin.workbench.sectionsFeedback')" class="order-5">
          <div class="flex flex-col gap-3">
            <Textarea v-model="feedbackDraft.note" rows="5" auto-resize :placeholder="$t('uiLab.feedback.placeholder')" />
          </div>
        </Panel>
        </div>
      </div>
    </div>

    <StandardDialog
      v-model:visible="artifactPreviewVisible"
      :header="artifactPreviewEntity?.identity?.name || $t('artifacts.previewTitle')"
      size="full"
      class="h-preview-dialog"
      :pt="{ content: { class: 'flex-1 flex flex-col overflow-hidden h-full p-0' } }"
    >
      <div class="flex h-full">
        <div v-if="artifactPreviewError" class="flex flex-1 flex-col items-center justify-center gap-4">
          <i class="pi pi-exclamation-circle text-4xl"></i>
          <p>{{ artifactPreviewError }}</p>
        </div>
        <DrawingCanvas
          v-else-if="artifactPreviewDrawingSource"
          :source="artifactPreviewDrawingSource"
          :source-type="artifactPreviewSourceType"
          mode="viewer"
          show-layer-panel
          @error="handleArtifactPreviewError"
        />
        <div v-else class="flex flex-1 flex-col items-center justify-center gap-6">
          <i :class="artifactPreviewMode === 'pdf' ? 'pi pi-file-pdf text-6xl opacity-20' : 'pi pi-file text-6xl opacity-20'"></i>
          <div class="text-center">
            <p>{{ artifactPreviewMode === 'pdf' ? $t('artifacts.pdfPreviewUnavailable') : $t('artifacts.previewUnavailable') }}</p>
            <small>{{ $t('artifacts.downloadFilePrompt') }}</small>
          </div>
          <Button :label="$t('common.download')" icon="pi pi-download" @click="downloadArtifactPreview" />
        </div>
      </div>
    </StandardDialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { MarkerType, Position, VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from '~/components/shared/EntityMultiSelect.vue';
import Panel from 'primevue/panel';
import Select from '~/components/shared/EntitySelect.vue';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import TypedSettingsForm from '~/components/shared/TypedSettingsForm.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import CassetteDesigner from '~/components/CassetteDesigner.vue';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi';
import { DESIGN_SYSTEM_ENTITIES, createDesignSystemDemoRows } from '~/utils/design-system.js';
import { buildWorkflowGraph, parseCommaList, parseJsonObject } from '~/utils/domain-builder.js';
import { compileWorkflowDraft } from '~/utils/workflow-compiler.js';
import { occsParameterNames, occsQueueParameters } from '~/utils/occs/parameters.js';
import { useWorkbenchFixturesStore } from '~/stores/workbenchFixtures.js';
import {
  buildManualWorkbenchEntity,
  defaultManualEntityDraft as createDefaultManualEntityDraft,
  manualEntityContextType,
  manualEntityPreviewType,
  manualFieldsForEntity as buildManualFieldsForEntity
} from '~/test-data/workbench-manual-entities.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const fixtureStore = useWorkbenchFixturesStore();
const domainUi = useCutkitDomainUi();
const STORAGE_KEY = 'cutkit:entity-workbench:v1';
const WORKFLOW_LAYOUT_STORAGE_KEY = 'cutkit:entity-workbench-layout:v1';
const globalWorkbenchTabs = [
  { value: 'entities', labelKey: 'admin.workbench.sectionsEntities' },
  { value: 'context', labelKey: 'admin.workbench.sectionsContext' },
  { value: 'commands', labelKey: 'admin.workbench.sectionsCommands' }
];
const WORKBENCH_SECTION_VALUES = globalWorkbenchTabs.map(tab => tab.value);

const domainLoading = ref(false);
const domainError = ref('');
const sourceDomain = ref({ entities: [], workflows: {}, hooks: {} });
const entities = ref([]);
const workflows = ref({});
const hookContracts = ref({});
const activeWorkbenchSection = ref(normalizeWorkbenchSection(route.query.section));
const activeEntityTab = ref('ui');
const uiRows = createDesignSystemDemoRows();
const feedback = ref({});
const dataDecisions = ref({});
const models = ref([]);
const modelLoading = ref(false);
const modelError = ref('');
const search = ref('');
const selectedEntityKey = ref('');
const selectedState = ref('');
const selectedTransitionIndex = ref(null);
const transitionDraftFrom = ref('');
const workflowLayouts = ref({});
const commands = ref([]);
const commandRuns = ref([]);
const commandsLoading = ref(false);
const commandRunsLoading = ref(false);
const commandRunning = ref(false);
const artifactPreviewVisible = ref(false);
const artifactPreviewEntity = ref(null);
const artifactPreviewError = ref('');
const commandsError = ref('');
const commandsRegistry = ref({});
const commandSearch = ref('');
const selectedCommandId = ref('');
const commandEntities = ref({});
const commandParameters = ref({});
const taskDefinitions = ref([]);
const taskRuns = ref([]);
const tasksLoading = ref(false);
const tasksError = ref('');
const workbenchTestAccess = ref({ enabled: true, userId: '', organizationId: '', permissions: {} });
const manualEntityType = ref('project');
const manualEntityDraft = ref({});
const manualEntityRefs = ref([]);
const manualCassetteDesignerKey = ref(0);
const selectedCassetteTemplateId = ref('');
const persistedCassetteTemplateIds = ref([]);
let commandRunPoll = null;
let taskRunPoll = null;

const visibleEntities = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return workbenchEntities.value;
  return workbenchEntities.value.filter(entity => `${entity.key} ${entity.entityType} ${entity.collection} ${t(entity.labelKey)}`.toLowerCase().includes(term));
});
const workbenchEntities = computed(() => uiRows.map(row => ({
  ...row,
  backend: entities.value.find(entity => entity.type === row.entityType),
  collection: entities.value.find(entity => entity.type === row.entityType)?.collection || row.entityType
})));
const selectedEntityRow = computed(() => {
  if (!selectedEntityKey.value) selectedEntityKey.value = workbenchEntities.value[0]?.key || '';
  return workbenchEntities.value.find(entity => entity.key === selectedEntityKey.value) || workbenchEntities.value[0];
});
const selectedEntity = computed(() => selectedEntityRow.value?.backend
  || entities.value.find(entity => entity.type === selectedEntityRow.value?.entityType)
  || { type: selectedEntityRow.value?.entityType || 'entity', collection: selectedEntityRow.value?.collection || 'entities' });
const selectedUiRows = computed(() => uiRows.filter(row => row.key === selectedEntityRow.value?.key));
const selectedModel = computed(() => models.value.find(model => normalizeCollection(model.collection) === normalizeCollection(selectedEntity.value.collection)));
const selectedModelFields = computed(() => selectedModel.value?.fields || []);
const compactModelFields = computed(() => selectedModelFields.value.filter(field => !isObviousModelField(field)));
const feedbackDraft = computed(() => {
  const key = selectedEntityRow.value?.key || selectedEntity.value.type;
  feedback.value[key] ||= { decision: 'unchecked', note: '' };
  return feedback.value[key];
});
const workflowDraft = computed(() => {
  workflows.value[selectedEntity.value.type] ||= { initial: 'DRAFT', states: { DRAFT: { canUpdateMeta: true } }, transitions: [] };
  return workflows.value[selectedEntity.value.type];
});
const workflowStateNames = computed(() => Object.keys(workflowDraft.value.states || {}));
const workflowStateOptions = computed(() => workflowStateNames.value.map(value => ({ label: value, value })));
const workflowGraph = computed(() => buildWorkflowGraph(workflowDraft.value || {}));
const selectedStateDefinition = computed(() => {
  if (!selectedState.value) return {};
  workflowDraft.value.states[selectedState.value] ||= {};
  return workflowDraft.value.states[selectedState.value];
});
const selectedTransition = computed(() => {
  if (selectedTransitionIndex.value === null) return null;
  return workflowDraft.value.transitions[selectedTransitionIndex.value] || null;
});
const workflowCompile = computed(() => compileWorkflowDraft({
  entities: entities.value,
  workflows: workflows.value,
  hookContracts: hookContracts.value
}));
const workflowCompileIssues = computed(() => workflowCompile.value.issues.map(issue => issue.message));
provide('statusWorkflows', computed(() => workflowCompile.value.machines));
provide('statusTransitionHandler', handleWorkbenchStatusTransition);
provide('entityContext', computed(() => fixtureStore.context));
const defaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--p-content-border-color)' },
  interactionWidth: 24
};
const workflowNodes = computed(() => workflowGraph.value.nodes.map(node => ({
  id: node.id,
  label: node.id,
  position: workflowNodePosition(node),
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
  selected: selectedState.value === node.id,
  data: { label: node.id },
  style: workflowNodeStyle(node)
})));
const workflowEdges = computed(() => workflowGraph.value.edges.map(edge => ({
  id: edge.id,
  source: edge.from,
  target: edge.to,
  label: transitionLabel(workflowDraft.value.transitions[edge.index]),
  type: edge.reciprocal ? 'default' : 'smoothstep',
  pathOptions: edgePathOptions(edge),
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: selectedTransitionIndex.value === edge.index ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'
  },
  interactionWidth: 24,
  selected: selectedTransitionIndex.value === edge.index,
  data: { index: edge.index },
  style: workflowEdgeStyle(edge),
  labelStyle: {
    color: 'var(--p-text-color)',
    fill: 'var(--p-text-color)',
    fontSize: '0.625rem',
    fontWeight: '500'
  },
  labelShowBg: true,
  labelBgStyle: {
    fill: 'var(--p-content-background)',
    stroke: 'var(--p-content-border-color)'
  },
  labelBgPadding: [4, 3],
  labelBgBorderRadius: 4
})));
const selectedLifecycleAttachments = computed(() => {
  const attachments = selectedStateDefinition.value.lifecycle?.attachments || {};
  return Object.entries(attachments).map(([name, definition]) => ({
    name,
    multiple: Boolean(definition?.multiple)
  }));
});
const entityWorkbenchTabs = [
  { value: 'ui', labelKey: 'admin.workbench.sectionsUi' },
  { value: 'workflow', labelKey: 'admin.workbench.sectionsWorkflow' },
  { value: 'data', labelKey: 'admin.workbench.sectionsData' },
  { value: 'feedback', labelKey: 'admin.workbench.sectionsFeedback' }
];
const hookOptions = computed(() => uniqueSorted([
  ...Object.keys(hookContracts.value),
  ...(workflowDraft.value.transitions || []).flatMap(transition => (transition.hooks || []).map(hook => hook.handler).filter(Boolean))
]).map(value => ({ label: value, value })));
const capabilityOptions = computed(() => uniqueSorted([
  'engineering',
  'operator',
  'mounting',
  ...Object.values(workflows.value || {}).flatMap(workflow => [
    ...Object.values(workflow.states || {}).flatMap(state => state.lifecycle?.actors || []),
    ...(workflow.transitions || []).flatMap(transition => transition.capabilities || transition.requiredCapabilities || [])
  ])
]).map(value => ({ label: value, value })));
const hookPhaseOptions = computed(() => [
  { label: t('admin.domainBuilder.hookPhaseAfter'), value: 'after' },
  { label: t('admin.domainBuilder.hookPhaseBefore'), value: 'before' }
]);
const hookModeOptions = computed(() => [
  { label: t('admin.domainBuilder.hookModeAsync'), value: 'async' },
  { label: t('admin.domainBuilder.hookModeSync'), value: 'sync' }
]);
const visibleCommands = computed(() => {
  const term = commandSearch.value.trim().toLowerCase();
  const runnableCommands = commands.value.filter(command => command.kind !== 'task' && command.runnable !== false);
  if (!term) return runnableCommands;
  return runnableCommands.filter(command => JSON.stringify({
    id: command.id,
    label: command.label,
    input: command.input,
    output: command.output,
    access: command.access
}).toLowerCase().includes(term));
});
const commandOptions = computed(() => visibleCommands.value.map(command => ({
  label: command.label || command.id,
  value: command.id
})));
const selectedCommand = computed(() => visibleCommands.value.find(command => command.id === selectedCommandId.value) || null);
const selectedCommandTaskDefinitions = computed(() => {
  const ids = commandRelatedTaskIds(selectedCommand.value);
  return taskDefinitions.value.filter(task => ids.has(task.id));
});
const selectedCommandTaskRuns = computed(() => {
  const ids = commandRelatedTaskIds(selectedCommand.value);
  const runIds = new Set((lastCommandRun.value?.result?.tasks || [])
    .filter(job => job.type === 'task_run' && job.id)
    .map(job => job.id?.toString()));
  return taskRuns.value.filter(run => ids.has(run.taskId) || runIds.has(run._id?.toString()));
});
const entityRenderers = computed(() => Object.fromEntries(DESIGN_SYSTEM_ENTITIES.map(entry => [entry.entityType, entry])));
const commandEntityFields = computed(() => (selectedCommand.value?.input?.entities || []).map(input => ({
  name: input.name,
  label: `${input.name}:${input.type}`,
  type: 'entityId',
  entityType: input.type,
  required: Boolean(input.required)
})));
const visibleCommandParameterFields = computed(() => (selectedCommand.value?.input?.parameters || [])
  .filter(field => field.display !== 'debug' && field.display !== 'hidden'));
const workbenchAccessFields = computed(() => Object.keys({
  ...(fixtureStore.access.permissions || {}),
  ...(workbenchTestAccess.value.permissions || {})
}).sort().map(feature => ({ name: feature, label: feature })));
const lastCommandRun = computed(() => commandRuns.value[0] || null);
const commandOutputRefs = computed(() => uniqueOutputRefs([
  ...outputRefsFromResult(lastCommandRun.value?.result),
  ...selectedCommandTaskRuns.value.flatMap(run => outputRefsFromResult(run.output))
]));
const commandInputPreviews = computed(() => commandEntityFields.value
  .map(field => previewForEntityRef(field.entityType, commandEntities.value[field.name], `input:${field.name}`))
  .filter(Boolean));
const commandOutputPreviews = computed(() => commandOutputRefs.value
  .map(item => item.type === 'artifact'
    ? previewForArtifactOutput(item)
    : previewForEntityRef(item.type, item.id, `entity:${item.type}:${item.id}`))
  .filter(Boolean));
const artifactPreviewKind = computed(() => artifactPreviewEntity.value?.data?.type || '');
const artifactPreviewMode = computed(() => domainUi.getAttachmentPreview(artifactPreviewKind.value).mode);
const artifactPreviewDrawingSource = computed(() => {
  if (!artifactPreviewEntity.value?._id) return null;
  if (artifactPreviewMode.value !== 'dxf' && artifactPreviewMode.value !== 'svg') return null;
  return domainUi.getDownloadEndpoint('artifact', artifactPreviewEntity.value._id);
});
const artifactPreviewSourceType = computed(() => `${artifactPreviewMode.value}-url`);
const commandMissingOutputRefs = computed(() => {
  if (!commandOutputRefs.value.length) return [];
  return commandOutputRefs.value
    .filter(item => item.type && item.id && !findScenarioEntity(item.type, item.id))
    .map(item => `${item.type}:${item.id}`);
});
const scenarioEntityPreviews = computed(() => [
  previewForEntityRef('project', fixtureStore.refs.project, 'scenario:project'),
  previewForEntityRef('queue', fixtureStore.refs.queue, 'scenario:queue'),
  previewForEntityRef('cassette', fixtureStore.refs.cassetteTemplate, 'scenario:cassette'),
  previewForEntityRef('sheet_design', fixtureStore.refs.sheetDesign, 'scenario:sheet-design')
].filter(Boolean));
const cassetteTemplateOptions = computed(() => (fixtureStore.entityOptions.cassette || []).map(option => ({
  label: option.label,
  value: option.value
})));
const selectedCassetteTemplate = computed(() => (
  findScenarioEntity('cassette', selectedCassetteTemplateId.value) ||
  findScenarioEntity('cassette', fixtureStore.refs.cassetteTemplate) ||
  null
));
const typedSettingsContext = computed(() => ({
  entityTypes: manualEntityDefinitions.value.map(entity => entity.type),
  workflowStates: workflowCompile.value.states,
  entityOptions: fixtureStore.entityOptions
}));
const manualEntityDefinitions = computed(() => {
  const byType = new Map((entities.value || [])
    .filter(entity => entity?.type)
    .map(entity => [entity.type, entity]));
  for (const entry of DESIGN_SYSTEM_ENTITIES) {
    const type = manualEntityContextType(entry.entityType);
    if (type && !byType.has(type)) byType.set(type, { type });
  }
  return Array.from(byType.values());
});
const manualEntityTypeOptions = computed(() => manualEntityDefinitions.value
  .map(entity => ({ label: entityLabelForType(entity.type), value: entity.type }))
  .sort((a, b) => a.label.localeCompare(b.label)));
const manualEntityFields = computed(() => manualFieldsForEntity(manualEntityType.value));
const canCreateManualEntity = computed(() => manualEntityType.value !== 'cassette' && manualEntityFields.value.every(field => {
  if (!field.required) return true;
  const value = manualEntityDraft.value?.[field.name];
  if (field.type === 'number') return Number.isFinite(Number(value)) && Number(value) >= Number(field.min ?? 0);
  return value !== '' && value !== null && value !== undefined;
}));
const manualEntityPreviews = computed(() => manualEntityRefs.value
  .map(ref => previewForEntityRef(ref.previewType || ref.type, ref.id, `manual:${ref.type}:${ref.id}`))
  .filter(Boolean));

const dataDecisionOptions = ['unchecked', 'keep', 'remove', 'rename', 'move', 'investigate'].map(value => ({ label: value, value }));
const accessLevelOptions = ['none', 'read', 'write', 'admin'].map(value => ({ label: value, value }));

onMounted(async () => {
  await loadDomain();
  loadStoredDraft();
  loadModels();
  loadWorkflowLayouts();
  await rebuildFixtureScenario({ loadPersistedCassettes: false });
  await loadCommands();
  await loadPersistedCassetteTemplates();
  loadCommandRuns();
  loadTasks();
  if (import.meta.client) commandRunPoll = window.setInterval(loadCommandRuns, 5000);
  if (import.meta.client) taskRunPoll = window.setInterval(loadTasks, 5000);
});

onUnmounted(() => {
  if (commandRunPoll) window.clearInterval(commandRunPoll);
  if (taskRunPoll) window.clearInterval(taskRunPoll);
});

watch([workflows, feedback, dataDecisions], saveDraft, { deep: true });
watch(workflowLayouts, saveWorkflowLayouts, { deep: true });
watch(() => route.query.section, (section) => {
  const normalized = normalizeWorkbenchSection(section);
  activeWorkbenchSection.value = normalized;
  const raw = Array.isArray(section) ? section[0] : section;
  if (raw && raw !== normalized) {
    router.replace({ path: route.path, query: { ...route.query, section: normalized } });
  }
}, { immediate: true });
watch(() => fixtureStore.refs.cassetteTemplate, (id) => {
  if (!selectedCassetteTemplateId.value || !findScenarioEntity('cassette', selectedCassetteTemplateId.value)) {
    selectedCassetteTemplateId.value = id || cassetteTemplateOptions.value[0]?.value || '';
  }
}, { immediate: true });
watch(cassetteTemplateOptions, (options) => {
  if (!options.some(option => option.value?.toString() === selectedCassetteTemplateId.value?.toString())) {
    selectedCassetteTemplateId.value = fixtureStore.refs.cassetteTemplate || options[0]?.value || '';
  }
});
watch(selectedEntityKey, () => {
  selectedState.value = '';
  selectedTransitionIndex.value = null;
  transitionDraftFrom.value = '';
});

watch(selectedCommandId, syncCommandInput);
watch(manualEntityType, resetManualEntityDraft);

function normalizeWorkbenchSection(value) {
  const section = Array.isArray(value) ? value[0] : value;
  return WORKBENCH_SECTION_VALUES.includes(section) ? section : 'entities';
}

function loadCassetteTemplate(id) {
  if (!id) return;
  selectedCassetteTemplateId.value = id;
  const entity = findScenarioEntity('cassette', id);
  if (!entity) return;
  setWorkbenchRefs({ cassetteTemplate: entity._id });
  syncNestingQueueCassette(entity);
  applyScenarioDefaults();
}

async function saveCassetteTemplate(payload = {}) {
  const definition = payload.definition || payload.occs || {};
  const name = String(payload.name || selectedCassetteTemplate.value?.identity?.name || t('cassette.newCassette')).trim() || t('cassette.newCassette');
  const resultCassetteId = payload.commandResult?.data?.cassetteId ||
    payload.commandResult?.entities?.find(entity => entity.type === 'cassette')?.id ||
    '';
  const persistedId = payload.savedEntity?._id || resultCassetteId;
  const lookupId = persistedId || payload.id || '';
  const savedEntity = payload.savedEntity
    ? clonePlain(payload.savedEntity)
    : await fetchPersistedCassetteTemplate(lookupId).catch(() => null);
  const existing = savedEntity || (payload.id ? findScenarioEntity('cassette', payload.id) : selectedCassetteTemplate.value);
  const entity = savedEntity || buildCassetteV2TemplateEntity({ ...payload, definition, name }, existing);
  if (!entity) return;

  rememberPersistedCassetteTemplateIds([savedEntity?._id || persistedId].filter(Boolean));
  fixtureStore.upsertEntities([{ type: 'cassette', entity }]);
  selectedCassetteTemplateId.value = entity._id;
  setWorkbenchRefs({ cassetteTemplate: entity._id });
  syncNestingQueueCassette(entity);
  manualEntityRefs.value = uniqueOutputRefs([
    { type: 'cassette_template', id: entity._id },
    ...manualEntityRefs.value
  ]);
  applyScenarioDefaults();
}

async function loadPersistedCassetteTemplates(options = {}) {
  const preferredTemplateId = options.preferredTemplateId || selectedCassetteTemplateId.value;
  const templates = await fetchPersistedCassetteTemplates().catch(() => []);
  if (!templates.length) return;

  rememberPersistedCassetteTemplateIds(templates.map(template => template._id));
  fixtureStore.upsertEntities(templates.map(entity => ({ type: 'cassette', entity })));

  const selectedEntity = preferredTemplateId ? findScenarioEntity('cassette', preferredTemplateId) : null;
  if (selectedEntity) {
    loadCassetteTemplate(selectedEntity._id);
  }
}

async function fetchPersistedCassetteTemplates() {
  const result = await $fetch('/api/cassettes');
  const cassettes = Array.isArray(result) ? result : (result?.items || result?.data || []);
  return cassettes.filter(entity => entity?._id && entity.data?.type === 'PARAMETRIC');
}

async function fetchPersistedCassetteTemplate(id) {
  if (!id) return null;
  const entity = await $fetch(`/api/cassettes/${encodeURIComponent(id)}`);
  return entity && entity.data?.type === 'PARAMETRIC' ? entity : null;
}

function rememberPersistedCassetteTemplateIds(ids = []) {
  const next = new Set(persistedCassetteTemplateIds.value.map(id => id?.toString()).filter(Boolean));
  for (const id of ids) {
    if (id) next.add(id.toString());
  }
  persistedCassetteTemplateIds.value = Array.from(next);
}

function buildCassetteV2TemplateEntity(payload = {}, existing = null) {
  const definition = clonePlain(payload.definition || {});
  const parameterNames = Array.isArray(payload.parameters)
    ? payload.parameters
    : occsParameterNames(definition);
  if (!existing) {
    const entity = buildManualEntity('cassette', {
      name: payload.name,
      definition,
      parameters: parameterNames
    });
    if (payload.id && entity) {
      entity._id = payload.id;
      entity.identity = {
        ...(entity.identity || {}),
        uid: payload.id,
        serial: String(payload.id).toUpperCase()
      };
    }
    return entity;
  }

  const entity = clonePlain(existing);
  const uid = entity.identity?.uid || entity._id;
  entity.identity = {
    ...(entity.identity || {}),
    uid,
    name: payload.name,
    slug: slugifyWorkbenchValue(payload.name),
    serial: entity.identity?.serial || String(uid).toUpperCase()
  };
  entity.lineage = {
    ...(entity.lineage || {}),
    organizationId: entity.lineage?.organizationId || fixtureStore.access.organizationId
  };
  entity.attachments ||= {};
  entity.data = {
    ...(entity.data || {}),
    type: 'PARAMETRIC',
    definition,
    parameters: parameterNames,
    organizationId: fixtureStore.access.organizationId,
    userId: fixtureStore.access.userId
  };
  return entity;
}

function syncNestingQueueCassette(cassette) {
  const queue = findScenarioEntity('queue', fixtureStore.refs.queue);
  if (!queue || !cassette?._id) return;
  const nextQueue = clonePlain(queue);
  const currentJob = nextQueue.data?.job || {};
  const currentItems = Array.isArray(currentJob.items) ? currentJob.items : [];
  const currentItem = currentItems[0] || {};
  nextQueue.data = {
    ...(nextQueue.data || {}),
    job: {
      ...currentJob,
      items: [
        {
          ...currentItem,
          id: cassette._id,
          type: cassette.data?.type || currentItem.type || 'PARAMETRIC',
          quantity: Number(currentItem.quantity) > 0 ? Number(currentItem.quantity) : 10,
          parameters: cassetteParametersForQueue(cassette)
        },
        ...currentItems.slice(1)
      ]
    }
  };
  fixtureStore.upsertEntities([{ type: 'queue', entity: nextQueue }]);
}

function setWorkbenchRefs(patch = {}) {
  fixtureStore.context = {
    ...fixtureStore.context,
    refs: {
      ...(fixtureStore.context.refs || {}),
      ...patch
    },
    persisted: false
  };
}

function cassetteParametersForQueue(cassette = {}) {
  return occsQueueParameters(cassette.data?.definition || {});
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function slugifyWorkbenchValue(value) {
  return String(value || 'entity')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'entity';
}

async function loadDomain() {
  domainLoading.value = true;
  domainError.value = '';
  try {
    const result = await $fetch('/api/admin/domain');
    if (result?.success === false) throw new Error(result.error || t('admin.workbench.errors.loadDomainFailed'));
    sourceDomain.value = {
      entities: result.entities || result.domain?.entities || [],
      workflows: result.workflows || result.domain?.workflows || {},
      hooks: result.hooks || result.domain?.hooks || {}
    };
    entities.value = clonePlain(sourceDomain.value.entities);
    workflows.value = clonePlain(sourceDomain.value.workflows);
    hookContracts.value = clonePlain(sourceDomain.value.hooks);
  } catch (error) {
    domainError.value = error?.data?.message || error?.message || t('admin.workbench.errors.loadDomainFailed');
  } finally {
    domainLoading.value = false;
  }
}

async function loadModels() {
  modelLoading.value = true;
  modelError.value = '';
  try {
    const result = await $fetch('/api/debug/data-models');
    if (result?.success === false) throw new Error(result.error || t('admin.workbench.errors.loadDataModelsFailed'));
    models.value = Array.isArray(result) ? result : (result?.models || []);
  } catch (error) {
    modelError.value = error?.message || t('admin.workbench.errors.loadDataModelsFailed');
  } finally {
    modelLoading.value = false;
  }
}

async function loadCommands() {
  commandsLoading.value = true;
  commandsError.value = '';
  try {
    const result = await $fetch('/api/admin/commands');
    commands.value = (result.commands || []).filter(command => command.kind !== 'task');
    commandsRegistry.value = result.registry || {};
    await rebuildFixtureScenario({ loadPersistedCassettes: false });
    ensureSelectedCommand();
    syncCommandInput();
  } catch (error) {
    commandsError.value = error?.data?.message || error?.message || t('admin.workbench.errors.loadCommandsFailed');
  } finally {
    commandsLoading.value = false;
  }
}

async function loadTasks() {
  tasksLoading.value = true;
  tasksError.value = '';
  try {
    const result = await $fetch('/api/admin/tasks', {
      query: {
        limit: 25
      }
    });
    taskDefinitions.value = result.definitions || [];
    taskRuns.value = result.runs || [];
  } catch (error) {
    tasksError.value = error?.data?.message || error?.message || t('admin.workbench.errors.loadTasksFailed');
  } finally {
    tasksLoading.value = false;
  }
}

async function loadCommandRuns() {
  if (!selectedCommandId.value || selectedCommand.value?.kind === 'task') {
    commandRuns.value = [];
    return;
  }
  commandRunsLoading.value = true;
  try {
    const result = await $fetch('/api/admin/commands/runs', {
      query: { commandId: selectedCommandId.value, limit: 1 }
    });
    commandRuns.value = result.runs || [];
  } catch (error) {
    commandsError.value = error?.data?.message || error?.message || t('admin.workbench.errors.loadCommandRunsFailed');
  } finally {
    commandRunsLoading.value = false;
  }
}

async function runSelectedCommand() {
  if (!selectedCommand.value || !selectedCommand.value.runnable) return;
  commandRunning.value = true;
  commandsError.value = '';
  try {
    await $fetch(`/api/admin/commands/${selectedCommand.value.id}/run`, {
      method: 'POST',
      body: {
        entities: commandEntities.value,
        parameters: commandParameters.value,
        testAccess: workbenchTestAccess.value
      }
    });
    await loadCommandRuns();
  } catch (error) {
    commandsError.value = error?.data?.message || error?.message || t('admin.workbench.errors.runCommandFailed');
    await loadCommandRuns();
  } finally {
    commandRunning.value = false;
  }
}

async function rebuildFixtureScenario(options = {}) {
  const previousTemplateId = selectedCassetteTemplateId.value;
  fixtureStore.rebuild({
    workflows: workflows.value,
    entities: entities.value,
    commands: commands.value
  });
  manualEntityRefs.value = [];
  applyScenarioDefaults();
  resetManualEntityDraft();
  if (options?.loadPersistedCassettes !== false) {
    await loadPersistedCassetteTemplates({ preferredTemplateId: previousTemplateId });
  }
}

async function seedFixtureScenario() {
  await fixtureStore.seed({
    workflows: workflows.value,
    entities: entities.value,
    commands: commands.value
  });
  applyScenarioDefaults();
}

function resetManualEntityDraft() {
  manualEntityDraft.value = defaultManualEntityDraft(manualEntityType.value);
}

function selectManualEntityType(type) {
  manualEntityType.value = type;
}

function createManualEntity() {
  if (manualEntityType.value === 'cassette') return;
  if (!canCreateManualEntity.value) return;
  const entity = buildManualEntity(manualEntityType.value, manualEntityDraft.value);
  if (!entity) return;
  upsertManualEntity(manualEntityType.value, entity);
  resetManualEntityDraft();
}

function createManualCassetteTemplate(payload = {}) {
  const params = payload.parameters || {};
  const definition = params.definition || {};
  const parameterNames = Array.isArray(params.parameters) ? params.parameters : occsParameterNames(definition);
  const entity = buildManualEntity('cassette', {
    name: params.name || t('cassette.newCassette'),
    definition,
    parameters: parameterNames
  });
  if (!entity) return;
  upsertManualEntity('cassette', entity, 'cassette_template');
  selectedCassetteTemplateId.value = entity._id;
  setWorkbenchRefs({ cassetteTemplate: entity._id });
  syncNestingQueueCassette(entity);
  applyScenarioDefaults();
  manualCassetteDesignerKey.value += 1;
}

function upsertManualEntity(type, entity, previewType = manualEntityPreviewType(type)) {
  fixtureStore.upsertEntities([{ type: manualEntityContextType(type), entity }]);
  manualEntityRefs.value = uniqueOutputRefs([
    { type: previewType, id: entity._id },
    ...manualEntityRefs.value
  ]);
}

async function handleWorkbenchStatusTransition({ entityType, targetId, targetState }) {
  const entity = fixtureStore.transitionEntityStatus(manualEntityContextType(entityType), targetId, targetState, {
    userId: workbenchTestAccess.value.userId || fixtureStore.access.userId || 'workbench-user',
    metadata: { note: 'Workbench preview transition' }
  });
  return { entity, status: entity?.status || null, actions: [] };
}

function defaultManualEntityDraft(type) {
  return createDefaultManualEntityDraft(type, {
    context: fixtureStore.context,
    workflowCompile: workflowCompile.value,
    label: entityLabelForType(type)
  });
}

function manualFieldsForEntity(type) {
  return buildManualFieldsForEntity(type, workflowCompile.value).map(field => ({
    ...field,
    label: manualFieldLabel(field.name)
  }));
}

function buildManualEntity(type, draft = {}) {
  return buildManualWorkbenchEntity(type, draft, {
    context: fixtureStore.context,
    workflowCompile: workflowCompile.value,
    entityDefinition: manualEntityDefinitionFor(type)
  });
}

function syncCommandInput() {
  ensureSelectedCommand();
  if (!selectedCommand.value) {
    commandEntities.value = {};
    commandParameters.value = {};
    commandRuns.value = [];
    return;
  }
  const entitiesInput = {};
  for (const input of selectedCommand.value.input?.entities || []) {
    entitiesInput[input.name] = '';
  }
  commandEntities.value = entitiesInput;
  commandParameters.value = defaultSettingsFor(selectedCommand.value.input?.parameters || []);
  applyScenarioDefaults();
  loadCommandRuns();
}

function applyScenarioDefaults() {
  syncWorkbenchAccessDefaults();
  if (!selectedCommand.value) return;
  const defaults = fixtureStore.defaultsForAction(selectedCommand.value.id);
  commandEntities.value = {
    ...commandEntities.value,
    ...(defaults.entities || {})
  };
  commandParameters.value = {
    ...commandParameters.value,
    ...(defaults.parameters || {})
  };
}

function syncWorkbenchAccessDefaults() {
  workbenchTestAccess.value = {
    ...workbenchTestAccess.value,
    userId: fixtureStore.access.userId || workbenchTestAccess.value.userId,
    organizationId: fixtureStore.access.organizationId || workbenchTestAccess.value.organizationId,
    role: fixtureStore.access.role || workbenchTestAccess.value.role,
    restrictedTo: fixtureStore.access.restrictedTo || workbenchTestAccess.value.restrictedTo,
    memberships: fixtureStore.access.memberships || workbenchTestAccess.value.memberships,
    permissions: {
      ...(fixtureStore.access.permissions || {}),
      ...(workbenchTestAccess.value.permissions || {})
    }
  };
}

function setWorkbenchAccessLevel(feature, level) {
  workbenchTestAccess.value = {
    ...workbenchTestAccess.value,
    permissions: {
      ...(workbenchTestAccess.value.permissions || {}),
      [feature]: level
    }
  };
}

function ensureSelectedCommand() {
  if (visibleCommands.value.some(command => command.id === selectedCommandId.value)) return;
  selectedCommandId.value = visibleCommands.value[0]?.id || '';
}

function commandRunSeverity(status) {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'RUNNING') return 'warn';
  return 'secondary';
}

function taskRunSeverity(status) {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'FAILED' || status === 'CANCELLED') return 'danger';
  if (status === 'RUNNING') return 'warn';
  if (status === 'RETRY_WAIT') return 'info';
  return 'secondary';
}

function taskOutputTags(task) {
  const output = task?.output || {};
  return [
    ...(output.entities || []).map(item => `entity:${item}`),
    ...(output.attachments || []).map(item => `attachment:${item}`),
    ...(output.tasks || []).map(item => `task:${item}`),
    ...(output.events || []).map(item => `event:${item}`),
    ...(output.data || []).map(item => `data:${item}`)
  ];
}

function commandRelatedTaskIds(command) {
  if (!command) return new Set();
  const explicit = command.output?.tasks || [];
  const inferred = taskDefinitions.value
    .filter(task => task.service === command.service)
    .filter(task => task.id === `${command.service}.${command.action}` || task.id.endsWith(`.${command.action}`))
    .map(task => task.id);
  const runIds = taskRuns.value
    .filter(run => run.service === command.service)
    .filter(run => run.taskId === `${command.service}.${command.action}` || run.taskId?.endsWith(`.${command.action}`))
    .map(run => run.taskId);
  return new Set([...explicit, ...inferred, ...runIds]);
}

function taskRunDebug(run) {
  return JSON.stringify({
    input: run.input,
    output: run.output,
    error: run.error,
    executor: run.executor,
    auth: run.auth
  }, null, 2);
}

function commandRunSummary(run) {
  if (run.error?.message) return run.error.message;
  if (run.result?.entities?.length) return run.result.entities.map(item => `${item.type}:${item.id}`).join(', ');
  if (run.result?.tasks?.length) return run.result.tasks.map(item => `${item.type}:${item.id}`).join(', ');
  return run.status;
}

function commandRunOutput(run) {
  if (run.error) return JSON.stringify(run.error, null, 2);
  if (run.result) return JSON.stringify(run.result, null, 2);
  return commandRunSummary(run);
}

function previewForEntityRef(entityType, id, key) {
  if (!entityType || !id) return null;
  const renderer = entityRenderers.value[entityType];
  if (!renderer?.component) return null;
  const entity = findScenarioEntity(entityType, id);
  if (!entity) return null;
  return {
    key,
    component: renderer.component,
    props: { [renderer.propName]: entity }
  };
}

function previewForArtifactOutput(item) {
  const renderer = entityRenderers.value.artifact;
  if (!renderer?.component || !item?.id) return null;
  const entity = findScenarioEntity('artifact', item.id);
  if (!entity) return null;
  return {
    key: `attachment:${item.kind || item.type}:${item.id}`,
    component: renderer.component,
    props: { [renderer.propName]: entity },
    listeners: { click: previewArtifactOutput }
  };
}

function previewArtifactOutput(artifact) {
  artifactPreviewEntity.value = artifact;
  artifactPreviewError.value = '';
  artifactPreviewVisible.value = true;
}

function downloadArtifactPreview() {
  if (!artifactPreviewEntity.value?._id) return;
  window.location.href = domainUi.getDownloadEndpoint('artifact', artifactPreviewEntity.value._id);
}

function handleArtifactPreviewError(error) {
  artifactPreviewError.value = t('artifacts.loadDxfPreviewFailed', { message: error.message });
}

function outputRefsFromResult(result) {
  if (!result) return [];
  return [
    ...(result.entities || []).map(item => ({ type: item.type, id: item.id })),
    ...(result.attachments || []).map(item => ({ type: 'artifact', id: item.id, artifactKind: item.kind }))
  ].filter(item => item.type && item.id);
}

function uniqueOutputRefs(refs = []) {
  return Array.from(new Map(refs
    .filter(ref => ref.type && ref.id)
    .map(ref => [`${ref.type}:${ref.id}`, ref])).values());
}

function findScenarioEntity(entityType, id) {
  const options = fixtureStore.entityOptions[manualEntityContextType(entityType)] || [];
  return options.find(option => option.value?.toString() === id?.toString())?.entity || null;
}

function defaultSettingsFor(fields) {
  return Object.fromEntries((fields || [])
    .filter(field => field.default !== undefined)
    .map(field => [field.name, field.default]));
}

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString();
}

function loadStoredDraft() {
  if (!import.meta.client) return;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    workflows.value = parsed.workflows || workflows.value;
    feedback.value = parsed.feedback || {};
    dataDecisions.value = parsed.dataDecisions || {};
  } catch {
    resetWorkbench();
  }
}

function loadWorkflowLayouts() {
  if (!import.meta.client) return;
  const saved = localStorage.getItem(WORKFLOW_LAYOUT_STORAGE_KEY);
  if (!saved) return;
  try {
    workflowLayouts.value = JSON.parse(saved);
  } catch {
    workflowLayouts.value = {};
  }
}

function saveDraft() {
  if (!import.meta.client) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    workflows: workflows.value,
    feedback: feedback.value,
    dataDecisions: dataDecisions.value
  }));
}

function saveWorkflowLayouts() {
  if (!import.meta.client) return;
  localStorage.setItem(WORKFLOW_LAYOUT_STORAGE_KEY, JSON.stringify(workflowLayouts.value));
}

function resetWorkbench() {
  entities.value = clonePlain(sourceDomain.value.entities || []);
  workflows.value = clonePlain(sourceDomain.value.workflows || {});
  hookContracts.value = clonePlain(sourceDomain.value.hooks || {});
  feedback.value = {};
  dataDecisions.value = {};
  workflowLayouts.value = {};
  if (import.meta.client) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(WORKFLOW_LAYOUT_STORAGE_KEY);
  }
}

function dataDecisionFor(field) {
  const key = `${selectedEntityRow.value?.key || selectedEntity.value.type}:${field.name}`;
  dataDecisions.value[key] ||= { decision: 'unchecked', target: '' };
  return dataDecisions.value[key];
}

function isObviousModelField(field) {
  const name = field?.name || '';
  if (!name || name === '_id') return true;
  if (['identity', 'lineage', 'origin', 'status', 'specs', 'attachments', 'data', 'summary'].includes(name)) return true;
  return name.startsWith('lineage.') || name.startsWith('origin.') || name.startsWith('identity.');
}

function addWorkflowState() {
  const name = uniqueName('STATE', workflowStateNames.value);
  workflowDraft.value.states[name] = {};
  if (!workflowDraft.value.initial) workflowDraft.value.initial = name;
}

function removeWorkflowState(state) {
  delete workflowDraft.value.states[state];
  delete workflowLayouts.value[selectedEntity.value.type]?.[state];
  workflowDraft.value.transitions = workflowDraft.value.transitions.filter(transition => transition.from !== state && transition.to !== state);
  if (workflowDraft.value.initial === state) workflowDraft.value.initial = workflowStateNames.value[0] || '';
  if (selectedState.value === state) selectedState.value = workflowStateNames.value[0] || '';
  selectedTransitionIndex.value = null;
  if (transitionDraftFrom.value === state) transitionDraftFrom.value = '';
}

function workflowNodeStyle(node) {
  const selected = selectedState.value === node.id || transitionDraftFrom.value === node.id;
  const base = {
    width: `${node.width}px`,
    minHeight: `${node.height}px`,
    borderRadius: 'var(--ck-radius-ui)',
    border: selected ? '2px solid var(--p-primary-color)' : '1px solid var(--p-content-border-color)',
    fontFamily: 'inherit',
    fontWeight: 600
  };
  if (node.initial || transitionDraftFrom.value === node.id) {
    return {
      ...base,
      background: 'var(--p-primary-color)',
      color: 'var(--p-primary-contrast-color)'
    };
  }
  if (node.terminal) {
    return {
      ...base,
      background: 'var(--ck-subtle-background)',
      color: 'var(--p-text-color)'
    };
  }
  return {
    ...base,
    background: 'var(--p-content-background)',
    color: 'var(--p-text-color)'
  };
}

function workflowEdgeStyle(edge) {
  return {
    stroke: selectedTransitionIndex.value === edge.index ? 'var(--p-primary-color)' : 'var(--p-content-border-color)',
    strokeWidth: selectedTransitionIndex.value === edge.index ? 3 : 2
  };
}

function edgePathOptions(edge) {
  if (edge.reciprocal) {
    return { curvature: edge.reverse ? 0.55 : 0.2 };
  }
  return {
    offset: 24 + edge.sameDirectionIndex * 18,
    borderRadius: 12
  };
}

function workflowNodePosition(node) {
  return workflowLayouts.value[selectedEntity.value.type]?.[node.id] || { x: node.x, y: node.y };
}

function transitionLabel(transition = {}) {
  const parts = [`${transition.from} -> ${transition.to}`];
  if (transition.access?.permissions?.length) parts.push(`${transition.access.permissions.length} perms`);
  if (transition.access?.system) parts.push('system');
  const capabilities = transition.capabilities || transition.requiredCapabilities || [];
  if (capabilities.length) parts.push(`${capabilities.length} caps`);
  if (transition.hooks?.length) parts.push(`${transition.hooks.length} hooks`);
  return parts.join(' / ');
}

function selectState(state) {
  if (transitionDraftFrom.value) {
    workflowDraft.value.transitions.push({
      from: transitionDraftFrom.value,
      to: state,
      access: defaultTransitionAccess()
    });
    selectedTransitionIndex.value = workflowDraft.value.transitions.length - 1;
    selectedState.value = '';
    transitionDraftFrom.value = '';
    return;
  }
  selectedState.value = state;
  selectedTransitionIndex.value = null;
}

function selectTransition(index) {
  selectedTransitionIndex.value = index;
  selectedState.value = '';
  transitionDraftFrom.value = '';
}

function startTransitionDraft() {
  if (transitionDraftFrom.value) {
    transitionDraftFrom.value = '';
    return;
  }
  transitionDraftFrom.value = selectedState.value || workflowDraft.value.initial || workflowStateNames.value[0] || '';
  selectedTransitionIndex.value = null;
}

function renameSelectedState(value) {
  const next = String(value || '').trim();
  const previous = selectedState.value;
  if (!next || next === previous || workflowDraft.value.states[next]) return;
  workflowDraft.value.states[next] = workflowDraft.value.states[previous];
  delete workflowDraft.value.states[previous];
  for (const transition of workflowDraft.value.transitions) {
    if (transition.from === previous) transition.from = next;
    if (transition.to === previous) transition.to = next;
  }
  if (workflowDraft.value.initial === previous) workflowDraft.value.initial = next;
  if (transitionDraftFrom.value === previous) transitionDraftFrom.value = next;
  if (workflowLayouts.value[selectedEntity.value.type]?.[previous]) {
    workflowLayouts.value[selectedEntity.value.type][next] = workflowLayouts.value[selectedEntity.value.type][previous];
    delete workflowLayouts.value[selectedEntity.value.type][previous];
  }
  selectedState.value = next;
}

function ensureLifecycle() {
  selectedStateDefinition.value.lifecycle ||= {};
  return selectedStateDefinition.value.lifecycle;
}

function pruneLifecycle() {
  const lifecycle = selectedStateDefinition.value.lifecycle;
  if (!lifecycle) return;
  if (!lifecycle.actors?.length) delete lifecycle.actors;
  if (!lifecycle.attachments || Object.keys(lifecycle.attachments).length === 0) delete lifecycle.attachments;
  if (lifecycle.data !== true) delete lifecycle.data;
  if (Object.keys(lifecycle).length === 0) delete selectedStateDefinition.value.lifecycle;
}

function updateLifecycleActors(value) {
  const actors = parseValueList(value);
  if (actors.length) ensureLifecycle().actors = actors;
  else if (selectedStateDefinition.value.lifecycle) delete selectedStateDefinition.value.lifecycle.actors;
  pruneLifecycle();
}

function updateLifecycleData(value) {
  if (value) ensureLifecycle().data = true;
  else if (selectedStateDefinition.value.lifecycle) delete selectedStateDefinition.value.lifecycle.data;
  pruneLifecycle();
}

function ensureLifecycleAttachments() {
  const lifecycle = ensureLifecycle();
  lifecycle.attachments ||= {};
  return lifecycle.attachments;
}

function addLifecycleAttachment() {
  const attachments = ensureLifecycleAttachments();
  const name = uniqueName('attachment', Object.keys(attachments));
  attachments[name] = { multiple: false };
}

function renameLifecycleAttachment(previous, value) {
  const next = String(value || '').trim();
  const attachments = selectedStateDefinition.value.lifecycle?.attachments;
  if (!attachments || !next || next === previous || attachments[next]) return;
  attachments[next] = attachments[previous];
  delete attachments[previous];
}

function updateLifecycleAttachmentMultiple(name, value) {
  const attachments = ensureLifecycleAttachments();
  attachments[name] ||= {};
  attachments[name].multiple = Boolean(value);
}

function removeLifecycleAttachment(name) {
  const attachments = selectedStateDefinition.value.lifecycle?.attachments;
  if (!attachments) return;
  delete attachments[name];
  pruneLifecycle();
}

function updateTransitionCapabilities(transition, value) {
  const capabilities = parseValueList(value);
  delete transition.requiredCapabilities;
  if (capabilities.length) transition.capabilities = capabilities;
  else delete transition.capabilities;
}

function updateTransitionAccess(transition, value) {
  transition.access = parseJsonObject(value, transition.access || defaultTransitionAccess());
}

function defaultTransitionAccess() {
  return { permissions: [{ feature: featureForEntity(selectedEntity.value.type), level: 'write' }] };
}

function addTransitionHook(transition) {
  transition.hooks ||= [];
  transition.hooks.push({ handler: hookOptions.value[0]?.value || 'triggerAggregator', params: {} });
}

function updateHookHandler(hook, value) {
  hook.handler = value;
  hook.params = {};
}

function updateHookPhase(hook, value) {
  if (value && value !== 'after') hook.phase = value;
  else delete hook.phase;
}

function updateHookMode(hook, value) {
  if (value && value !== 'async') hook.mode = value;
  else delete hook.mode;
}

function hookParameterFields(handler) {
  return hookContracts.value[handler]?.parameters || [];
}

function parseValueList(value) {
  if (Array.isArray(value)) return uniqueSorted(value.map(item => String(item || '').trim()).filter(Boolean));
  return parseCommaList(value);
}

function removeSelectedTransition() {
  if (selectedTransitionIndex.value === null) return;
  workflowDraft.value.transitions.splice(selectedTransitionIndex.value, 1);
  selectedTransitionIndex.value = null;
}

function onWorkflowNodeClick(event) {
  selectState(event.node.id);
}

function onWorkflowNodeDragStop(event) {
  workflowLayouts.value[selectedEntity.value.type] ||= {};
  workflowLayouts.value[selectedEntity.value.type][event.node.id] = {
    x: Math.round(event.node.position.x),
    y: Math.round(event.node.position.y)
  };
}

function onWorkflowEdgeClick(event) {
  selectTransition(event.edge.data.index);
}

function onWorkflowConnect(connection) {
  if (!connection.source || !connection.target) return;
  workflowDraft.value.transitions.push({
    from: connection.source,
    to: connection.target,
    access: defaultTransitionAccess()
  });
  selectedTransitionIndex.value = workflowDraft.value.transitions.length - 1;
  selectedState.value = '';
  transitionDraftFrom.value = '';
}

function downloadDraft() {
  const blob = new Blob([JSON.stringify({
    entities: entities.value,
    uiComponents: selectedUiRows.value.map(row => ({
      key: row.key,
      entityType: row.entityType,
      propName: row.propName,
      status: row.status,
      trace: row.trace
    })),
    dataDecisions: dataDecisions.value,
    feedback: feedback.value,
    workflows: workflows.value
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cutkit-workbench-draft.json';
  link.click();
  URL.revokeObjectURL(url);
}

function entityLabelForType(type) {
  if (type === 'cassette') return t('entities.cassetteTemplate');
  const row = DESIGN_SYSTEM_ENTITIES.find(entry => entry.entityType === type)
    || DESIGN_SYSTEM_ENTITIES.find(entry => manualEntityContextType(entry.entityType) === type);
  return row?.labelKey ? t(row.labelKey) : type;
}

function manualEntityTypeLabel(type) {
  return manualEntityTypeOptions.value.find(option => option.value === type)?.label || entityLabelForType(type);
}

function manualEntityDefinitionFor(type) {
  return manualEntityDefinitions.value.find(entity => entity.type === type) || {};
}

function manualFieldLabel(name) {
  const key = `admin.workbench.manualFields.${name}`;
  const translated = t(key);
  return translated === key ? name : translated;
}

function normalizeCollection(collection) {
  return String(collection || '').replace(/-/g, '_');
}

function entityFeature(entityType) {
  if (entityType === 'project') return 'projects';
  if (entityType === 'queue') return 'queues';
  if (['material', 'material_pile', 'sheet', 'remnant', 'geometry_capture'].includes(entityType)) return 'materials';
  if (entityType === 'requisition') return 'requisitions';
  if (String(entityType || '').includes('cassette')) return 'projects';
  return String(entityType || '').replace(/_/g, '-');
}

function uniqueName(prefix, existing) {
  let index = 1;
  let value = `${prefix}_${index}`;
  while (existing.includes(value)) {
    index += 1;
    value = `${prefix}_${index}`;
  }
  return value;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function featureForEntity(type) {
  const featureMap = {
    artifact: 'artifacts',
    material_pile: 'materials',
    nesting_run: 'nesting_runs',
    cassette_design: 'cassettes',
    cassette_instance: 'projects',
    sheet_design: 'projects'
  };
  return featureMap[type] || `${type}s`;
}
</script>
