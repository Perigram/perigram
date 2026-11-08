<template>
  <div class="group/state-row flex min-w-0 flex-col gap-2 border-b border-chrome-border py-2 last:border-b-0">
    <div class="flex min-w-0 items-center gap-2">
      <Inplace closable @open="draft = state.value || ''">
        <template #display>
          <div class="flex min-w-0 items-center gap-2 rounded-ui px-1 py-0.5 transition-colors hover:bg-subtle">
            <Tag :severity="state.severity || 'info'" :icon="state.icon || undefined" class="min-w-0">
              <span class="min-w-0 truncate">{{ state.value || $t('typeCanvas.stateName') }}</span>
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
      <div class="ml-auto flex shrink-0 items-center gap-1">
        <label class="flex items-center gap-1 text-supporting text-muted">
          <Checkbox
            :model-value="state.terminal === true"
            :binary="true"
            @update:model-value="value => $emit('terminal', value === true)"
          />
          {{ $t('processDesigner.stateTerminal') }}
        </label>
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
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <Select
        :model-value="state.severity || 'info'"
        :options="severityOptions"
        option-label="label"
        option-value="value"
        size="small"
        class="w-32 shrink-0"
        :aria-label="$t('processDesigner.stateSeverity')"
        @update:model-value="value => $emit('severity', value || 'info')"
      />
      <IconField class="w-32 shrink-0">
        <InputIcon v-if="state.icon" :class="state.icon" aria-hidden="true" />
        <InputText
          :model-value="state.icon || ''"
          size="small"
          class="w-full"
          :placeholder="$t('processDesigner.stateIcon')"
          :aria-label="$t('processDesigner.stateIcon')"
          @update:model-value="value => $emit('icon', String(value || '').trim() || '')"
        />
      </IconField>
      <InputText
        :model-value="state.label || ''"
        size="small"
        class="min-w-0 flex-1"
        :placeholder="$t('typeDeclaration.stateLabel')"
        :aria-label="$t('typeDeclaration.stateLabel')"
        @update:model-value="value => $emit('label', String(value || ''))"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Inplace from 'primevue/inplace';
import Tag from 'primevue/tag';
import Select from '~/components/shared/InstanceSelect.vue';
import { stateSeverityOptions } from '~/components/type-designer/state-severities.js';

// Pure presentation — every mutation is an event up to the hosting surface.
defineProps({
  state: { type: Object, required: true }
});

const emit = defineEmits(['rename', 'label', 'severity', 'icon', 'terminal', 'remove']);

const { t } = useI18n();
const severityOptions = stateSeverityOptions(t);
const draft = ref('');

function commitRename(close) {
  emit('rename', String(draft.value ?? '').trim());
  close();
}
</script>
