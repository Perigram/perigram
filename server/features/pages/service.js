import { createError } from 'h3';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import * as instanceRevisionsService from '../instance-revisions/service.js';
import { assertRevisionSourceReadable } from '~/server/utils/revision-access.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { resolveOrganizationId } from '~/server/utils/organization-scope.js';
import { PAGE_TYPE_ID, pageTypeDeclaration } from '#packages/cts';
import { createBlockId, normalizePageDocument, normalizePageFilePath } from '#shared/page-document.js';
import { hasPermission } from '../../utils/auth-helpers.js';
import * as filesService from '../files/service.js';
import { runOrganizationChange } from '../instances/index.js';
import { compileRegistryForOrganization, defineType } from '../cts-types/service.js';
import * as graphExecutionsService from '../graph-executions/service.js';
import * as repository from './repository.js';

const KINDS = new Set(['page', 'section']);
const ensuredPageTypes = new Set();
const ensuringPageTypes = new Map();

function ensurePageType(organizationId, actor) {
  const key = String(organizationId);
  if (ensuredPageTypes.has(key)) return Promise.resolve();
  if (ensuringPageTypes.has(key)) return ensuringPageTypes.get(key);
  const pending = (async () => {
    try {
      const registry = await compileRegistryForOrganization(organizationId);
      const current = registry.getType(PAGE_TYPE_ID, organizationId);
      if (!current || Number(current.version || 1) < Number(pageTypeDeclaration.version || 1)) {
        await defineType(pageTypeDeclaration, { organizationId, actor });
      }
      ensuredPageTypes.add(key);
    } catch {
      // The pages surface keeps working when the registry is temporarily
      // uncompilable; the next call retries the seed.
    } finally {
      ensuringPageTypes.delete(key);
    }
  })();
  ensuringPageTypes.set(key, pending);
  return pending;
}

async function preparePages(organizationId, actor) {
  await repository.migrateLegacy(organizationId);
  await repository.migrateDocuments(organizationId);
  await ensurePageType(organizationId, actor);
}

export async function listTree(auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  return (await repository.findByOrganization(organizationId)).map(repository.serialize);
}

export async function getById(id, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  const page = await requireOwnPage(id, organizationId);
  return repository.serializeFull(page);
}

export async function create({ kind = 'page', name = '', parentId = null, classTypeId = null, blocks = [], order = [] } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  const document = normalizePageDocument({ blocks, order });
  if (!KINDS.has(kind)) {
    throw createError({ statusCode: 400, message: 'Unknown page kind' });
  }
  const normalizedName = normalizeName(name);
  const normalizedClassTypeId = classTypeId ? String(classTypeId) : '';
  if (normalizedClassTypeId) {
    if (kind === 'section') {
      throw createError({ statusCode: 400, message: 'A class page is a page' });
    }
    const existing = await repository.findByClassType(organizationId, normalizedClassTypeId);
    if (existing) return repository.serializeFull(existing);
  }
  let normalizedParent = null;
  if (parentId) {
    if (kind === 'section') {
      throw createError({ statusCode: 400, message: 'A section is a root' });
    }
    const parent = await requireParent(parentId, organizationId);
    normalizedParent = toFlexibleId(String(parent._id));
  }
  const id = await runOrganizationChange(organizationId, {
    kind: 'page-created',
    typeId: 'page',
    paths: ['name', 'parentId', 'blocks', 'order'],
    actorId: auth.userId
  }, () => repository.create({
    organizationId: toFlexibleId(organizationId),
    kind,
    name: normalizedName,
    parentId: normalizedParent,
    classTypeId: normalizedClassTypeId,
    blocks: document.blocks,
    order: document.order,
    createdBy: auth.userId
  }));
  return {
    _id: String(id),
    kind,
    name: normalizedName,
    parentId: normalizedParent ? String(normalizedParent) : null,
    classTypeId: normalizedClassTypeId || null
  };
}

export async function update(id, { name, parentId, blocks, order } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  const page = await requireOwnPage(id, organizationId);
  const changes = {};
  let document = null;
  if (name !== undefined) changes.name = normalizeName(name);
  if (blocks !== undefined || order !== undefined) {
    document = normalizePageDocument({
      blocks: blocks !== undefined ? blocks : page.fields?.blocks,
      order: order !== undefined ? order : page.fields?.order
    });
    changes.blocks = document.blocks;
    changes.order = document.order;
  }
  if (parentId !== undefined) {
    if (page.fields?.section === true && parentId) {
      throw createError({ statusCode: 400, message: 'A section is a root' });
    }
    changes.parentId = toFlexibleId(await resolvedParentId(id, parentId, organizationId));
  }
  const updated = Object.keys(changes).length
    ? await runOrganizationChange(organizationId, {
        kind: 'page-updated',
        typeId: 'page',
        instanceId: String(page._id),
        paths: Object.keys(changes),
        actorId: auth.userId
      }, () => repository.update(id, changes, organizationId))
    : page;
  if (blocks !== undefined || order !== undefined) {
    await prunePageFiles(page._id, document, organizationId);
  }
  return repository.serializeFull(updated);
}

function referenceSourceIdentity(reference = {}) {
  const typeId = String(reference.typeId || '').trim();
  const instanceId = String(reference.instanceId || '').trim();
  if (!typeId || !instanceId) throw createError({ statusCode: 400, message: 'Typed reference requires typeId and instanceId' });
  return { typeId, instanceId };
}

function isUnavailableStatus(error, statuses) {
  return statuses.includes(Number(error?.statusCode || error?.status));
}

// The graph-output parameter contract lives in this feature's README
// (Typed references and collections).
async function resolveLiveCollectionBlock(block, auth) {
  const source = block.collection.source;
  const unavailable = { blockId: block.id, status: 'unavailable' };
  let label = String(source.outputId);
  try {
    const { graph } = await graphExecutionsService.resolvePinnedGraph(source.graphId, source.graphRevision, auth);
    const output = (graph.interface?.outputs || []).find(port => String(port.id) === String(source.outputId));
    if (output) label = String(output.label || label);
  } catch (error) {
    if (!isUnavailableStatus(error, [400, 403, 404, 409])) throw error;
  }
  let evaluation = null;
  try {
    evaluation = await graphExecutionsService.evaluateSavedGraph({
      graphDocumentInstanceId: source.graphDocumentInstanceId,
      graphRevision: source.graphRevision,
      inputBindings: block.collection.parameters || {}
    }, auth);
  } catch (error) {
    if (isUnavailableStatus(error, [400, 403, 404, 409])) return unavailable;
    throw error;
  }
  const values = evaluation?.outputs?.[String(source.outputId)];
  if (!Array.isArray(values)) return unavailable;
  return {
    blockId: block.id,
    status: 'resolved',
    mode: 'live',
    graph: { id: String(source.graphId), revision: String(source.graphRevision) },
    outputId: String(source.outputId),
    label,
    itemCount: values.length,
    truncated: values.length > 100,
    items: await resolveCollectionValues(values, auth)
  };
}

async function resolveParameterizedCollectionBlock(block, auth) {
  const source = block.collection.source;
  const parameters = block.collection.parameters;
  const unavailable = { blockId: block.id, status: 'unavailable' };
  const executionsService = getAppRegistry().getInstanceService('graph-execution');
  let record = null;
  if (typeof executionsService?.processGetById === 'function') {
    try {
      record = await executionsService.processGetById(source.executionInstanceId, auth);
    } catch (error) {
      if (isUnavailableStatus(error, [403, 404])) return unavailable;
      throw error;
    }
  }
  const fields = record?.fields || {};
  if (!record
    || fields.status !== 'succeeded'
    || !fields.graphDocument?.id
    || String(fields.graphDocument.id) !== String(source.graphDocumentInstanceId)
    || String(fields.graphId) !== String(source.graphId)
    || String(fields.graphRevision) !== String(source.graphRevision)) {
    return unavailable;
  }
  let graph = null;
  try {
    ({ graph } = await graphExecutionsService.resolvePinnedGraph(source.graphId, source.graphRevision, auth));
  } catch (error) {
    if (isUnavailableStatus(error, [403, 404, 409])) return unavailable;
    throw error;
  }
  const output = (graph.interface?.outputs || []).find(port => String(port.id) === String(source.outputId));
  if (!output || output.contract?.shape !== 'list') return unavailable;
  const declaredInputs = graph.interface?.inputs || [];
  const declaredIds = new Set(declaredInputs.map(port => String(port.id)));
  if (Object.keys(parameters).some(key => !declaredIds.has(String(key)))) return unavailable;
  const bindings = { ...(fields.inputs && typeof fields.inputs === 'object' ? fields.inputs : {}), ...parameters };
  for (const port of declaredInputs) {
    if (!port.required) continue;
    const bound = Object.hasOwn(bindings, String(port.id)) ? bindings[String(port.id)] : port.default;
    if (bound === undefined) return unavailable;
    if (bound === null && port.contract?.semantic?.nullable !== true) return unavailable;
  }
  let evaluation = null;
  try {
    evaluation = await graphExecutionsService.evaluateSavedGraph({
      graphDocumentInstanceId: source.graphDocumentInstanceId,
      inputBindings: bindings
    }, auth);
  } catch (error) {
    if (isUnavailableStatus(error, [400, 403, 404, 409])) return unavailable;
    throw error;
  }
  const values = evaluation?.outputs?.[String(source.outputId)];
  if (!Array.isArray(values)) return unavailable;
  return {
    blockId: block.id,
    status: 'resolved',
    mode: 'parameterized',
    executionInstanceId: String(record._id),
    executionId: String(fields.executionId || ''),
    graph: { id: String(fields.graphId), revision: String(fields.graphRevision) },
    outputId: String(source.outputId),
    label: String(output.label || source.outputId),
    itemCount: values.length,
    truncated: values.length > 100,
    items: await resolveCollectionValues(values, auth)
  };
}

async function resolveCollectionValues(values, auth) {
  const registry = getAppRegistry();
  const items = [];
  for (const value of values.slice(0, 100)) {
    const typeId = String(value?.type || value?.typeId || '');
    const instanceId = String(value?.id || value?.instanceId || value?._id || '');
    if (!typeId || !instanceId) {
      items.push({ kind: 'value', value });
      continue;
    }
    const target = registry.getInstanceService(typeId);
    try {
      const instance = await target?.processGetById?.(instanceId, auth);
      items.push(instance
        ? { kind: 'instance', typeId, instanceId, instance }
        : { kind: 'unavailable' });
    } catch (error) {
      if (isUnavailableStatus(error, [403, 404])) items.push({ kind: 'unavailable' });
      else throw error;
    }
  }
  return items;
}

export async function resolveReferences(pageId, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  const page = await requireOwnPage(pageId, organizationId);
  const document = normalizePageDocument({ blocks: page.fields?.blocks, order: page.fields?.order });
  const registry = getAppRegistry();
  const resolved = [];
  for (const block of document.blocks) {
    if (block.kind === 'collection') {
      if (block.collection.resultPolicy === 'live') {
        resolved.push(await resolveLiveCollectionBlock(block, auth));
      } else if (Object.keys(block.collection.parameters || {}).length) {
        resolved.push(await resolveParameterizedCollectionBlock(block, auth));
      }
      continue;
    }
    if (block.kind !== 'reference') continue;
    const { typeId, instanceId } = referenceSourceIdentity(block.ref);
    const service = registry.getInstanceService(typeId);
    if (typeof service?.processGetById !== 'function') {
      resolved.push({ blockId: block.id, status: 'unavailable' });
      continue;
    }
    let current;
    try {
      current = await service.processGetById(instanceId, auth);
    } catch (error) {
      if ([403, 404].includes(Number(error?.statusCode || error?.status))) {
        resolved.push({ blockId: block.id, status: 'unavailable' });
        continue;
      }
      throw error;
    }
    if (!current) {
      resolved.push({ blockId: block.id, status: 'unavailable', reason: 'missing' });
      continue;
    }
    if (!block.ref.revisionId) {
      resolved.push({ blockId: block.id, status: 'resolved', mode: 'live', typeId, instanceId, instance: current });
      continue;
    }
    try {
      const revision = await instanceRevisionsService.getById(block.ref.revisionId, auth.userId, auth.role, auth);
      await assertRevisionSourceReadable(revision, auth);
      const source = revision?.data?.source || {};
      if (String(source.type) !== typeId || String(source.id) !== instanceId) {
        resolved.push({ blockId: block.id, status: 'unavailable' });
        continue;
      }
      resolved.push({ blockId: block.id, status: 'resolved', mode: 'pinned', typeId, instanceId, revisionId: block.ref.revisionId, revision });
    } catch (error) {
      if ([403, 404].includes(Number(error?.statusCode || error?.status))) {
        resolved.push({ blockId: block.id, status: 'unavailable' });
        continue;
      }
      throw error;
    }
  }
  return resolved;
}

export async function findBacklinks(typeId, instanceId, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  const pages = await repository.findByOrganization(organizationId);
  const backlinks = [];
  for (const page of pages) {
    const document = normalizePageDocument({ blocks: page.fields?.blocks, order: page.fields?.order });
    for (const block of document.blocks) {
      if (block.kind !== 'reference') continue;
      if (block.ref.typeId === String(typeId) && block.ref.instanceId === String(instanceId)) {
        backlinks.push({ pageId: String(page._id), pageName: String(page.fields?.name || page.name || ''), blockId: block.id, mode: block.ref.revisionId ? 'pinned' : 'live', ...(block.ref.revisionId ? { revisionId: block.ref.revisionId } : {}) });
      }
    }
  }
  return backlinks;
}

export async function bakeFile({
  pageId,
  path,
  buffer,
  mimeType = 'application/octet-stream',
  conflictPolicy = 'fail',
  provenance = {},
  expectedOrganizationSequence = null
} = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  const page = await requireOwnPage(pageId, organizationId);
  if (page.fields?.section === true) {
    throw createError({ statusCode: 400, message: 'Files can only be baked into a page, not a section' });
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > 25 * 1024 * 1024) {
    throw createError({ statusCode: 400, message: 'Baked file must contain between 1 byte and 25 MiB' });
  }
  const logicalPath = normalizePageFilePath(path);
  if (!logicalPath) throw createError({ statusCode: 400, message: 'A safe relative page file path is required' });
  if (!['fail', 'create-revision', 'replace', 'create-distinct-name'].includes(conflictPolicy)) {
    throw createError({ statusCode: 400, message: 'Unsupported page file conflict policy' });
  }
  if (conflictPolicy === 'replace' && !hasPermission(auth, 'organizations', 'admin')) {
    throw createError({ statusCode: 403, message: 'Replacing a page file requires organization admin permission' });
  }

  const document = normalizePageDocument({
    blocks: page.fields?.blocks,
    order: page.fields?.order
  });
  let targetPath = logicalPath;
  let existing = document.blocks.find(block => block.kind === 'file' && block.file.path === targetPath) || null;
  if (existing && conflictPolicy === 'fail') {
    throw createError({ statusCode: 409, message: `Page already contains ${targetPath}` });
  }
  if (existing && conflictPolicy === 'create-distinct-name') {
    targetPath = distinctPageFilePath(targetPath, new Set(
      document.blocks.filter(block => block.kind === 'file').map(block => block.file.path)
    ));
    existing = null;
  }

  const fileName = targetPath.split('/').pop();
  const baked = await runOrganizationChange(organizationId, {
    kind: 'page-file-baked',
    typeId: 'page',
    instanceId: String(page._id),
    paths: ['blocks', `files.${targetPath}`],
    actorId: auth.userId
  }, async () => {
    const stored = await filesService.uploadFile(
      buffer,
      fileName,
      {
        userId: String(auth.userId),
        organizationId,
        pageId: String(page._id),
        logicalPath: targetPath,
        graphId: String(provenance.graphId || ''),
        graphRevision: String(provenance.graphRevision || ''),
        executionId: String(provenance.executionId || ''),
        outputId: String(provenance.outputId || '')
      },
      'files',
      mimeType
    );
    try {
      const previousFile = existing?.file || null;
      const history = previousFile
        ? [...(previousFile.history || []), Object.fromEntries(Object.entries(previousFile).filter(([key]) => key !== 'history'))]
        : [];
      const revision = previousFile ? Number(previousFile.revision || 1) + 1 : 1;
      const file = {
        path: targetPath,
        fileId: stored.id,
        bucket: 'files',
        name: fileName,
        mime: String(mimeType || 'application/octet-stream'),
        size: buffer.length,
        revision,
        history
      };
      const block = existing
        ? { ...existing, file }
        : { id: createBlockId('f'), kind: 'file', file };
      const blocks = existing
        ? document.blocks.map(item => item.id === existing.id ? block : item)
        : [...document.blocks, block];
      const order = existing
        ? document.order
        : [...document.order, block.id];
      const updated = await repository.updatePageDocumentIfUnchanged(
        page._id,
        organizationId,
        page.updatedAt,
        normalizePageDocument({ blocks, order })
      );
      if (!updated) {
        throw createError({ statusCode: 409, message: 'Page changed while the file was being baked; reload and retry' });
      }
      return { updated, file };
    } catch (error) {
      await filesService.deleteFile(stored.id, 'files').catch(() => {});
      throw error;
    }
  }, { expectedSequence: expectedOrganizationSequence });
  return {
    page: repository.serializeFull(baked.updated),
    file: baked.file,
    conflictPolicy
  };
}

export async function retractBakedFile({ pageId, fileId } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  const page = await requireOwnPage(pageId, organizationId);
  const document = normalizePageDocument({ blocks: page.fields?.blocks, order: page.fields?.order });
  const block = document.blocks.find(item => item.kind === 'file' && String(item.file?.fileId || '') === String(fileId || ''));
  if (!block) {
    const retainedInHistory = document.blocks.some(item => item.kind === 'file'
      && (item.file?.history || []).some(revision => String(revision.fileId || '') === String(fileId || '')));
    if (retainedInHistory) return { success: false, referenced: true };
    const file = await filesService.findFileMeta(fileId, 'files');
    if (file && String(file.metadata?.pageId || '') === String(pageId)) {
      await filesService.deleteFile(fileId, 'files');
      return { success: true, detached: true };
    }
    return { success: false, referenced: false };
  }
  const history = [...(block.file.history || [])];
  let blocks;
  let order = document.order;
  if (history.length) {
    const previous = history.pop();
    const restored = { ...previous, history };
    blocks = document.blocks.map(item => item.id === block.id ? { ...block, file: restored } : item);
  } else {
    blocks = document.blocks.filter(item => item.id !== block.id);
    order = order.filter(id => id !== block.id);
  }
  const updated = await runOrganizationChange(organizationId, {
    kind: 'page-file-retracted',
    typeId: PAGE_TYPE_ID,
    instanceId: String(page._id),
    paths: ['fields.blocks', 'fields.order'],
    actorId: auth.userId
  }, async () => {
    const result = await repository.updatePageDocumentIfUnchanged(
      page._id,
      organizationId,
      page.updatedAt,
      normalizePageDocument({ blocks, order })
    );
    if (!result) throw createError({ statusCode: 409, message: 'Page changed before the failed Bake could be retracted' });
    return result;
  });
  await filesService.deleteFile(fileId, 'files');
  return { success: true, page: repository.serializeFull(updated) };
}

async function prunePageFiles(pageId, document, organizationId) {
  const referenced = new Set();
  for (const block of document?.blocks || []) {
    if (block?.kind !== 'file' || !block.file) continue;
    if (block.file.fileId) referenced.add(String(block.file.fileId));
    for (const revision of block.file.history || []) {
      if (revision?.fileId) referenced.add(String(revision.fileId));
    }
  }
  const owned = await filesService.listFileMetasWhere('files', {
    'metadata.pageId': String(pageId)
  });
  await Promise.all(owned
    .filter(file => !referenced.has(String(file.id)))
    .map(file => filesService.deleteFile(file.id, 'files')));
}

function distinctPageFilePath(path, occupied) {
  const slash = path.lastIndexOf('/');
  const directory = slash >= 0 ? path.slice(0, slash + 1) : '';
  const filename = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';
  for (let suffix = 2; suffix <= 1000; suffix += 1) {
    const candidate = `${directory}${stem} (${suffix})${extension}`;
    if (!occupied.has(candidate)) return candidate;
  }
  throw createError({ statusCode: 409, message: 'Could not find an unused page file name' });
}

export async function remove(id, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await preparePages(organizationId, auth.userId);
  const page = await requireOwnPage(id, organizationId);
  await runOrganizationChange(organizationId, {
    kind: 'page-deleted',
    typeId: 'page',
    instanceId: String(page._id),
    paths: ['instance'],
    actorId: auth.userId
  }, async () => {
    await repository.detachChildren(organizationId, page._id);
    await repository.remove(page._id, organizationId);
  });
  await prunePageFiles(page._id, { blocks: [], order: [] }, organizationId);
  return { success: true };
}

async function requireOwnPage(id, organizationId) {
  const page = await repository.findById(id);
  if (!page || String(page.organizationId) !== String(organizationId)) {
    throw createError({ statusCode: 404, message: 'Page not found' });
  }
  return page;
}

async function requireParent(parentId, organizationId) {
  const parent = await repository.findById(parentId);
  if (!parent || String(parent.organizationId) !== String(organizationId)) {
    throw createError({ statusCode: 400, message: 'Unknown parent page' });
  }
  return parent;
}

// The new parent of a move: same-org, root-detached, and outside the
// moved page's own subtree (the ancestor walk that refuses cycles).
async function resolvedParentId(id, parentId, organizationId) {
  if (!parentId) return null;
  const parent = await requireParent(parentId, organizationId);
  const movedId = String(id);
  const seen = new Set();
  let current = parent;
  while (current) {
    const currentId = String(current._id);
    if (currentId === movedId || seen.has(currentId)) {
      throw createError({ statusCode: 400, message: 'A page cannot move inside itself' });
    }
    seen.add(currentId);
    const parentRef = current.lineage?.pageId;
    current = parentRef ? await repository.findById(parentRef) : null;
  }
  return String(parentId);
}

function normalizeName(name) {
  return String(name ?? '').trim();
}
