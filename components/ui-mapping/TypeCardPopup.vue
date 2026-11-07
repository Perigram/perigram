<template>
  <!-- The type's card (SPEC §22.8, owner direction 2026-11-07): the
       glyph with the authored name, the field vocabulary, the state
       machine mini-view, and — for declaration-authoring capability
       holders — the authoring entries. -->
  <div class="flex w-[26rem] max-w-[86vw] flex-col gap-3">
    <div class="flex items-center gap-2">
      <Avatar :icon="glyph" shape="circle" />
      <span class="min-w-0 truncate text-body">{{ typeLabel }}</span>
    </div>

    <div v-if="fieldRows.length" :class="LAYOUT.specList">
      <div
        v-for="field in fieldRows"
        :key="field.name"
        class="flex min-w-0 items-baseline justify-between gap-3"
      >
        <span class="min-w-0 truncate text-label text-muted">{{ field.label }}</span>
        <span class="shrink-0 text-label text-muted">{{ field.hint }}</span>
      </div>
    </div>

    <div v-if="machineHtml" :class="['overflow-x-auto', MARKDOWN_ELEMENT_CLASSES]" v-html="machineHtml" />

    <template v-if="authoringReady">
      <Divider />
      <div class="flex items-center gap-2">
        <Button
          icon="pi pi-pencil"
          :label="$t('typeDeclaration.editFields')"
          size="small"
          text
          severity="secondary"
          @click="$emit('author-fields')"
        />
        <Button
          icon="pi pi-share-alt"
          :label="$t('typeDeclaration.editStates')"
          size="small"
          text
          severity="secondary"
          class="ml-auto"
          @click="$emit('author-states')"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import {
  LAYOUT, iconFor, resolveFieldGroups, fieldLabel
} from '#shared/ui-mapping/index.js';
import { MARKDOWN_ELEMENT_CLASSES, renderMarkdown } from '#shared/markdown.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { machineModelOf, mermaidFlowchartOf } from '~/utils/processDesignerDeclarationEditor.js';

// The read view of a declared type: every surface's type label opens
// it. Holders of a live declaration session read the draft (authored
// order, empty fields included) and gain the authoring entries.
const props = defineProps({
  type: { type: Object, required: true },
  // The per-type state policy map ({ [value]: { label, ... } }) — the
  // served vocabulary the machine view renders for non-holders.
  statePolicy: { type: Object, default: null },
  // The contract's authored machine edges for the type
  // ([{ from, to, intent }] from stateTransitionsByType).
  stateTransitions: { type: Array, default: null }
});

defineEmits(['author-fields', 'author-states']);

const { t, te } = useI18n();
const authoring = inject('declarationAuthoring', null);
const authoringReady = computed(() => Boolean(authoring?.ready?.value));

const typeLabel = computed(() => generatedEntityLabel(props.type, { t, te }));
const glyph = computed(() => iconFor(props.type));

const descriptorHint = descriptor => {
  if (!descriptor?.base) return '';
  if (descriptor.unit) return `${descriptor.base} · ${descriptor.unit}`;
  if (descriptor.accepts?.length) return `${descriptor.base} (${descriptor.accepts.length})`;
  if (descriptor.values?.length) return `${descriptor.base} (${descriptor.values.length})`;
  return descriptor.base;
};

const fieldRows = computed(() => {
  if (authoringReady.value) {
    return (authoring.subtree?.value?.fields || [])
      .map(({ node }) => node?.data || {})
      .filter(data => data.name && data.descriptor)
      .map(data => ({ name: data.name, label: fieldLabel(data.name, data.descriptor), hint: descriptorHint(data.descriptor) }));
  }
  return resolveFieldGroups(props.type)
    .flatMap(group => group.fields)
    .map(field => ({ name: field.name, label: field.label, hint: descriptorHint(field.descriptor) }));
});

// The machine mini-view: the declaration authoring's mermaid render —
// the session's draft machine for holders, the served vocabulary plus
// authored edges otherwise.
const machineHtml = computed(() => {
  let model = null;
  if (authoringReady.value) {
    model = machineModelOf(authoring.subtree?.value);
  } else {
    const states = Object.entries(props.statePolicy || {})
      .map(([value, policy]) => ({ value, label: policy?.label || value }));
    if (!states.length) return '';
    model = {
      initial: null,
      states,
      edges: (props.stateTransitions || [])
        .filter(edge => edge?.from && edge?.to)
        .map(edge => ({ from: edge.from, to: edge.to, intent: edge.intent || '' }))
    };
  }
  if (!model?.states?.length) return '';
  return renderMarkdown(`\`\`\`mermaid\n${mermaidFlowchartOf(model)}\n\`\`\``);
});
</script>
