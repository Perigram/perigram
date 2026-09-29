import { ref } from 'vue';

export function useProcessDesignerPanels() {
  return {
    inspectTab: ref('inspector'),
    inspectorOpen: ref(true),
    paletteOpen: ref(true),
    selectedPrincipalId: ref(null),
    selectedRoleId: ref(null),
    selectedScreenId: ref(null)
  };
}
