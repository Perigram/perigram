<template>
  <div>
    <div v-if="isEffect" class="flex flex-col gap-2">
      <!-- Role assignment is lane placement (node UI contract "Lanes");
           this panel owns only the per-grant access LEVELS. -->
      <div
        v-for="(grant, index) in grants"
        :key="grant.roleId"
        class="flex items-center gap-2"
      >
        <span class="min-w-0 flex-1 truncate text-supporting">{{ roleOptions.find(option => option.value === grant.roleId)?.label || grant.roleId }}</span>
        <Select
          :model-value="grant.level || 'write'"
          :options="accessLevelOptions"
          option-label="label"
          option-value="value"
          class="w-28 shrink-0"
          size="small"
          @update:model-value="value => $emit('update-grant-level', { index, level: value })"
        />
      </div>
      <div v-if="accessDetail" class="text-supporting text-muted">{{ accessDetail }}</div>
      <div v-if="effectiveAccess.length" class="flex flex-wrap gap-1">
        <span
          v-for="item in effectiveAccess"
          :key="item.label"
          class="max-w-full truncate rounded-ui bg-subtle px-1.5 py-0.5 text-supporting"
          :class="item.inherited ? 'text-muted' : ''"
        >{{ item.label }}</span>
      </div>
    </div>
    <Panel v-if="record.kind === 'cts.transition' && typeId" :header="$t('processDesigner.transitionStatusHeader')" class="mt-0">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('processDesigner.transitionAxis') }}</label>
          <Select
            :model-value="record.state?.axis || 'main'"
            :options="transitionAxisOptions"
            option-label="label"
            option-value="value"
            size="small"
            @update:model-value="value => updateTransitionReference('axis', value)"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label>{{ $t('processDesigner.transitionTo') }}</label>
          <Select
            :model-value="record.state?.to || ''"
            :options="transitionPathOptions(record.state?.axis || 'main')"
            option-label="label"
            option-value="value"
            size="small"
            filter
            @update:model-value="value => updateTransitionReference('to', value)"
          />
        </div>
        <small class="text-muted">{{ $t('processDesigner.transitionReferenceHint') }}</small>
      </div>
    </Panel>
    <Panel v-if="record.kind === 'cts.transition' && typeId" :header="$t('processDesigner.transitionGuard')" class="mt-0">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <Select
            :model-value="guardMode"
            :options="guardModeOptions"
            option-label="label"
            option-value="value"
            size="small"
            @update:model-value="setGuardMode"
          />
        </div>
        <div v-for="(condition, index) in guardConditions" :key="index" class="flex items-center gap-2">
          <Select
            :model-value="condition.field"
            :options="guardFieldOptions"
            option-label="label"
            option-value="value"
            size="small"
            filter
            class="min-w-0 flex-1"
            :placeholder="$t('processDesigner.field')"
            @update:model-value="value => updateGuardCondition(index, 'field', value)"
          />
          <Select
            :model-value="condition.op"
            :options="guardOperatorOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="w-16 shrink-0"
            @update:model-value="value => updateGuardCondition(index, 'op', value)"
          />
          <InputText
            :model-value="condition.value"
            size="small"
            class="w-24 shrink-0"
            @change="event => updateGuardCondition(index, 'value', event.target.value)"
          />
          <Button icon="pi pi-times" :aria-label="$t('common.delete')" size="small" text severity="danger" @click="removeGuardCondition(index)" />
        </div>
        <Button icon="pi pi-plus" :label="$t('processDesigner.addGuardCondition')" size="small" text @click="addGuardCondition" />
        <small class="text-muted">{{ $t('processDesigner.transitionGuardHint') }}</small>
      </div>
    </Panel>
    <Panel v-if="record.kind === 'cts.transition' && typeId" :header="$t('processDesigner.transitionAssignment')" class="mt-0">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('processDesigner.assignmentScope') }}</label>
          <StateMultiSelect
            :model-value="record.assignment?.scope || []"
            :options="transitionPathOptions(record.state?.axis || 'main')"
            option-label="label"
            option-value="value"
            size="small"
            filter
            class="w-full"
            :placeholder="$t('processDesigner.assignmentScopeAll')"
            @update:model-value="setAssignmentScope"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label>{{ $t('processDesigner.assignmentCapability') }}</label>
          <InputText
            :model-value="record.assignment?.capability || ''"
            size="small"
            @update:model-value="setAssignmentCapability"
          />
        </div>
        <small class="text-muted">{{ $t('processDesigner.transitionAssignmentHint') }}</small>
      </div>
    </Panel>
    <Panel v-if="producerAvailable" :header="$t('processDesigner.createdEntity')" class="mt-0">
      <div class="flex flex-col gap-3">
        <div class="flex min-w-0 items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <i :class="entityIconFor(producer.typeId)" />
            <strong class="truncate">{{ typeIdLabelFor(producer.typeId) }}</strong>
          </div>
          <Tag :value="$t('processDesigner.producerOutputTag')" severity="secondary" size="small" />
        </div>
        <div class="flex flex-col gap-1">
          <label>{{ $t('processDesigner.relations') }}</label>
          <MultiSelect v-model="producer.relations" :options="relationOptionsFor(producer.typeId)" option-label="label" option-value="value" display="chip" class="w-full" @change="$emit('sync')" />
        </div>
        <small class="text-muted">{{ $t('processDesigner.producerWorkflowHint') }}</small>
      </div>
    </Panel>
    <div v-if="preview.supported" class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <label>{{ $t('processDesigner.outputPreview') }}</label>
        <Button icon="pi pi-refresh" :label="$t('processDesigner.refreshPreview')" size="small" text :loading="preview.running" @click="$emit('run-preview')" />
      </div>
      <Message v-if="preview.state?.error" severity="error">{{ preview.state.error }}</Message>
      <Message v-else-if="!preview.state" severity="secondary">{{ $t('processDesigner.previewHint') }}</Message>
      <div v-else class="flex flex-col gap-2">
        <section v-for="output in preview.outputs" :key="output.id" class="rounded-ui bg-subtle p-2 text-supporting">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="flex min-w-0 items-baseline gap-2">
              <strong class="truncate">{{ output.label }}</strong>
              <span v-if="output.type" class="shrink-0 text-muted">{{ output.type }}</span>
            </span>
            <span class="text-muted">{{ $t('processDesigner.previewCounts', { branches: output.tree.branchCount, items: output.tree.itemCount }) }}</span>
          </div>
          <div v-for="branch in output.tree.branches" :key="branch.path.join(';')" class="mb-1 flex gap-2 last:mb-0">
            <code class="shrink-0 text-muted">{{ formatPreviewPath(branch.path) }}</code>
            <code class="min-w-0 flex-1 whitespace-pre-wrap break-all">{{ formatPreviewItems(branch.items) }}</code>
          </div>
          <div v-if="output.tree.truncated" class="mt-1 text-muted">{{ $t('processDesigner.previewTruncated') }}</div>
        </section>
      </div>
    </div>
    <div v-if="record.kind === 'cts.command' || record.kind === 'cts.service'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.service') }}</label>
      <Select v-model="record.commandId" :options="commandOptions" option-label="label" option-value="value" filter @change="$emit('sync')" />
    </div>
    <Panel v-if="(record.kind === 'cts.command' || record.kind === 'cts.service') && record.commandId" :header="$t('processDesigner.commandService')" toggleable collapsed>
      <div class="flex flex-col gap-3">
        <Message v-if="!commandService" severity="secondary">{{ $t('processDesigner.commandServiceNone') }}</Message>
        <div v-if="commandService" class="flex flex-col gap-3">
          <div class="flex flex-col gap-1">
            <label>{{ $t('processDesigner.runPrincipals') }}</label>
            <MultiSelect v-model="commandService.access.runPrincipals" :options="servicePrincipalOptions" option-label="label" option-value="value" display="chip" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label>{{ $t('processDesigner.viewPrincipals') }}</label>
            <MultiSelect v-model="commandService.access.viewPrincipals" :options="servicePrincipalOptions" option-label="label" option-value="value" display="chip" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label>{{ $t('processDesigner.serviceBillingMode') }}</label>
            <Select v-model="commandService.billing.mode" :options="serviceBillingModeOptions" option-label="label" option-value="value" />
          </div>
          <div v-if="commandService.billing.mode === 'prepaidTokens'" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.serviceTokenCost') }}</label>
              <InputNumber v-model="commandService.billing.tokenCost" :min="0" :max-fraction-digits="2" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.serviceMeterKey') }}</label>
              <InputText v-model="commandService.billing.meterKey" class="w-full" />
            </div>
          </div>
        </div>
        <Button
          v-if="!commandService"
          icon="pi pi-plus"
          :label="$t('processDesigner.commandServiceCreate')"
          size="small"
          severity="secondary"
          outlined
          @click="$emit('create-command-service')"
        />
        <Button
          v-else
          icon="pi pi-trash"
          :label="$t('common.delete')"
          severity="danger"
          outlined
          size="small"
          @click="$emit('remove-command-service')"
        />
      </div>
    </Panel>
    <div v-if="record.kind === 'cts.construct' && typeId && constructionModes.length" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.constructionMode') }}</label>
      <Select
        :model-value="record.construction?.mode ?? ''"
        :options="constructionModes"
        option-label="label"
        option-value="value"
        @update:model-value="mode => $emit('update-construction-mode', mode)"
      />
    </div>
    <div v-if="record.kind === 'cts.construct' && typeId === 'artifact'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.allowedArtifactCreation') }}</label>
      <MultiSelect
        :model-value="artifactKinds"
        :options="artifactKindOptions"
        option-label="label"
        option-value="value"
        display="chip"
        filter
        :placeholder="$t('processDesigner.allUploadArtifactKinds')"
        @update:model-value="value => $emit('update-artifact-kinds', value)"
      />
    </div>
    <div v-if="record.kind === 'control.domainEventTrigger'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.event') }}</label>
      <Select v-model="record.eventId" :options="designer.eventOptions" option-label="label" option-value="value" filter @change="$emit('sync')" />
    </div>
    <div v-if="record.kind === 'cts.conversion'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.attachmentKind') }}</label>
      <Select v-model="record.attachmentKind" :options="designer.attachmentKindOptions" option-label="label" option-value="value" filter @change="$emit('sync')" />
    </div>
    <div v-if="record.kind === 'cts.read' && record.select === 'related'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.relation') }}</label>
      <Select v-model="record.relationKey" :options="relationOptionsFor(typeId)" option-label="label" option-value="value" filter @change="$emit('sync')" />
    </div>
    <div v-if="record.kind === 'cts.read' && record.select === 'extract'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.projection') }}</label>
      <Select v-model="record.projection" :options="projectionOptionsFor(typeId)" option-label="label" option-value="value" filter @change="$emit('sync')" />
    </div>
    <div v-if="record.kind === 'collection.join'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.joinLeftKey') }}</label>
      <InputText v-model="record.leftKey" class="w-full" @change="$emit('sync')" />
      <label>{{ $t('processDesigner.joinRightKey') }}</label>
      <InputText v-model="record.rightKey" class="w-full" @change="$emit('sync')" />
    </div>
    <div v-if="record.kind === 'cts.field'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.fieldToRead') }}</label>
      <Select
        :model-value="fieldProjectionValue"
        :options="fieldProjectionOptions"
        option-label="label"
        option-value="value"
        filter
        class="w-full"
        :placeholder="$t('processDesigner.bindTypeFirst')"
        @update:model-value="setFieldProjection"
      />
    </div>
    <div v-if="record.kind === 'value.recordField'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.recordFieldPath') }}</label>
      <InputText v-model="record.path" class="w-full" @change="$emit('sync')" />
      <label>{{ $t('processDesigner.recordOutputType') }}</label>
      <Select
        :model-value="record.type?.base || 'json'"
        :options="recordFieldTypeOptions"
        option-label="label"
        option-value="value"
        @update:model-value="updateRecordFieldType"
      />
    </div>
    <div v-if="record.kind === 'record.construct'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.recordFields') }}</label>
      <div v-for="(field, index) in recordFields" :key="index" class="flex items-center gap-2">
        <InputText
          :model-value="field"
          class="w-full"
          @update:model-value="value => updateRecordField(index, value)"
        />
        <Button icon="pi pi-times" :aria-label="$t('common.delete')" size="small" text severity="danger" @click="removeRecordField(index)" />
      </div>
      <Button icon="pi pi-plus" :label="$t('processDesigner.addRecordField')" size="small" text @click="addRecordField" />
    </div>
  </div>
</template>

<script setup>
// The processNode inspector: effect authorization rows (grants plus the
// inherited entity-access window), the transition reference, the
// producer-output panel, output preview, the command-service panel, and
// the per-kind configuration selects (construction mode, artifact kinds,
// events, relations). Pure presentation over the selected record — every
// mutation is an event back to the page's single update/sync entry point.
import { computed } from 'vue';
import { operationKindOf, typeIdOf } from '~/packages/cts/src/index.js';
import { EFFECT_SPECIES_KINDS } from '~/packages/processes/src/index.js';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from '~/components/shared/InstanceMultiSelect.vue';
import StateMultiSelect from 'primevue/multiselect';
import Panel from 'primevue/panel';
import Select from '~/components/shared/InstanceSelect.vue';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  record: { type: Object, default: () => ({}) },
  producer: { type: Object, default: () => ({}) },
  producerAvailable: { type: Boolean, default: false },
  producerRelationOptions: { type: Array, default: () => [] },
  // Field paths of the producer's bound type — the read/write/private
  // policy lists on the producer output select among them.
  fieldPolicyOptions: { type: Array, default: () => [] },
  relationOptionsFor: { type: Function, default: () => [] },
  projectionOptionsFor: { type: Function, default: () => [] },
  typeIdOptions: { type: Array, default: () => [] },
  roleOptions: { type: Array, default: () => [] },
  commandOptions: { type: Array, default: () => [] },
  commandService: { type: Object, default: null },
  servicePrincipalOptions: { type: Array, default: () => [] },
  transitionAxisOptions: { type: Array, default: () => [{ label: 'main', value: 'main' }] },
  transitionPathOptions: { type: Function, default: () => [] },
  // Row-relative field paths of the transition's bound type — guard
  // conditions select among them (SPEC §7 paths are row-relative).
  guardFieldOptions: { type: Array, default: () => [] },
  constructionModes: { type: Array, default: () => [] },
  artifactKinds: { type: Array, default: () => [] },
  artifactKindOptions: { type: Array, default: () => [] },
  designer: { type: Object, default: () => ({}) },
  grants: { type: Array, default: () => [] },
  accessDetail: { type: String, default: '' },
  effectiveAccess: { type: Array, default: () => [] },
  inputs: { type: Array, default: () => [] },
  preview: { type: Object, default: () => ({ supported: false, running: false, state: null, outputs: [] }) },
  formatPreviewPath: { type: Function, required: true },
  formatPreviewItems: { type: Function, required: true }
});

const emit = defineEmits([
  'sync',
  'update-grant-level',
  'update-construction-mode',
  'update-artifact-kinds',
  'run-preview',
  'create-command-service',
  'remove-command-service'
]);

const { t, te } = useI18n();
const op = computed(() => operationKindOf(props.record || {}));
const isEffect = computed(() => EFFECT_SPECIES_KINDS.has(op.value));
const typeId = computed(() => typeIdOf(props.record || {}));

// Get field's pick list: the bound type's readable field paths (the
// projection owns the list — party rows included). Labels localize when
// they carry an i18n key (the framework party rows do), else pass through.
const fieldProjectionOptions = computed(() => (
  typeId.value
    ? (props.designer.fieldsForEntity?.(typeId.value) || []).map(field => ({
      label: te(field.label) ? t(field.label) : (field.label || field.value),
      value: field.value
    }))
    : []
));
// The pick writes the record's `path` — the single persisted home of the
// field selection.
const fieldProjectionValue = computed(() => props.record.path || '');
function setFieldProjection(value) {
  props.record.path = value || '';
  emit('sync');
}

// Record-value authoring surfaces: the record elimination form's key and
// output type, the join's key paths, and the record composer's field list.
const recordFieldTypeOptions = computed(() => [
  'string', 'number', 'integer', 'boolean', 'json', 'date', 'dateTime', 'entityRef'
].map(value => ({ label: t(`processDesigner.dataTypes.${value}`), value })));
const recordFields = computed(() => (Array.isArray(props.record.fields) ? props.record.fields : []));

function updateRecordFieldType(base) {
  props.record.type = { ...(props.record.type || {}), base };
  emit('sync');
}

function updateRecordField(index, value) {
  const fields = [...recordFields.value];
  fields[index] = String(value || '').trim();
  props.record.fields = fields;
  emit('sync');
}

function addRecordField() {
  props.record.fields = [...recordFields.value, ''];
  emit('sync');
}

function removeRecordField(index) {
  props.record.fields = recordFields.value.filter((_, position) => position !== index);
  emit('sync');
}
const accessLevelOptions = computed(() => [
  { label: t('processDesigner.accessRead'), value: 'read' },
  { label: t('processDesigner.accessWrite'), value: 'write' },
  { label: t('processDesigner.accessAdmin'), value: 'admin' }
]);
const serviceBillingModeOptions = computed(() => [
  { label: t('processDesigner.serviceBillingNone'), value: 'none' },
  { label: t('processDesigner.serviceBillingPrepaidTokens'), value: 'prepaidTokens' }
]);

// A transition operation references a declared transition; it never authors
// state policy. Changing axis clears endpoints that do not belong to it.
function updateTransitionReference(key, value) {
  const previousAxis = props.record.state?.axis || 'main';
  const state = { ...(props.record.state || {}) };
  if (key === 'axis' && value !== previousAxis) {
    state.from = '';
    state.to = '';
  }
  state[key] = value;
  props.record.state = state;
  emit('sync');
}

// Assignment authoring (SPEC §7): an empty scope assigns the resolved
// actors for every state (ownership); the facet exists only while a
// fact is authored.
function writeAssignment(patch) {
  const assignment = { ...(props.record.assignment || {}), ...patch };
  for (const key of Object.keys(patch)) {
    if (assignment[key] === undefined || assignment[key] === null
      || (Array.isArray(assignment[key]) && !assignment[key].length)) {
      delete assignment[key];
    }
  }
  if (Object.keys(assignment).length) props.record.assignment = assignment;
  else delete props.record.assignment;
  emit('sync');
}

function setAssignmentScope(value) {
  writeAssignment({ scope: Array.isArray(value) ? value.map(String) : [] });
}

function setAssignmentCapability(value) {
  writeAssignment({ capability: String(value || '').trim() || null });
}

// Guard authoring (SPEC §7): the guard is one boolean expression AST over
// { value }; this editor is a projection over the flat comparison subset —
// N conditions folded into one and/or chain, one condition the bare
// comparison. Literals are numbers, booleans, or strings.
const GUARD_CONDITION_OPS = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte'];

const guardModeOptions = computed(() => [
  { label: t('processDesigner.guardAll'), value: 'and' },
  { label: t('processDesigner.guardAny'), value: 'or' }
]);
const guardOperatorOptions = computed(() => GUARD_CONDITION_OPS.map(op => ({ label: { eq: '=', ne: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥' }[op], value: op })));

const guardMode = computed(() => (props.record.guard?.op === 'or' ? 'or' : 'and'));
const guardConditions = computed(() => {
  const comparisons = [];
  collectGuardComparisons(props.record.guard, comparisons);
  return comparisons.map(node => ({
    field: (node.args[0]?.path || []).slice(1).join('.'),
    op: GUARD_CONDITION_OPS.includes(node.op) ? node.op : 'eq',
    value: node.args[1]?.op === 'lit' ? String(node.args[1].value ?? '') : ''
  }));
});

function collectGuardComparisons(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.op === 'and' || node.op === 'or') {
    collectGuardComparisons(node.args?.[0], out);
    collectGuardComparisons(node.args?.[1], out);
    return;
  }
  if (GUARD_CONDITION_OPS.includes(node.op)) out.push(node);
}

function writeGuard(conditions, mode) {
  const comparisons = conditions
    .filter(condition => condition.field && condition.op)
    .map(condition => ({
      op: condition.op,
      args: [
        { op: 'field', path: ['value', ...String(condition.field).split('.')] },
        { op: 'lit', value: parseGuardLiteral(condition.value) }
      ]
    }));
  if (!comparisons.length) delete props.record.guard;
  else if (comparisons.length === 1) props.record.guard = comparisons[0];
  else props.record.guard = comparisons.reduce((left, right) => ({ op: mode, args: [left, right] }));
  emit('sync');
}

function parseGuardLiteral(value) {
  const text = String(value ?? '').trim();
  if (text !== '' && !Number.isNaN(Number(text))) return Number(text);
  if (text === 'true') return true;
  if (text === 'false') return false;
  return text;
}

function setGuardMode(mode) {
  writeGuard(guardConditions.value, mode);
}

function updateGuardCondition(index, key, value) {
  const conditions = guardConditions.value.map(condition => ({ ...condition }));
  conditions[index] = { ...conditions[index], [key]: value };
  writeGuard(conditions, guardMode.value);
}

function addGuardCondition() {
  writeGuard([...guardConditions.value, { field: '', op: 'eq', value: '' }], guardMode.value);
}

function removeGuardCondition(index) {
  writeGuard(guardConditions.value.filter((_, position) => position !== index), guardMode.value);
}

function typeIdLabelFor(typeId) {
  return props.typeIdOptions.find(option => option.value === typeId)?.label || typeId || '';
}
function entityIconFor(typeId) {
  return props.typeIdOptions.find(option => option.value === typeId)?.icon || 'pi pi-box';
}
</script>
