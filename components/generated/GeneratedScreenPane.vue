<template>
  <section class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <!-- The pane's content column: the scroll host the container-traits
         seam measures, with the bounded comments side panel anchored
         beside it (SPEC §22.17). -->
    <div class="relative flex min-h-0 flex-1 flex-col">
      <div ref="scrollHost" class="min-h-0 flex-1 overflow-auto p-4">
        <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
        <StateBlock v-else-if="notFound" state="error" :message="$t('generatedScreen.notFound')" />
        <!-- Every pane screen — generator templates and the home overload
             alike — renders through the single generator host and emits
             instance opens to the workspace instead of routing. -->
        <GeneratedScreenHost
          v-else
          :screen="scopedScreen"
          :navigation="navigation"
          @open-instance="payload => $emit('open-entity', { typeId: payload.typeId, instanceId: payload.instanceId })"
          @refresh="$emit('refresh')"
        />
      </div>
      <RecordCommentsPanel :target="commentsTarget" @close="commentsTarget = null" />
    </div>
  </section>
</template>

<script setup>
// The workspace pane adapter for opened screens: compiled typeList screens
// render inside the active pane tab, and instance-bound screens (compiled
// instanceDetail or the synthesized fallback) render with the instance id
// in the screen scope. Instance opens emit `{ typeId, instanceId }` to the
// workspace — routing stays with the host, never the generator.
import { computed, provide, ref } from 'vue';
import GeneratedScreenHost from '~/components/generated/GeneratedScreenHost.vue';
import RecordCommentsPanel from '~/components/chat/RecordCommentsPanel.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { synthesizeDetailScreen } from '~/components/generated/detail-screen-actions.js';
import { resolveGeneratedScreenOverload } from '~/components/generated/overloads.js';
import { screenByKey } from '~/utils/process-navigation.js';
import { useAuthStore } from '~/stores/auth';
import { provideContainerTraits } from '~/composables/useContainerTraits.js';

const props = defineProps({
  item: { type: Object, required: true },
  navigation: { type: Object, default: null }
});

defineEmits(['refresh', 'open-entity']);

// The pane is a container-traits host: it measures its own scroll column
// and provides the resolved record, so hosted surfaces size budgets to
// the pane the user shaped (the container seam contract).
const scrollHost = ref(null);
provideContainerTraits({ hostKind: 'pane', elRef: scrollHost });

// The pane's comments channel (SPEC §22.17): the hosted record's header
// opens the thread as the bounded side panel inside the pane.
const commentsTarget = ref(null);
provide('recordCommentsPanel', target => {
  commentsTarget.value = commentsTarget.value?.instanceId === target.instanceId
    && commentsTarget.value?.typeId === target.typeId
    ? null
    : target;
});

const authStore = useAuthStore();

// Instance-bound tabs carry their scope on the item; the manifest record
// (or the synthesized detail fallback when the manifest has no record for
// the key) renders with that scope, exactly like the routed surface.
const resolvedScreen = computed(() => {
  const manifestScreen = screenByKey(authStore.screenManifest || [], props.item.screenKey);
  if (manifestScreen) return manifestScreen;
  if (!props.item.instanceId || !props.item.screenKey) return null;
  const baseKey = String(props.item.screenKey).replace(/_detail$/, '');
  return synthesizeDetailScreen(screenByKey(authStore.screenManifest || [], baseKey));
});
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
const activeKey = computed(() => (props.item.instanceId
  ? `screen:${props.item.screenKey}:${props.item.instanceId}`
  : (props.item.screenKey ? `screen:${props.item.screenKey}` : props.item.key)));
// The pane's tab key: the workspace page-dirty registry keys an open
// record page's unsaved overlay by its pane tab, so pane-close confirms.
provide('workspacePageKey', activeKey.value);
// Screen records resolve after auth hydration; only a hydrated manifest
// with no matching record — or a template no surface renders — is a
// not-found.
const renderable = computed(() => {
  const template = resolvedScreen.value?.template;
  return ['typeList', 'instanceDetail', 'formAction'].includes(template)
    || Boolean(resolveGeneratedScreenOverload(resolvedScreen.value));
});
const loading = computed(() => !authStore.userIsSet);
const notFound = computed(() => authStore.userIsSet && (!resolvedScreen.value || !renderable.value));
</script>
