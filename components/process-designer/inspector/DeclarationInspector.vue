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
        <div class="flex flex-col gap-1">
          <label>{{ $t('processDesigner.icon') }}</label>
          <GlyphSelect
            :model-value="node.data.glyph || ''"
            :aria-label="$t('processDesigner.icon')"
            @update:model-value="value => { node.data.glyph = value || null; $emit('sync'); }"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label>{{ $t('processDesigner.declarationClass') }}</label>
          <Select
            :model-value="node.data.class"
            :options="classOptions"
            option-label="label"
            option-value="value"
            @update:model-value="setClass"
          />
        </div>
        <template v-if="node.data.class === 'file'">
          <div class="flex flex-col gap-1">
            <label>{{ $t('processDesigner.payloadMime') }}</label>
            <AutoComplete
              :model-value="node.data.payload?.mime || []"
              :suggestions="mimeSuggestions"
              :placeholder="$t('processDesigner.payloadMimePlaceholder')"
              class="w-full"
              multiple
              typeahead
              complete-on-focus
              @complete="event => completeMime(event.query)"
              @update:model-value="value => writePayload({ mime: value })"
            />
          </div>
          <div v-if="hasPayload" class="flex flex-col gap-2">
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.payloadSize') }}</label>
              <InputNumber
                :model-value="payloadSizeMb"
                :min="0"
                show-buttons
                button-layout="horizontal"
                @update:model-value="value => writePayload({ maxSize: Number(value) > 0 ? Math.round(Number(value) * 1024 * 1024) : undefined })"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.payloadPreview') }}</label>
              <Select
                :model-value="node.data.payload?.preview || ''"
                :options="previewOptions"
                option-label="label"
                option-value="value"
                @update:model-value="value => writePayload({ preview: value || undefined })"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.payloadCreation') }}</label>
              <MultiSelect
                :model-value="node.data.payload?.creation || []"
                :options="creationOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                @update:model-value="value => writePayload({ creation: value })"
              />
            </div>
          </div>
        </template>
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
        <FieldDeclarationForm
          :name="node.data.name || ''"
          :descriptor="node.data.descriptor || { base: 'string' }"
          :type-options="typeOptions"
          @update:name="value => { node.data.name = value; $emit('sync'); }"
          @update:descriptor="value => { node.data.descriptor = value; $emit('sync'); }"
        />
        <Message
          v-for="diagnostic in diagnostics"
          :key="diagnostic"
          severity="error"
          size="small"
          :closable="false"
        >{{ diagnostic }}</Message>
      </div>
    </template>

    <template v-else-if="node.type === 'ctsState'">
      <div class="flex flex-col gap-3">
        <StateDeclarationForm
          :value="node.data.value || ''"
          :severity="node.data.severity || 'info'"
          :icon="node.data.icon || ''"
          @update:value="value => { node.data.value = value; $emit('sync'); }"
          @update:severity="value => { node.data.severity = value; $emit('sync'); }"
          @update:icon="value => { node.data.icon = value || null; $emit('sync'); }"
        />
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
// The declaration inspector: class (name + glyph + class preset + payload
// traits for file types + the identifier dropdown over the class's field
// nodes + declaration diagnostics), field (name + descriptor via the
// shared type-designer editor), state (name, severity, icon — a
// first-class canvas node wired into a Create node for the entry or into
// a status-mutating effect for the transition target), and type reference
// selection. The identifier dropdown emits `update-identifier-field` (the
// page's single-holder move across the sibling field nodes). Mutations
// write the canvas node's declaration data and emit `sync`; the
// live-graph pass re-derives records, ports, and the tree overlay
// from it.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AutoComplete from 'primevue/autocomplete';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import MultiSelect from '~/components/shared/InstanceMultiSelect.vue';
import Message from 'primevue/message';
import Select from '~/components/shared/InstanceSelect.vue';
import FieldDeclarationForm from '~/components/type-designer/FieldDeclarationForm.vue';
import StateDeclarationForm from '~/components/type-designer/StateDeclarationForm.vue';
import GlyphSelect from '~/components/type-designer/GlyphSelect.vue';
import { DECLARABLE_CLASSES, CREATION_PROTOCOLS } from '@perigram/cts/index';
import { RENDERABLE_PREVIEW_MODES } from '#shared/ui-mapping/index.js';

const props = defineProps({
  node: { type: Object, required: true },
  typeIdValid: { type: Boolean, default: true },
  diagnostics: { type: Array, default: () => [] },
  typeOptions: { type: Array, default: () => [] },
  typeAnchorOptions: { type: Array, default: () => [] },
  // The class's sibling field nodes as identifier picks; value '' leaves
  // the identifier unowned (SPEC §4).
  identifierFieldOptions: { type: Array, default: () => [] },
  identifierFieldValue: { type: String, default: '' }
});

const emit = defineEmits(['sync', 'update-name', 'update-identifier-field']);

const { t } = useI18n();

const classOptions = DECLARABLE_CLASSES.map(classOf => ({ label: classOf, value: classOf }));

const creationOptions = CREATION_PROTOCOLS.map(value => ({ label: value, value }));

// Preview picks: the unset default renders as download (the projection's
// fallback), the rest are the app's renderable and visual preview modes.
const previewOptions = [
  { label: 'download', value: '' },
  ...[...new Set([...RENDERABLE_PREVIEW_MODES, 'attachment', 'none'])]
    .map(value => ({ label: value, value }))
];

const hasPayload = computed(() => Boolean(props.node.data?.payload?.mime?.length));
const payloadSizeMb = computed(() => {
  const bytes = Number(props.node.data?.payload?.maxSize);
  return Number.isFinite(bytes) && bytes > 0 ? bytes / (1024 * 1024) : null;
});

// Offered MIME families, wildcards first: picking "any image" is the
// authoring gesture; vendor-specific strings stay typable beside them.
const MIME_SUGGESTIONS = Object.freeze([
  'image/*', 'video/*', 'audio/*', 'text/*',
  'application/pdf', 'application/json', 'application/zip',
  'text/plain', 'text/csv', 'text/markdown'
]);
const mimeSuggestions = ref(MIME_SUGGESTIONS);
function completeMime(query = '') {
  const needle = String(query).toLowerCase();
  mimeSuggestions.value = MIME_SUGGESTIONS.filter(mime => mime.includes(needle));
}

// The payload facet (SPEC §4): an empty accepted-MIME list leaves the type
// payload-less (fields alone satisfy the file class), any authored MIME
// carries the trait set through compileTreeDeclarations to the registry.
function writePayload(patch) {
  const current = props.node.data?.payload || {};
  const next = { ...current, ...patch };
  const mime = (next.mime || []).map(entry => String(entry).trim()).filter(Boolean);
  if (!mime.length) {
    props.node.data.payload = null;
  } else {
    const maxSize = Number(next.maxSize);
    props.node.data.payload = {
      mime,
      ...(Number.isFinite(maxSize) && maxSize > 0 ? { maxSize: Math.round(maxSize) } : {}),
      ...(next.preview ? { preview: String(next.preview) } : {}),
      creation: (next.creation || []).length ? [...new Set(next.creation.map(String))] : ['upload']
    };
  }
  emit('sync');
}

function setClass(value) {
  props.node.data.class = value;
  if (value !== 'file') props.node.data.payload = null;
  emit('sync');
}


</script>
