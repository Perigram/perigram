<template>
  <div>
    <div v-if="isEffect" class="flex flex-col gap-2">
      <label>{{ $t('processDesigner.actionRoles') }}</label>
      <MultiSelect
        :model-value="grantRoleIds"
        :options="roleOptions"
        option-label="label"
        option-value="value"
        display="chip"
        class="w-full"
        @update:model-value="value => $emit('update-grant-roles', value)"
      />
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
          class="max-w-full truncate rounded-ui border border-content-border px-1.5 py-0.5 text-supporting"
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
          <label>{{ $t('processDesigner.transitionFrom') }}</label>
          <Select
            :model-value="record.state?.from || ''"
            :options="transitionPathOptions(record.state?.axis || 'main')"
            option-label="label"
            option-value="value"
            size="small"
            filter
            @update:model-value="value => updateTransitionReference('from', value)"
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
        <section v-for="output in preview.outputs" :key="output.id" class="rounded-ui border border-content-border bg-subtle p-2 text-supporting">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="flex min-w-0 items-baseline gap-2">
              <strong class="truncate">{{ output.label }}</strong>
              <span v-if="output.type" class="shrink-0 text-muted">{{ output.type }}</span>
            </span>
            <span class="text-muted">{{ $t('processDesigner.previewCounts', { branches: output.tree.branchCount, items: output.tree.itemCount }) }}</span>
          </div>
          <div v-for="branch in output.tree.branches" :key="branch.path.join(';')" class="mb-1 grid grid-cols-[auto_minmax(0,1fr)] gap-2 last:mb-0">
            <code class="text-muted">{{ formatPreviewPath(branch.path) }}</code>
            <code class="min-w-0 whitespace-pre-wrap break-all">{{ formatPreviewItems(branch.items) }}</code>
          </div>
          <div v-if="output.tree.truncated" class="mt-1 text-muted">{{ $t('processDesigner.previewTruncated') }}</div>
        </section>
      </div>
    </div>
    <div v-if="record.kind === 'cts.command' || op === 'effect.runCommand'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.service') }}</label>
      <Select v-model="record.commandId" :options="commandOptions" option-label="label" option-value="value" filter @change="$emit('sync')" />
    </div>
    <Panel v-if="(record.kind === 'cts.command' || op === 'effect.runCommand') && record.commandId" :header="$t('processDesigner.commandService')" toggleable collapsed>
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
    <div v-if="op === 'effect.createEntity' && typeId && constructionModes.length" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.constructionMode') }}</label>
      <Select
        :model-value="record.construction?.mode ?? ''"
        :options="constructionModes"
        option-label="label"
        option-value="value"
        @update:model-value="mode => $emit('update-construction-mode', mode)"
      />
    </div>
    <div v-if="op === 'effect.createEntity' && typeId === 'artifact'" class="flex flex-col gap-1">
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
    <div v-if="op === 'effect.generateAttachment'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.attachmentKind') }}</label>
      <Select v-model="record.attachmentKind" :options="designer.attachmentKindOptions" option-label="label" option-value="value" filter @change="$emit('sync')" />
    </div>
    <div v-if="record.kind === 'cts.read' && record.select === 'related'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.relation') }}</label>
      <Select v-model="record.relationKey" :options="relationOptionsFor(typeId)" option-label="label" option-value="value" filter @change="$emit('sync')" />
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
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from '~/components/shared/InstanceMultiSelect.vue';
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
  typeIdOptions: { type: Array, default: () => [] },
  roleOptions: { type: Array, default: () => [] },
  commandOptions: { type: Array, default: () => [] },
  commandService: { type: Object, default: null },
  servicePrincipalOptions: { type: Array, default: () => [] },
  transitionAxisOptions: { type: Array, default: () => [{ label: 'main', value: 'main' }] },
  transitionPathOptions: { type: Function, default: () => [] },
  constructionModes: { type: Array, default: () => [] },
  artifactKinds: { type: Array, default: () => [] },
  artifactKindOptions: { type: Array, default: () => [] },
  designer: { type: Object, default: () => ({}) },
  grants: { type: Array, default: () => [] },
  grantRoleIds: { type: Array, default: () => [] },
  accessDetail: { type: String, default: '' },
  effectiveAccess: { type: Array, default: () => [] },
  inputs: { type: Array, default: () => [] },
  preview: { type: Object, default: () => ({ supported: false, running: false, state: null, outputs: [] }) },
  formatPreviewPath: { type: Function, required: true },
  formatPreviewItems: { type: Function, required: true }
});

const emit = defineEmits([
  'sync',
  'update-grant-roles',
  'update-grant-level',
  'update-construction-mode',
  'update-artifact-kinds',
  'run-preview',
  'create-command-service',
  'remove-command-service'
]);

const { t } = useI18n();
const op = computed(() => operationKindOf(props.record || {}));
const isEffect = computed(() => op.value.startsWith('effect.'));
const typeId = computed(() => typeIdOf(props.record || {}));
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

function typeIdLabelFor(typeId) {
  return props.typeIdOptions.find(option => option.value === typeId)?.label || typeId || '';
}
function entityIconFor(typeId) {
  return props.typeIdOptions.find(option => option.value === typeId)?.icon || 'pi pi-box';
}
</script>
