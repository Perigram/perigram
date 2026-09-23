<template>
  <div class="flex flex-col gap-4">
    <template v-if="node.type === 'ctsClass'">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('processDesigner.label') }}</label>
          <InputText
            :model-value="node.data.name || ''"
            :placeholder="$t('processDesigner.classNamePlaceholder')"
            @update:model-value="value => $emit('update-name', String(value || ''))"
          />
        </div>
        <div class="flex items-center gap-2">
          <Select
            :model-value="node.data.glyph || ''"
            :options="glyphOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="min-w-0 flex-1"
            :aria-label="$t('processDesigner.icon')"
            @update:model-value="value => { node.data.glyph = String(value || '').trim() || null; $emit('sync'); }"
          >
            <template #value="slotProps">
              <i v-if="slotProps.value" :class="slotProps.value" aria-hidden="true" />
              <span v-else class="text-muted">{{ $t('processDesigner.auto') }}</span>
            </template>
            <template #option="slotProps">
              <i v-if="slotProps.option.value" :class="slotProps.option.value" :aria-label="slotProps.option.label" />
              <span v-else class="text-muted">{{ $t('processDesigner.auto') }}</span>
            </template>
          </Select>
          <InputText
            :model-value="node.data.glyph || ''"
            size="small"
            class="min-w-0 flex-1"
            :placeholder="$t('processDesigner.icon')"
            :aria-label="$t('processDesigner.icon')"
            @update:model-value="value => { node.data.glyph = String(value || '').trim() || null; $emit('sync'); }"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label>{{ $t('typesPane.class') }}</label>
          <Select
            :model-value="node.data.class"
            :options="classOptions"
            option-label="label"
            option-value="value"
            @update:model-value="value => { node.data.class = value; }"
          />
        </div>

        <Message
          v-for="diagnostic in diagnostics"
          :key="diagnostic"
          severity="error"
          size="small"
          :closable="false"
        >{{ diagnostic }}</Message>
        <Message severity="info" :closable="false">{{ $t('processDesigner.classDeclaresHint') }}</Message>
      </div>
    </template>

    <template v-else-if="node.type === 'ctsField'">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('typeCanvas.fieldName') }}</label>
          <InputText v-model="node.data.name" @update:model-value="$emit('sync')" />
        </div>
        <DescriptorEditor
          :model-value="node.data.descriptor || { base: 'string' }"
          :type-options="typeOptions"
          @update:model-value="value => { node.data.descriptor = value; $emit('sync'); }"
        />
        <!-- Display tokens (SPEC §4 naming facet): label defaults to the
             authored name, display kind derives when absent, and the two
             closed flags are single-holder toggles the page moves across
             the sibling fields of the declared type. -->
        <div class="flex items-center gap-2">
          <InputText
            :model-value="node.data.descriptor?.label || ''"
            size="small"
            class="min-w-0 flex-1"
            :placeholder="node.data.name || $t('processDesigner.fieldDisplayLabel')"
            :aria-label="$t('processDesigner.fieldDisplayLabel')"
            @update:model-value="value => patchDescriptor({ label: String(value || '').trim() || undefined })"
          />
          <Select
            :model-value="node.data.descriptor?.display || ''"
            :options="displayKindOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="min-w-0 flex-1"
            :aria-label="$t('processDesigner.fieldDisplayKind')"
            @update:model-value="value => patchDescriptor({ display: value || undefined })"
          />
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <label class="flex items-center gap-2">
            <Checkbox
              :model-value="node.data.descriptor?.identifier === true"
              :binary="true"
              @update:model-value="value => $emit('update-display-role', { flag: 'identifier', value })"
            />
            <span class="text-supporting text-muted">{{ $t('processDesigner.namesRecord') }}</span>
          </label>
          <label class="flex items-center gap-2">
            <Checkbox
              :model-value="node.data.descriptor?.depiction === true"
              :binary="true"
              @update:model-value="value => $emit('update-display-role', { flag: 'depiction', value })"
            />
            <span class="text-supporting text-muted">{{ $t('processDesigner.picture') }}</span>
          </label>
        </div>
      </div>
    </template>

    <template v-else-if="node.type === 'ctsState'">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('typeCanvas.stateName') }}</label>
          <InputText v-model="node.data.value" @update:model-value="$emit('sync')" />
        </div>
        <div class="flex items-center gap-2">
          <Select
            :model-value="node.data.severity || 'info'"
            :options="severityOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="min-w-0 flex-1"
            :aria-label="$t('processDesigner.stateSeverity')"
            @update:model-value="value => { node.data.severity = value; $emit('sync'); }"
          />
          <InputText
            :model-value="node.data.icon || ''"
            size="small"
            class="min-w-0 flex-1"
            :placeholder="$t('processDesigner.stateIcon')"
            @update:model-value="value => { node.data.icon = String(value || '').trim() || null; $emit('sync'); }"
          />
        </div>
        <Message severity="info" size="small" :closable="false">{{ $t('processDesigner.stateNodeHint') }}</Message>
      </div>
    </template>

    <template v-else-if="node.type === 'ctsType'">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('processDesigner.typeId') }}</label>
          <Select
            :model-value="node.data?.typeId || ''"
            :options="typeAnchorOptions"
            option-label="label"
            option-value="value"
            filter
            @update:model-value="value => { node.data.typeId = value; $emit('sync'); }"
          />
        </div>
        <Message severity="info" :closable="false">{{ $t('processDesigner.typeBindingHint') }}</Message>
      </div>
    </template>
  </div>
</template>

<script setup>
// The declaration inspector: class (name + glyph + class preset +
// declaration diagnostics), field (name + descriptor via the shared
// type-designer editor + the SPEC §4 display tokens: label, display kind,
// identifier/depiction single-holder toggles), state (name, severity,
// icon — a first-class canvas node wired into the class, into a Create
// node for the entry, or into a status-mutating effect for the
// transition target), and type reference selection. The class owns no
// lifecycle editor: states and transitions author on the canvas and in
// the process graph. Mutations write the canvas node's declaration data
// and emit `sync`; the live-graph pass re-derives records, ports, and
// the tree overlay from it. The display-role toggles emit
// `update-display-role` instead — single-holder semantics (exactly one
// identifier, at most one depiction per type) are the tree's to enforce,
// not this node's.
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from '~/components/shared/InstanceSelect.vue';
import Checkbox from 'primevue/checkbox';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';
import { DECLARABLE_CLASSES, DISPLAY_KINDS } from '~/packages/cts/src/index.js';

const props = defineProps({
  node: { type: Object, required: true },
  typeIdValid: { type: Boolean, default: true },
  diagnostics: { type: Array, default: () => [] },
  typeOptions: { type: Array, default: () => [] },
  typeAnchorOptions: { type: Array, default: () => [] }
});

const emit = defineEmits(['sync', 'update-name', 'update-display-role']);

const classOptions = DECLARABLE_CLASSES.map(classOf => ({ label: classOf, value: classOf }));

const severityOptions = ['info', 'success', 'warn', 'danger', 'secondary'].map(value => ({ label: value, value }));

// A curated glyph set (the class defaults plus common entity shapes) —
// one picker row, not an icon designer; the free-text field beside it
// carries any other icon id verbatim.
const GLYPH_CHOICES = Object.freeze([
  'pi pi-users', 'pi pi-file', 'pi pi-box', 'pi pi-folder', 'pi pi-cog',
  'pi pi-image', 'pi pi-tag', 'pi pi-map-marker', 'pi pi-calendar', 'pi pi-book'
]);

const glyphOptions = Object.freeze([
  { label: '', value: '' },
  ...GLYPH_CHOICES.map(value => ({ label: value, value }))
]);

const displayKindOptions = Object.freeze([
  { label: 'auto', value: '' },
  ...DISPLAY_KINDS.map(value => ({ label: value, value }))
]);

function patchDescriptor(changes) {
  const descriptor = { ...(props.node.data.descriptor || { base: 'string' }), ...changes };
  for (const key of Object.keys(changes)) {
    if (descriptor[key] === undefined) delete descriptor[key];
  }
  props.node.data.descriptor = descriptor;
  emit('sync');
}
</script>
