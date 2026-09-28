<template>
  <span v-if="splittable || closeable" class="inline-flex shrink-0 self-stretch items-stretch">
    <Button
      icon="pi pi-ellipsis-v"
      text
      rounded
      size="small"
      severity="secondary"
      class="!h-full !w-6"
      :aria-label="$t('common.more')"
      @click.stop="toggle"
    />
    <Popover ref="popover">
      <div class="flex min-w-44 flex-col gap-1" @click="hide">
        <Button
          v-if="splittable"
          :label="$t('project.splitRight')"
          icon="pi pi-arrows-h"
          text
          size="small"
          class="w-full justify-start"
          @click="$emit('split', 'horizontal')"
        />
        <Button
          v-if="splittable"
          :label="$t('project.splitDown')"
          icon="pi pi-arrows-v"
          text
          size="small"
          class="w-full justify-start"
          @click="$emit('split', 'vertical')"
        />
        <Button
          v-if="closeable"
          :label="$t('common.close')"
          icon="pi pi-times"
          text
          size="small"
          severity="danger"
          class="w-full justify-start"
          @click="$emit('close')"
        />
      </div>
    </Popover>
  </span>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import Popover from 'primevue/popover';

defineProps({
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true }
});

defineEmits(['split', 'close']);

const popover = ref(null);

function toggle(event) {
  popover.value?.toggle(event);
}

function hide() {
  popover.value?.hide();
}
</script>
