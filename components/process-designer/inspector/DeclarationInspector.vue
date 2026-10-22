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
          <label>{{ $t('processDesigner.declarationClass') }}</label>
          <Select
            :model-value="node.data.class"
            :options="classOptions"
            option-label="label"
            option-value="value"
            @update:model-value="value => { node.data.class = value; }"
          />
        </div>
        <div v-if="identifierFieldOptions.length" class="flex flex-col gap-1">
          <label>{{ $t('processDesigner.namesRecord') }}</label>
          <Select
            :model-value="identifierFieldValue"
            :options="identifierFieldOptions"
            option-label="label"
            option-value="value"
            filter
            @update:model-value="value => $emit('update-identifier-field', value || '')"
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
      </div>
    </template>

    <template v-else-if="node.type === 'ctsState'">
      <div class="flex flex-col gap-3">
        <InputText v-model="node.data.value" :placeholder="$t('typeCanvas.stateName')" @update:model-value="$emit('sync')" />
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
        <div v-if="stateFieldOptions.length" class="flex flex-col gap-2">
          <label class="flex items-center gap-2">
            <Checkbox :model-value="fieldPolicyAuthored" binary @update:model-value="toggleFieldPolicy" />
            <span>{{ $t('processDesigner.stateFieldPolicy') }}</span>
          </label>
          <template v-if="fieldPolicyAuthored">
            <MultiSelect
              :model-value="node.data.fieldPolicy?.visible || []"
              :options="stateFieldOptions"
              option-label="label"
              option-value="value"
              size="small"
              filter
              class="w-full"
              :placeholder="$t('processDesigner.stateVisibleFields')"
              @update:model-value="value => setFieldPolicyList('visible', value)"
            />
            <MultiSelect
              :model-value="node.data.fieldPolicy?.editable || []"
              :options="stateFieldOptions"
              option-label="label"
              option-value="value"
              size="small"
              filter
              class="w-full"
              :placeholder="$t('processDesigner.stateEditableFields')"
              @update:model-value="value => setFieldPolicyList('editable', value)"
            />
          </template>
        </div>
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
// The declaration inspector: class (name + glyph + class preset + the
// identifier dropdown over the class's field nodes + declaration
// diagnostics), field (name + descriptor via the shared type-designer
// editor), state (name, severity, icon, field policy — a first-class
// canvas node wired into the class or a type anchor, into a Create node
// for the entry, or into a status-mutating effect for the transition
// target), and type reference selection. The identifier dropdown emits
// `update-identifier-field` (the page's single-holder move across the
// sibling field nodes). Mutations write the canvas node's declaration
// data and emit `sync`; the live-graph pass re-derives records, ports,
// and the tree overlay from it.
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from 'primevue/multiselect';
import Select from '~/components/shared/InstanceSelect.vue';
import Checkbox from 'primevue/checkbox';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';
import { DECLARABLE_CLASSES } from '~/packages/cts/src/index.js';
import { iconFontGlyphs } from '#shared/icon-fonts.js';
import { computed } from 'vue';

const props = defineProps({
  node: { type: Object, required: true },
  typeIdValid: { type: Boolean, default: true },
  diagnostics: { type: Array, default: () => [] },
  typeOptions: { type: Array, default: () => [] },
  typeAnchorOptions: { type: Array, default: () => [] },
  // Row field ids of the bound type — the state's field-policy lists
  // select among them.
  stateFieldOptions: { type: Array, default: () => [] },
  // The class's sibling field nodes as identifier picks; value '' is the
  // registry boundary mint (SPEC §4).
  identifierFieldOptions: { type: Array, default: () => [] },
  identifierFieldValue: { type: String, default: '' }
});

const emit = defineEmits(['sync', 'update-name', 'update-identifier-field']);

const classOptions = DECLARABLE_CLASSES.map(classOf => ({ label: classOf, value: classOf }));

const severityOptions = ['info', 'success', 'warn', 'danger', 'secondary'].map(value => ({ label: value, value }));

// A curated PrimeIcon set (the class defaults plus common entity shapes)
// followed by the built icon-font palette (every ck-* glyph the font
// build offers, generated beside the CSS in shared/icon-fonts.js) — one
// picker row, not an icon designer; the free-text field beside it
// carries any other icon id verbatim.
const GLYPH_CHOICES = Object.freeze([
  'pi pi-users', 'pi pi-file', 'pi pi-box', 'pi pi-folder', 'pi pi-cog',
  'pi pi-image', 'pi pi-tag', 'pi pi-map-marker', 'pi pi-calendar', 'pi pi-book'
]);

const glyphOptions = Object.freeze([
  { label: '', value: '' },
  ...GLYPH_CHOICES.map(value => ({ label: value, value })),
  ...iconFontGlyphs.map(value => ({ label: value, value }))
]);

// State field policy (SPEC §7): an empty selection removes that axis —
// the facet exists only while a list is authored.
const fieldPolicyAuthored = computed(() => props.node.data.fieldPolicy != null);

function toggleFieldPolicy(enabled) {
  if (enabled && props.node.data.fieldPolicy == null) {
    props.node.data.fieldPolicy = {};
  } else if (!enabled) {
    delete props.node.data.fieldPolicy;
  }
  emit('sync');
}

function setFieldPolicyList(key, value) {
  const list = Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
  const facet = { ...(props.node.data.fieldPolicy || {}) };
  if (list.length) facet[key] = list;
  else delete facet[key];
  if (Object.keys(facet).length) props.node.data.fieldPolicy = facet;
  else delete props.node.data.fieldPolicy;
  emit('sync');
}
</script>
