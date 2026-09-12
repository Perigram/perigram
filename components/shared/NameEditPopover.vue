<template>
  <span class="inline-flex" data-entity-card-interactive="true" @click.stop>
    <slot name="trigger" :open="open">
      <Button
        icon="pi pi-pencil"
        text
        rounded
        size="small"
        :aria-label="ariaLabel || $t('common.edit')"
        @click="open"
      />
    </slot>

    <Popover ref="popover">
      <form class="flex min-w-72 flex-col gap-3" @submit.prevent="submit">
        <label :for="inputId" class="text-label">{{ label }}</label>
        <InputText
          :id="inputId"
          v-model="draft"
          class="w-full"
          :placeholder="placeholder"
          autofocus
          @keydown.esc.prevent="close"
        />
        <div class="flex justify-end gap-2">
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            type="button"
            severity="secondary"
            :aria-label="$t('common.cancel')"
            @click="close"
          />
          <Button
            icon="pi pi-check"
            rounded
            size="small"
            type="submit"
            :loading="saving"
            :disabled="saving || !canSubmit"
            :aria-label="$t('common.save')"
          />
        </div>
      </form>
    </Popover>
  </span>
</template>

<script setup>
import { computed, ref, useId, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, required: true },
  placeholder: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '' }
});

const emit = defineEmits(['save']);

const popover = ref();
const draft = ref(props.modelValue || '');
const inputId = useId();

watch(
  () => props.modelValue,
  (value) => {
    draft.value = value || '';
  }
);

const trimmedDraft = computed(() => draft.value.trim());
const canSubmit = computed(() => trimmedDraft.value && trimmedDraft.value !== (props.modelValue || '').trim());

const open = (event) => {
  draft.value = props.modelValue || '';
  popover.value?.toggle(event);
};

const close = () => {
  popover.value?.hide();
};

const submit = () => {
  if (!canSubmit.value) return;
  emit('save', trimmedDraft.value, close);
};
</script>
