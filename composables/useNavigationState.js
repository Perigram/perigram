import { reactive, computed } from 'vue';

const state = reactive({
  tabs: [],
  activeTab: null,
});

export const useNavigationState = () => {
  const setTabs = (tabs) => {
    state.tabs = tabs;
  };

  const setActiveTab = (tab) => {
    state.activeTab = tab;
  };

  const clearTabs = () => {
    state.tabs = [];
    state.activeTab = null;
  }

  return {
    tabs: computed(() => state.tabs),
    activeTab: computed(() => state.activeTab),
    setTabs,
    setActiveTab,
    clearTabs,
  };
};
