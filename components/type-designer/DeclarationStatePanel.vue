<template>
  <div class="flex w-full flex-col gap-3">
    <div v-if="states.length" class="flex flex-col">
      <DeclarationStateRow
        v-for="state in states"
        :key="state.node.id"
        :state="state"
        @rename="value => authoring.setStateValue(state.node, value)"
        @label="value => authoring.setStateLabel(state.node, value)"
        @severity="value => authoring.setStateSeverity(state.node, value)"
        @icon="value => authoring.setStateIcon(state.node, value)"
        @remove="() => authoring.removeWithGate(state.node.id)"
      />
    </div>

    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <InputText
          v-model="newStateValue"
          size="small"
          class="min-w-0 flex-1"
          :placeholder="$t('typeCanvas.stateName')"
          :aria-label="$t('typeDeclaration.addState')"
          @keydown.enter.prevent="commitAddState"
        />
        <Button
          icon="pi pi-check"
          size="small"
          text
          :disabled="!newStateValue.trim()"
          :aria-label="$t('common.add')"
          @click="commitAddState"
        />
      </div>
      <span class="text-supporting text-muted">
        {{ addStateCarrier === 'initial'
          ? $t('typeDeclaration.addStateHintInitial')
          : $t('typeDeclaration.addStateHintTransition') }}
      </span>
    </div>

    <div v-if="transitions.length" class="flex flex-col">
      <div class="flex min-w-0 items-center gap-2 pb-1">
        <span class="min-w-0 flex-1 truncate text-label text-muted">{{ $t('typeDeclaration.from') }}</span>
        <span class="w-32 shrink-0 truncate text-label text-muted">{{ $t('typeDeclaration.to') }}</span>
        <span class="min-w-0 flex-1 truncate text-label text-muted">{{ $t('typeDeclaration.intent') }}</span>
        <span class="w-8 shrink-0" aria-hidden="true" />
      </div>
      <DeclarationTransitionRow
        v-for="entry in transitions"
        :key="entry.record.id"
        :entry="entry"
        :states="states"
        :state-options="stateOptions"
        @retarget="value => authoring.retargetTransition(entry, value)"
        @intent="value => authoring.setTransitionIntent(entry, value)"
        @remove="() => authoring.removeWithGate(entry.node.id)"
      />
    </div>

    <div v-if="states.length" class="flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <Select
          v-model="newTransitionTarget"
          :options="stateOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="min-w-0 flex-1"
          :placeholder="$t('typeDeclaration.to')"
          :aria-label="$t('typeDeclaration.addTransition')"
        />
        <Button
          icon="pi pi-plus"
          size="small"
          text
          severity="secondary"
          :disabled="!newTransitionTarget"
          :aria-label="$t('typeDeclaration.addTransition')"
          :title="$t('typeDeclaration.addTransition')"
          @click="commitAddTransition"
        />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Button
        v-if="states.length"
        icon="pi pi-share-alt"
        :label="$t('typeDeclaration.machineView')"
        size="small"
        text
        severity="secondary"
        @click="machineVisible = true"
      />
      <DeclarationSaveButton
        v-if="authoring.dirty.value || authoring.saving.value"
        class="ml-auto"
        :authoring="authoring"
      />
    </div>

    <Message v-for="item in authoring.refusals.value" :key="item" severity="warn" :closable="false">{{ item }}</Message>
    <Message v-for="item in authoring.diagnostics.value" :key="item" severity="error" :closable="false">{{ item }}</Message>

    <StandardDialog v-model:visible="machineVisible" :header="$t('typeDeclaration.machineView')" size="lg">
      <div :class="MARKDOWN_ELEMENT_CLASSES" class="max-h-[60dvh] overflow-auto" v-html="machineHtml" />
    </StandardDialog>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from '~/components/shared/InstanceSelect.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { MARKDOWN_ELEMENT_CLASSES, renderMarkdown } from '#shared/markdown.js';
import DeclarationStateRow from '~/components/type-designer/DeclarationStateRow.vue';
import DeclarationTransitionRow from '~/components/type-designer/DeclarationTransitionRow.vue';
import DeclarationSaveButton from '~/components/type-designer/DeclarationSaveButton.vue';
import { machineModelOf, mermaidFlowchartOf } from '~/utils/processDesignerDeclarationEditor.js';

// The state surface's authoring lane (SPEC §1, owner direction 2026-11-07):
// the vocabulary states with their severity/icon/label, add-state under the
// SPEC §7 carrier law with its consequence stated, transitions authored
// from/to the live vocabulary, the machine view, and the session save —
// every mutation a gesture on the provided session.
const props = defineProps({
  authoring: { type: Object, required: true }
});

const states = computed(() => props.authoring.subtree?.value?.states || []);
const transitions = computed(() => props.authoring.subtree?.value?.transitions || []);
const stateOptions = computed(() => props.authoring.stateValueOptions());
const addStateCarrier = computed(() => props.authoring.addStateCarrier.value);

const newStateValue = ref('');
const newTransitionTarget = ref('');
const machineVisible = ref(false);

watch(states, () => {
  if (newTransitionTarget.value && !states.value.some(({ node }) => node.data?.value === newTransitionTarget.value)) {
    newTransitionTarget.value = '';
  }
});

function commitAddState() {
  const value = newStateValue.value.trim();
  if (!value) return;
  props.authoring.addState(value);
  newStateValue.value = '';
}

function commitAddTransition() {
  if (!newTransitionTarget.value) return;
  props.authoring.addTransition(newTransitionTarget.value);
  newTransitionTarget.value = '';
}

const machineHtml = computed(() => {
  if (!machineVisible.value) return '';
  const mermaid = mermaidFlowchartOf(machineModelOf(props.authoring.subtree.value));
  return renderMarkdown(`\`\`\`mermaid\n${mermaid}\`\`\``);
});
</script>
