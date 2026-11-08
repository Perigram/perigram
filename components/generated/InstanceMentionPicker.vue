<template>
  <Popover ref="popover" @show="onShow" @hide="emit('hide')">
    <div class="w-80">
      <InstanceTree
        ref="tree"
        :aria-label="t('editors.pickInstance')"
        :show-create="false"
        @select="selectInstance"
      />
    </div>
  </Popover>
</template>

<script setup>
import { nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Popover from 'primevue/popover';
import InstanceTree from '~/components/shared/InstanceTree.vue';

// The document mention picker (SPEC §26): `@` and the slash instance
// entry open the shared instance tree anchored at the caret, so a pick
// lands exactly where the author asked.
const emit = defineEmits(['select', 'hide']);
const { t } = useI18n();
const popover = ref(null);
const tree = ref(null);

function open(anchor) {
  popover.value?.show({ currentTarget: anchor }, anchor);
}

function onShow() {
  tree.value?.reset();
  nextTick(() => tree.value?.focusFilter());
}

function selectInstance(item) {
  popover.value?.hide();
  emit('select', item);
}

const hide = () => popover.value?.hide?.();

defineExpose({ open, hide });
</script>
