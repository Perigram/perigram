import { ref } from 'vue';

export function useProcessDesignerPanels() {
  return {
    inspectTab: ref('inspector'),
    inspectorOpen: ref(true),
    paletteOpen: ref(true),
    processMenu: ref(null),
    selectedPrincipalId: ref(null),
    selectedRoleId: ref(null),
    selectedScreenId: ref(null)
  };
}
