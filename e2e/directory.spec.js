import fs from 'node:fs';
import path from 'node:path';
import { request as playwrightRequest } from '@playwright/test';
import { test, expect } from './fixtures.js';
import { E2E_BASE_URL } from './config.js';

// Directory, targeted invitations, and partnerships acceptance spec.
//
// A second, throwaway account ("the invitee") is registered through the
// public signup API with its own Playwright API context, so the handshake
// flows run between two real sessions. The durable artifact
// (test-results/directory-acceptance.json) records every step's outcome.

const ARTIFACT_PATH = path.resolve(import.meta.dirname, '../test-results/directory-acceptance.json');
const artifact = { steps: [] };

function record(step, outcome) {
  artifact.steps.push({ step, ...outcome });
}

async function registerInvitedUser(page) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const credentials = {
    name: `E2E Directory Persona ${suffix}`,
    email: `e2e-directory-${suffix}@perigram.local`,
    password: 'e2e-directory-password'
  };
  const context = await playwrightRequest.newContext({ baseURL: E2E_BASE_URL });
  const registered = await context.post('/api/auth/register', { data: credentials });
  expect(registered.ok(), await registered.text()).toBeTruthy();
  // Login binds the session cookie to the invitee context.
  const login = await context.post('/api/auth/login', { data: credentials });
  expect(login.ok(), await login.text()).toBeTruthy();
  record('register invitee', { email: credentials.email, name: credentials.name });
  return { context, credentials };
}

test.describe('directory, invitations, partnerships', () => {
  test('directory search stays in contextual homes and the picker keeps direct-thread reach', async ({ app }) => {
    const { context, credentials } = await registerInvitedUser(app.page);
    app.trackCleanup(async () => { await context.dispose(); });

    const search = await app.request.get('/api/directory/search', {
      params: { q: credentials.name }
    });
    expect(search.ok()).toBeTruthy();
    const payload = await search.json();
    const userGroup = payload.groups.find(group => group.type === 'user');
    const found = (userGroup?.results || []).find(entry => entry.identity?.name === credentials.name);
    expect(found, 'directory search must find the registered user by name').toBeTruthy();
    expect(JSON.stringify(found)).not.toContain('email', 'directory cards never carry email');
    record('directory user search', { found: found.identity.name, id: found._id });

    // UI: the chats picker's directory search keeps its results within the
    // direct-thread reach — this persona shares no organization yet, so
    // the picker lists nothing for their name.
    await app.gotoClient('/chats');
    await app.page.locator('button:has(.pi-user-plus)').first().click();
    await app.page.locator('[data-testid="new-chat-search"]').fill(credentials.name);
    await app.page.waitForTimeout(1200);
    await expect(app.page.locator('[data-testid="new-chat-picker"]')).not.toContainText(credentials.name);
    await app.expectCleanRuntime();
    record('picker hides unreachable users', {});

    const me = await (await app.request.get('/api/auth/me')).json();
    const organizationName = me.organizationData?.name || '';
    expect(organizationName, 'e2e session must carry an active organization name').toBeTruthy();
    const orgSearch = await app.request.get('/api/directory/search', {
      params: { q: organizationName }
    });
    const orgPayload = await orgSearch.json();
    const orgGroup = orgPayload.groups.find(group => group.type === 'organization');
    expect((orgGroup?.results || []).some(entry => entry._id === String(me.organizationId)))
      .toBeTruthy();
    record('directory organization search', { organizationName });
  });

  test('account popover organization entry opens the overview', async ({ app }) => {
    const me = await (await app.request.get('/api/auth/me')).json();
    const organizationName = me.organizationData?.name || '';
    expect(organizationName, 'e2e session must carry an active organization name').toBeTruthy();

    // The home sidebar's account popover: clicking the active organization
    // opens its overview (layouts README account-control contract — the
    // entry never dead-ends on a silent switch).
    await app.gotoClient('/');
    await app.page.locator('[data-testid="user-menu-trigger"]:visible').first().click();
    await app.page.locator(`button:has-text("${organizationName}")`).first().click();
    await expect(app.page).toHaveURL(/\/organization\/?$/);
    await app.expectCleanRuntime();
    record('account popover org entry -> overview', { url: app.page.url() });
  });

  test('inviting an existing user completes in a single handshake', async ({ app }) => {
    const { context, credentials } = await registerInvitedUser(app.page);
    app.trackCleanup(async () => { await context.dispose(); });
    const inviteeIdValue = await inviteeId(context);
    // Register the membership cleanup before any assertion: a failure mid
    // flow must still remove the throwaway member from the organization.
    app.trackCleanup(async () => {
      await app.request.delete(`/api/users/${inviteeIdValue}`, { failOnStatusCode: false });
    });

    const me = await (await app.request.get('/api/auth/me')).json();
    const organizationId = String(me.organizationId);
    const roles = await (await app.request.get(`/api/organizations/${organizationId}/roles`)).json();
    const roleIds = Object.values(roles || {}).map(role => role.id).slice(0, 1);
    expect(roleIds.length, 'organization must expose at least one role').toBeGreaterThan(0);

    const invite = await app.request.post(`/api/organizations/${organizationId}/invitations`, {
      data: { roleIds, inviteeUserId: await inviteeId(context) }
    });
    expect(invite.ok(), await invite.text()).toBeTruthy();
    record('targeted invitation sent', { organizationId, roleIds });

    // The invitee sees exactly this invitation and accepts it.
    const mine = await (await context.get('/api/invitations/mine')).json();
    expect(mine.length).toBeGreaterThan(0);
    const invitation = mine.find(entry => entry.organizationId === organizationId);
    expect(invitation, 'invitation must be listed for the invitee').toBeTruthy();
    expect(invitation.roleLabels.length).toBeGreaterThan(0);
    record('invitee lists invitation', { id: invitation._id });

    const accept = await context.post(`/api/invitations/${invitation._id}/respond`, {
      data: { action: 'accept' }
    });
    expect(accept.ok(), await accept.text()).toBeTruthy();
    const inviteeMe = await (await context.get('/api/auth/me')).json();
    const membership = (inviteeMe.memberships || []).find(item => String(item.organizationId) === organizationId);
    expect(membership?.status, 'accepting a targeted invitation makes the membership active directly').toBe('active');
    record('single handshake membership', { status: membership.status });

    // The organization-side active listing consumed the invitation: the
    // one-time handshake is complete and the member table owns the user.
    const orgInvitations = await (await app.request.get(`/api/organizations/${organizationId}/invitations`)).json();
    const listed = orgInvitations.find(entry => entry._id === invitation._id);
    expect(listed, 'accepted invitation must leave the active list').toBeUndefined();
    record('organization invitation consumed', { remaining: orgInvitations.length });

    // UI: the invited user's profile shows no leftover invitations after accept.
    await app.gotoClient('/profile?tab=organizations');
    await expect(app.page.locator('body')).not.toContainText(credentials.name);
    await app.expectCleanRuntime();

    // Chats -> new with the now shared-org persona: the picker finds them
    // by name, selecting opens the DIRECT thread, and the sent message
    // lands in the inbox-listed conversation (the reported regression:
    // user messages used to vanish into instance threads).
    await app.gotoClient('/chats');
    await app.page.locator('button:has(.pi-user-plus)').first().click();
    await app.page.locator('[data-testid="new-chat-search"]').fill(credentials.name);
    const personaOption = app.page.locator(`[data-testid="new-chat-picker"] li:has-text("${credentials.name}")`);
    await personaOption.first().waitFor({ timeout: 10000 });
    await personaOption.first().click();
    const composer = app.page.locator('textarea:visible').last();
    await composer.fill('directory e2e direct message');
    await composer.press('Enter');
    await app.page.waitForTimeout(1500);

    const conversations = await (await app.request.get('/api/support/conversations')).json();
    const directThread = (conversations || []).find(conversation => (
      conversation.conversationKind === 'direct'
      && (conversation.participants || []).map(String).includes(String(inviteeIdValue))
    ));
    expect(directThread, 'the sent message must create/list the direct conversation').toBeTruthy();
    expect(String(directThread.lastMessage || '')).toContain('directory e2e direct message');
    record('direct message from picker', { conversationKey: directThread.conversationKey });
    await app.expectCleanRuntime();
  });

  test('partnership request and acceptance become an active partner relation', async ({ app }) => {
    const { context, credentials } = await registerInvitedUser(app.page);
    app.trackCleanup(async () => { await context.dispose(); });

    // The invitee creates their own organization and switches into it.
    const partnerOrg = await (await context.post('/api/organizations', {
      data: {
        name: `E2E Partner Org ${Math.random().toString(36).slice(2, 7)}`,
        email: credentials.email
      }
    })).json();
    expect(partnerOrg?._id, 'invitee must be able to create an organization').toBeTruthy();
    const switched = await context.post('/api/auth/switch-org', {
      data: { organizationId: String(partnerOrg._id) }
    });
    expect(switched.ok(), await switched.text()).toBeTruthy();
    record('partner organization created', { id: String(partnerOrg._id), name: partnerOrg.identity?.name });

    const me = await (await app.request.get('/api/auth/me')).json();
    const organizationId = String(me.organizationId);

    const request_ = await app.request.post('/api/partnerships', {
      data: { partnerOrganizationId: String(partnerOrg._id) }
    });
    expect(request_.ok(), await request_.text()).toBeTruthy();
    const partnership = await request_.json();
    expect(partnership.status).toBe('pending');
    expect(partnership.direction).toBe('outgoing');
    expect(partnership.partnerOrganization?._id).toBe(String(partnerOrg._id));
    record('partnership requested', { id: partnership._id, status: partnership.status });

    // Duplicate requests are rejected while pending.
    const duplicate = await app.request.post('/api/partnerships', {
      data: { partnerOrganizationId: String(partnerOrg._id) },
      failOnStatusCode: false
    });
    expect(duplicate.status()).toBe(409);
    record('duplicate partnership rejected', { status: duplicate.status() });

    // The partner side accepts from their own organization context.
    const accept = await context.post(`/api/partnerships/${partnership._id}/accept`);
    expect(accept.ok(), await accept.text()).toBeTruthy();
    record('partnership accepted', {});

    const list = await (await app.request.get('/api/partnerships')).json();
    const active = list.find(entry => entry._id === partnership._id);
    expect(active?.status).toBe('active');
    expect(active?.partnerOrganization?.name).toContain('E2E Partner Org');
    record('partnership listed active', { status: active.status });

    // UI: the partners management route shows the active partner.
    await app.gotoClient('/organization/partners');
    await expect(app.page.locator('body')).toContainText(partnerOrg.identity?.name);
    await app.expectCleanRuntime();

    // UI: partner rows open the organization inside the home workspace —
    // search the partner name and open its row (pane tab, no standalone
    // org route).
    await app.page.locator('[data-testid="partner-search-input"]').fill(partnerOrg.identity?.name || 'E2E Partner Org');
    await app.page.locator(`[data-partner-candidate="${partnerOrg._id}"]`).waitFor({ timeout: 10000 });
    await app.page.locator(`[data-partner-candidate="${partnerOrg._id}"]`).click();
    await app.page.locator('[data-home-workspace]').waitFor({ timeout: 15000 });
    await expect(app.page).not.toHaveURL(/\/organizations\//);
    await expect(app.page.locator('[data-directory-surface]')).toContainText(partnerOrg.identity?.name);
    await app.expectCleanRuntime();
    record('partners UI surfaces', { partnersRoute: true, inHomeOrg: true });

    // Cleanup: terminate the partnership.
    app.trackCleanup(async () => {
      await app.request.delete(`/api/partnerships/${partnership._id}`, { failOnStatusCode: false });
    });

    writeArtifact();
  });
});

async function inviteeId(context) {
  const me = await (await context.get('/api/auth/me')).json();
  return String(me.userId || me.id);
}

function writeArtifact() {
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));
}
