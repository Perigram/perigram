<template>
  <span v-if="splittable || closeable || maximizable || canReopen" class="inline-flex shrink-0">
    <Button
      icon="pi pi-ellipsis-v"
      text
      rounded
      size="small"
      severity="secondary"
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
          v-if="maximizable"
          :label="$t(maximized ? 'project.restorePane' : 'project.maximizePane')"
          :icon="maximized ? 'pi pi-window-minimize' : 'pi pi-window-maximize'"
          text
          size="small"
          class="w-full justify-start"
          @click="$emit('toggle-maximize')"
        />
        <Button
          v-if="canReopen"
          :label="$t('project.reopenClosed')"
          icon="pi pi-history"
          text
          size="small"
          class="w-full justify-start"
          @click="$emit('reopen')"
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
  splittable: { type: Boolean, default: true },
  maximizable: { type: Boolean, default: true },
  maximized: { type: Boolean, default: false },
  canReopen: { type: Boolean, default: false }
});

defineEmits(['split', 'close', 'toggle-maximize', 'reopen']);

const popover = ref(null);

function toggle(event) {
  popover.value?.toggle(event);
}

function hide() {
  popover.value?.hide();
}
</script>
