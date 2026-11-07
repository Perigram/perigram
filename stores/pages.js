import { defineStore } from 'pinia';

// The organization's custom pages and sidebar sections (SPEC §26): the
// tree projection over `/api/pages` plus per-document content loads.
// Mutations are direct fetches — the pages API is the one transport.
export const usePagesStore = defineStore('pages', {
  state: () => ({
    pages: [],
    loaded: false,
    loading: false,
    contents: {}
  }),
  getters: {
    sections: state => state.pages.filter(page => page.kind === 'section'),
    pageById: state => id => state.pages.find(page => page._id === String(id)) || null
  },
  actions: {
    async ensureLoaded() {
      if (this.loaded || this.loading) return;
      await this.reload();
    },
    async reload() {
      this.loading = true;
      try {
        const response = await $fetch('/api/pages');
        this.pages = response?.pages || [];
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    },
    async loadContent(id) {
      const page = await $fetch(`/api/pages/${id}`);
      this.contents = { ...this.contents, [String(id)]: page.content || '' };
      this.upsert({ ...page });
      return page;
    },
    async createPage(parentId = null) {
      const page = await $fetch('/api/pages', {
        method: 'POST',
        body: parentId ? { parentId } : {}
      });
      this.upsert(page);
      return page;
    },
    async createSection() {
      const section = await $fetch('/api/pages', {
        method: 'POST',
        body: { kind: 'section' }
      });
      this.upsert(section);
      return section;
    },
    async rename(id, name) {
      await this.patch(id, { name });
    },
    async move(id, parentId) {
      await this.patch(id, { parentId });
    },
    async saveContent(id, content) {
      await this.patch(id, { content });
      this.contents = { ...this.contents, [String(id)]: content };
    },
    async patch(id, body) {
      const page = await $fetch(`/api/pages/${id}`, { method: 'PATCH', body });
      this.upsert(page);
      return page;
    },
    async remove(id) {
      await $fetch(`/api/pages/${id}`, { method: 'DELETE' });
      this.pages = this.pages.filter(page => page._id !== String(id));
      const contents = { ...this.contents };
      delete contents[String(id)];
      this.contents = contents;
      await this.reload();
    },
    upsert(page) {
      if (!page?._id) return;
      const id = String(page._id);
      const existing = this.pages.find(candidate => candidate._id === id);
      const row = {
        _id: id,
        kind: page.kind,
        name: page.name,
        parentId: page.parentId ? String(page.parentId) : null
      };
      this.pages = existing
        ? this.pages.map(candidate => (candidate._id === id ? row : candidate))
        : [...this.pages, row];
    }
  }
});
