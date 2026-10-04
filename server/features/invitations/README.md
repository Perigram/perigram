# COMPONENT: Invitations

## Core Files
- `repository.js`: Database operations for `invitations` collection.
- `service.js`: Invitation generation and processing.

## Workflows
1. **Generate**: A user who can manage team members in the organization creates
   a unique token and short code for organization joining. The same
   team-management access check is used for listing, creating, and revoking
   invitations: active process `users:admin` grants pass first, with the narrow
   stored membership `users:admin` grant recovery path from the users feature.
   The team-management UI shows the generated `/invitation/:token` link for
   copying; invitations are not addressed to a specific email.
2. **Authenticate**: Anonymous invitees use the link to log in or register.
   Registration from an invitation creates only the user account and preserves
   the redirect back to the invitation instead of asking for organization
   details.
   The public token endpoint returns a sanitized invitation presentation with
   the stored organization name and server-resolved role labels. The browser
   never requests the protected organization entity while rendering the form.
3. **Join**: The authenticated user accepts the invitation via token or code,
   creating a pending membership with no copied role state or permission preset
   and writing the invited role ids to the organization's authoritative role
   assignment. Organization admins approve or reject the membership from team
   management. Pending membership prevents runtime tenant access; rejection
   removes both membership and organization assignment.

## Targeted Invitations (invite an existing user)

`generateInvitation` accepts an optional `inviteeUserId` (validated to exist
and not already be a member or hold a pending invitation). Targeted
invitations address exactly one existing user discovered through the
[directory](../directory/README.md) and complete in a **single handshake**:
the team administrator already chose the user, so the invitee's acceptance
creates the **active** membership and the role assignment directly — there
is no second organizational approval round. Declining simply closes the
invitation.

- `listMine(user)` returns the caller's active targeted invitations
  (`GET /api/invitations/mine`) — the shared `TargetedInvitations` surface
  renders them with accept/decline actions, mounted both in the account
  settings popup (above the memberships section, reachable for members of
  other organizations) and on the orgless organization shell.
- `respondInvitation(id, user, action)` (`POST /api/invitations/:id/respond`)
  accepts or declines; only the addressed user may respond.
- The organization-side listing (`listByOrgForUser`) includes targeted
  invitations with `inviteeUserId`/`inviteeName` and their state, beside the
  copyable link invitations.

Invitation organization ids use the repository `toFlexibleId()` convention
covered by the [feature template](../_template/README.md).

## API / Functions
- `generateInvitation()`: Creates a new invitation after team-management
  authorization, validates organization role ids, and stores those ids.
  With `inviteeUserId` it creates a targeted invitation instead of a link.
- `listByOrgForUser()`: Lists active organization invitations after
  team-management authorization.
- `revokeInvitation()`: Revokes an invitation after team-management
  authorization.
- `joinByToken()`: Process join using secret token.
- `joinByCode()`: Process join using short alphanumeric code.
- `listMine()` / `respondInvitation()`: The invitee side of targeted
  invitations.
