import { splitViewEmbeds } from './markdown.js';

// The Page block document (SPEC §28.10): ordered text, collection,
// typed-reference, and file blocks. References store identity/revision
// only; resolution and access remain server-owned.
export function createBlockId(prefix = 'b') {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

export function viewRefOfBlock(block = {}) {
  return block.kind === 'view' && block.view && typeof block.view === 'object' ? block.view : null;
}

export function fileRefOfBlock(block = {}) {
  return block.kind === 'file' && block.file && typeof block.file === 'object' ? block.file : null;
}

export function normalizePageFilePath(value) {
  const path = String(value || '').trim();
  if (!path || path.length > 240 || path.startsWith('/') || path.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(path)) return '';
  const segments = path.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return '';
  return path;
}

// A frozen collection snapshot keeps the resolved items inside the
// resolution's 100-item window: record items (source identity plus the
// captured projection), plain values, and unavailable states. The pages
// feature re-checks each record item's read grant at serve time.
function normalizeSnapshotItem(item) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    if (item.kind === 'unavailable') return { kind: 'unavailable' };
    if (item.kind === 'record' || item.kind === 'instance') {
      const typeId = String(item.typeId || '').trim();
      const instanceId = String(item.instanceId || '').trim();
      return typeId && instanceId && item.instance && typeof item.instance === 'object'
        ? { kind: 'record', typeId, instanceId, instance: item.instance }
        : { kind: 'unavailable' };
    }
    if (item.kind === 'value') return { kind: 'value', value: item.value };
  }
  return { kind: 'value', value: item };
}

function normalizeCollectionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !Array.isArray(snapshot.items)) return null;
  return {
    label: String(snapshot.label || ''),
    itemCount: Number.isInteger(Number(snapshot.itemCount)) && Number(snapshot.itemCount) >= 0 ? Number(snapshot.itemCount) : 0,
    truncated: snapshot.truncated === true,
    items: snapshot.items.slice(0, 100).map(normalizeSnapshotItem)
  };
}

export function normalizePageDocument(document = {}) {
  const source = Array.isArray(document.blocks) ? document.blocks : [];
  const blocks = source
    .filter(block => block && typeof block === 'object' && (block.kind === 'text' || block.kind === 'view' || block.kind === 'collection' || block.kind === 'file' || block.kind === 'reference'))
    .map(block => {
      const id = String(block.id || createBlockId(block.kind === 'view' ? 'v' : block.kind === 'collection' ? 'c' : block.kind === 'file' ? 'f' : 't'));
      if (block.kind === 'view') {
        const view = viewRefOfBlock(block) || {};
        return {
          id,
          kind: 'view',
          view: {
            ...(view.id ? { id: String(view.id) } : {}),
            typeId: String(view.typeId || ''),
            name: String(view.name || ''),
            parameters: view.parameters && typeof view.parameters === 'object' && !Array.isArray(view.parameters) ? view.parameters : {},
            resultPolicy: 'live',
            ...(view.parentTypeId ? { parentTypeId: String(view.parentTypeId) } : {}),
            ...(view.parentId ? { parentId: String(view.parentId) } : {}),
            ...(view.sourceId ? { sourceId: String(view.sourceId) } : {}),
            ...(view.definitionRevision ? { definitionRevision: String(view.definitionRevision) } : {}),
            ...(view.definitionSnapshot && typeof view.definitionSnapshot === 'object' && !Array.isArray(view.definitionSnapshot)
              ? { definitionSnapshot: { viewState: view.definitionSnapshot.viewState && typeof view.definitionSnapshot.viewState === 'object' && !Array.isArray(view.definitionSnapshot.viewState) ? view.definitionSnapshot.viewState : {} } }
              : {})
          }
        };
      }
      if (block.kind === 'collection') {
        const collection = block.collection && typeof block.collection === 'object' ? block.collection : {};
        const source = collection.source && typeof collection.source === 'object' ? collection.source : {};
        const snapshot = normalizeCollectionSnapshot(collection.snapshot);
        const policy = collection.resultPolicy === 'live' ? 'live' : (snapshot ? 'frozen' : 'pinned');
        const required = policy === 'live'
          ? ['graphDocumentInstanceId', 'graphId', 'graphRevision', 'outputId']
          : ['executionInstanceId', 'graphDocumentInstanceId', 'graphId', 'graphRevision', 'outputId'];
        if (source.kind !== 'graph-output' || required.some(key => !String(source[key] || '').trim())) return null;
        return {
          id,
          kind: 'collection',
          collection: {
            source: {
              kind: 'graph-output',
              ...(policy !== 'live' ? { executionInstanceId: String(source.executionInstanceId) } : {}),
              graphDocumentInstanceId: String(source.graphDocumentInstanceId),
              graphId: String(source.graphId),
              graphRevision: String(source.graphRevision),
              outputId: String(source.outputId)
            },
            parameters: collection.parameters && typeof collection.parameters === 'object' && !Array.isArray(collection.parameters) ? collection.parameters : {},
            ...(snapshot && policy === 'frozen' ? { snapshot } : {}),
            resultPolicy: policy
          }
        };
      }
      if (block.kind === 'reference') {
        const ref = block.ref && typeof block.ref === 'object' ? block.ref : {};
        const typeId = String(ref.typeId || '').trim();
        const instanceId = String(ref.instanceId || '').trim();
        if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(typeId) || !instanceId || instanceId.length > 256) return null;
        const revisionId = ref.revisionId == null || ref.revisionId === '' ? null : String(ref.revisionId).trim();
        if (revisionId && revisionId.length > 256) return null;
        return { id, kind: 'reference', ref: { typeId, instanceId, ...(revisionId ? { revisionId } : {}) } };
      }
      if (block.kind === 'file') {
        const file = fileRefOfBlock(block) || {};
        const normalizeFileRef = source => {
          const path = normalizePageFilePath(source?.path);
          const fileId = String(source?.fileId || '');
          if (!path || !fileId) return null;
          return {
            path,
            fileId,
            bucket: 'files',
            name: String(source.name || path.split('/').pop()),
            mime: String(source.mime || 'application/octet-stream'),
            size: Number.isFinite(Number(source.size)) && Number(source.size) >= 0 ? Number(source.size) : 0,
            revision: Number.isInteger(Number(source.revision)) && Number(source.revision) > 0 ? Number(source.revision) : 1
          };
        };
        const normalizedFile = normalizeFileRef(file);
        if (!normalizedFile) return null;
        return {
          id,
          kind: 'file',
          file: {
            ...normalizedFile,
            history: (Array.isArray(file.history) ? file.history : [])
              .map(normalizeFileRef)
              .filter(Boolean)
          }
        };
      }
      return { id, kind: 'text', text: String(block.text || '') };
    });
  const validBlocks = blocks.filter(Boolean);
  const byId = new Map(validBlocks.map(block => [block.id, block]));
  const order = [];
  for (const key of Array.isArray(document.order) ? document.order : []) {
    const id = String(key || '');
    if (!byId.has(id) || order.includes(id)) continue;
    order.push(id);
  }
  for (const block of validBlocks) {
    if (!order.includes(block.id)) order.push(block.id);
  }
  return { blocks: validBlocks, order };
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
