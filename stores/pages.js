import { defineStore } from 'pinia';
import { normalizePageDocument } from '#shared/page-document.js';

// The organization's custom pages and sidebar sections (SPEC §26): the
// tree projection over `/api/pages` plus per-document content loads.
// Mutations are direct fetches — the pages API is the one transport.
export const usePagesStore = defineStore('pages', {
  state: () => ({
    pages: [],
    loaded: false,
    loading: false,
    documents: {}
  }),
  getters: {
    sections: state => state.pages.filter(page => page.kind === 'section'),
    customPages: state => state.pages.filter(page => page.kind === 'page' && !page.classTypeId),
    pageById: state => id => state.pages.find(page => page._id === String(id)) || null,
    classPageForType: state => typeId => state.pages.find(page => page.classTypeId === String(typeId)) || null
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
    async loadDocument(id) {
      const page = await $fetch(`/api/pages/${id}`);
      this.documents = {
        ...this.documents,
        [String(id)]: normalizePageDocument({ blocks: page.blocks, order: page.order })
      };
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
    async ensureClassPage(typeId, name = '') {
      if (!typeId) return null;
      await this.ensureLoaded();
      const existing = this.classPageForType(typeId);
      if (existing) {
        if (!(String(existing._id) in this.documents)) {
          await this.loadDocument(existing._id).catch(() => null);
        }
        const document = this.documents[String(existing._id)] || { blocks: [], order: [] };
        const blocks = document.blocks.filter(block => !(block.kind === 'view' && block.view?.typeId === String(typeId)));
        if (blocks.length !== document.blocks.length) {
          const order = document.order.filter(key => blocks.some(block => block.id === key));
          await this.saveDocument(existing._id, { blocks, order }).catch(() => null);
        }
        return existing;
      }
      const page = await $fetch('/api/pages', {
        method: 'POST',
        body: { name, classTypeId: String(typeId) }
      });
      this.upsert(page);
      this.documents = { ...this.documents, [String(page._id)]: { blocks: [], order: [] } };
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
    async saveDocument(id, document) {
      const normalized = normalizePageDocument(document);
      await this.patch(id, normalized);
      this.documents = { ...this.documents, [String(id)]: normalized };
    },
    async patch(id, body) {
      const page = await $fetch(`/api/pages/${id}`, { method: 'PATCH', body });
      this.upsert(page);
      return page;
    },
    async remove(id) {
      await $fetch(`/api/pages/${id}`, { method: 'DELETE' });
      this.pages = this.pages.filter(page => page._id !== String(id));
      const documents = { ...this.documents };
      delete documents[String(id)];
      this.documents = documents;
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
        parentId: page.parentId ? String(page.parentId) : null,
        classTypeId: page.classTypeId ? String(page.classTypeId) : null
      };
      this.pages = existing
        ? this.pages.map(candidate => (candidate._id === id ? row : candidate))
        : [...this.pages, row];
    }
  }
});
