export function useProcessDesignerScreens({ draft, selectedScreenId, createScreen }) {
  function add() {
    const id = `screen_${Date.now()}`;
    draft.value ||= { data: {} };
    draft.value.data.screens ||= {};
    draft.value.data.screens[id] = createScreen(id);
    selectedScreenId.value = id;
    return draft.value.data.screens[id];
  }

  function removeSelected() {
    if (!selectedScreenId.value || !draft.value?.data?.screens) return false;
    delete draft.value.data.screens[selectedScreenId.value];
    selectedScreenId.value = Object.keys(draft.value.data.screens)[0] || null;
    return true;
  }

  return { add, removeSelected };
}
