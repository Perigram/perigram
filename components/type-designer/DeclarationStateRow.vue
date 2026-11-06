<template>
  <div class="group/state-row flex min-w-0 items-center gap-3 border-b border-chrome-border py-2 last:border-b-0">
    <Inplace closable @open="draft = state.node.data.value || ''">
      <template #display>
        <div class="flex min-w-0 items-center gap-2 rounded-ui px-1 py-0.5 transition-colors hover:bg-subtle">
          <Tag :severity="state.node.data.severity || 'info'" :icon="state.node.data.icon || undefined" class="min-w-0">
            <span class="min-w-0 truncate">{{ state.node.data.value || $t('typeCanvas.stateName') }}</span>
          </Tag>
          <i class="pi pi-pencil shrink-0 text-muted text-supporting" aria-hidden="true" />
        </div>
      </template>
      <template #content="{ closeCallback }">
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <InputText
            v-model="draft"
            size="small"
            class="w-40"
            :aria-label="$t('typeCanvas.stateName')"
            @keydown.enter.prevent="commitRename(closeCallback)"
          />
          <Button
            icon="pi pi-check"
            size="small"
            text
            :aria-label="$t('common.save')"
            @click="commitRename(closeCallback)"
          />
          <Button
            icon="pi pi-times"
            size="small"
            text
            severity="secondary"
            :aria-label="$t('common.cancel')"
            @click="closeCallback()"
          />
        </div>
      </template>
    </Inplace>
    <Select
      :model-value="state.node.data.severity || 'info'"
      :options="severityOptions"
      option-label="label"
      option-value="value"
      size="small"
      class="w-36 shrink-0"
      :aria-label="$t('processDesigner.stateSeverity')"
      @update:model-value="value => $emit('severity', value || 'info')"
    />
    <IconField class="w-36 shrink-0">
      <InputIcon v-if="state.node.data.icon" :class="state.node.data.icon" aria-hidden="true" />
      <InputText
        :model-value="state.node.data.icon || ''"
        size="small"
        class="w-full"
        :placeholder="$t('processDesigner.stateIcon')"
        :aria-label="$t('processDesigner.stateIcon')"
        @update:model-value="value => $emit('icon', String(value || '').trim() || null)"
      />
    </IconField>
    <div
      class="ml-auto flex shrink-0 items-center gap-1 transition-opacity duration-150 [@media(hover:hover)]:opacity-60 group-hover/state-row:opacity-100 group-focus-within/state-row:opacity-100 motion-reduce:transition-none"
    >
      <Button
        icon="pi pi-trash"
        size="small"
        text
        severity="danger"
        :aria-label="$t('common.delete')"
        :title="$t('common.delete')"
        @click="$emit('remove')"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Inplace from 'primevue/inplace';
import Tag from 'primevue/tag';
import Select from '~/components/shared/InstanceSelect.vue';
import { stateSeverityOptions } from '~/components/type-designer/state-severities.js';

// Pure presentation — every mutation is an event up to the editor page
// (row contract: components/type-designer/README.md).
defineProps({
  state: { type: Object, required: true }
});

const emit = defineEmits(['rename', 'severity', 'icon', 'remove']);

const { t } = useI18n();
const severityOptions = stateSeverityOptions(t);
const draft = ref('');

function commitRename(close) {
  emit('rename', String(draft.value ?? '').trim());
  close();
}
</script>
