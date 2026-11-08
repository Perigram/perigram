import { defineStore } from 'pinia';
import { useAuthStore } from './auth';

// The organization's saved collection views (SPEC §26): the list
// projection over `/api/views` plus per-view state loads. A view is a
// saved lens — presentation data only, carried over the ordinary read
// paths.
export const useViewsStore = defineStore('views', {
  state: () => ({
    views: [],
    loaded: false,
    loading: false,
    viewStates: {}
  }),
  getters: {
    viewById: state => id => state.views.find(view => view._id === String(id)) || null,
    canSave: () => {
      const authStore = useAuthStore();
      return Boolean(authStore.organizationData);
    }
  },
  actions: {
    async ensureLoaded() {
      if (this.loaded || this.loading) return;
      await this.reload();
    },
    async reload() {
      this.loading = true;
      try {
        const response = await $fetch('/api/views');
        this.views = response?.views || [];
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    },
    async loadView(id) {
      let view;
      try {
        view = await $fetch(`/api/views/${id}`);
      } catch (error) {
        // A 404 means the view is gone server-side; the list cache drops
        // the stale row so readers render the unavailable state.
        if (error?.status === 404 || error?.statusCode === 404 || error?.data?.statusCode === 404) {
          this.views = this.views.filter(candidate => candidate._id !== String(id));
          const states = { ...this.viewStates };
          delete states[String(id)];
          this.viewStates = states;
        }
        throw error;
      }
      this.upsert({ _id: view._id, name: view.name, typeId: view.typeId });
      this.viewStates = { ...this.viewStates, [String(id)]: view.viewState || {} };
      return view;
    },
    async createView({ name, typeId, viewState }) {
      const view = await $fetch('/api/views', {
        method: 'POST',
        body: { name, typeId, viewState }
      });
      this.upsert(view);
      return view;
    },
    async rename(id, name) {
      const view = await $fetch(`/api/views/${id}`, { method: 'PATCH', body: { name } });
      this.upsert(view);
      return view;
    },
    async remove(id) {
      await $fetch(`/api/views/${id}`, { method: 'DELETE' });
      this.views = this.views.filter(view => view._id !== String(id));
    },
    upsert(view) {
      if (!view?._id) return;
      const id = String(view._id);
      const row = { _id: id, name: view.name, typeId: view.typeId };
      const existing = this.views.find(candidate => candidate._id === id);
      this.views = existing
        ? this.views.map(candidate => (candidate._id === id ? row : candidate))
        : [...this.views, row];
    }
  }
});
