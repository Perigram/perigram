# COMPONENT: API Endpoints

This directory contains the Nitro server API routes for the Nuxt application. Endpoints are organized by resource and use file-based routing.

## Structure
Routes are grouped into sub-directories corresponding to features:
- `artifacts/`: Metadata, deletion, and streaming for generated files.
- `batch/`: Detailed batch operations.
- `cassette-instances/`: Authenticated cassette instance listing, detail, and status routes.
- `cassettes/`: Upload and management of templates. The collection route
  forwards generated-screen lineage filters such as `libraryId` to the feature
  service so parent detail pages only list their own child templates.
- `commands/`: Authenticated execution route for declared domain commands such
  as `saveCassetteTemplate` and `generateAttachment`.
- `entity-events/`: Authenticated entity invalidation stream. `GET` opens the
  app-wide SSE connection for the current user, and `POST` publishes successful
  frontend CRUD mutations after their canonical entity API call succeeds.
- `tasks/`: Worker task queue protocol for claim, heartbeat, complete,
  fail, and cancel.
- `admin/commands/`: Authenticated command definition and run listing for
  `command_runs`.
- `config-bot/`: Admin draft generation, chat, and session routes for
  ConfigBot v0.1.
- `geometry-captures/`: Authenticated photo-to-polygon capture CRUD,
  preset-based recalculation, revision activation, review confirmation, and
  worker-result callback.
- `libraries/`: Authenticated cassette library CRUD. Libraries are
  organization-scoped containers with material data; cassettes created under a
  library persist `lineage.libraryId`.
- `admin/config-bot/`: Admin knowledge reindex route for ConfigBot.
- `admin/tasks/`: Authenticated task definition and run listing for
  `task_runs`.
- `project/`: Main project orchestration and nesting triggers.
  The project list route returns authorized project DTOs with canonical
  identity, status, origin, lineage, safe project data, summary fields, and
  queue previews so shared entity cards can render directly from the response.
  Collection routes for process-generated screens accept `primaryStatus` or
  comma-separated `primaryStatuses` when a role screen is scoped to one or more
  lifecycle windows.
- `process-definitions/`: Authenticated organization process definition CRUD,
  validation, activation, and archive endpoints. Activation compiles the visual
  graph into runtime access, navigation, workflow, field-policy, service, and
  socket contracts. Active assignment updates patch the compiled process role
  mapping for a user. Active action execution endpoints resolve the action from
  the active compiled process, verify that it is available to the current
  process roles, and delegate to entity, status, socket, or command runtimes.
  Socket projection endpoints return selected entity fields and receiver
  lifecycle metadata for cross-organization transfer flows.
- `organizations/:id/invitations`: Authenticated team-management invitation
  listing, creation, and revocation. Handlers delegate authorization to the
  invitations feature so all invitation operations use the same process-derived
  user-management access contract and support string organization ids.
- `sheet-designs/`: Lineage-scoped sheet design list/detail and direct DXF
  export.
- `queue/:id` and `cassette-designs/:id`: Single-entity DELETE routes delegate
  to feature `remove()` services, which enforce admin/delete access. Generated
  process screens use these canonical routes through `useEntity().remove()`
  instead of calling feature-specific browser code.
- `status/`: Authenticated status action and history endpoints. History
  handlers delegate to the statuses feature and return response-only actor
  display data for audit rows. Successful status transitions publish entity
  invalidation events through the shared entity event bus so other devices can
  refresh affected surfaces.
- `support/`: Authenticated support chat endpoints. User routes stream the
  current user's support conversation or a direct user-to-user conversation
  selected by `recipientUserId`; admin routes remain scoped to customer support
  conversations. Conversation-list routes return unread counts from
  `supportConversationReads`. Messages may include structured inline
  `entityRefs` selected from readable generated-screen entity types and
  concrete readable entity options when a scoped list service exists. The
  entity-options route also accepts `recipientUserId` for direct-chat warning
  metadata. The shared chat message component renders both inline tokens and
  structured refs.
- `workflow-overrides/`: Authenticated organization-owned lifecycle override
  read and replace endpoints for entity status machines.
- `user/`: Profile and credit management.
- `users/`: Organization user listing, mutation, and single-user detail
  endpoints used by inline user references.

## Conventions
- **Method Suffixes:** Files are named `[action].[method].js` (e.g., `index.get.js`, `create.post.js`).
- **Thin Wrappers:** API handlers should be minimal, delegating all business logic to the corresponding [Server Features](../features/README.md).
## Authentication
Most routes require authentication, which is handled by `server/middleware/auth.js`.
Responsibilities:
- Runs on ALL requests.
- Reads `sessionId` from cookies.
- Fetches user from the database.
- Attaches session info: `event.context.auth = { userId, isAdmin }`.

`auth/login.post.js` sets the `sessionId` cookie after password login. The cookie
is secure in production by default, but `SESSION_COOKIE_SECURE=false` can be set
for plain HTTP LAN deployments so browsers keep the session cookie.
`auth/register.post.js` is the public signup boundary. It accepts user
credentials and, when `organizationName`/`processTemplateId` are provided,
creates the user's initial organization membership and active starter process
without calling protected organization CRUD routes. Legacy
`organizationType` input is accepted only as a template fallback.
Invitation-driven signup omits organization fields;
the user creates only an account, then logs in and accepts the invitation link.
If a previous signup created a password-backed user before the organization step
existed, submitting the same email/password with organization details recovers
that orphaned account instead of returning a duplicate-email dead end.

## Example Handler
```javascript
export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  if (!userId) throw createError({ statusCode: 401 });
  
  const body = await readBody(event);
  return await service.create(body, userId);
});
```
