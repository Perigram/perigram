<template>
  <!-- The entity popup: the standard centered dialog hosting the
       entity's real record surface. Exactly one expansion affordance:
       the expand arrow steps the record up to its page (the home pane
       on desktop, its route on mobile). Unopenable types never get
       here — useEntityPopup refuses them. -->
  <StandardDialog
    v-model:visible="visible"
    :size="isDirectoryType ? 'md' : 'xl'"
    :show-default-footer="false"
  >
    <template #header>
      <!-- The trailing 8px keeps the step-up off the preset's close
           button: the header row stretches to the dialog edge, so
           without it the two icon buttons touch. -->
      <div class="flex min-w-0 flex-1 items-center gap-2 pr-2">
        <!-- The record header renders into the dialog header, so the popup
             carries one title surface and its action cluster. -->
        <div ref="popupHeader" class="min-w-0 flex-1" />
        <Button
          v-if="expandable()"
          icon="pi pi-external-link"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="$t('common.expand')"
          :title="$t('common.expand')"
          @click="expand"
        />
      </div>
    </template>
    <!-- Width-measure host: the dialog content owns the scroll surface. -->
    <div ref="popupBody">
      <DirectoryDetailSurface
        v-if="visible && isDirectoryType"
        :key="`${request.typeId}:${request.instanceId}`"
        :type-id="request.typeId"
        :instance-id="request.instanceId"
        bounded
      />
      <GeneratedScreenHost
        v-else-if="visible && detailScreen"
        :screen="detailScreen"
        :header-target="popupHeader"
        @open-instance="openInstance"
      />
    </div>
  </StandardDialog>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import GeneratedScreenHost from '~/components/generated/GeneratedScreenHost.vue';
import DirectoryDetailSurface from '~/components/directory/DirectoryDetailSurface.vue';
import { scopedDetailScreen, resolveDetailScreen } from '~/components/generated/detail-screen-actions.js';
import { detailRouteForInstance } from '~/components/generated/instance-detail-routing.js';
import { resolveFileSurface } from '~/components/generated/file-surfaces.js';
import { useCallRouting } from '~/composables/useCallRouting.js';
import { openInstanceInWorkspace, workspaceInstanceOpenEvent } from '~/utils/instance-workspace-open.js';
import { workspacePageOpenEvent } from '~/utils/workspace-page-open.js';
import { useSupportDialog } from '~/composables/useModalState';
import { useEntityPopup } from '~/composables/useEntityPopup';
import { useInstancesStore } from '~/stores/instances';
import { useAuthStore } from '~/stores/auth';
import { provideContainerTraits } from '~/composables/useContainerTraits.js';
import { useI18n } from 'vue-i18n';

const { request, close } = useEntityPopup();
const { isMobileViewport } = useCallRouting();
const instances = useInstancesStore();
const authStore = useAuthStore();
const { t, te } = useI18n();

// The record popup is a measuring container host: the dialog body's real
// width drives arrangement, the popup profile carries height/scroll and
// the compact density tier.
const popupBody = ref(null);
const popupHeader = ref(null);
provideContainerTraits({ hostKind: 'popup', elRef: popupBody });

// An action the hosted surface runs that opens another surface — an
// editor workspace page, a workspace tab, the chat drawer — takes the
// stage: the popup closes instead of floating over what it opened.
function onOutsideSurfaceOpened() {
  if (request.value) close();
}
const supportDialog = useSupportDialog();
watch(supportDialog, open => { if (open) onOutsideSurfaceOpened(); });
onMounted(() => {
  window.addEventListener(workspaceInstanceOpenEvent, onOutsideSurfaceOpened);
  window.addEventListener(workspacePageOpenEvent, onOutsideSurfaceOpened);
});
onBeforeUnmount(() => {
  window.removeEventListener(workspaceInstanceOpenEvent, onOutsideSurfaceOpened);
  window.removeEventListener(workspacePageOpenEvent, onOutsideSurfaceOpened);
});

const visible = computed({
  // The composable's open() already refuses unopenable types; the guard
  // here keeps a stale request (recompiled process dropped the screen)
  // from rendering the empty shell.
  get: () => Boolean(request.value) && (isDirectoryType.value || Boolean(detailScreen.value)),
  set: value => { if (!value) close(); }
});
const isDirectoryType = computed(() => ['user', 'organization'].includes(request.value?.typeId));

// Hydration for the hosted surfaces: the readable-reference resolution
// populates the pool even when the hosted screen's own source loading
// has not run yet.
watch(request, async (current) => {
  if (!current) return;
  const cached = instances.dtoFor(current.typeId, current.instanceId);
  if (!cached) {
    await instances.resolveReadableReference(current.typeId, current.instanceId, { silent: true }).catch(() => null);
  }
}, { immediate: true });


const detailScreen = computed(() => {
  const current = request.value;
  if (!current || isDirectoryType.value) return null;
  return scopedDetailScreen({
    typeId: current.typeId,
    instanceId: current.instanceId,
    screenKey: current.screenKey || '',
    screens: authStore.screenManifest || []
  });
});

function expand() {
  const current = request.value;
  if (!current) return;
  close();
  openInstanceInWorkspace({ typeId: current.typeId, instanceId: current.instanceId });
}

// The expand step-up goes where a page exists: a compiled/synthesizable
// detail screen, or the directory surface for user/organization. The
// record floor is popup-only (workspace tabs stay manifest-driven), so a
// floor record renders the dialog as its bounded terminal surface — the
// dialog's own close dismisses.
function expandable() {
  const current = request.value;
  if (!current) return false;
  if (current.typeId === 'organization' && isActiveOrganization(current.instanceId)) return true;
  const paneDestination = isDirectoryType.value
    || Boolean(resolveFileSurface(undefined, current.typeId)?.workspacePage)
    || Boolean(resolveDetailScreen({
      screens: authStore.screenManifest || [],
      typeId: current.typeId
    }));
  if (!paneDestination) return false;
  if (!isMobileViewport()) return true;
  if (isDirectoryType.value) return false;
  return Boolean(detailRouteForInstance({
    entity: { _id: current.instanceId },
    typeId: current.typeId,
    manifest: authStore.screenManifest
  }));
}

function isActiveOrganization(instanceId = '') {
  const activeId = authStore.organizationData?._id || authStore.userData?.organizationId || '';
  return Boolean(activeId) && String(instanceId) === String(activeId);
}

function openInstance({ screenKey: detailKey, typeId, instanceId } = {}) {
  if (!typeId || !instanceId) return;
  // The popup stays put: an identity open from the generator swaps the
  // popup subject in place — any type the popup itself can host resolves
  // (compiled screen, synthesizable detail, record floor).
  if (!scopedDetailScreen({ typeId, instanceId, screenKey: detailKey || '', screens: authStore.screenManifest || [] })) return;
  request.value = { typeId, instanceId: String(instanceId), ...(detailKey ? { screenKey: detailKey } : {}) };
}
</script>
