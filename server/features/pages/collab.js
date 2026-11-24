import { createError } from 'h3';
import * as Y from 'yjs';
import * as repository from './repository.js';
import { resolveOrganizationId } from '~/server/utils/organization-scope.js';
import { publish, registerTopicAuthorizer } from '../connections/service.js';

// Per-page Yjs collaboration (SPEC §26): the page structure and each text
// block are Yjs documents held in worker memory. The persisted page document
// remains the source of truth; clients checkpoint it through the ordinary
// pages API. Connections SSE carries live updates and awareness.
const docs = new Map();
const LEASE_MS = 5000;
const DOC_PATTERN = /^(structure|block:[^/\u0000-\u001f\u007f]{1,200})$/;
const PAGE_TOPIC_PREFIX = 'page:';

let authorizerRegistered = false;

function ensureAuthorizer() {
  if (authorizerRegistered) return;
  authorizerRegistered = true;
  registerTopicAuthorizer(PAGE_TOPIC_PREFIX, async (auth, topic) => {
    const pageId = String(topic).slice(PAGE_TOPIC_PREFIX.length);
    if (!pageId || !auth?.organizationId) return false;
    const page = await repository.findById(pageId);
    return Boolean(page && String(page.organizationId) === String(auth.organizationId));
  });
}

export function registerPageCollabTopicAuthorizer() {
  ensureAuthorizer();
}

function pageTopic(pageId) {
  return `${PAGE_TOPIC_PREFIX}${String(pageId)}`;
}

async function requirePage(pageId, auth) {
  if (!auth?.userId) throw createError({ statusCode: 401, message: 'Authentication required' });
  const organizationId = resolveOrganizationId(auth);
  const page = await repository.findById(pageId);
  if (!page || String(page.organizationId) !== String(organizationId)) {
    throw createError({ statusCode: 404, message: 'Page not found' });
  }
  return page;
}

function prune() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, entry] of docs) {
    if (entry.lastAccess >= cutoff) continue;
    entry.doc.destroy();
    docs.delete(key);
  }
}

function entryFor(pageId, docName) {
  const key = `${String(pageId)}:${docName}`;
  let entry = docs.get(key);
  if (!entry) {
    entry = {
      doc: new Y.Doc(),
      initialized: false,
      ownerToken: null,
      leaseUntil: 0,
      lastAccess: Date.now()
    };
    docs.set(key, entry);
  }
  entry.lastAccess = Date.now();
  return entry;
}

function readUpdate(value) {
  const encoded = String(value || '');
  if (!encoded) return null;
  const buffer = Buffer.from(encoded, 'base64');
  return buffer.length ? new Uint8Array(buffer) : null;
}

function encodeUpdate(update) {
  return Buffer.from(update).toString('base64');
}

export async function handleCollab(pageId, body = {}, auth = {}) {
  ensureAuthorizer();
  await requirePage(pageId, auth);
  const docName = String(body.doc || '');
  if (!DOC_PATTERN.test(docName)) throw createError({ statusCode: 400, message: 'Unknown collaboration document' });
  prune();
  const entry = entryFor(pageId, docName);
  const op = String(body.op || '');
  const clientToken = String(body.clientToken || '');

  if (op === 'claim') {
    if (entry.initialized) return { owner: false, initialized: true };
    const now = Date.now();
    if (!entry.ownerToken || entry.leaseUntil <= now) {
      entry.ownerToken = clientToken;
      entry.leaseUntil = now + LEASE_MS;
      return { owner: true, initialized: false };
    }
    return { owner: false, initialized: false, retryAfter: Math.max(100, entry.leaseUntil - now) };
  }

  if (op === 'sync') {
    const stateVector = readUpdate(body.stateVector) || undefined;
    return {
      initialized: entry.initialized,
      update: encodeUpdate(Y.encodeStateAsUpdate(entry.doc, stateVector))
    };
  }

  if (op === 'update') {
    const update = readUpdate(body.update);
    if (!update) throw createError({ statusCode: 400, message: 'A collaboration update is required' });
    if (body.seed === true) {
      if (entry.ownerToken && entry.ownerToken !== clientToken) {
        throw createError({ statusCode: 409, message: 'Collaboration document is owned by another client' });
      }
      const seeded = new Y.Doc();
      Y.applyUpdate(seeded, update);
      entry.doc.destroy();
      entry.doc = seeded;
      entry.initialized = true;
      entry.ownerToken = null;
      entry.leaseUntil = 0;
    } else {
      Y.applyUpdate(entry.doc, update);
    }
    publish(pageTopic(pageId), { type: 'yjs', doc: docName, update: encodeUpdate(update), clientToken });
    return { ok: true };
  }

  if (op === 'awareness') {
    const awareness = readUpdate(body.awareness);
    if (!awareness) throw createError({ statusCode: 400, message: 'An awareness update is required' });
    publish(pageTopic(pageId), { type: 'awareness', doc: docName, awareness: encodeUpdate(awareness), clientToken });
    return { ok: true };
  }

  throw createError({ statusCode: 400, message: 'Unknown collaboration operation' });
}

/** Test-only: resets the in-memory collaboration registry between spec cases. */
export function __clearCollabForTests() {
  for (const entry of docs.values()) entry.doc.destroy();
  docs.clear();
  authorizerRegistered = false;
}
