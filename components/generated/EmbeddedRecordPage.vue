<template>
  <GeneratedScreenHost
    v-if="screen"
    :screen="screen"
    pool-only
    @open-instance="payload => emit('open-instance', payload)"
  />
</template>

<script setup>
// The records projection's host surface (SPEC §22.16): the same
// detail-screen resolution the record popup mounts — the compiled
// instanceDetail screen, the synthesized detail, or the record floor —
// scoped to one instance and rendered in place, children collections
// included. The embed rides the shared pool (pool-only host) and the
// `uiMappingEmbedded` provide steps the page chrome down: section-scale
// title, bounded preview band. The screen host is loaded async:
// GeneratedScreenHost imports the engine that renders this component's
// parent tree.
import { computed, defineAsyncComponent, provide } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { resolveDetailScreen, recordFloorScreen } from './detail-screen-actions.js';

provide('uiMappingEmbedded', true);
const emit = defineEmits(['open-instance']);

const GeneratedScreenHost = defineAsyncComponent(() => import('./GeneratedScreenHost.vue'));

const props = defineProps({
  instance: { type: Object, required: true }
});

const authStore = useAuthStore();

const screen = computed(() => {
  const typeId = props.instance?.type || null;
  const instanceId = props.instance?.id != null ? String(props.instance.id) : '';
  if (!typeId || !instanceId) return null;
  const base = resolveDetailScreen({ screens: authStore.screenManifest || [], typeId })
    || recordFloorScreen(typeId);
  if (!base) return null;
  return {
    ...base,
    scope: {
      ...(base.scope || {}),
      instanceId,
      [`${typeId}Id`]: instanceId
    }
  };
});
</script>
