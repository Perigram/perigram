<template>
  <StandardDialog :visible="visible" size="sm" :title="t('editors.insertGraphResult')" @update:visible="shown => { if (!shown) emit('close'); }">
    <div class="flex max-h-[70vh] min-w-80 flex-col gap-2 overflow-y-auto">
      <Button
        v-if="step !== 'graph' && !inserting"
        icon="pi pi-arrow-left"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="t('common.back')"
        @click="goBack"
      />

      <template v-if="step === 'graph'">
        <div class="text-supporting text-muted">{{ t('editors.graphResultHint') }}</div>
        <div v-if="graphsLoading" class="py-3 text-supporting text-muted">{{ t('common.loading') }}</div>
        <div v-else-if="!graphs.length" class="py-3 text-supporting text-muted">{{ t('editors.noSavedGraphs') }}</div>
        <Button
          v-for="graph in graphs"
          :key="graph._id"
          :label="graph.name"
          icon="pi pi-sitemap"
          text
          class="w-full justify-start"
          :disabled="!graph.graph"
          @click="selectGraph(graph)"
        />
      </template>

      <template v-else-if="step === 'revision'">
        <div class="text-supporting text-muted">{{ t('editors.graphRevisionHint') }}</div>
        <div v-if="revisionsLoading" class="py-3 text-supporting text-muted">{{ t('common.loading') }}</div>
        <template v-else>
          <Button
            :label="currentRevisionLabel"
            icon="pi pi-objects-column"
            text
            class="w-full justify-start"
            @click="selectRevision('')"
          />
          <Button
            v-for="revision in revisions"
            :key="revision._id"
            :label="revisionLabel(revision)"
            icon="pi pi-bookmark"
            text
            class="w-full justify-start"
            @click="selectRevision(revision)"
          />
        </template>
      </template>

      <template v-else>
        <div class="flex flex-col gap-1">
          <div class="text-supporting"><strong>{{ t('editors.graphOutputsLabel') }}</strong></div>
          <Button
            v-for="output in declaredOutputs"
            :key="output.id"
            :label="String(output.label || output.id)"
            icon="pi pi-objects-column"
            text
            class="w-full justify-start"
            :severity="selectedOutputId === output.id ? 'primary' : 'secondary'"
            @click="selectedOutputId = output.id"
          />
          <div v-if="!declaredOutputs.length" class="py-2 text-supporting text-muted">{{ t('editors.noDeclaredOutputs') }}</div>
        </div>

        <div v-if="parameterInputs.length" class="flex flex-col gap-2">
          <div class="text-supporting"><strong>{{ t('editors.graphParametersLabel') }}</strong></div>
          <label v-for="port in parameterInputs" :key="port.id" class="flex flex-col gap-1">
            <span class="text-supporting">{{ port.label || port.id }}{{ port.required ? ' *' : '' }}</span>
            <InputText v-if="inputBase(port) === 'string'" v-model="parameterDrafts[port.id]" size="small" />
            <InputNumber v-else-if="inputBase(port) === 'number' || inputBase(port) === 'integer'" v-model="parameterDrafts[port.id]" size="small" />
            <Checkbox v-else-if="inputBase(port) === 'boolean'" :model-value="Boolean(parameterDrafts[port.id])" binary @update:model-value="value => (parameterDrafts[port.id] = value)" />
            <Textarea v-else v-model="parameterDrafts[port.id]" auto-resize rows="2" :invalid="!jsonInputValid(port)" />
          </label>
        </div>

        <div class="flex flex-col gap-1">
          <div class="text-supporting"><strong>{{ t('editors.graphEmbedModeLabel') }}</strong></div>
          <div class="flex items-center gap-2">
            <Button
              :label="t('editors.liveEvaluation')"
              :severity="mode === 'live' ? 'primary' : 'secondary'"
              size="small"
              outlined
              @click="mode = 'live'"
            />
            <Button
              :label="t('editors.retainedResult')"
              :severity="mode === 'retained' ? 'primary' : 'secondary'"
              size="small"
              outlined
              @click="mode = 'retained'"
            />
          </div>
          <div class="text-supporting text-muted">{{ mode === 'live' ? t('editors.liveModeHint') : t('editors.retainedModeHint') }}</div>
        </div>

        <Button
          v-if="mode === 'live'"
          :label="t('editors.insertGraphResult')"
          icon="pi pi-check"
          size="small"
          :disabled="!canInsertLive"
          @click="insertLive"
        />

        <template v-else>
          <div v-if="retainedLoading" class="py-2 text-supporting text-muted">{{ t('common.loading') }}</div>
          <template v-else>
            <div v-if="!retainedOutputs.length" class="py-2 text-supporting text-muted">{{ t('editors.noRetainedResults') }}</div>
            <div v-for="output in retainedOutputs" :key="output.executionInstanceId" class="flex items-center gap-1">
              <Button :label="executionLabel(output)" icon="pi pi-sitemap" text class="min-w-0 flex-1 justify-start" :disabled="inserting" @click="insertRetained(output)" />
              <Button
                icon="pi pi-bookmark"
                text
                size="small"
                severity="secondary"
                :aria-label="t('editors.freezeGraphResult')"
                :title="t('editors.freezeGraphResult')"
                :loading="capturingKey === output.executionInstanceId + ':' + output.outputId"
                :disabled="inserting"
                @click="pickFrozen(output)"
              />
            </div>
          </template>
        </template>
        <div v-if="captureFailed" class="py-1 text-supporting text-muted">{{ t('editors.graphResultUnavailable') }}</div>
      </template>
    </div>
  </StandardDialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { frozenCollectionEmbed, liveGraphEmbed, retainedCollectionEmbed } from './graph-output-embed-contract.js';

const { t } = useI18n();
const props = defineProps({ visible: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'pick']);

const step = ref('graph');
const graphs = ref([]);
const graphsLoading = ref(false);
const selectedGraph = ref(null);
const revisions = ref([]);
const revisionsLoading = ref(false);
const pinnedGraph = ref(null);
const selectedOutputId = ref('');
const parameterDrafts = ref({});
const mode = ref('live');
const retainedOutputs = ref([]);
const retainedLoading = ref(false);
const capturingKey = ref('');
const captureFailed = ref(false);
const inserting = ref(false);

const declaredOutputs = computed(() => (pinnedGraph.value?.interface?.outputs || []).map(port => ({
  id: String(port.id || ''),
  label: String(port.label || port.id || '')
})));
const parameterInputs = computed(() => pinnedGraph.value?.interface?.inputs || []);
const currentRevisionLabel = computed(() => `${t('editors.currentDefinition')} · ${String(selectedGraph.value?.graph?.revision || '').slice(0, 8)}`);

const canInsertLive = computed(() => {
  if (!selectedOutputId.value) return false;
  for (const port of parameterInputs.value) {
    if (!port.required) continue;
    const raw = parameterDrafts.value[port.id];
    if (raw === undefined || raw === null || String(raw).trim() === '') return false;
    if (!jsonInputValid(port)) return false;
  }
  return true;
});

function inputBase(port) {
  const base = String(port?.contract?.semantic?.base || port?.contract?.base || 'string');
  return base === 'number' || base === 'integer' || base === 'boolean' ? base : (base === 'string' ? 'string' : 'json');
}

function jsonInputValid(port) {
  if (inputBase(port) !== 'json') return true;
  const raw = parameterDrafts.value[port.id];
  if (raw === undefined || String(raw).trim() === '') return !port?.required;
  try {
    JSON.parse(String(raw));
    return true;
  } catch {
    return false;
  }
}

function revisionLabel(revision) {
  return `v${revision.data?.number ?? '?'} · ${String(revision.data?.createdAt || '').slice(0, 16)}`;
}

function executionLabel(output) {
  return `${output.label} · ${output.count} · ${String(output.completedAt || '').slice(0, 16)}`;
}

function typedParameterValue(port) {
  const raw = parameterDrafts.value[port.id];
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  const base = inputBase(port);
  if (base === 'number' || base === 'integer') return Number(raw);
  if (base === 'json') {
    try {
      return JSON.parse(String(raw));
    } catch {
      return undefined;
    }
  }
  return raw;
}

function typedParameters() {
  const parameters = {};
  for (const port of parameterInputs.value) {
    const value = typedParameterValue(port);
    if (value !== undefined) parameters[port.id] = value;
  }
  return parameters;
}

function goBack() {
  captureFailed.value = false;
  if (step.value === 'output') {
    step.value = 'revision';
    pinnedGraph.value = null;
    selectedOutputId.value = '';
    parameterDrafts.value = {};
    mode.value = 'live';
    retainedOutputs.value = [];
  } else if (step.value === 'revision') {
    step.value = 'graph';
    selectedGraph.value = null;
    revisions.value = [];
  }
}

function selectGraph(graph) {
  if (!graph?.graph) return;
  selectedGraph.value = graph;
  step.value = 'revision';
  revisions.value = [];
  revisionsLoading.value = true;
  $fetch('/api/instance-revisions', {
    query: { typeId: 'graph-document', instanceId: String(graph._id), scope: 'content' }
  })
    .then(result => {
      revisions.value = (Array.isArray(result) ? result : [])
        .sort((a, b) => Number(b.data?.number || 0) - Number(a.data?.number || 0));
    })
    .catch(() => {
      revisions.value = [];
    })
    .finally(() => {
      revisionsLoading.value = false;
    });
}

async function selectRevision(revision) {
  const graph = selectedGraph.value;
  if (!graph) return;
  try {
    pinnedGraph.value = revision
      ? JSON.parse(await $fetch(`/api/instance-revisions/${encodeURIComponent(revision._id)}/file`, { responseType: 'text' }))
      : graph.graph;
  } catch {
    pinnedGraph.value = null;
  }
  if (!pinnedGraph.value) return;
  selectedOutputId.value = '';
  parameterDrafts.value = {};
  for (const port of pinnedGraph.value.interface?.inputs || []) {
    if (port.default !== undefined) parameterDrafts.value[port.id] = port.default;
  }
  step.value = 'output';
}

watch([mode, selectedOutputId], ([value]) => {
  retainedOutputs.value = [];
  captureFailed.value = false;
  if (value !== 'retained' || !pinnedGraph.value || !selectedGraph.value || !selectedOutputId.value) return;
  retainedLoading.value = true;
  $fetch('/api/graph-executions/collection-outputs')
    .then(options => {
      retainedOutputs.value = (Array.isArray(options) ? options : []).filter(option => (
        String(option.graphDocumentInstanceId) === String(selectedGraph.value._id)
        && String(option.graphId) === String(pinnedGraph.value.id)
        && String(option.graphRevision) === String(pinnedGraph.value.revision)
        && String(option.outputId) === String(selectedOutputId.value)
      ));
    })
    .catch(() => {
      retainedOutputs.value = [];
    })
    .finally(() => {
      retainedLoading.value = false;
    });
});

function insertLive() {
  if (!canInsertLive.value || !pinnedGraph.value || !selectedGraph.value) return;
  inserting.value = true;
  emit('pick', liveGraphEmbed({
    graphDocumentInstanceId: selectedGraph.value._id,
    graphId: pinnedGraph.value.id,
    graphRevision: pinnedGraph.value.revision
  }, { id: selectedOutputId.value }, typedParameters()));
}

function insertRetained(output) {
  inserting.value = true;
  emit('pick', retainedCollectionEmbed(output));
}

async function pickFrozen(output) {
  capturingKey.value = output.executionInstanceId + ':' + output.outputId;
  captureFailed.value = false;
  try {
    const resolved = await $fetch(`/api/graph-executions/collection-outputs/${encodeURIComponent(output.executionInstanceId)}/${encodeURIComponent(output.outputId)}`, { query: { graphDocumentInstanceId: output.graphDocumentInstanceId, graphId: output.graphId, graphRevision: output.graphRevision } });
    inserting.value = true;
    emit('pick', frozenCollectionEmbed(output, resolved));
  } catch {
    captureFailed.value = true;
  } finally {
    capturingKey.value = '';
  }
}

watch(() => props.visible, async visible => {
  if (!visible) return;
  step.value = 'graph';
  graphs.value = [];
  selectedGraph.value = null;
  revisions.value = [];
  pinnedGraph.value = null;
  selectedOutputId.value = '';
  parameterDrafts.value = {};
  mode.value = 'live';
  retainedOutputs.value = [];
  captureFailed.value = false;
  inserting.value = false;
  graphsLoading.value = true;
  try {
    const items = await $fetch('/api/instances/graph-document');
    graphs.value = await Promise.all((Array.isArray(items) ? items : [])
      .filter(item => item?.payload?.fileId && item?._id)
      .map(async item => {
        const record = {
          ...item,
          _id: String(item._id),
          name: String(item.name || 'Graph'),
          graphId: String(item.fields?.graphId || '')
        };
        try {
          const payload = await $fetch(`/api/files/download/${encodeURIComponent(record.payload.fileId)}?bucket=files`, { responseType: 'text' });
          record.graph = JSON.parse(payload);
          return record;
        } catch {
          record.graph = null;
          return record;
        }
      }));
  } catch {
    graphs.value = [];
  } finally {
    graphsLoading.value = false;
  }
}, { immediate: true });
</script>
