import { createError } from 'h3';
import { randomUUID } from 'node:crypto';
import { hasEntityAccess } from '../../core/access/service.js';
import { createDomainDraft, validateDomainDraft } from '~/utils/domain-builder.js';
import {
  cncAttachmentKinds,
  cncCommands,
  cncDesignSystem,
  cncDomain,
  cncEntities,
  cncHookContracts,
  cncServiceContracts,
  cncSummaries,
  cncTasks,
  cncWorkflows
} from '~/packages/domain-cnc/src/index.js';
import { createFrameworkManifest, queryDocs } from '~/packages/devtools/src/index.js';
import * as repository from './repository.js';
import { buildConfigBotKnowledge } from './indexer.js';
import { askOllama, getOllamaConfig } from './ollama.js';

const DEFAULT_ENTITY_TYPES = ['project', 'queue', 'nesting_run', 'sheet_design'];
const PACKAGE_NAMES = [
  '@cutkit/core',
  '@cutkit/workflows',
  '@cutkit/vue',
  '@cutkit/devtools',
  '@cutkit/mcp',
  '@cutkit/domain-cnc'
];

export async function generateDraft({ message, prompt, context = {}, sessionId = null } = {}, auth = {}) {
  assertConfigBotAccess(auth);
  const text = normalizePrompt(message || prompt);
  const session = sessionId
    ? await getOwnedSession(sessionId, auth)
    : await repository.createSession({ userId: auth.userId, title: createSessionTitle(text), context, mode: 'generate' });

  await repository.appendMessage(session._id, { role: 'user', content: text });
  const knowledge = await getKnowledgeForPrompt(text);
  const draftPackage = createConfigBotDraftPackage({
    prompt: text,
    context,
    knowledgeChunks: knowledge,
    generatedBy: auth.userId
  });
  await repository.appendDraft(session._id, draftPackage);
  await repository.appendMessage(session._id, {
    role: 'assistant',
    content: draftPackage.summary,
    draftPackageId: draftPackage.id
  });

  return {
    session: serializeSession(await repository.findSessionById(session._id, auth.userId)),
    package: draftPackage
  };
}

export async function chat({ message, context = {}, sessionId = null } = {}, auth = {}) {
  assertConfigBotAccess(auth);
  const text = normalizePrompt(message);
  const session = sessionId
    ? await getOwnedSession(sessionId, auth)
    : await repository.createSession({ userId: auth.userId, title: createSessionTitle(text), context, mode: 'chat' });

  await repository.appendMessage(session._id, { role: 'user', content: text });
  const knowledge = await getKnowledgeForPrompt(text);
  const deterministic = createChatAnswer(text, knowledge);
  const ollamaAnswer = await askOllama([
    { role: 'system', content: createSystemPrompt(knowledge) },
    { role: 'user', content: text }
  ]);
  const answer = ollamaAnswer || deterministic;
  const assistantMessage = {
    role: 'assistant',
    content: answer,
    citations: knowledge.map(toCitation)
  };

  await repository.appendMessage(session._id, assistantMessage);
  return {
    session: serializeSession(await repository.findSessionById(session._id, auth.userId)),
    message: assistantMessage,
    ollama: { configured: Boolean(getOllamaConfig().baseUrl), used: Boolean(ollamaAnswer) }
  };
}

export async function getSession(id, auth = {}) {
  assertConfigBotAccess(auth);
  return serializeSession(await getOwnedSession(id, auth));
}

export async function reindexKnowledge(_params = {}, auth = {}) {
  assertConfigBotAccess(auth);
  const chunks = await buildConfigBotKnowledge();
  const appChunks = chunks.filter(chunk => chunk.source === 'app');
  const cortexChunks = chunks.filter(chunk => chunk.source === 'cortex');
  const app = await repository.replaceKnowledgeChunks('app', appChunks);
  const cortex = await repository.replaceKnowledgeChunks('cortex', cortexChunks);

  return {
    ok: true,
    chunks: app.count + cortex.count,
    sources: { app: app.count, cortex: cortex.count }
  };
}

export function assertConfigBotAccess(auth = {}) {
  if (!auth?.userId) throw createError({ statusCode: 401, message: 'Authentication required' });
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const allowed = hasEntityAccess({
    entity: { lineage: { organizationId } },
    feature: 'config_bot',
    level: 'admin',
    auth
  });
  if (!allowed) throw createError({ statusCode: 403, message: 'ConfigBot access denied' });
  return true;
}

export function createConfigBotDraftPackage({
  prompt,
  context = {},
  knowledgeChunks = [],
  generatedBy = null,
  now = new Date()
} = {}) {
  const manifest = createConfigBotManifest();
  const selectedEntities = selectEntitiesForPrompt(prompt, manifest, context);
  const slug = createDraftSlug(prompt, selectedEntities);
  const route = `/admin/generated/${slug}`;
  const title = createDraftTitle(prompt, selectedEntities);
  const components = selectComponents(selectedEntities, manifest);
  const domainDraft = createDomainDraft({
    entities: cncEntities,
    workflows: cncWorkflows,
    summaries: cncSummaries,
    serviceContracts: cncServiceContracts,
    commands: cncCommands,
    hookContracts: cncHookContracts
  });
  const domainValidation = validateDomainDraft(domainDraft);
  const files = createVirtualFiles({ slug, title, route, selectedEntities, components });
  const citations = knowledgeChunks.slice(0, 5).map(toCitation);
  const validation = {
    ok: domainValidation.ok && components.length > 0,
    checks: [
      { area: 'domain-cnc', ok: domainValidation.ok, issues: domainValidation.issues },
      { area: 'ui-lego', ok: components.length > 0, issues: components.length ? [] : [{ message: 'No entity components selected' }] },
      { area: 'write-policy', ok: true, issues: [] }
    ]
  };

  return {
    id: `cfgdraft-${randomUUID()}`,
    version: '0.1',
    kind: 'admin-micro-app-draft',
    target: 'admin-micro-app',
    title,
    route,
    prompt,
    context,
    generatedAt: now.toISOString(),
    generatedBy,
    writes: { mode: 'draft-only', applyEnabled: false },
    summary: createDraftSummary({ title, route, selectedEntities, components }),
    selectedEntities,
    components,
    workflows: selectedEntities
      .filter(entity => cncWorkflows[entity.type])
      .map(entity => ({ entityType: entity.type, workflow: cncWorkflows[entity.type] })),
    domainDraft,
    validation,
    files,
    citations,
    manifest: {
      schemaVersion: manifest.schemaVersion,
      packages: manifest.packages,
      commandIds: Object.keys(cncCommands),
      taskIds: Object.values(cncTasks).map(task => task.id)
    }
  };
}

export function createConfigBotManifest() {
  return createFrameworkManifest({
    packages: PACKAGE_NAMES.map(name => ({ name })),
    entities: cncEntities,
    frontendEntities: cncDomain.ui.endpoints,
    workflows: cncWorkflows,
    summaries: cncSummaries,
    commands: cncCommands,
    tasks: cncTasks,
    attachmentKinds: cncAttachmentKinds,
    designSystem: {
      variants: cncDesignSystem.variants,
      groups: cncDesignSystem.groups,
      primitives: cncDesignSystem.primitives,
      contracts: cncDesignSystem.contracts,
      componentInventory: {},
      tokens: {}
    },
    dataModelFields: []
  });
}

export function selectEntitiesForPrompt(prompt = '', manifest = createConfigBotManifest(), context = {}) {
  const haystack = [
    prompt,
    context.entityType,
    ...(Array.isArray(context.entityTypes) ? context.entityTypes : [])
  ].filter(Boolean).join(' ').toLowerCase();
  const matches = manifest.entities.filter(entity => entityMatchesText(entity, haystack));
  const selected = matches.length
    ? matches
    : manifest.entities.filter(entity => DEFAULT_ENTITY_TYPES.includes(entity.type));

  return selected.slice(0, 6).map(entity => ({
    type: entity.type,
    collection: entity.collection,
    blocks: entity.blocks || [],
    workflow: Boolean(cncWorkflows[entity.type])
  }));
}

function entityMatchesText(entity, haystack) {
  const words = new Set([
    entity.type,
    entity.collection,
    entity.type?.replace(/_/g, ' '),
    entity.collection?.replace(/_/g, ' ')
  ].filter(Boolean).map(value => String(value).toLowerCase()));
  return [...words].some(word => haystack.includes(word));
}

function selectComponents(selectedEntities, manifest) {
  const selectedTypes = new Set(selectedEntities.map(entity => entity.type));
  return manifest.designSystem.components
    .filter(component => selectedTypes.has(component.entityType))
    .map(component => ({
      key: component.key,
      entityType: component.entityType,
      componentPath: component.componentPath,
      primitives: ['StandardPage', 'ActionToolbar', 'ResponsiveGrid', 'StateBlock', 'EntityCard', 'EntityStatus']
    }));
}

function createVirtualFiles({ slug, title, route, selectedEntities, components }) {
  const entityTypes = selectedEntities.map(entity => entity.type);
  return [
    {
      path: `pages/admin/generated/${slug}.vue`,
      language: 'vue',
      role: 'page-preview',
      content: createVuePageSource({ title, route, entityTypes, components })
    },
    {
      path: `config-bot/${slug}.package.json`,
      language: 'json',
      role: 'draft-package',
      content: JSON.stringify({
        route,
        target: 'admin-micro-app',
        writes: { mode: 'draft-only', applyEnabled: false },
        entities: entityTypes,
        components: components.map(component => component.key)
      }, null, 2)
    }
  ];
}

function createVuePageSource({ title, route, entityTypes, components }) {
  const componentComment = components.map(component => `${component.key}:${component.componentPath}`).join(', ');
  return `<template>
  <StandardPage :title="$t('generated.${routeKey(route)}.title')" :subtitle="$t('generated.${routeKey(route)}.subtitle')">
    <template #actions>
      <Button icon="pi pi-refresh" :label="$t('common.refresh')" size="small" />
    </template>

    <ActionToolbar :title="$t('generated.${routeKey(route)}.workspace')" :subtitle="$t('generated.${routeKey(route)}.entities')" />
    <ResponsiveGrid variant="wide">
      <StateBlock
        v-for="entityType in entityTypes"
        :key="entityType"
        icon="pi pi-box"
        :message="entityType"
        :description="$t('generated.${routeKey(route)}.draftOnly')"
      />
    </ResponsiveGrid>
  </StandardPage>
</template>

<script setup>
import Button from 'primevue/button';

definePageMeta({
  layout: 'app',
  middleware: ['auth']
});

const entityTypes = ${JSON.stringify(entityTypes, null, 2)};
// ConfigBot v0.1 draft: ${title}
// Existing components selected as lego: ${componentComment}
</script>
`;
}

function routeKey(route) {
  return route.replace(/^\/+/, '').replace(/[^a-zA-Z0-9]+/g, '.').replace(/\.$/, '');
}

function createDraftSummary({ title, route, selectedEntities, components }) {
  return [
    `${title} is ready as a draft package for ${route}.`,
    `It uses ${selectedEntities.map(entity => entity.type).join(', ')} and ${components.map(component => component.key).join(', ')} from the existing domain/UI catalog.`,
    'Apply is disabled; export the package for review before any repository change.'
  ].join(' ');
}

function createChatAnswer(prompt, knowledge) {
  const citations = knowledge.slice(0, 3).map(item => `${item.path}: ${item.title}`).join('; ');
  return [
    `ConfigBot v0.1 can create draft admin micro-app packages from the domain-cnc and Vue component catalog for: ${prompt}.`,
    citations ? `Relevant sources: ${citations}.` : 'No indexed source matched the question yet; run reindex from the ConfigBot page.'
  ].join(' ');
}

function createSystemPrompt(knowledge) {
  const context = knowledge.slice(0, 6).map(item => `Source: ${item.path}\n${item.content}`).join('\n\n');
  return [
    'You are ConfigBot for CutKit. Prefer draft package generation guidance over generic Q&A.',
    'Never claim that repository writes or production mutations are available in v0.1.',
    context
  ].join('\n\n');
}

async function getKnowledgeForPrompt(prompt) {
  const stored = await repository.listKnowledgeChunks({ limit: 500 });
  const corpus = stored.length ? stored : await buildConfigBotKnowledge();
  return queryDocs(corpus, prompt).slice(0, 8);
}

async function getOwnedSession(sessionId, auth) {
  const session = await repository.findSessionById(sessionId, auth.userId);
  if (!session) throw createError({ statusCode: 404, message: 'ConfigBot session not found' });
  return session;
}

function serializeSession(session) {
  if (!session) return null;
  return {
    id: session._id?.toString(),
    title: session.title,
    mode: session.mode,
    context: session.context || {},
    messages: session.messages || [],
    drafts: session.drafts || [],
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function toCitation(chunk) {
  return {
    source: chunk.source || 'app',
    path: chunk.path,
    title: chunk.title || chunk.path,
    snippet: chunk.snippet || String(chunk.content || '').replace(/\s+/g, ' ').slice(0, 240)
  };
}

function normalizePrompt(value) {
  const prompt = String(value || '').trim();
  if (!prompt) throw createError({ statusCode: 400, message: 'ConfigBot prompt is required' });
  return prompt;
}

function createSessionTitle(prompt) {
  return prompt.slice(0, 80);
}

function createDraftTitle(prompt, selectedEntities) {
  const entityLabel = selectedEntities.slice(0, 3).map(entity => entity.type.replace(/_/g, ' ')).join(' / ');
  return `${entityLabel || 'Admin'} workflow draft`;
}

function createDraftSlug(prompt, selectedEntities) {
  const base = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const fallback = selectedEntities.map(entity => entity.type.replace(/_/g, '-')).join('-') || 'admin-workflow';
  return base || fallback;
}
