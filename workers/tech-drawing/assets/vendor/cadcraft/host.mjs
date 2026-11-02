// The CadCraft browser edition as a same-origin iframe: the embedding
// host both drawing surfaces drive. The iframe exposes `window.cadcraft`
// ({ doc, view, engine, host, commands }); this module owns the frame,
// the chrome hiding, the document/selection/view subscriptions and the
// entity mapping between OCCS records and CadCraft entities.

const APP_ENTRY = './app/index.html';
const READY_TIMEOUT_MS = 120000;
const DXF_MODULE = './app/assets/apps/cadcraft/0.7/dxf.js';

const EMBED_CSS = `
  html, body { height: 100% !important; overflow: hidden !important; }
  body > header, header.site-header, .site-header, .shell-hint, .shell-edge, .shell-showbars { display: none !important; }
  [data-cadcraft] > *:not(.cc-stage):not(.cc-cmd) { display: none !important; }
  [data-cadcraft] > .cc-stage > .cc-tabs, [data-cadcraft] > .cc-stage > .cc-doctabs,
  [data-cadcraft] .cc-tour, [data-cadcraft] .cc-hint, [data-cadcraft] .cc-dialog,
  [data-cadcraft] .cc-vc { display: none !important; }
  dialog.shell-recover, dialog[data-autosave-dialog] { display: none !important; }
  [data-cadcraft] { display: block !important; position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; }
  [data-cadcraft] > .cc-stage { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
  [data-cadcraft] > .cc-stage > .cc-canvases { bottom: 0 !important; top: 0 !important; }
  [data-cadcraft] > .cc-cmd { display: none !important; }
  [data-cadcraft].pg-command-line > .cc-cmd {
    display: block !important; position: absolute !important; left: 0; right: 0; bottom: 0;
    height: 7.2rem; z-index: 5;
  }
  [data-cadcraft].pg-command-line > .cc-stage > .cc-canvases { bottom: 7.2rem !important; }
`;

const nextFrame = () => new Promise(resolve => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(resolve));
  else setTimeout(resolve, 0);
});

export class CadCraftHost {
  constructor({ container, title = 'CadCraft' } = {}) {
    this.container = container;
    this.title = title;
    this.frame = null;
    this.win = null;
    this.cad = null;
    this.disposed = false;
    this.suppress = false;
    this.unsubscribeDoc = null;
    this.onChange = null;
    this.onSelection = null;
    this.onCommand = null;
    this.onPointerDown = null;
    this.onPointerUp = null;
    this.onKeyDown = null;
    this._lastSelection = '';
  }

  async mount() {
    const frame = document.createElement('iframe');
    const entry = new URL(APP_ENTRY, import.meta.url);
    entry.searchParams.set('embed', '1');
    frame.src = entry.href;
    frame.title = this.title;
    frame.setAttribute('allow', 'clipboard-read; clipboard-write');
    frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#2b2f36';
    this.container.appendChild(frame);
    this.frame = frame;
    const started = Date.now();
    while (!this.disposed) {
      try {
        const win = frame.contentWindow;
        if (win?.cadcraft?.doc && win.cadcraft?.view && win.cadcraft?.engine) {
          this.win = win;
          this.cad = win.cadcraft;
          break;
        }
      } catch {
        // A cross-origin frame can never be read; the surface reports the timeout.
      }
      if (Date.now() - started > READY_TIMEOUT_MS) throw new Error('CadCraft did not start');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (this.disposed) throw new Error('CadCraft was destroyed');
    this._hideChrome();
    this._bindDoc();
    this._bindSelection();
    this._bindCommand();
    this._bindInput();
    return this;
  }

  _hideChrome() {
    const doc = this.win.document;
    doc.getElementById('perigram-cadcraft-loading')?.remove();
    const recovery = doc.querySelector('[data-autosave-dialog]');
    if (recovery?.open) recovery.close();
    this.cad.host?.autosave?.stop?.();
    // The edition's own first-run tour and hint card belong to its
    // desktop surface; the embedding host owns the chrome.
    try {
      this.win.localStorage.setItem('cadcraft.tour', 'done');
      this.win.localStorage.setItem('cadcraft.tour.auto', 'off');
      this.win.localStorage.setItem('cc-tours', 'off');
    } catch {
      // Private storage: the stylesheet still hides the panel.
    }
    doc.querySelector('.cc-tour')?.remove();
    if (this.cad.host) {
      this.cad.host.settings.corner = 'none';
      this.cad.host.applyCorner?.();
      this.cad.host.setToggle?.('grid', false);
      this.cad.host.setToggle?.('dyn', false);
    }
    const style = doc.createElement('style');
    style.id = 'perigram-cadcraft-embed';
    style.textContent = EMBED_CSS;
    doc.head.appendChild(style);
    this.cad.view.resize();
  }

  _bindDoc() {
    this.unsubscribeDoc = this.cad.doc.on((kind) => {
      if (!this.suppress) this.onChange?.(kind);
    });
  }

  _bindSelection() {
    const host = this.cad.host;
    const original = host.setSelection.bind(host);
    host.setSelection = (set) => {
      const result = original(set);
      const ids = [...(host.selection || [])];
      const key = ids.join(',');
      if (key !== this._lastSelection) {
        this._lastSelection = key;
        this.onSelection?.(ids);
      }
      return result;
    };
  }

  _bindCommand() {
    this.cad.host.addCommandHook?.(name => this.onCommand?.(name || null));
  }

  _bindInput() {
    const doc = this.win.document;
    this._pointerDown = event => this.onPointerDown?.(event);
    this._pointerUp = event => this.onPointerUp?.(event);
    this._keyDown = event => this.onKeyDown?.(event);
    doc.addEventListener('pointerdown', this._pointerDown, true);
    doc.addEventListener('pointerup', this._pointerUp, true);
    this.win.addEventListener('keydown', this._keyDown, true);
  }

  entities() {
    return this.cad?.doc ? this.cad.doc.all() : [];
  }

  seed(entities, { name = 'Drawing', layers = [{ name: '0' }], fit = true } = {}) {
    if (!this.cad) return;
    this.suppress = true;
    try {
      this.cad.doc.load({ entities, layers, meta: { name } });
    } finally {
      this.suppress = false;
    }
    if (fit) this.cad.view.fit();
  }

  /** Replace one derived layer's entities in place — the host's annotation channel. A locked layer stays visible and unpickable. */
  annotate(layer, entities, { locked = false } = {}) {
    if (!this.cad || !layer) return;
    const doc = this.cad.doc;
    this.suppress = true;
    try {
      doc.change('ANNOTATE', () => {
        for (const entity of [...doc.entities.values()]) {
          if (entity.layer === layer) doc.remove(entity.id);
        }
        doc.layer(layer).locked = Boolean(locked);
        for (const entity of entities) doc.add({ ...entity, layer });
      });
    } finally {
      this.suppress = false;
    }
    this.cad.view.invalidate();
  }

  /** The entity under a world point (the engine's own pick tolerance), or null. */
  pick(entityPoint, px = 6) {
    const view = this.cad?.view;
    if (!view) return null;
    const id = view.pick({ x: entityPoint.x, y: entityPoint.y }, px);
    return id == null ? null : this.cad.doc.get(id);
  }

  async openText(name, text) {
    if (!this.cad) return;
    let drawing;
    try {
      const module = await import(new URL(DXF_MODULE, import.meta.url));
      drawing = module.readDxf(text);
    } catch (error) {
      throw new Error(error?.message || String(error));
    }
    this.suppress = true;
    try {
      this.cad.doc.load({ ...drawing, meta: { ...(drawing.meta || {}), name } });
    } finally {
      this.suppress = false;
    }
    this.cad.view.fit();
  }

  newDrawing(name = 'Drawing') {
    if (!this.cad) return;
    this.suppress = true;
    try {
      this.cad.doc.load({ entities: [], layers: [{ name: '0' }], meta: { name } });
    } finally {
      this.suppress = false;
    }
    this.cad.view.fit();
  }

  zoomFit(excludeLayer = null) {
    const view = this.cad?.view;
    if (!view) return;
    const layer = excludeLayer ? this.cad.doc.layers.get(excludeLayer) : null;
    if (!layer) {
      view.fit();
      return;
    }
    const on = layer.on;
    layer.on = false;
    try {
      view.fit();
    } finally {
      layer.on = on;
    }
  }

  lockLayers(locked = true) {
    if (!this.cad) return;
    for (const layer of this.cad.doc.layers.values()) layer.locked = Boolean(locked);
    this.cad.view.invalidate();
  }

  zoomWindow(a, b) {
    this.cad?.host?.zoomWindow?.(a, b);
  }

  worldToScreen(point) {
    const view = this.cad?.view;
    if (!view) return { x: 0, y: 0 };
    return view.toScreen(point.x, point.y);
  }

  screenToWorld(point) {
    const view = this.cad?.view;
    if (!view) return { x: 0, y: 0 };
    return view.toWorld(point.x, point.y);
  }

  viewKey() {
    const view = this.cad?.view;
    if (!view) return '';
    return [view.x0, view.y0, view.w, view.h, view.zoom, view.tw].join(',');
  }

  /** The view camera `{ cx, cy, zoom, tw }`, for a host that preserves it across mode flips. */
  snapshotView() {
    const view = this.cad?.view;
    return view ? { ...view.snapshot() } : null;
  }

  restoreView(snapshot) {
    if (!snapshot || !this.cad?.view) return;
    this.cad.view.restore({ ...snapshot });
  }

  selection() {
    return [...(this.cad?.host?.selection || [])];
  }

  setSelection(ids = []) {
    this.cad?.host?.setSelection(new Set(ids));
  }

  run(command) {
    if (!command || !this.cad) return Promise.resolve();
    return this.cad.engine.run(command);
  }

  cancel() {
    this.cad?.engine?.escape();
  }

  get running() {
    return this.cad?.engine?.running || null;
  }

  setOrtho(on) {
    this.cad?.host?.setToggle('ortho', Boolean(on));
  }

  setGrid(on) {
    this.cad?.host?.setToggle('grid', Boolean(on));
  }

  setOsnap(on) {
    this.cad?.host?.setToggle('osnap', Boolean(on));
  }

  setSnapKind(kind, on) {
    const kinds = this.cad?.host?.settings?.kinds;
    if (!kinds) return;
    if (on) kinds.add(kind); else kinds.delete(kind);
    this.cad.view.invalidate();
  }

  setCommandLine(on) {
    const root = this.win?.document?.querySelector('[data-cadcraft]');
    if (!root) return;
    root.classList.toggle('pg-command-line', Boolean(on));
    this.cad.view.resize();
    if (on) this.win.document.querySelector('[data-cmd-input]')?.focus();
  }

  destroy() {
    this.disposed = true;
    if (this.win) {
      const doc = this.win.document;
      doc.removeEventListener('pointerdown', this._pointerDown, true);
      doc.removeEventListener('pointerup', this._pointerUp, true);
      this.win.removeEventListener('keydown', this._keyDown, true);
    }
    this.unsubscribeDoc?.();
    this.unsubscribeDoc = null;
    this.frame?.remove();
    this.frame = null;
    this.win = null;
    this.cad = null;
  }
}

export { nextFrame };
