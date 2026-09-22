<template>
  <span class="inline-flex shrink-0" data-instance-card-interactive="true">
    <Button
      icon="pi pi-ellipsis-h"
      text
      rounded
      size="small"
      severity="secondary"
      :aria-label="$t('common.more')"
      @click.stop="toggle"
    />
    <Popover ref="popover">
      <div class="flex min-w-48 flex-col gap-1" @click="hide">
        <slot />
      </div>
    </Popover>
  </span>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import Popover from 'primevue/popover';

const popover = ref(null);

function toggle(event) {
  popover.value?.toggle(event);
}

function hide() {
  popover.value?.hide();
}
</script>
