<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <div class="min-h-0 flex-1 overflow-auto p-4">
      <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
      <StateBlock v-else-if="notFound" state="error" :message="$t('generatedScreen.notFound')" />
      <!-- Screens render through the ui-mapping engine — the same CTS
           render contract as the routed surfaces — and emit instance opens
           to the workspace instead of routing: typeList screens through
           the shared type host, scoped (instance-bound) screens through
           the detail host. -->
      <GeneratedScreen
        v-else-if="screenOverload"
        :screen="scopedScreen"
        @refresh="$emit('refresh')"
      />
      <GeneratedScreenHost
        v-else-if="resolvedScreen.template === 'typeList' && !item.instanceId"
        :screen="resolvedScreen"
        @open-instance="payload => $emit('open-entity', { typeId: payload.typeId, instanceId: payload.instanceId })"
        @refresh="$emit('refresh')"
      />
      <GeneratedScreenHost
        v-else-if="item.instanceId && resolvedScreen"
        :screen="scopedScreen"
        @open-instance="payload => $emit('open-entity', { typeId: payload.typeId, instanceId: payload.instanceId })"
        @refresh="$emit('refresh')"
      />
      <GeneratedScreen v-else :screen="resolvedScreen" @refresh="$emit('refresh')" />
    </div>
  </div>
</template>

<script setup>
// The pane body for opened screens: compiled typeList screens render
// inside the pane tab through the shared type host, and instance-bound
// screens (compiled instanceDetail or the synthesized fallback) render
// through the detail host with the instance id in the screen scope.
// Instance opens emit `{ typeId, instanceId }` to the workspace — routing
// stays with the host, never the generator.
import { computed } from 'vue';
import GeneratedScreen from '~/components/generated/GeneratedScreen.vue';
import GeneratedScreenHost from '~/components/generated/GeneratedScreenHost.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { synthesizeDetailScreen } from '~/components/generated/detail-screen-actions.js';
import { resolveGeneratedScreenOverload, resolveGeneratedInstanceDetailOverload } from '~/components/generated/overloads.js';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  item: { type: Object, required: true }
});

defineEmits(['refresh', 'open-entity']);

const authStore = useAuthStore();

const manifestScreen = computed(() => (authStore.screenManifest || []).find(candidate => (
  candidate.screenKey === props.item.screenKey || candidate.id === props.item.screenKey
)) || null);
// Instance-bound tabs carry their scope on the item; the manifest record
// (or the synthesized detail fallback when the manifest has no record for
// the key) renders with that scope, exactly like the routed surface.
const resolvedScreen = computed(() => manifestScreen.value
  || (props.item.instanceId && props.item.screenKey
    ? synthesizeDetailScreen((authStore.screenManifest || []).find(candidate => (
      candidate.screenKey === props.item.screenKey.replace(/_detail$/, '')
      || candidate.id === props.item.screenKey.replace(/_detail$/, '')
    )))
    : null));
const scopedScreen = computed(() => {
  if (!resolvedScreen.value || !props.item.instanceId) return resolvedScreen.value;
  return {
    ...resolvedScreen.value,
    scope: {
      ...(resolvedScreen.value.scope || {}),
      instanceId: props.item.instanceId,
      [`${props.item.typeId || resolvedScreen.value.typeId}Id`]: props.item.instanceId
    }
  };
});
// The routed page's overload rule: editor-backed detail types (and
// artifact) keep the legacy renderer that owns their surfaces.
const screenOverload = computed(() => Boolean(resolvedScreen.value && (
  resolveGeneratedScreenOverload(resolvedScreen.value)
  || (props.item.instanceId && resolvedScreen.value.template === 'instanceDetail'
    && resolveGeneratedInstanceDetailOverload(resolvedScreen.value.typeId))
)));
// Screen records resolve after auth hydration; only a hydrated manifest
// with no matching record is a not-found.
const loading = computed(() => !authStore.userIsSet);
const notFound = computed(() => authStore.userIsSet && !resolvedScreen.value);
</script>
