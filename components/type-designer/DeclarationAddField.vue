<template>
  <Button
    icon="pi pi-plus"
    :label="$t('typesPane.addField')"
    size="small"
    text
    severity="secondary"
    class="self-start"
    data-testid="field-add-open"
    @click="event => popover?.toggle(event)"
  />
  <Popover ref="popover">
    <div class="flex w-[26rem] max-w-[86vw] flex-col gap-3">
      <div class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('typeCanvas.fieldName') }}</label>
        <InputText
          v-model="draftName"
          size="small"
          :placeholder="$t('typeCanvas.fieldName')"
          :aria-label="$t('typeCanvas.fieldName')"
          @keydown.enter.prevent="commit"
        />
      </div>
      <div class="rounded-ui border border-content-border p-3">
        <DescriptorEditor v-model="draftDescriptor" :type-options="typeOptions" />
      </div>
      <Button
        icon="pi pi-check"
        :label="$t('common.add')"
        size="small"
        :disabled="!draftName.trim()"
        @click="commit"
      />
    </div>
  </Popover>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';

// The property block's add-field affordance (SPEC §1): mints the field
// through the session's addField gesture with the authored name and
// descriptor, so the new row lands in the block at once.
const props = defineProps({
  authoring: { type: Object, required: true },
  typeOptions: { type: Array, default: () => [] }
});

const popover = ref(null);
const draftName = ref('');
const draftDescriptor = ref({ base: 'string' });

function commit() {
  const name = draftName.value.trim();
  if (!name) return;
  props.authoring.addField({ name, descriptor: draftDescriptor.value });
  draftName.value = '';
  draftDescriptor.value = { base: 'string' };
  popover.value?.hide();
}
</script>
