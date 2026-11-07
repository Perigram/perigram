import { defineStore } from 'pinia';

// The organization's instance overlays (SPEC §26): per-instance record
// page arrangements cached by instance. An overlay is presentation data
// over the record's own page — reads ride the ordinary org membership,
// writes the record's write grant (the feature's law).
export const useInstanceOverlaysStore = defineStore('instance-overlays', {
  state: () => ({
    overlays: {},
    loaded: {}
  }),
  getters: {
    overlayFor: state => (typeId, instanceId) => state.overlays[overlayKey(typeId, instanceId)] || null,
    loadedFor: state => (typeId, instanceId) => Boolean(state.loaded[overlayKey(typeId, instanceId)])
  },
  actions: {
    async ensureLoaded(typeId, instanceId) {
      const key = overlayKey(typeId, instanceId);
      if (this.loaded[key]) return;
      try {
        const response = await $fetch(`/api/instance-overlays/${encodeURIComponent(typeId)}/${encodeURIComponent(instanceId)}`);
        this.overlays = { ...this.overlays, [key]: response?.overlay || null };
      } catch {
        this.overlays = { ...this.overlays, [key]: null };
      } finally {
        this.loaded = { ...this.loaded, [key]: true };
      }
    },
    async save(typeId, instanceId, { blocks, order }) {
      const overlay = await $fetch(`/api/instance-overlays/${encodeURIComponent(typeId)}/${encodeURIComponent(instanceId)}`, {
        method: 'PATCH',
        body: { blocks, order }
      });
      this.overlays = { ...this.overlays, [overlayKey(typeId, instanceId)]: overlay };
      this.loaded = { ...this.loaded, [overlayKey(typeId, instanceId)]: true };
      return overlay;
    },
    async remove(typeId, instanceId) {
      await $fetch(`/api/instance-overlays/${encodeURIComponent(typeId)}/${encodeURIComponent(instanceId)}`, { method: 'DELETE' });
      this.overlays = { ...this.overlays, [overlayKey(typeId, instanceId)]: null };
      this.loaded = { ...this.loaded, [overlayKey(typeId, instanceId)]: true };
    }
  }
});

function overlayKey(typeId, instanceId) {
  return `${typeId}:${instanceId}`;
}
