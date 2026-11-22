<template>
  <div>
    <section v-if="editableInputs.length || operationOptions.length || isLiteral || isCast || typedBaseFields.length || isConvertUnit || declaredScalarControls.length" class="flex flex-col gap-3">
      <div v-if="editableInputs.length" class="flex flex-col gap-2">
        <label >{{ $t('processDesigner.inputDefaults') }}</label>
        <div v-for="input in editableInputs" :key="input.id" class="flex flex-col gap-1">
          <label>{{ input.label }}</label>
          <TypedValueControl
            :base="input.base"
            :type-id="input.type?.typeId || ''"
            :model-value="inputDefault(input.id)"
            :status-options="statusOptions"
            :placeholder="$t('processDesigner.inlineValue')"
            @update:model-value="value => setInputDefault(input, value)"
          />
        </div>
      </div>
      <div v-if="operationOptions.length" class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.operation') }}</label>
        <Select
          :model-value="operationValue"
          :options="operationOptions"
          option-label="label"
          option-value="value"
          size="small"
          @update:model-value="setOperation"
        />
      </div>
      <div v-if="isLiteral" class="flex flex-col gap-2">
        <label>{{ $t('processDesigner.valueType') }}</label>
        <TypedLiteralControl
          :bases="PROCESS_AUTHORED_BASES"
          :base="record.type?.base || 'json'"
          :type-id="record.typeId || record.type?.typeId || ''"
          :model-value="record.value"
          :type-options="typeIdOptions"
          :status-options="statusOptions"
          :placeholder="$t('processDesigner.inlineValue')"
          @update:base="setLiteralBase"
          @update:type-id="setLiteralTypeId"
          @update:model-value="value => { record.value = value; emit('sync'); }"
        />
        <Select
          v-if="hasConfig('access')"
          :model-value="record.access || 'item'"
          :options="accessOptions"
          option-label="label"
          option-value="value"
          size="small"
          @update:model-value="value => { record.access = value; emit('sync'); }"
        />
      </div>
      <div v-if="isCast" class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.recordOutputType') }}</label>
        <Select
          :model-value="record.outputType?.base || 'record'"
          :options="castBaseOptions"
          option-label="label"
          option-value="value"
          size="small"
          @update:model-value="value => { record.outputType = { ...(record.outputType || {}), base: value }; emit('sync'); }"
        />
      </div>
      <div v-for="field in typedBaseFields" :key="field.id" class="flex flex-col gap-1">
        <label>{{ field.label }}</label>
        <Select
          :model-value="record[field.id]?.base || 'string'"
          :options="baseTypeOptions"
          option-label="label"
          option-value="value"
          size="small"
          @update:model-value="value => setTypedBase(field.id, value)"
        />
      </div>
      <div v-if="op === 'value.format'" class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.valueTemplate') }}</label>
        <InputText
          :model-value="record.template ?? ''"
          size="small"
          @update:model-value="value => { record.template = String(value ?? ''); emit('sync'); }"
        />
      </div>
      <div v-if="hasConfig('matching')" class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.dataMatching') }}</label>
        <Select
          :model-value="record.matching || 'longest'"
          :options="matchingOptions"
          option-label="label"
          option-value="value"
          size="small"
          @update:model-value="value => { record.matching = value; emit('sync'); }"
        />
      </div>
      <div v-if="hasConfig('select')" class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.readSelection') }}</label>
        <Select
          :model-value="record.select || 'current'"
          :options="selectOptions"
          option-label="label"
          option-value="value"
          size="small"
          @update:model-value="value => { record.select = value; emit('sync'); }"
        />
      </div>
      <div v-if="hasConfig('required')" class="flex items-center justify-between gap-2">
        <label>{{ $t('processDesigner.required') }}</label>
        <ToggleSwitch :model-value="record.required !== false" @update:model-value="value => { record.required = value; emit('sync'); }" />
      </div>
      <div v-if="hasConfig('min') || hasConfig('max')" class="flex items-center gap-2">
        <InputNumber
          v-if="hasConfig('min')"
          :model-value="record.min ?? null"
          :placeholder="$t('processDesigner.minimum')"
          :aria-label="$t('processDesigner.minimum')"
          :use-grouping="false"
          size="small"
          class="min-w-0 flex-1"
          @update:model-value="value => { record.min = value; emit('sync'); }"
        />
        <InputNumber
          v-if="hasConfig('max')"
          :model-value="record.max ?? null"
          :placeholder="$t('processDesigner.maximum')"
          :aria-label="$t('processDesigner.maximum')"
          :use-grouping="false"
          size="small"
          class="min-w-0 flex-1"
          @update:model-value="value => { record.max = value; emit('sync'); }"
        />
      </div>
      <div v-if="hasConfig('pattern')" class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.pattern') }}</label>
        <InputText :model-value="record.pattern ?? ''" size="small" @update:model-value="value => { record.pattern = String(value ?? ''); emit('sync'); }" />
      </div>
      <div v-if="hasConfig('message') && op === 'value.validate'" class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.validationMessage') }}</label>
        <InputText :model-value="record.message ?? ''" size="small" @update:model-value="value => { record.message = String(value ?? ''); emit('sync'); }" />
      </div>
      <div v-if="hasConfig('path') && op === 'source.processInput'" class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.path') }}</label>
        <InputText :model-value="record.path ?? ''" size="small" @update:model-value="value => { record.path = String(value ?? ''); emit('sync'); }" />
      </div>
      <div v-if="hasConfig('path') && op === 'source.triggerPayload'" class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.path') }}</label>
        <InputText :model-value="record.path ?? ''" size="small" @update:model-value="value => { record.path = String(value ?? ''); emit('sync'); }" />
      </div>
      <div v-if="hasConfig('secretRef')" class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.secretReference') }}</label>
        <InputText :model-value="record.secretRef ?? ''" size="small" @update:model-value="value => { record.secretRef = String(value ?? ''); emit('sync'); }" />
      </div>
      <div v-if="isConvertUnit" class="flex items-center gap-2">
        <Select
          :model-value="record.fromUnit || 'mm'"
          :options="convertUnitOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="min-w-0 flex-1"
          @update:model-value="value => { record.fromUnit = value; emit('sync'); }"
        />
        <i class="pi pi-arrow-right text-muted" aria-hidden="true" />
        <Select
          :model-value="record.toUnit || 'm'"
          :options="convertUnitOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="min-w-0 flex-1"
          @update:model-value="value => { record.toUnit = value; emit('sync'); }"
        />
      </div>
    </section>
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
      <div v-if="effectiveAccess.length" class="flex flex-wrap gap-1">
        <span
          v-for="item in effectiveAccess"
          :key="item.label"
          class="max-w-full truncate rounded-ui bg-subtle px-1.5 py-0.5 text-supporting"
          :class="item.inherited ? 'text-muted' : ''"
        >{{ item.label }}</span>
      </div>
    </div>
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
      </div>
    </Panel>
    <Panel
      v-if="statePolicyTarget && stateFieldPolicyOptions.length"
      :header="$t('processDesigner.stateFieldPolicy')"
      class="mt-0"
    >      <div class="flex flex-col gap-2">
        <MultiSelect
          :model-value="record.fieldPolicy?.visible || []"
          :options="stateFieldPolicyOptions"
          option-label="label"
          option-value="value"
          size="small"
          filter
          class="w-full"
          :placeholder="$t('processDesigner.stateVisibleFields')"
          @update:model-value="value => setFieldPolicyList('visible', value)"
        />
        <MultiSelect
          :model-value="record.fieldPolicy?.editable || []"
          :options="stateFieldPolicyOptions"
          option-label="label"
          option-value="value"
          size="small"
          filter
          class="w-full"
          :placeholder="$t('processDesigner.stateEditableFields')"
          @update:model-value="value => setFieldPolicyList('editable', value)"
        />
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
        <label>{{ $t('processDesigner.liveInputs') }}</label>
        <span v-if="preview.running" class="text-muted">{{ $t('processDesigner.previewRunning') }}</span>
      </div>
      <Message v-if="preview.error || preview.state?.error" severity="error">{{ preview.error || preview.state?.error }}</Message>
      <Message v-else-if="!preview.state" severity="secondary">{{ $t('processDesigner.previewHint') }}</Message>
      <div v-else class="flex flex-col gap-2">
        <section v-for="input in preview.inputs" :key="input.id" class="rounded-ui bg-subtle p-2 text-supporting">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="flex min-w-0 items-baseline gap-2">
              <strong class="truncate">{{ input.label }}</strong>
              <span v-if="input.type" class="shrink-0 text-muted">{{ input.type }}</span>
            </span>
            <span class="text-muted">{{ $t('processDesigner.previewCounts', { branches: input.tree.branchCount, items: input.tree.itemCount }) }}</span>
          </div>
          <div v-for="branch in input.tree.branches" :key="branch.path.join(';')" class="mb-1 flex gap-2 last:mb-0">
            <code class="shrink-0 text-muted">{{ formatPreviewPath(branch.path) }}</code>
            <code class="min-w-0 flex-1 whitespace-pre-wrap break-all">{{ formatPreviewItems(branch.items) }}</code>
          </div>
          <div v-if="input.tree.truncated" class="mt-1 text-muted">{{ $t('processDesigner.previewTruncated') }}</div>
        </section>
      </div>
      <div class="flex items-center justify-between gap-2">
        <label>{{ $t('processDesigner.outputPreview') }}</label>
      </div>
      <div v-if="preview.outputs?.length" class="flex flex-col gap-2">
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
    <div v-if="isEffect && op !== 'cts.construct' && !hasIncomingEventWire" class="flex flex-col gap-2">
      <div class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.scheduleStart') }}</label>
        <DatePicker
          :model-value="scheduleAt"
          date-format="yy-mm-dd"
          show-time
          size="small"
          class="w-full"
          @update:model-value="setScheduleAt"
        />
        <label>{{ $t('processDesigner.scheduleInterval') }}</label>
        <InputText
          :model-value="record.trigger?.schedule?.interval || ''"
          :placeholder="$t('processDesigner.scheduleIntervalPlaceholder')"
          size="small"
          class="w-full"
          @update:model-value="setScheduleInterval"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label>{{ $t('processDesigner.startOnEvent') }}</label>
        <Select
          :model-value="record.eventId || ''"
          :options="designer.eventOptions || []"
          option-label="label"
          option-value="value"
          filter
          show-clear
          size="small"
          class="w-full"
          @update:model-value="value => { record.eventId = value || ''; $emit('sync'); }"
        />
      </div>
    </div>
    <div v-if="record.kind === 'control.stopFailure'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.failureMessage') }}</label>
      <InputText v-model="record.message" class="w-full" @change="$emit('sync')" />
    </div>
    <div v-if="record.kind === 'control.stopSuccess'" class="flex flex-col gap-1">
      <label>{{ $t('processDesigner.successResult') }}</label>
      <InputText v-model="record.result" class="w-full" @change="$emit('sync')" />
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
// The processNode inspector owns all authoring controls: unconnected socket
// defaults, literal/value configuration, operation parameters, access grants,
// transition guards, construction mode, event triggers, and previews. The
// canvas node itself stays a read-only socket manifest. Mutations stay on
// this selected-record surface and return through the host's sync entry point.
import { computed } from 'vue';
import { operationKindOf, typeIdOf } from '#packages/cts';
import {
  CAST_BASES,
  CONVERT_UNITS,
  EFFECT_SPECIES_KINDS,
  MAPPED_MUTATION_SPECIES_KINDS,
  PROCESS_AUTHORED_BASES,
  PROCESS_MATCHING_MODES,
  processNodeConfigurationSchema
} from '#packages/processes';
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from '~/components/shared/InstanceMultiSelect.vue';
import Panel from 'primevue/panel';
import Select from '~/components/shared/InstanceSelect.vue';
import Tag from 'primevue/tag';
import ToggleSwitch from 'primevue/toggleswitch';
import TypedValueControl from '~/components/process-designer/TypedValueControl.vue';
import TypedLiteralControl from '~/components/process-designer/TypedLiteralControl.vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  record: { type: Object, default: () => ({}) },
  producer: { type: Object, default: () => ({}) },
  producerAvailable: { type: Boolean, default: false },
  producerRelationOptions: { type: Array, default: () => [] },
  relationOptionsFor: { type: Function, default: () => [] },
  projectionOptionsFor: { type: Function, default: () => [] },
  typeIdOptions: { type: Array, default: () => [] },
  roleOptions: { type: Array, default: () => [] },
  commandOptions: { type: Array, default: () => [] },
  commandService: { type: Object, default: null },
  servicePrincipalOptions: { type: Array, default: () => [] },
  // Row-relative field paths of the transition's bound type — guard
  // conditions select among them (SPEC §7 paths are row-relative).
  guardFieldOptions: { type: Array, default: () => [] },
  // Top-level row ids of the bound type — the target/initial state's
  // field-policy lists select among them (SPEC §7).
  stateFieldPolicyOptions: { type: Array, default: () => [] },
  // The operation's target/initial state value (page-resolved; packet
  // unwrapping lives there).
  statePolicyTarget: { type: String, default: '' },
  constructionModes: { type: Array, default: () => [] },
  designer: { type: Object, default: () => ({}) },
  grants: { type: Array, default: () => [] },
  effectiveAccess: { type: Array, default: () => [] },
  inputs: { type: Array, default: () => [] },
  operationOptions: { type: Array, default: () => [] },
  statusOptions: { type: Array, default: () => [] },
  preview: { type: Object, default: () => ({ supported: false, running: false, state: null, inputs: [], outputs: [], error: '' }) },
  formatPreviewPath: { type: Function, required: true },
  formatPreviewItems: { type: Function, required: true }
});

const emit = defineEmits([
  'sync',
  'update-grant-level',
  'update-construction-mode',
  'create-command-service',
  'remove-command-service'
]);

const { t, te } = useI18n();
const op = computed(() => operationKindOf(props.record || {}));
const isEffect = computed(() => EFFECT_SPECIES_KINDS.has(op.value));
const typeId = computed(() => typeIdOf(props.record || {}));

const isLiteral = computed(() => String(op.value).startsWith('source.literal'));
const isCast = computed(() => op.value === 'value.cast');
const isConvertUnit = computed(() => op.value === 'value.convertUnit');
const configSchema = computed(() => processNodeConfigurationSchema(op.value));
const typedBaseFields = computed(() => Object.entries(configSchema.value.properties || {})
  .filter(([, schema]) => schema.semantic?.kind === 'perigram.value-base')
  .map(([id, schema]) => ({ id, label: schema.title || t('processDesigner.valueType') })));
function hasConfig(id) {
  return Object.hasOwn(configSchema.value.properties || {}, id);
}
const declaredScalarControls = computed(() => ['matching', 'select', 'required', 'min', 'max', 'pattern', 'message', 'path', 'secretRef']
  .some(id => hasConfig(id)));
const baseTypeOptions = computed(() => PROCESS_AUTHORED_BASES.map(value => ({ label: t(`processDesigner.dataTypes.${value}`), value })));
const matchingOptions = computed(() => PROCESS_MATCHING_MODES.map(value => ({ label: t(`processDesigner.matching.${value}`), value })));
const selectOptions = computed(() => ['current', 'all', 'extract', 'parent', 'children', 'related']
  .map(value => ({ label: t(`processDesigner.readModes.${value}`), value })));
const accessOptions = computed(() => ['item', 'list', 'tree']
  .map(value => ({ label: t(`processDesigner.dataAccess.${value}`), value })));
function setTypedBase(id, base) {
  props.record[id] = { ...(props.record[id] || {}), base };
  emit('sync');
}
const castBaseOptions = CAST_BASES.map(value => ({ label: t(`processDesigner.dataTypes.${value}`), value }));
const convertUnitOptions = CONVERT_UNITS.map(value => ({ label: value, value }));
const operationValue = computed(() => (
  op.value === 'collection.sort' ? props.record.direction || 'asc' : props.record.operation
));
const editableInputs = computed(() => props.inputs.filter(input => (
  !input.connected
  && input.role === 'data'
  && op.value !== 'cts.field'
  && ['string', 'id', 'number', 'integer', 'boolean', 'json', 'date', 'dateTime', 'duration', 'enum', 'status', 'entityRef'].includes(input.base)
  && (input.access === 'item' || (input.access === 'list' && MAPPED_MUTATION_SPECIES_KINDS.has(op.value)))
)));
function inputDefault(id) {
  const value = props.record.inputDefaults?.[id];
  return value?.branches ? value.branches[0]?.items?.[0] : value;
}
function setInputDefault(input, value) {
  const inputDefaults = { ...(props.record.inputDefaults || {}) };
  if (value == null || value === '') delete inputDefaults[input.id];
  else inputDefaults[input.id] = { branches: [{ path: [], items: [value] }] };
  props.record.inputDefaults = inputDefaults;
  if (input.base === 'status' && value != null && value !== '') {
    props.record.state = { ...(props.record.state || {}), to: value };
  }
  emit('sync');
}
function setOperation(value) {
  if (op.value === 'collection.sort') props.record.direction = value;
  else props.record.operation = value;
  emit('sync');
}
function setLiteralBase(base) {
  props.record.type = { ...(props.record.type || {}), base };
  props.record.value = base === 'boolean' ? false
    : ['number', 'integer'].includes(base) ? 0
      : base === 'json' ? {}
        : base === 'entityRef' ? null
          : '';
  if (base === 'entityRef') {
    const typeId = props.record.type?.typeId || props.record.typeId || '';
    props.record.typeId = typeId;
    props.record.type.typeId = typeId;
  }
  emit('sync');
}
function setLiteralTypeId(value) {
  props.record.typeId = value || '';
  props.record.type = { ...(props.record.type || {}), typeId: value || '' };
  emit('sync');
}


// Schedule/event authoring renders on unwired entries: the wire wins the
// trigger mode, so an authored start time or subscription is an entry fact.
const hasIncomingEventWire = computed(() => Boolean(props.inputs?.some?.(input => input.id === 'in' && input.role !== 'data')));
const scheduleAt = computed(() => {
  const at = props.record.trigger?.schedule?.at;
  return at ? new Date(at) : null;
});
function setScheduleAt(value) {
  const trigger = { ...(props.record.trigger || {}) };
  const schedule = { ...(trigger.schedule || {}) };
  if (value) schedule.at = new Date(value).toISOString();
  else delete schedule.at;
  if (Object.keys(schedule).length) trigger.schedule = schedule;
  else delete trigger.schedule;
  props.record.trigger = trigger;
  emit('sync');
}
function setScheduleInterval(value) {
  const trigger = { ...(props.record.trigger || {}) };
  const schedule = { ...(trigger.schedule || {}) };
  const text = String(value ?? '').trim();
  if (text) schedule.interval = text;
  else delete schedule.interval;
  if (Object.keys(schedule).length) trigger.schedule = schedule;
  else delete trigger.schedule;
  props.record.trigger = trigger;
  emit('sync');
}

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

function setFieldPolicyList(key, value) {
  const list = Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
  const facet = { ...(props.record.fieldPolicy || {}) };
  if (list.length) facet[key] = list;
  else delete facet[key];
  if (Object.keys(facet).length) props.record.fieldPolicy = facet;
  else delete props.record.fieldPolicy;
  emit('sync');
}
</script>
