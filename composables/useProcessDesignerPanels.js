import { ref } from 'vue';

export function useProcessDesignerPanels() {
  return {
    canvasMenu: ref(null),
    dockPopover: ref(null),
    inspectTab: ref('inspector'),
    inspectorOpen: ref(true),
    paletteOpen: ref(true),
    pinnedDockPopover: ref(null),
    processMenu: ref(null),
    selectedPrincipalId: ref(null),
    selectedRoleId: ref(null),
    selectedScreenId: ref(null)
  };
}
