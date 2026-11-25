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
        <PayloadTraitsEditor
          v-if="node.data.class === 'file'"
          v-model="node.data.payload"
          @update:model-value="$emit('sync')"
        />
        <div class="flex flex-col gap-1">
          <label class="text-label text-muted">{{ $t('processDesigner.projections') }}</label>
          <ProjectionsEditor
            :model-value="node.data.projections || []"
            @update:model-value="value => { node.data.projections = value; $emit('sync'); }"
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
import { useI18n } from 'vue-i18n';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from '~/components/shared/InstanceSelect.vue';
import FieldDeclarationForm from '~/components/type-designer/FieldDeclarationForm.vue';
import StateDeclarationForm from '~/components/type-designer/StateDeclarationForm.vue';
import GlyphSelect from '~/components/type-designer/GlyphSelect.vue';
import PayloadTraitsEditor from '~/components/type-designer/PayloadTraitsEditor.vue';
import ProjectionsEditor from '~/components/type-designer/ProjectionsEditor.vue';
import { DECLARABLE_CLASSES } from '#packages/cts';

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

function setClass(value) {
  props.node.data.class = value;
  if (value !== 'file') props.node.data.payload = null;
  emit('sync');
}


</script>
