<template>
  <Button
    icon="pi pi-pen-to-square"
    text
    rounded
    size="small"
    severity="secondary"
    :class="['shrink-0 transition-opacity duration-150 [@media(hover:hover)]:opacity-60 group-hover/ck-field:opacity-100 group-focus-within/ck-field:opacity-100 motion-reduce:transition-none', open ? 'opacity-100' : '']"
    :aria-label="$t('common.edit')"
    :title="$t('common.edit')"
    data-testid="field-author-open"
    @click="event => popover?.toggle(event)"
  />
  <Popover ref="popover" @show="open = true" @hide="open = false">
    <DeclarationFieldPanel
      :authoring="authoring"
      :field="field"
      :type-options="typeOptions"
    />
  </Popover>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import DeclarationFieldPanel from '~/components/type-designer/DeclarationFieldPanel.vue';

// The per-row field authoring affordance (SPEC §1): the popover anchored
// at the property row hosts the field authoring form.
defineProps({
  authoring: { type: Object, required: true },
  field: { type: Object, required: true },
  typeOptions: { type: Array, default: () => [] }
});

const popover = ref(null);
const open = ref(false);
</script>
