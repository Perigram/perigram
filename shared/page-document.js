import { splitViewEmbeds } from './markdown.js';

// The Page block document (SPEC §26): ordered text and collection blocks.
// Text blocks carry markdown; collection blocks carry the view ref the
// read pipeline and ViewEmbed consume.
export function createBlockId(prefix = 'b') {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

export function viewRefOfBlock(block = {}) {
  return block.kind === 'view' && block.view && typeof block.view === 'object' ? block.view : null;
}

export function normalizePageDocument(document = {}) {
  const source = Array.isArray(document.blocks) ? document.blocks : [];
  const blocks = source
    .filter(block => block && typeof block === 'object' && (block.kind === 'text' || block.kind === 'view'))
    .map(block => {
      const id = String(block.id || createBlockId(block.kind === 'view' ? 'v' : 't'));
      if (block.kind === 'view') {
        const view = viewRefOfBlock(block) || {};
        return {
          id,
          kind: 'view',
          view: {
            ...(view.id ? { id: String(view.id) } : {}),
            typeId: String(view.typeId || ''),
            name: String(view.name || ''),
            ...(view.parentTypeId ? { parentTypeId: String(view.parentTypeId) } : {}),
            ...(view.parentId ? { parentId: String(view.parentId) } : {}),
            ...(view.sourceId ? { sourceId: String(view.sourceId) } : {})
          }
        };
      }
      return { id, kind: 'text', text: String(block.text || '') };
    });
  const byId = new Map(blocks.map(block => [block.id, block]));
  const order = [];
  for (const key of Array.isArray(document.order) ? document.order : []) {
    const id = String(key || '');
    if (!byId.has(id) || order.includes(id)) continue;
    order.push(id);
  }
  for (const block of blocks) {
    if (!order.includes(block.id)) order.push(block.id);
  }
  return { blocks, order };
}

export function blocksFromMarkdown(content = '') {
  const blocks = [];
  for (const part of splitViewEmbeds(String(content || ''))) {
    if (part.type === 'view') {
      const view = {
        ...(part.id ? { id: String(part.id) } : {}),
        typeId: String(part.typeId || ''),
        name: String(part.name || ''),
        ...(part.parentTypeId ? { parentTypeId: String(part.parentTypeId) } : {}),
        ...(part.parentId ? { parentId: String(part.parentId) } : {}),
        ...(part.sourceId ? { sourceId: String(part.sourceId) } : {})
      };
      if (!view.id && !view.typeId) continue;
      blocks.push({ id: createBlockId('v'), kind: 'view', view });
      continue;
    }
    if (!String(part.text || '').trim()) continue;
    blocks.push({ id: createBlockId('t'), kind: 'text', text: String(part.text) });
  }
  return { blocks, order: blocks.map(block => block.id) };
}
