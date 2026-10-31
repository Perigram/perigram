<template>
  <div ref="body" class="flex min-w-0 flex-col">
    <GeneratedScreenHost
      v-if="screen"
      :screen="screen"
      presentation="peek"
      @open-instance="onOpenInstance"
    />
  </div>
</template>

<script setup>
// The record peek body (SPEC §22.14): the compiled detail screen scoped
// to the record in its peek presentation — compact identity line, state,
// preview, and leading facts — rendered inside
// [`HoverPeek.vue`](./HoverPeek.vue).
import { computed, ref, watch } from 'vue';
import GeneratedScreenHost from '~/components/generated/GeneratedScreenHost.vue';
import { useAuthStore } from '~/stores/auth';
import { scopedDetailScreen } from '~/components/generated/detail-screen-actions.js';
import { provideContainerTraits } from '~/composables/useContainerTraits.js';

const props = defineProps({
  typeId: { type: String, required: true },
  instanceId: { type: [String, Number], required: true },
  screenKey: { type: String, default: '' }
});

const authStore = useAuthStore();
// The peek is a measuring container host, the same law the record popup
// follows: the popover body's real width drives arrangement and the
// compact density tier rides the hosted rhythm.
const body = ref(null);
provideContainerTraits({ hostKind: 'popup', elRef: body });
const subject = ref({ typeId: props.typeId, instanceId: props.instanceId, screenKey: props.screenKey });
watch(() => [props.typeId, props.instanceId, props.screenKey], ([typeId, instanceId, screenKey]) => {
  subject.value = { typeId, instanceId, screenKey };
});
const screen = computed(() => scopedDetailScreen({
  ...subject.value,
  screens: authStore.screenManifest || []
}));
// Identity opens from the generator swap the peek subject in place —
// the same law the record popup follows.
function onOpenInstance({ typeId, instanceId, screenKey } = {}) {
  if (!typeId || !instanceId) return;
  subject.value = { typeId, instanceId, screenKey: screenKey || '' };
}
</script>
