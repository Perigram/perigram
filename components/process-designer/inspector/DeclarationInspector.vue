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
import AutoComplete from 'primevue/autocomplete';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import MultiSelect from 'primevue/multiselect';
import Message from 'primevue/message';
import Select from '~/components/shared/InstanceSelect.vue';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';
import { DECLARABLE_CLASSES, CREATION_PROTOCOLS } from '~/packages/cts/src/index.js';
import { RENDERABLE_PREVIEW_MODES, VISUAL_PREVIEW_MODES } from '#shared/ui-mapping/index.js';
import { iconFontGlyphs } from '#shared/icon-fonts.js';

const props = defineProps({
  node: { type: Object, required: true },
  typeIdValid: { type: Boolean, default: true },
  diagnostics: { type: Array, default: () => [] },
  typeOptions: { type: Array, default: () => [] },
  typeAnchorOptions: { type: Array, default: () => [] },
  // The class's sibling field nodes as identifier picks; value '' is the
  // registry boundary mint (SPEC §4).
  identifierFieldOptions: { type: Array, default: () => [] },
  identifierFieldValue: { type: String, default: '' }
});

const emit = defineEmits(['sync', 'update-name', 'update-identifier-field']);

const classOptions = DECLARABLE_CLASSES.map(classOf => ({ label: classOf, value: classOf }));

const severityOptions = ['info', 'success', 'warn', 'danger', 'secondary'].map(value => ({ label: value, value }));

const creationOptions = CREATION_PROTOCOLS.map(value => ({ label: value, value }));

// Preview picks: the unset default renders as download (the projection's
// fallback), the rest are the app's renderable and visual preview modes.
const previewOptions = [
  { label: 'download', value: '' },
  ...[...new Set([...RENDERABLE_PREVIEW_MODES, ...VISUAL_PREVIEW_MODES, 'attachment', 'none'])]
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
</script>
